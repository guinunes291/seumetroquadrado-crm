-- ============================================================================
-- Campanhas de EQUIPE FIXA — decisão de produto de 2026-08-19: campanhas de
-- conta de anúncio própria caem SEMPRE na equipe da campanha, sem delegar
-- para as roletas de zona.
--
--  1) roletas.equipe_fixa (boolean): campanha marcada não passa pelo
--     zona-primeiro do motor ponderado nem pelo filtro intra-equipe de
--     profiles.zonas — o rodízio fica 100% dentro do time da campanha.
--     O repasse por SLA já fica na mesma equipe (leads.roleta_slug pina a
--     campanha e os repasses chamam o ponderado de volta).
--  2) Seed de DUAS campanhas de equipe fixa com token próprio:
--     'equipe-guilherme' e 'equipe-bruno'. Times definidos pela gestão no
--     painel Campanhas (participação manual, como as demais).
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.roletas ADD COLUMN IF NOT EXISTS equipe_fixa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.roletas.equipe_fixa IS
  'Campanha de equipe fixa: não delega para as roletas de zona nem filtra por profiles.zonas — o rodízio fica sempre dentro do time da campanha.';

INSERT INTO public.roletas (slug, nome, descricao, criterio_participacao, exigir_presenca, tipo, equipe_fixa, webhook_token)
VALUES
  ('equipe-guilherme', 'Equipe Guilherme',
   'Campanhas da conta de anúncio própria — leads caem sempre neste time, sem corte por zona.',
   'manual', true, 'campanha', true, encode(gen_random_bytes(24), 'hex')),
  ('equipe-bruno', 'Equipe Bruno',
   'Campanhas da conta de anúncio própria — leads caem sempre neste time, sem corte por zona.',
   'manual', true, 'campanha', true, encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (slug) DO UPDATE
  SET tipo = 'campanha',
      equipe_fixa = true,
      criterio_participacao = 'manual',
      webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token);

-- ---------------------------------------------------------------------------
-- Roleta ponderada — corpo idêntico ao de 20260816140000 fora os dois pontos
-- comentados com "equipe_fixa".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int; _zslug text;
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  SELECT id, corretor_id, status INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  -- Zona primeiro — EXCETO campanha de equipe fixa: nela o lead nunca sai
  -- do time da campanha, seja qual for a zona.
  IF NOT _roleta.equipe_fixa THEN
    _zslug := public.roleta_da_zona(public.zona_do_lead(_lead_id));
    IF _zslug IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _dlp_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _dlp_elegiveis;

  INSERT INTO _dlp_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  -- Filtro intra-equipe por zona do corretor — também pulado na equipe fixa.
  _zona := public.zona_do_lead(_lead_id);
  IF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    SELECT count(*) INTO _n_zona
    FROM _dlp_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _dlp_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _dlp_elegiveis;
  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_disponivel');
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'em_atendimento'::public.lead_status
           ELSE status
         END,
         data_distribuicao = COALESCE(data_distribuicao, now())
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;

  INSERT INTO public.distribution_log(
    lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado
  )
  VALUES (
    _lead_id, _picked, 'automatica', 'roleta_ponderada',
    _roleta.slug, 'roleta:'||_roleta.slug||':tier'||_tier_picked, 'sucesso'
  );

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked,
    'tier', _tier_picked, 'roleta_slug', _roleta.slug,
    'zona', _zona
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuir_lead_ponderado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_ponderado(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.roletas
   WHERE tipo = 'campanha' AND equipe_fixa
     AND slug IN ('equipe-guilherme','equipe-bruno')
     AND webhook_token IS NOT NULL;
  IF _n < 2 THEN
    RAISE EXCEPTION 'seed das campanhas de equipe fixa incompleto (% de 2)', _n;
  END IF;
  IF position('equipe_fixa' IN pg_get_functiondef(
       'public.distribuir_lead_ponderado(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roleta ponderada não respeita equipe_fixa';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
