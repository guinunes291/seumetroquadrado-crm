DROP FUNCTION IF EXISTS public.leads_status_counts(boolean, text, text, text, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.leads_status_counts(
  _na_lixeira boolean DEFAULT false,
  _origem text DEFAULT NULL,
  _corretor text DEFAULT NULL,
  _temperatura text DEFAULT NULL,
  _periodo_start timestamptz DEFAULT NULL,
  _periodo_end timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _search_digits text DEFAULT NULL
) RETURNS TABLE(status text, quantidade bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _is_gestor := public.has_role(_caller,'admin')
             OR public.has_role(_caller,'gestor')
             OR public.has_role(_caller,'superintendente');

  RETURN QUERY
  WITH ultima_venda AS (
    SELECT DISTINCT ON (v.lead_id)
      v.lead_id,
      v.data_assinatura
    FROM public.vendas v
    WHERE v.lead_id IS NOT NULL
      AND COALESCE(v.distrato, false) = false
    ORDER BY v.lead_id, v.data_assinatura DESC NULLS LAST, v.created_at DESC
  ),
  base AS (
    SELECT l.status::text AS status
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (
        _corretor IS NULL OR _corretor = 'all'
        OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
        OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor)
      )
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (
        _periodo_start IS NULL OR
        CASE
          WHEN l.status::text = 'contrato_fechado' THEN COALESCE(uv.data_assinatura::timestamptz, l.created_at)
          ELSE l.created_at
        END >= _periodo_start
      )
      AND (
        _periodo_end IS NULL OR
        CASE
          WHEN l.status::text = 'contrato_fechado' THEN COALESCE(uv.data_assinatura::timestamptz, l.created_at)
          ELSE l.created_at
        END <= _periodo_end
      )
      AND (
        _search IS NULL OR _search = ''
        OR l.search_text ILIKE '%'||_search||'%'
        OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%')
      )
      AND (_is_gestor OR (l.corretor_id = _caller AND l.status::text <> 'novo'))
  )
  SELECT b.status, count(*) AS quantidade
  FROM base b
  GROUP BY b.status
  UNION ALL
  SELECT '__total__', count(*) FROM base;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_status_counts(boolean, text, text, text, timestamptz, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leads_filtered(
  _na_lixeira boolean DEFAULT false,
  _status text DEFAULT NULL,
  _origem text DEFAULT NULL,
  _corretor text DEFAULT NULL,
  _temperatura text DEFAULT NULL,
  _periodo_start timestamptz DEFAULT NULL,
  _periodo_end timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _search_digits text DEFAULT NULL,
  _limit int DEFAULT 1000,
  _offset int DEFAULT 0
) RETURNS TABLE(
  id uuid,
  nome text,
  email text,
  telefone text,
  origem text,
  status text,
  temperatura text,
  corretor_id uuid,
  projeto_id uuid,
  projeto_nome text,
  observacoes text,
  created_at timestamptz,
  ultima_interacao timestamptz,
  na_lixeira boolean,
  renda_informada text,
  entrada_disponivel text,
  usa_fgts boolean,
  data_venda date,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _is_gestor := public.has_role(_caller,'admin')
             OR public.has_role(_caller,'gestor')
             OR public.has_role(_caller,'superintendente');

  RETURN QUERY
  WITH ultima_venda AS (
    SELECT DISTINCT ON (v.lead_id)
      v.lead_id,
      v.data_assinatura
    FROM public.vendas v
    WHERE v.lead_id IS NOT NULL
      AND COALESCE(v.distrato, false) = false
    ORDER BY v.lead_id, v.data_assinatura DESC NULLS LAST, v.created_at DESC
  ),
  base AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.origem::text AS origem,
      l.status::text AS status,
      l.temperatura::text AS temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.observacoes,
      l.created_at,
      l.ultima_interacao,
      l.na_lixeira,
      l.renda_informada,
      l.entrada_disponivel,
      l.usa_fgts,
      uv.data_assinatura AS data_venda,
      CASE
        WHEN l.status::text = 'contrato_fechado' THEN COALESCE(uv.data_assinatura::timestamptz, l.created_at)
        ELSE l.created_at
      END AS data_filtro
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_status IS NULL OR _status = 'all' OR l.status::text = _status)
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (
        _corretor IS NULL OR _corretor = 'all'
        OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
        OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor)
      )
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (
        _search IS NULL OR _search = ''
        OR l.search_text ILIKE '%'||_search||'%'
        OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%')
      )
      AND (_is_gestor OR (l.corretor_id = _caller AND l.status::text <> 'novo'))
  ),
  filtrado AS (
    SELECT *
    FROM base b
    WHERE (_periodo_start IS NULL OR b.data_filtro >= _periodo_start)
      AND (_periodo_end IS NULL OR b.data_filtro <= _periodo_end)
  )
  SELECT
    f.id,
    f.nome,
    f.email,
    f.telefone,
    f.origem,
    f.status,
    f.temperatura,
    f.corretor_id,
    f.projeto_id,
    f.projeto_nome,
    f.observacoes,
    f.created_at,
    f.ultima_interacao,
    f.na_lixeira,
    f.renda_informada,
    f.entrada_disponivel,
    f.usa_fgts,
    f.data_venda,
    count(*) OVER() AS total_count
  FROM filtrado f
  ORDER BY
    CASE WHEN f.status = 'contrato_fechado' THEN f.data_venda END DESC NULLS LAST,
    f.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 1000), 1000))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_filtered(boolean, text, text, text, text, timestamptz, timestamptz, text, text, int, int) TO authenticated;