
-- ============================================================
-- P1: dashboard_atividade_periodo
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_atividade_periodo(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_atividade_periodo(
  _di timestamptz,
  _df timestamptz,
  _scope uuid,
  _campo_data text DEFAULT 'criacao'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
  _use_evento boolean := (_campo_data = 'evento');
  _leads_novos int;
  _agendamentos int;
  _visitas int;
  _perdidos int;
  _vendas int;
  _vgv numeric;
BEGIN
  -- Leads: só têm data de criação; ambos os modos usam created_at.
  SELECT count(*)::int INTO _leads_novos
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope);

  -- Agendamentos: 'evento' usa data_inicio; 'criacao' usa created_at.
  IF _use_evento THEN
    SELECT count(*)::int INTO _agendamentos
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (_di IS NULL OR data_inicio >= _di) AND (_df IS NULL OR data_inicio < _df)
      AND (_scope IS NULL OR corretor_id = _scope);
  ELSE
    SELECT count(*)::int INTO _agendamentos
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope);
  END IF;

  -- Visitas via transições: a linha de transição JÁ é o registro
  -- do evento; created_at coincide com o momento do registro.
  SELECT count(*)::int INTO _visitas
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'visita_realizada'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope);

  SELECT count(DISTINCT t.lead_id)::int INTO _perdidos
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'perdido'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope);

  -- Vendas: 'evento' usa data_assinatura; 'criacao' (padrão novo) usa created_at.
  IF _use_evento THEN
    SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
    FROM public.vendas
    WHERE distrato = false
      AND (_di_date IS NULL OR data_assinatura >= _di_date)
      AND (_df_date IS NULL OR data_assinatura <= _df_date)
      AND (_scope IS NULL OR corretor_id = _scope);
  ELSE
    SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
    FROM public.vendas
    WHERE distrato = false
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope);
  END IF;

  RETURN jsonb_build_object(
    'leads_novos', _leads_novos,
    'agendamentos', _agendamentos,
    'visitas', _visitas,
    'perdidos', _perdidos,
    'vendas', _vendas,
    'vgv', _vgv
  );
END;
$function$;

