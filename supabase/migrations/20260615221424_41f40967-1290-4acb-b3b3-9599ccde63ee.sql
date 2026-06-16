
-- Dashboard aggregation RPCs

CREATE OR REPLACE FUNCTION public.dashboard_kpis(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  SELECT jsonb_build_object(
    'total',            count(*),
    'novo',             count(*) FILTER (WHERE status='novo'),
    'aguardando',       count(*) FILTER (WHERE status='aguardando_atendimento'),
    'em_atendimento',   count(*) FILTER (WHERE status='em_atendimento'),
    'qualificado',     count(*) FILTER (WHERE status='qualificado'),
    'agendado',         count(*) FILTER (WHERE status='agendado'),
    'visita_realizada', count(*) FILTER (WHERE status='visita_realizada'),
    'analise_credito',  count(*) FILTER (WHERE status='analise_credito'),
    'contrato_fechado', count(*) FILTER (WHERE status='contrato_fechado'),
    'perdido',          count(*) FILTER (WHERE status='perdido'),
    'sem_corretor',     count(*) FILTER (WHERE corretor_id IS NULL)
  ) INTO _result
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_di IS NULL OR created_at >= _di)
    AND (_df IS NULL OR created_at <  _df)
    AND (_scope IS NULL OR corretor_id = _scope);

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(
  _di timestamptz,
  _df timestamptz,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(dia date, leads int, agendamentos int, visitas int, vendas int)
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
  WITH dias AS (
    SELECT generate_series(_di::date, (_df - interval '1 day')::date, interval '1 day')::date AS d
  ),
  l AS (
    SELECT created_at::date AS d, count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND created_at >= _di AND created_at < _df
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  ag AS (
    SELECT created_at::date AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND created_at >= _di AND created_at < _df
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  vi AS (
    SELECT created_at::date AS d, count(*)::int AS n
    FROM public.lead_status_transitions
    WHERE created_at >= _di AND created_at < _df
      AND para_status = 'visita_realizada'
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  ve AS (
    SELECT created_at::date AS d, count(*)::int AS n
    FROM public.lead_status_transitions
    WHERE created_at >= _di AND created_at < _df
      AND para_status = 'contrato_fechado'
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(l.n,0), COALESCE(ag.n,0), COALESCE(vi.n,0), COALESCE(ve.n,0)
  FROM dias
  LEFT JOIN l  ON l.d=dias.d
  LEFT JOIN ag ON ag.d=dias.d
  LEFT JOIN vi ON vi.d=dias.d
  LEFT JOIN ve ON ve.d=dias.d
  ORDER BY dias.d;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamptz,
  _df timestamptz,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(etapa text, ordem int, quantidade int)
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
  WITH base AS (
    SELECT id, status FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND created_at >= _di AND created_at < _df
      AND (_scope IS NULL OR corretor_id = _scope)
  )
  SELECT * FROM (VALUES
    ('Novos',            1, (SELECT count(*)::int FROM base)),
    ('Em atendimento',   2, (SELECT count(*)::int FROM base WHERE status IN ('em_atendimento','qualificado','agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Agendados',        3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Visitas',          4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','analise_credito','contrato_fechado'))),
    ('Análise crédito',  5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','contrato_fechado'))),
    ('Fechados',         6, (SELECT count(*)::int FROM base WHERE status = 'contrato_fechado'))
  ) AS t(etapa, ordem, quantidade);
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_metricas_por_corretor(
  _di timestamptz,
  _df timestamptz
)
RETURNS TABLE(corretor_id uuid, nome text, leads int, agendamentos int, visitas int, analise int, fechados int, perdidos int, conversao numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH ll AS (
    SELECT corretor_id AS cid, count(*)::int AS n,
           count(*) FILTER (WHERE status='perdido')::int AS perd
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NOT NULL
      AND created_at >= _di AND created_at < _df
    GROUP BY corretor_id
  ),
  ag AS (
    SELECT corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL AND corretor_id IS NOT NULL
      AND created_at >= _di AND created_at < _df
    GROUP BY corretor_id
  ),
  tr AS (
    SELECT corretor_id AS cid,
      count(*) FILTER (WHERE para_status='visita_realizada')::int AS vi,
      count(*) FILTER (WHERE para_status='analise_credito')::int  AS an,
      count(*) FILTER (WHERE para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions
    WHERE created_at >= _di AND created_at < _df AND corretor_id IS NOT NULL
    GROUP BY corretor_id
  ),
  todos AS (
    SELECT cid FROM ll UNION SELECT cid FROM ag UNION SELECT cid FROM tr
  )
  SELECT t.cid,
         COALESCE(p.nome, 'Corretor'),
         COALESCE(ll.n,0),
         COALESCE(ag.n,0),
         COALESCE(tr.vi,0),
         COALESCE(tr.an,0),
         COALESCE(tr.ve,0),
         COALESCE(ll.perd,0),
         CASE WHEN COALESCE(ll.n,0) > 0
              THEN round((COALESCE(tr.ve,0)::numeric / ll.n::numeric) * 100, 1)
              ELSE 0 END
  FROM todos t
  LEFT JOIN ll ON ll.cid = t.cid
  LEFT JOIN ag ON ag.cid = t.cid
  LEFT JOIN tr ON tr.cid = t.cid
  LEFT JOIN public.profiles p ON p.id = t.cid
  ORDER BY COALESCE(tr.ve,0) DESC, COALESCE(tr.vi,0) DESC, COALESCE(ll.n,0) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_motivos_perda(
  _di timestamptz,
  _df timestamptz,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(motivo text, quantidade int)
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
  SELECT COALESCE(NULLIF(trim(motivo_perdido),''),'Não informado')::text,
         count(*)::int
  FROM public.leads
  WHERE deleted_at IS NULL AND status = 'perdido'
    AND (_di IS NULL OR updated_at >= _di)
    AND (_df IS NULL OR updated_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_leads_urgentes(
  _corretor uuid DEFAULT NULL,
  _min_minutos int DEFAULT 30
)
RETURNS TABLE(lead_id uuid, nome text, telefone text, corretor_id uuid, corretor_nome text, status lead_status, minutos_parado int)
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
  SELECT l.id, l.nome, l.telefone, l.corretor_id,
         COALESCE(p.nome,'—')::text,
         l.status,
         EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))::int / 60
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.corretor_id
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.status IN ('novo','aguardando_atendimento')
    AND EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at))) / 60 >= _min_minutos
    AND (_scope IS NULL OR l.corretor_id = _scope)
  ORDER BY COALESCE(l.data_distribuicao, l.created_at) ASC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_redistribuicoes(
  _di timestamptz,
  _df timestamptz
)
RETURNS TABLE(quando timestamptz, lead_id uuid, lead_nome text, corretor_id uuid, corretor_nome text, tipo distribuicao_tipo, motivo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT dl.created_at, dl.lead_id, l.nome, dl.corretor_id, COALESCE(p.nome,'—')::text, dl.tipo, dl.motivo
  FROM public.distribution_log dl
  LEFT JOIN public.leads l ON l.id = dl.lead_id
  LEFT JOIN public.profiles p ON p.id = dl.corretor_id
  WHERE dl.created_at >= _di AND dl.created_at < _df
  ORDER BY dl.created_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis(timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_diaria(timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_funil(timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metricas_por_corretor(timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_motivos_perda(timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_leads_urgentes(uuid,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_redistribuicoes(timestamptz,timestamptz) TO authenticated;
