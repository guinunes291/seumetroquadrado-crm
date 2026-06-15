
-- has_role precisa ser chamada por authenticated dentro das policies; bloqueamos anon e public.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;

-- handle_new_user e set_updated_at são acionadas só por triggers; ninguém deve chamar direto.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
