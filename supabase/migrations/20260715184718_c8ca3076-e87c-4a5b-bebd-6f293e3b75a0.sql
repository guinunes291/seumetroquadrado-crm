
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  NEW.ativo := OLD.ativo;
  NEW.status_conta := OLD.status_conta;
  NEW.equipe_id := OLD.equipe_id;
  NEW.data_admissao := OLD.data_admissao;
  NEW.presente := OLD.presente;
  NEW.presente_em := OLD.presente_em;
  NEW.last_lead_assigned_at := OLD.last_lead_assigned_at;
  NEW.email := OLD.email;
  NEW.id := OLD.id;
  RETURN NEW;
END;
$$;
