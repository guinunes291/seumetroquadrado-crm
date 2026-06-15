
-- 1. Presença diária no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS presente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presente_em timestamptz;

-- 2. Configuração de timeout por origem
CREATE TABLE IF NOT EXISTS public.distribuicao_config (
  origem lead_origem PRIMARY KEY,
  timeout_horas integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.distribuicao_config TO authenticated;
GRANT ALL ON public.distribuicao_config TO service_role;

ALTER TABLE public.distribuicao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados podem ler config"
  ON public.distribuicao_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/gestor gerenciam config"
  ON public.distribuicao_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

INSERT INTO public.distribuicao_config (origem, timeout_horas) VALUES
  ('importacao', 48),
  ('facebook', 24),
  ('google_sheets', 24),
  ('site', 24),
  ('indicacao', 24),
  ('captacao_corretor', 24),
  ('whatsapp', 24),
  ('telefone', 24),
  ('plantao', 24),
  ('agendamento_self_service', 24),
  ('chatbot', 24),
  ('outro', 24)
ON CONFLICT (origem) DO NOTHING;

-- 3. Marcar presença
CREATE OR REPLACE FUNCTION public.marcar_presenca(_presente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  UPDATE public.profiles
  SET presente = _presente,
      presente_em = CASE WHEN _presente THEN now() ELSE NULL END
  WHERE id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_presenca(boolean) TO authenticated;

-- 4. Elegibilidade
CREATE OR REPLACE FUNCTION public.corretor_elegivel(_corretor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ok boolean;
  _total int;
  _trabalhados int;
BEGIN
  SELECT (p.presente
          AND p.presente_em IS NOT NULL
          AND p.presente_em::date = current_date
          AND fd.ativo
          AND fd.leads_recebidos_hoje < fd.max_leads_dia)
  INTO _ok
  FROM public.profiles p
  JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
  WHERE p.id = _corretor_id;

  IF _ok IS NULL OR _ok = false THEN RETURN false; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'aguardando_atendimento')
  INTO _total, _trabalhados
  FROM public.leads
  WHERE corretor_id = _corretor_id
    AND deleted_at IS NULL
    AND na_lixeira = false
    AND status NOT IN ('contrato_fechado','pos_venda','perdido');

  IF _total = 0 THEN RETURN true; END IF;
  RETURN (_trabalhados::numeric / _total::numeric) >= 0.9;
END;
$$;

GRANT EXECUTE ON FUNCTION public.corretor_elegivel(uuid) TO authenticated;

-- 5. Distribuir para elegível
CREATE OR REPLACE FUNCTION public.distribuir_lead_elegivel(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _corretor uuid;
  _max_pos int;
BEGIN
  SELECT fd.corretor_id INTO _corretor
  FROM public.fila_distribuicao fd
  WHERE fd.ativo = true
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND public.corretor_elegivel(fd.corretor_id) = true
  ORDER BY fd.posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _corretor IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;

  UPDATE public.fila_distribuicao
  SET posicao = _max_pos + 1,
      leads_recebidos_hoje = leads_recebidos_hoje + 1,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor;

  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = 'aguardando_atendimento',
      corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
  WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
  VALUES (_lead_id, _corretor, 'automatica', 'Roleta automática (elegibilidade)');

  RETURN _corretor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribuir_lead_elegivel(uuid) TO service_role;

-- 6. Redistribuir leads parados
CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _timeout int;
  _qtd int := 0;
  _novo uuid;
  _ant uuid;
BEGIN
  FOR _lead IN
    SELECT l.id, l.origem, l.corretor_id, l.data_distribuicao
    FROM public.leads l
    WHERE l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
  LOOP
    SELECT COALESCE(dc.timeout_horas, 24) INTO _timeout
    FROM public.distribuicao_config dc WHERE dc.origem = _lead.origem;
    IF _timeout IS NULL THEN _timeout := 24; END IF;

    IF _lead.data_distribuicao < now() - (_timeout || ' hours')::interval THEN
      _ant := _lead.corretor_id;
      INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
      VALUES (_lead.id, _ant, 'redistribuicao',
              'Lead parado em aguardando_atendimento por mais de ' || _timeout || 'h');

      UPDATE public.leads
      SET corretor_anterior_id = _ant,
          corretor_id = NULL,
          status = 'novo',
          data_distribuicao = NULL,
          tentativas_redistribuicao = COALESCE(tentativas_redistribuicao,0) + 1
      WHERE id = _lead.id;

      _novo := public.distribuir_lead_elegivel(_lead.id);
      IF _novo IS NOT NULL THEN _qtd := _qtd + 1; END IF;
    END IF;
  END LOOP;

  RETURN _qtd;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redistribuir_leads_parados() TO service_role;

-- 7. Orquestrador (chamado pelo cron)
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _novo uuid;
  _dist int := 0;
  _redist int := 0;
BEGIN
  FOR _lead_id IN
    SELECT id FROM public.leads
    WHERE corretor_id IS NULL
      AND status = 'novo'
      AND deleted_at IS NULL
      AND na_lixeira = false
    ORDER BY created_at ASC
    LIMIT 200
  LOOP
    _novo := public.distribuir_lead_elegivel(_lead_id);
    IF _novo IS NOT NULL THEN _dist := _dist + 1;
    ELSE EXIT;
    END IF;
  END LOOP;

  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object('distribuidos', _dist, 'redistribuidos', _redist, 'em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_distribuicao_automatica() TO service_role;

-- 8. Reset diário
CREATE OR REPLACE FUNCTION public.resetar_presenca_diaria()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET presente = false, presente_em = NULL WHERE presente = true;
$$;

GRANT EXECUTE ON FUNCTION public.resetar_presenca_diaria() TO service_role;
