DO $mig$
DECLARE
  _uid uuid;
  _admin uuid;
  _mail text := 'kamilla.lima@interno.smq.local';
  _foto text := '/__l5e/assets-v1/7467f8ae-3bad-4158-af4b-37307ea528af/kamilla-lima.png';
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = _mail LIMIT 1;

  IF _uid IS NULL THEN
    SELECT ur.user_id INTO _admin
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role AND p.status_conta = 'ativa'
    ORDER BY p.created_at
    LIMIT 1;

    INSERT INTO public.convites_crm (email, papel, criado_por, expira_em)
    VALUES (_mail, 'corretor'::public.app_role, _admin, now() + interval '1 day')
    ON CONFLICT DO NOTHING;

    _uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      _uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      _mail, '', now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('nome','Kamilla Lima'),
      now(), now()
    );
  END IF;

  UPDATE public.profiles
     SET nome = 'Kamilla Lima',
         email = '',
         telefone = NULL,
         ativo = true,
         status_conta = 'ativa'::public.status_conta,
         avatar_url = _foto,
         perfil_completo = true
   WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'corretor'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END
$mig$;