
-- Permite ao próprio usuário atualizar seu perfil (nome, telefone, cargo, bio, avatar_url).
-- Campos sensíveis (equipe, status, papel, presença, contadores, admissão, email) são
-- preservados por trigger quando o autor da mudança não é admin.

CREATE POLICY "profiles_update_self"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin pode alterar qualquer coisa.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Preserva campos sensíveis quando não-admin (inclui self-update).
  NEW.ativo := OLD.ativo;
  NEW.status_conta := OLD.status_conta;
  NEW.equipe_id := OLD.equipe_id;
  NEW.data_admissao := OLD.data_admissao;
  NEW.presente := OLD.presente;
  NEW.presente_em := OLD.presente_em;
  NEW.last_lead_assigned_at := OLD.last_lead_assigned_at;
  NEW.leads_recebidos_hoje := OLD.leads_recebidos_hoje;
  NEW.email := OLD.email;
  NEW.id := OLD.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_sensitive ON public.profiles;
CREATE TRIGGER trg_profiles_protect_sensitive
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_sensitive_fields();
