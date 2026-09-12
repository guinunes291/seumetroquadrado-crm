-- Escopo de equipe do gestor: só gerencia corretor das equipes que ele lidera
-- (equipes.gestor_id) ou da própria equipe dele (profiles.equipe_id).
CREATE OR REPLACE FUNCTION public.gestor_gere_corretor(_gestor uuid, _corretor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles c
    WHERE c.id = _corretor
      AND (
        c.equipe_id IN (SELECT e.id FROM public.equipes e WHERE e.gestor_id = _gestor)
        OR c.equipe_id = (SELECT g.equipe_id FROM public.profiles g WHERE g.id = _gestor)
      )
      AND c.equipe_id IS NOT NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.gestor_gere_corretor(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gerenciar_participante_roleta(_slug text, _corretor_id uuid, _acao text, _motivo text DEFAULT NULL::text, _limite integer DEFAULT NULL::integer, _pausado_ate timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _roleta_id uuid;
  _eh_admin boolean;
BEGIN
  _eh_admin := _caller IS NOT NULL AND public.has_role(_caller, 'admin');
  IF _caller IS NOT NULL AND NOT _eh_admin THEN
    IF NOT public.has_role(_caller, 'gestor') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    -- Gestor tem autonomia SOMENTE sobre corretores da(s) equipe(s) dele.
    IF NOT public.gestor_gere_corretor(_caller, _corretor_id) THEN
      RAISE EXCEPTION 'corretor fora da sua equipe';
    END IF;
  END IF;

  SELECT id INTO _roleta_id FROM public.roletas WHERE slug = _slug;
  IF _roleta_id IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  IF _acao = 'incluir' THEN
    IF _slug = 'marquinhos' AND NOT _eh_admin
       AND NOT (public.get_dist_setting('permitir_inclusao_manual') #>> '{}')::boolean THEN
      RAISE EXCEPTION 'inclusao manual desabilitada para gestores';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
      WHERE p.id = _corretor_id AND p.ativo = true
    ) THEN
      RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor';
    END IF;

    INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, limite_diario, incluido_por)
    VALUES (_roleta_id, _corretor_id, true, _limite, _caller)
    ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
      ativo = true,
      pausado_ate = NULL,
      motivo_pausa = NULL,
      limite_diario = COALESCE(EXCLUDED.limite_diario, public.roleta_participantes.limite_diario),
      incluido_por = _caller,
      incluido_em = now();
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'incluido', _motivo, _caller);

  ELSIF _acao = 'remover' THEN
    UPDATE public.roleta_participantes
       SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'removido', _motivo, _caller);

  ELSIF _acao = 'pausar' THEN
    IF _pausado_ate IS NULL OR _pausado_ate <= now() THEN
      RAISE EXCEPTION 'pausa exige data futura (_pausado_ate)';
    END IF;
    UPDATE public.roleta_participantes
       SET pausado_ate = _pausado_ate, motivo_pausa = _motivo
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'pausado',
            COALESCE(_motivo,'') || ' (até ' || to_char(_pausado_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
            _caller);

  ELSIF _acao = 'reativar' THEN
    UPDATE public.roleta_participantes
       SET ativo = true, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'reativado', _motivo, _caller);

  ELSIF _acao = 'limite' THEN
    UPDATE public.roleta_participantes
       SET limite_diario = _limite
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'limite_alterado',
            'Limite diário: ' || COALESCE(_limite::text, 'padrão'), _caller);

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id);
END;
$function$;