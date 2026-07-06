CREATE OR REPLACE FUNCTION public.dashboard_metricas_por_corretor(_di timestamp with time zone, _df timestamp with time zone)
 RETURNS TABLE(corretor_id uuid, nome text, leads integer, agendamentos integer, visitas integer, analise integer, fechados integer, perdidos integer, conversao numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
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
      AND a.created_at >= _di AND a.created_at < _df
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id AS cid,
      count(*) FILTER (WHERE t.para_status='visita_realizada')::int AS vi,
      count(*) FILTER (WHERE t.para_status='analise_credito')::int  AS an,
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