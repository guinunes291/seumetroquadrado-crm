UPDATE public.distribuicao_config SET sla_minutos = 5 WHERE origem = 'facebook';

DROP FUNCTION IF EXISTS public.leads_com_sla(uuid);
CREATE OR REPLACE FUNCTION public.leads_com_sla(_corretor uuid DEFAULT NULL)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  status text,
  sla_minutos integer,
  minutos_decorridos integer,
  sla_status text,
  temperatura_calc lead_temperatura
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  SELECT l.id, l.nome, l.telefone, l.status::text,
         COALESCE(dc.sla_minutos, 30) AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN l.status NOT IN ('novo','aguardando_atendimento') THEN 'ok'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > COALESCE(dc.sla_minutos,30) THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (COALESCE(dc.sla_minutos,30) * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
           WHEN l.created_at > now() - interval '48 hours' AND l.ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           WHEN l.created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND (_scope IS NULL OR l.corretor_id = _scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_com_sla(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_temperatura_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n int;
BEGIN
  WITH calc AS (
    SELECT id,
      CASE
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
        WHEN status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
        WHEN created_at > now() - interval '48 hours' AND ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
        WHEN created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
        ELSE 'frio'::lead_temperatura
      END AS nova
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND status NOT IN ('contrato_fechado','pos_venda','perdido')
  )
  UPDATE public.leads l
  SET temperatura = c.nova
  FROM calc c
  WHERE l.id = c.id AND l.temperatura IS DISTINCT FROM c.nova;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_alertas_leads_parados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id, 'follow_up',
         'Lead parado: ' || l.nome,
         'Sem interação há 5+ dias. Retome o contato.',
         '/leads/' || l.id::text, l.id
  FROM public.leads l
  WHERE l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND COALESCE(l.ultima_interacao, l.created_at) < now() - interval '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = l.id AND a.tipo = 'follow_up'
        AND a.created_at::date = now()::date
    );
END;
$$;

SELECT cron.schedule('alertar-leads-parados', '0 8 * * *', $$ SELECT public.gerar_alertas_leads_parados(); $$);

CREATE OR REPLACE FUNCTION public.gerar_pushes_lembretes_visita()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_outbox(user_id, title, body, url, tag)
  SELECT ag.corretor_id,
         'Lembrete de visita: ' || ag.titulo,
         to_char(ag.data_inicio, 'DD/MM/YYYY HH24:MI') || COALESCE(' · ' || ag.local, ''),
         '/agendamentos',
         o.lbl || '-' || ag.id::text
  FROM public.agendamentos ag
  CROSS JOIN (VALUES
    ('lembrete-48h', interval '48 hours'),
    ('lembrete-24h', interval '24 hours'),
    ('lembrete-10h', interval '10 hours')
  ) AS o(lbl, janela)
  WHERE ag.tipo = 'visita'
    AND ag.status IN ('agendado','confirmado','remarcado')
    AND ag.deleted_at IS NULL
    AND ag.corretor_id IS NOT NULL
    AND ag.data_inicio > now()
    AND ag.data_inicio <= now() + o.janela
    AND NOT EXISTS (SELECT 1 FROM public.push_outbox po WHERE po.tag = o.lbl || '-' || ag.id::text);
END;
$$;

SELECT cron.schedule('lembretes-visita', '*/5 * * * *', $$ SELECT public.gerar_pushes_lembretes_visita(); $$);