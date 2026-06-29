-- leads_com_sla: adiciona filtro de período opcional (_di/_df) para que o card
-- "SLA estourando" do painel Hoje siga o filtro Hoje/Semana/Mês.
-- O cálculo de SLA continua "agora"; o período apenas limita o CONJUNTO aos leads
-- cuja entrada (COALESCE(data_distribuicao, created_at)) cai na janela.
-- Parâmetros com DEFAULT NULL preservam o comportamento anterior (sem filtro).

DROP FUNCTION IF EXISTS public.leads_com_sla(uuid);

CREATE OR REPLACE FUNCTION public.leads_com_sla(
  _corretor uuid DEFAULT NULL,
  _di date DEFAULT NULL,
  _df date DEFAULT NULL
)
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
    AND (_scope IS NULL OR l.corretor_id = _scope)
    AND (_di IS NULL OR COALESCE(l.data_distribuicao, l.created_at)::date >= _di)
    AND (_df IS NULL OR COALESCE(l.data_distribuicao, l.created_at)::date <= _df);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_com_sla(uuid, date, date) TO authenticated;
