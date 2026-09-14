CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _convite public.convites_crm%ROWTYPE;
  _email text;
BEGIN
  _email := lower(btrim(COALESCE(
    NULLIF(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data->>'email', ''),
    NULLIF(NEW.raw_user_meta_data->>'preferred_email', '')
  )));

  SELECT c.*
  INTO _convite
  FROM public.convites_crm AS c
  WHERE lower(btrim(c.email)) = _email
    AND c.estado = 'pendente'::public.convite_crm_estado
    AND c.expira_em > now()
  ORDER BY c.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro requer convite válido. Solicite um convite ao gestor.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, email, nome, equipe_id, status_conta)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.email, ''), _email, NEW.id::text || '@sem-email.invalid'),
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'nome'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
      split_part(COALESCE(_email, NEW.id::text), '@', 1)
    ),
    _convite.equipe_id,
    'ativa'::public.status_conta
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email),
        equipe_id = EXCLUDED.equipe_id,
        status_conta = 'ativa'::public.status_conta;

  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _convite.papel)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.convites_crm
  SET estado = 'aceito'::public.convite_crm_estado,
      aceito_por = NEW.id,
      aceito_em = now()
  WHERE id = _convite.id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;