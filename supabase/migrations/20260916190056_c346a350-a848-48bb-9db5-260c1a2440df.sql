ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_concluido_origem text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
       AND conname = 'profiles_onboarding_origem_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_origem_chk
      CHECK (onboarding_concluido_origem IS NULL
             OR onboarding_concluido_origem IN ('onboarding','manual'));
  END IF;
END $$;

UPDATE public.profiles
   SET onboarding_concluido_origem = 'manual'
 WHERE onboarding_concluido_em IS NOT NULL
   AND onboarding_concluido_origem IS NULL;

CREATE OR REPLACE FUNCTION public.onboarding_corretor_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'concluido_em', p.onboarding_concluido_em,
    'origem', p.onboarding_concluido_origem,
    'eh_corretor', public.has_role(p.id, 'corretor'),
    'tem_interacao', EXISTS (
      SELECT 1 FROM public.interacoes i
       WHERE i.autor_id = p.id AND i.deleted_at IS NULL
    )
  )
  FROM public.profiles p
  WHERE p.id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_corretor_concluir()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tem boolean;
  _ja timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_role(_uid, 'corretor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT p.onboarding_concluido_em INTO _ja FROM public.profiles p WHERE p.id = _uid;

  SELECT EXISTS (
    SELECT 1 FROM public.interacoes i WHERE i.autor_id = _uid AND i.deleted_at IS NULL
  ) INTO _tem;

  IF _ja IS NULL AND NOT _tem THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_interacao')
           || public.onboarding_corretor_status();
  END IF;

  UPDATE public.profiles p
     SET onboarding_concluido_em = COALESCE(p.onboarding_concluido_em, now()),
         onboarding_concluido_origem = COALESCE(p.onboarding_concluido_origem, 'onboarding')
   WHERE p.id = _uid;

  RETURN jsonb_build_object('ok', true) || public.onboarding_corretor_status();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.onboarding_corretor_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_corretor_concluir() TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_corretor_distribuicao(
  _corretor_id uuid,
  _zonas text[] DEFAULT NULL::text[],
  _modelo_contrato text DEFAULT NULL::text,
  _limpar_modelo_contrato boolean DEFAULT false,
  _onboarding_concluido boolean DEFAULT NULL::boolean,
  _limite_diario_webhook integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'onboarding_concluido_origem', p.onboarding_concluido_origem,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _antes
  FROM public.profiles p WHERE p.id = _corretor_id;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'corretor inexistente';
  END IF;

  IF _zonas IS NOT NULL
     AND NOT (_zonas <@ ARRAY['Norte','Sul','Leste','Oeste','Centro']::text[]) THEN
    RAISE EXCEPTION 'zona invalida (use Norte/Sul/Leste/Oeste/Centro)';
  END IF;

  IF _modelo_contrato IS NOT NULL AND _modelo_contrato NOT IN ('fixo','autonomo') THEN
    RAISE EXCEPTION 'modelo_contrato invalido (fixo|autonomo)';
  END IF;

  IF _limite_diario_webhook IS NOT NULL AND _limite_diario_webhook < 1 THEN
    RAISE EXCEPTION 'limite_diario_webhook deve ser >= 1';
  END IF;

  UPDATE public.profiles p SET
    zonas = COALESCE(_zonas, p.zonas),
    modelo_contrato = CASE
      WHEN _limpar_modelo_contrato THEN NULL
      WHEN _modelo_contrato IS NOT NULL THEN _modelo_contrato
      ELSE p.modelo_contrato END,
    onboarding_concluido_em = CASE
      WHEN _onboarding_concluido IS TRUE THEN COALESCE(p.onboarding_concluido_em, now())
      WHEN _onboarding_concluido IS FALSE THEN NULL
      ELSE p.onboarding_concluido_em END,
    onboarding_concluido_origem = CASE
      WHEN _onboarding_concluido IS TRUE THEN COALESCE(p.onboarding_concluido_origem, 'manual')
      WHEN _onboarding_concluido IS FALSE THEN NULL
      ELSE p.onboarding_concluido_origem END,
    limite_diario_webhook = COALESCE(_limite_diario_webhook, p.limite_diario_webhook)
  WHERE p.id = _corretor_id;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'onboarding_concluido_origem', p.onboarding_concluido_origem,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _depois
  FROM public.profiles p WHERE p.id = _corretor_id;

  IF _antes IS DISTINCT FROM _depois THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('profiles', _corretor_id, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'corretor', _depois);
END;
$function$;