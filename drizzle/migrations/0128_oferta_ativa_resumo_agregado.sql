CREATE OR REPLACE FUNCTION public.listar_ofertas_ativas_resumo(_arquivadas boolean DEFAULT false)
RETURNS TABLE (
  id uuid, nome text, descricao text, status text, corretor_id uuid,
  criado_por uuid, filtros jsonb, created_at timestamptz, updated_at timestamptz,
  total_leads bigint, total_contatados bigint, total_avancados bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT o.id, o.nome, o.descricao, o.status, o.corretor_id,
         o.criado_por, o.filtros, o.created_at, o.updated_at,
         count(v.id), count(v.id) FILTER (WHERE v.contatado),
         count(v.id) FILTER (WHERE v.avancado)
  FROM public.ofertas_ativas AS o
  LEFT JOIN public.oferta_ativa_leads AS v ON v.oferta_id = o.id
  WHERE CASE WHEN _arquivadas THEN o.status = 'arquivada' ELSE o.status <> 'arquivada' END
  GROUP BY o.id
  ORDER BY o.created_at DESC, o.id;
$function$;
REVOKE ALL ON FUNCTION public.listar_ofertas_ativas_resumo(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_ofertas_ativas_resumo(boolean) TO authenticated;
COMMENT ON FUNCTION public.listar_ofertas_ativas_resumo(boolean) IS 'Read-only offer summaries. SECURITY INVOKER preserves both existing offer and link RLS policies; progress uses the trigger-maintained contact/advancement flags.';