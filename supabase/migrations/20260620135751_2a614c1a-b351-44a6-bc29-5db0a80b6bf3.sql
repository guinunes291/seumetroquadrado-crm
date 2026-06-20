CREATE OR REPLACE FUNCTION public.leads_status_counts(
  _na_lixeira boolean DEFAULT false,
  _origem text DEFAULT NULL,
  _corretor text DEFAULT NULL,
  _temperatura text DEFAULT NULL,
  _periodo_start timestamptz DEFAULT NULL,
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
  WITH base AS (
    SELECT l.status::text AS status
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (
        _corretor IS NULL OR _corretor = 'all'
        OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
        OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor)
      )
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (_periodo_start IS NULL OR l.created_at >= _periodo_start)
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

GRANT EXECUTE ON FUNCTION public.leads_status_counts(boolean, text, text, text, timestamptz, text, text) TO authenticated;