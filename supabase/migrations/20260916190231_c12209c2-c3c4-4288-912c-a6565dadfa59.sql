REVOKE EXECUTE ON FUNCTION public.onboarding_corretor_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.onboarding_corretor_concluir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_corretor_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_corretor_concluir() TO authenticated;