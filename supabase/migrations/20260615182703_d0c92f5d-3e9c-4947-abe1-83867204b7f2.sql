-- ============================================================
-- Migration 1: alerta_agendamento_criado usa data_inicio
-- ============================================================
CREATE OR REPLACE FUNCTION public.alerta_agendamento_criado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'agendamento_proximo',
      'Novo agendamento: ' || COALESCE(NEW.titulo, 'sem título'),
      'Data: ' || to_char(NEW.data_inicio, 'DD/MM/YYYY HH24:MI'),
      '/agendamentos',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.alerta_agendamento_criado() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Migration 2: lead_status_transitions + trigger + backfill
-- ============================================================
CREATE TABLE public.lead_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  de_status public.lead_status,
  para_status public.lead_status NOT NULL,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lst_lead ON public.lead_status_transitions(lead_id, created_at DESC);
CREATE INDEX idx_lst_para_status ON public.lead_status_transitions(para_status, created_at);
CREATE INDEX idx_lst_corretor ON public.lead_status_transitions(corretor_id, para_status, created_at);

GRANT SELECT ON public.lead_status_transitions TO authenticated;
GRANT ALL ON public.lead_status_transitions TO service_role;
ALTER TABLE public.lead_status_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/gestor veem todas as transicoes"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Corretor ve transicoes dos seus leads"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_status_transitions.lead_id AND l.corretor_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.registrar_transicao_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_status_transitions
      (lead_id, corretor_id, de_status, para_status, alterado_por)
    VALUES (NEW.id, NEW.corretor_id, OLD.status, NEW.status, auth.uid());

    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo)
    VALUES (
      NEW.id,
      auth.uid(),
      'mudanca_status',
      'interna',
      'Mudança de status',
      'Status alterado de "' || COALESCE(OLD.status::text, '—')
        || '" para "' || NEW.status::text || '".'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_transicao_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registrar_transicao_status ON public.leads;
CREATE TRIGGER trg_registrar_transicao_status
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.registrar_transicao_status();

INSERT INTO public.lead_status_transitions
  (lead_id, corretor_id, de_status, para_status, alterado_por, created_at)
SELECT id, corretor_id, NULL, 'contrato_fechado'::public.lead_status, NULL, updated_at
FROM public.leads
WHERE status IN ('contrato_fechado','pos_venda') AND deleted_at IS NULL;

-- ============================================================
-- Migration 3: cron alerts (tarefa_atrasada + agendamento_proximo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.gerar_alertas_tarefas_atrasadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT t.corretor_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || t.titulo,
         'Venceu em ' || to_char(t.data_vencimento, 'DD/MM/YYYY HH24:MI'),
         '/tarefas', t.id
  FROM public.tarefas t
  WHERE t.status IN ('pendente','em_andamento')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND t.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = t.id
        AND a.tipo = 'tarefa_atrasada'
        AND a.created_at::date = now()::date
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_alertas_tarefas_atrasadas() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gerar_alertas_agendamentos_proximos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT ag.corretor_id, 'agendamento_proximo', 'Agendamento em breve: ' || ag.titulo,
         to_char(ag.data_inicio, 'DD/MM/YYYY HH24:MI') || COALESCE(' · ' || ag.local, ''),
         '/agendamentos', ag.id
  FROM public.agendamentos ag
  WHERE ag.deleted_at IS NULL
    AND ag.status IN ('agendado','confirmado','remarcado')
    AND ag.data_inicio > now()
    AND ag.data_inicio <= now() + (COALESCE(ag.lembrete_minutos, 30) || ' minutes')::interval
    AND ag.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = ag.id
        AND a.tipo = 'agendamento_proximo'
        AND a.titulo LIKE 'Agendamento em breve:%'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_alertas_agendamentos_proximos() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('alertar-tarefas-atrasadas')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='alertar-tarefas-atrasadas');
SELECT cron.schedule('alertar-tarefas-atrasadas', '0 * * * *',
  $$ SELECT public.gerar_alertas_tarefas_atrasadas(); $$);

SELECT cron.unschedule('alertar-agendamentos-proximos')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='alertar-agendamentos-proximos');
SELECT cron.schedule('alertar-agendamentos-proximos', '*/5 * * * *',
  $$ SELECT public.gerar_alertas_agendamentos_proximos(); $$);

-- ============================================================
-- Migration 4: distribuir_lead guard + buscar_lead_duplicado
-- ============================================================
CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _distribuido_por uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _corretor uuid;
  _max_pos int;
  _caller uuid := auth.uid();
  _atual uuid;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT corretor_id INTO _atual FROM public.leads WHERE id = _lead_id;
  IF _atual IS NOT NULL AND _tipo = 'automatica' THEN
    RETURN _atual;
  END IF;

  SELECT corretor_id INTO _corretor
  FROM public.fila_distribuicao
  WHERE ativo = true
    AND leads_recebidos_hoje < max_leads_dia
  ORDER BY posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _corretor IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;

  UPDATE public.fila_distribuicao
  SET posicao = _max_pos + 1,
      leads_recebidos_hoje = leads_recebidos_hoje + 1,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor;

  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
      corretores_que_tentaram = array_append(corretores_que_tentaram, _corretor)
  WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, distribuido_por_id, motivo)
  VALUES (_lead_id, _corretor, _tipo, COALESCE(_distribuido_por, _caller),
          CASE WHEN _tipo = 'automatica' THEN 'Roleta automática'
               ELSE 'Distribuição ' || _tipo::text END);

  RETURN _corretor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buscar_lead_duplicado(_projeto_id uuid, _telefone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.leads
  WHERE projeto_id = _projeto_id
    AND deleted_at IS NULL
    AND length(regexp_replace(_telefone, '\D', '', 'g')) >= 8
    AND regexp_replace(telefone, '\D', '', 'g') = regexp_replace(_telefone, '\D', '', 'g')
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) TO authenticated, service_role;