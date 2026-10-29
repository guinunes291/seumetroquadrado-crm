CREATE OR REPLACE FUNCTION public.mcp_funil_contagens(
  _desde timestamptz DEFAULT NULL,
  _ate timestamptz DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _origens text[] DEFAULT NULL,
  _excluir_importados boolean DEFAULT false,
  _incluir_lixeira boolean DEFAULT false
)
RETURNS TABLE(status text, temperatura text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_service_bot(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.status::text, l.temperatura::text, count(*)::bigint
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND (_incluir_lixeira OR COALESCE(l.na_lixeira, false) = false)
    AND (_desde IS NULL OR l.created_at >= _desde)
    AND (_ate IS NULL OR l.created_at <= _ate)
    AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
    AND (_origens IS NULL OR l.origem::text = ANY(_origens))
    AND (NOT _excluir_importados OR l.origem::text <> 'importacao')
  GROUP BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_funil_contagens(timestamptz, timestamptz, uuid, text[], boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_funil_contagens(timestamptz, timestamptz, uuid, text[], boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.mcp_funil_contagens(timestamptz, timestamptz, uuid, text[], boolean, boolean) TO authenticated;