CREATE OR REPLACE FUNCTION public.isleadavancado_status(_status public.lead_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _status IN (
    'agendado'::public.lead_status,
    'qualificado'::public.lead_status,
    'visita_realizada'::public.lead_status,
    'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status,
    'contrato_fechado'::public.lead_status,
    'pos_venda'::public.lead_status
  )
$$;

GRANT EXECUTE ON FUNCTION public.isleadavancado_status(public.lead_status) TO authenticated;