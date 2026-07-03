
CREATE OR REPLACE FUNCTION public.isleadavancado_status(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_status, '') IN (
    'agendado','qualificado','visita_realizada','proposta_enviada',
    'analise_credito','contrato_fechado','pos_venda'
  );
$$;

GRANT EXECUTE ON FUNCTION public.isleadavancado_status(text) TO authenticated;