-- ============================================================
-- P2: dashboard_kpis
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_kpis(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_kpis(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _campo_data text DEFAULT 'criacao'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _pipeline jsonb;
  _periodo jsonb;
  _prev jsonb := NULL;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  SELECT jsonb_build_object(
    'novo',                  count(*) FILTER (WHERE status = 'novo'),
    'aguardando_atendimento',count(*) FILTER (WHERE status = 'aguardando_atendimento'),
    'aguardando_retorno',    count(*) FILTER (WHERE status = 'aguardando_retorno'),
    'em_atendimento',        count(*) FILTER (WHERE status = 'em_atendimento'),
    'agendado',              count(*) FILTER (WHERE status = 'agendado'),
    'visita_realizada',      count(*) FILTER (WHERE status = 'visita_realizada'),
    'analise_credito',       count(*) FILTER (WHERE status = 'analise_credito'),
    'em_aberto',             count(*) FILTER (WHERE status NOT IN ('contrato_fechado','perdido')),
    'sem_corretor',          count(*) FILTER (WHERE corretor_id IS NULL AND status NOT IN ('contrato_fechado','perdido'))
  ) INTO _pipeline
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_scope IS NULL OR corretor_id = _scope);

  _periodo := public.dashboard_atividade_periodo(_di, _df, _scope, _campo_data);

  IF _di IS NOT NULL AND _df IS NOT NULL THEN
    _prev := public.dashboard_atividade_periodo(_di - (_df - _di), _di, _scope, _campo_data);
  END IF;

  RETURN jsonb_build_object('pipeline', _pipeline, 'periodo', _periodo, 'prev', _prev);
END;
$function$;

-- ============================================================
-- P3: dashboard_serie_diaria
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_serie_diaria(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _campo_data text DEFAULT 'criacao'
)
RETURNS TABLE(dia date, leads integer, agendamentos integer, visitas integer, vendas integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _use_evento boolean := (_campo_data = 'evento');
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d1 date;
  _d2 date;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  IF _di IS NULL OR _df IS NULL THEN
    _d1 := _hoje - 89;
    _d2 := _hoje;
  ELSE
    _d1 := (_di AT TIME ZONE 'America/Sao_Paulo')::date;
    _d2 := LEAST((_df AT TIME ZONE 'America/Sao_Paulo')::date, _hoje);
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(_d1, _d2, interval '1 day')::date AS d
  ),
  l AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  ag AS (
    SELECT (
      CASE WHEN _use_evento THEN (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
           ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
    ) AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (
        CASE WHEN _use_evento THEN (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
             ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
      ) BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  vi AS (
    SELECT (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.lead_status_transitions t
    JOIN public.leads le ON le.id = t.lead_id
    WHERE t.para_status = 'visita_realizada'
      AND le.deleted_at IS NULL AND le.na_lixeira = false
      AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR COALESCE(t.corretor_id, le.corretor_id) = _scope)
    GROUP BY 1
  ),
  ve AS (
    SELECT (
      CASE WHEN _use_evento THEN data_assinatura
           ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
    ) AS d, count(*)::int AS n
    FROM public.vendas
    WHERE distrato = false
      AND (
        CASE WHEN _use_evento THEN data_assinatura
             ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
      ) BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(l.n,0),
         COALESCE(ag.n,0),
         COALESCE(vi.n,0),
         COALESCE(ve.n,0)
  FROM dias
  LEFT JOIN l  ON l.d  = dias.d
  LEFT JOIN ag ON ag.d = dias.d
  LEFT JOIN vi ON vi.d = dias.d
  LEFT JOIN ve ON ve.d = dias.d
  ORDER BY dias.d;
END;
$function$;

-- ============================================================
-- P4: dashboard_funil
-- Leads só têm data de criação; expõe o parâmetro por consistência
-- de assinatura, mas o filtro segue sempre por created_at.
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_funil(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _campo_data text DEFAULT 'criacao'
)
RETURNS TABLE(etapa text, ordem integer, quantidade integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  PERFORM _campo_data;  -- reservado para uso futuro; leads só têm created_at

  RETURN QUERY
  WITH base AS (
    SELECT id, status FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (_di IS NULL OR created_at >= _di)
      AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
  )
  SELECT * FROM (VALUES
    ('Novos', 1, (SELECT count(*)::int FROM base)),
    ('Em atendimento', 2, (SELECT count(*)::int FROM base WHERE status IN ('aguardando_retorno','em_atendimento','qualificado','agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Agendados', 3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Visitas', 4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','analise_credito','contrato_fechado'))),
    ('Análise crédito', 5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','contrato_fechado'))),
    ('Fechados', 6, (SELECT count(*)::int FROM base WHERE status = 'contrato_fechado'))
  ) AS t(etapa, ordem, quantidade);
END;
$function$;

-- ============================================================
-- P5: dashboard_metricas_por_corretor
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_metricas_por_corretor(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.dashboard_metricas_por_corretor(
  _di timestamptz,
  _df timestamptz,
  _campo_data text DEFAULT 'criacao'
)
RETURNS TABLE(corretor_id uuid, nome text, leads integer, agendamentos integer, visitas integer, analise integer, fechados integer, perdidos integer, conversao numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _use_evento boolean := (_campo_data = 'evento');
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH ll AS (
    SELECT l.corretor_id AS cid, count(*)::int AS n,
           count(*) FILTER (WHERE l.status='perdido')::int AS perd
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.corretor_id IS NOT NULL
      AND l.created_at >= _di AND l.created_at < _df
    GROUP BY l.corretor_id
  ),
  ag AS (
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.corretor_id IS NOT NULL
      AND (
        (NOT _use_evento AND a.created_at >= _di AND a.created_at < _df)
        OR (_use_evento AND a.data_inicio >= _di AND a.data_inicio < _df)
      )
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id AS cid,
           count(*) FILTER (WHERE t.para_status='visita_realizada')::int AS vi,
           count(*) FILTER (WHERE t.para_status='analise_credito')::int AS an,
           count(*) FILTER (WHERE t.para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions t
    WHERE t.created_at >= _di AND t.created_at < _df AND t.corretor_id IS NOT NULL
    GROUP BY t.corretor_id
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
$function$;

-- ============================================================
-- P6: dashboard_motivos_perda
-- 'evento' usa a data em que a transição para perdido foi registrada
-- (comportamento atual). 'criacao' passa a usar leads.updated_at ou o
-- created_at da transição — na prática o mesmo momento em que o
-- corretor gravou a perda no CRM.
-- ============================================================
DROP FUNCTION IF EXISTS public.dashboard_motivos_perda(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_motivos_perda(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _campo_data text DEFAULT 'criacao'
)
RETURNS TABLE(motivo text, quantidade integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  PERFORM _campo_data;

  RETURN QUERY
  WITH perdas AS (
    SELECT
      COALESCE(
        NULLIF(trim(l.motivo_perda_categoria), ''),
        NULLIF(trim(l.motivo_perdido), ''),
        'nao_informado'
      ) AS m,
      COALESCE(
        (SELECT max(t.created_at) FROM public.lead_status_transitions t
          WHERE t.lead_id = l.id AND t.para_status = 'perdido'),
        l.updated_at
      ) AS quando
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false
      AND l.status = 'perdido'
      AND (_scope IS NULL OR l.corretor_id = _scope)
  )
  SELECT p.m, count(*)::int
  FROM perdas p
  WHERE (_di IS NULL OR p.quando >= _di)
    AND (_df IS NULL OR p.quando < _df)
  GROUP BY p.m
  ORDER BY 2 DESC
  LIMIT 12;
END;
$function$;

-- ============================================================
-- P7: gestao_metricas
-- 'criacao' usa interacoes.created_at, 'evento' segue com ocorreu_em.
-- ============================================================
DROP FUNCTION IF EXISTS public.gestao_metricas(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.gestao_metricas(
  _periodo_start timestamptz,
  _periodo_end timestamptz,
  _campo_data text DEFAULT 'criacao'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _use_evento boolean := (_campo_data = 'evento');
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'atividade', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'autor_id', a.autor_id,
          'ligacao', a.ligacao,
          'whatsapp', a.whatsapp,
          'visita', a.visita,
          'outras', a.outras,
          'total', a.total
        )
        ORDER BY a.total DESC
      )
      FROM (
        SELECT
          i.autor_id,
          count(*) FILTER (WHERE i.tipo = 'ligacao')  AS ligacao,
          count(*) FILTER (WHERE i.tipo = 'whatsapp') AS whatsapp,
          count(*) FILTER (WHERE i.tipo = 'visita')   AS visita,
          count(*) FILTER (WHERE i.tipo NOT IN ('ligacao', 'whatsapp', 'visita')) AS outras,
          count(*) AS total
        FROM public.interacoes i
        WHERE i.deleted_at IS NULL
          AND (
            (NOT _use_evento AND i.created_at >= _periodo_start AND i.created_at <= _periodo_end)
            OR (_use_evento AND i.ocorreu_em >= _periodo_start AND i.ocorreu_em <= _periodo_end)
          )
        GROUP BY i.autor_id
      ) a
    ), '[]'::jsonb),
    'aderencia', (
      SELECT jsonb_build_object(
        'total', count(*),
        'sem_corretor', count(*) FILTER (WHERE l.corretor_id IS NULL),
        'sem_email', count(*) FILTER (WHERE l.email IS NULL),
        'sem_renda', count(*) FILTER (WHERE l.renda_informada IS NULL)
      )
      FROM public.leads l
      WHERE l.na_lixeira = false
        AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
    )
  ) INTO _result;
  RETURN _result;
END;
$function$;
