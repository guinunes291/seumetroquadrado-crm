-- 1) Criar auth.users + profiles + roles para corretores faltantes
DO $mig$
DECLARE
  _brokers jsonb := '[
    {"legacy":7961898,"email":"sheldonbarbosaa@gmail.com","nome":"Sheldon Barbosa","role":"gestor","telefone":"11952954131"},
    {"legacy":11649527,"email":"dpconsultoria10@gmail.com","nome":"Dayane Prince","role":"superintendente","telefone":"11912033754"},
    {"legacy":12022299,"email":"patty.martirio77@gmail.com","nome":"Patricia Santos","role":"corretor","telefone":"11947802496"},
    {"legacy":21698610,"email":"michelilopes97@gmail.com","nome":"Michelli Lopes","role":"corretor","telefone":"11970282793"},
    {"legacy":37980275,"email":"gizadsa@gmail.com","nome":"Giza Duarte","role":"corretor","telefone":"11973997821"},
    {"legacy":38400613,"email":"ezequiel.jonatas1992@gmail.com","nome":"Ezequiel Silva","role":"corretor","telefone":null},
    {"legacy":38430149,"email":"taynaracorretora8@gmail.com","nome":"Taynara da Costa Souza","role":"corretor","telefone":"11944943278"},
    {"legacy":39780403,"email":"geovannedasilva79@gmail.com","nome":"Geovane da Silva","role":"corretor","telefone":"11982435850"},
    {"legacy":41340004,"email":"camillederolle7@gmail.com","nome":"Camille Derolle","role":"corretor","telefone":"11939307359"}
  ]'::jsonb;
  _b jsonb;
  _uid uuid;
BEGIN
  FOR _b IN SELECT * FROM jsonb_array_elements(_brokers) LOOP
    SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(_b->>'email') LIMIT 1;

    IF _uid IS NULL THEN
      _uid := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        _uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        _b->>'email', '', now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        jsonb_build_object('nome', _b->>'nome'),
        now(), now()
      );
    END IF;

    INSERT INTO public.profiles (id, email, nome, legacy_user_id, telefone)
    VALUES (_uid, _b->>'email', _b->>'nome', (_b->>'legacy')::bigint, _b->>'telefone')
    ON CONFLICT (id) DO UPDATE SET
      legacy_user_id = COALESCE(public.profiles.legacy_user_id, EXCLUDED.legacy_user_id),
      nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
      telefone = COALESCE(public.profiles.telefone, EXCLUDED.telefone);

    -- garante role pedido; remove o default 'corretor' se foi gestor/superint.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, (_b->>'role')::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END
$mig$;

-- 2) Religa leads sem corretor para os legacy_ids que agora têm profile (match direto)
ALTER TABLE public.leads DISABLE TRIGGER trg_alerta_lead_distribuido;

UPDATE public.leads l
SET corretor_id = p.id
FROM public.stg_leads s
JOIN public.profiles p ON p.legacy_user_id = s.corretor_legacy
WHERE l.legacy_id = s.legacy_id
  AND l.corretor_id IS NULL
  AND s.corretor_legacy IS NOT NULL;

-- 3) Mapa de legacy_ids secundários (mesma pessoa, vários IDs antigos)
WITH map(legacy, uid) AS (
  VALUES
    (39180001::bigint, (SELECT id FROM public.profiles WHERE legacy_user_id = 21698610)),
    (39785368::bigint, (SELECT id FROM public.profiles WHERE legacy_user_id = 11649527)),
    (5055943::bigint,  '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (7722800::bigint,  '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (35250002::bigint, '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (36090010::bigint, '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid)
)
UPDATE public.leads l
SET corretor_id = m.uid
FROM public.stg_leads s
JOIN map m ON m.legacy = s.corretor_legacy
WHERE l.legacy_id = s.legacy_id
  AND l.corretor_id IS NULL
  AND m.uid IS NOT NULL;

-- 4) corretor_anterior pelo mesmo critério (match direto e mapa)
UPDATE public.leads l
SET corretor_anterior_id = p.id
FROM public.stg_leads s
JOIN public.profiles p ON p.legacy_user_id = s.corretor_anterior_legacy
WHERE l.legacy_id = s.legacy_id
  AND l.corretor_anterior_id IS NULL
  AND s.corretor_anterior_legacy IS NOT NULL;

WITH map(legacy, uid) AS (
  VALUES
    (39180001::bigint, (SELECT id FROM public.profiles WHERE legacy_user_id = 21698610)),
    (39785368::bigint, (SELECT id FROM public.profiles WHERE legacy_user_id = 11649527)),
    (5055943::bigint,  '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (7722800::bigint,  '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (35250002::bigint, '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid),
    (36090010::bigint, '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid)
)
UPDATE public.leads l
SET corretor_anterior_id = m.uid
FROM public.stg_leads s
JOIN map m ON m.legacy = s.corretor_anterior_legacy
WHERE l.legacy_id = s.legacy_id
  AND l.corretor_anterior_id IS NULL
  AND m.uid IS NOT NULL;

ALTER TABLE public.leads ENABLE TRIGGER trg_alerta_lead_distribuido;