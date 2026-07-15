CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(
  p_de public.lead_status,
  p_para public.lead_status,
  p_gestao boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','visita_realizada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','agendado','proposta_enviada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','visita_realizada','proposta_enviada','contrato_fechado','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = ANY (ARRAY['pos_venda','analise_credito'])
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno'])
    ELSE false
  END;
$$;