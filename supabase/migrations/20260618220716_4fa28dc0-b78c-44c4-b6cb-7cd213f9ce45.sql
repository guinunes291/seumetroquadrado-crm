CREATE OR REPLACE FUNCTION public.normalizar_status_lead_corretor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS trg_normalizar_status_lead_corretor ON public.leads;
CREATE TRIGGER trg_normalizar_status_lead_corretor
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.normalizar_status_lead_corretor();

UPDATE public.leads
SET status = 'aguardando_atendimento'::public.lead_status,
    data_distribuicao = COALESCE(data_distribuicao, now()),
    timestamp_recebimento = COALESCE(timestamp_recebimento, now())
WHERE corretor_id IS NOT NULL
  AND status = 'novo'::public.lead_status;