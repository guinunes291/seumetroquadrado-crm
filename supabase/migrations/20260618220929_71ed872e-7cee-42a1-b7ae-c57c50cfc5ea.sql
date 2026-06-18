CREATE OR REPLACE FUNCTION public.normalizar_status_lead_corretor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NEW.corretor_id = auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'gestor') THEN
    NEW.status := 'aguardando_atendimento'::public.lead_status;
    NEW.data_distribuicao := COALESCE(NEW.data_distribuicao, now());
    NEW.timestamp_recebimento := COALESCE(NEW.timestamp_recebimento, now());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalizar_status_lead_corretor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalizar_status_lead_corretor() FROM anon;
REVOKE ALL ON FUNCTION public.normalizar_status_lead_corretor() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_status_lead_corretor() TO service_role;