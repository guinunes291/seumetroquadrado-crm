CREATE OR REPLACE FUNCTION public.vendas_total_empresa()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_active_member(auth.uid()) AND (
      public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  THEN jsonb_build_object(
    'mes', count(*) FILTER (WHERE date_trunc('month', data_assinatura) = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    'ano', count(*) FILTER (WHERE date_trunc('year', data_assinatura) = date_trunc('year', (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    'total', count(*))
  ELSE NULL END
  FROM public.vendas
  WHERE status_venda = 'aprovada' AND coalesce(distrato,false) = false AND data_assinatura IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.vendas_total_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendas_total_empresa() TO authenticated;