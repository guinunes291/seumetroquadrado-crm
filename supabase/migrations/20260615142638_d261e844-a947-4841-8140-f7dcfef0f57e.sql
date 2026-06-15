-- Revoga execução pública das funções SECURITY DEFINER (continuam disponíveis a triggers e ao service_role)
REVOKE EXECUTE ON FUNCTION public.alerta_lead_distribuido() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alerta_tarefa_criada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alerta_agendamento_criado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_ultima_interacao_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resetar_cotas_diarias() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) FROM PUBLIC, anon, authenticated;
-- Mantém acesso ao service_role para o webhook chamar distribuir_lead
GRANT EXECUTE ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) TO service_role;