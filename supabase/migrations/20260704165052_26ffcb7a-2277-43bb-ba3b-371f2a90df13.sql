
-- 1) Novo status: aguardando_corretor (fallback quando não há elegível na roleta)
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'aguardando_corretor';

-- 2) Coluna para roleta justa persistida
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_lead_assigned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_profiles_last_lead_assigned_at ON public.profiles(last_lead_assigned_at NULLS FIRST) WHERE ativo = true;

-- 3) RPC de roleta justa por webhook (least-recently-assigned)
-- Elegível: profiles.ativo, telefone não vazio, role='corretor' (exclui admin/gestor/docs-bot).
CREATE OR REPLACE FUNCTION public.distribuir_lead_webhook(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
BEGIN
  SELECT p.id
    INTO _cid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
   WHERE p.ativo = true
     AND p.telefone IS NOT NULL
     AND btrim(p.telefone) <> ''
     AND lower(coalesce(p.nome,'')) <> 'docs-bot'
   ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF _cid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _cid;
  RETURN _cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribuir_lead_webhook(uuid) TO service_role;

-- 4) Fallback gestor: primeiro gestor ativo (excluindo docs-bot), senão admin ativo.
CREATE OR REPLACE FUNCTION public.gestor_fallback_webhook()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE p.ativo = true
     AND lower(coalesce(p.nome,'')) <> 'docs-bot'
     AND ur.role IN ('gestor'::app_role, 'admin'::app_role)
   ORDER BY (ur.role = 'gestor'::app_role) DESC, p.created_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.gestor_fallback_webhook() TO service_role;
