
DROP FUNCTION IF EXISTS public.distribuir_lead_webhook(uuid);

CREATE OR REPLACE FUNCTION public.distribuir_lead_webhook()
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

REVOKE ALL ON FUNCTION public.distribuir_lead_webhook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_webhook() TO service_role;
