
REVOKE ALL ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resetar_cotas_diarias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resetar_cotas_diarias() TO service_role;
