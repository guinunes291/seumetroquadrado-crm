
CREATE OR REPLACE FUNCTION public.arquivar_leads_sem_contato_30d()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Regra desativada em 2026-07-17: leads sem contato não devem ser
  -- auto-perdidos. Estoque de leads sem corretor fica em Gestão → Estoque.
  RETURN 0;
END;
$function$;
