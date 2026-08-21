-- ---------------------------------------------------------------------------
-- 2026-08-21 — Roleta ponderada entrega o lead em "Aguardando atendimento"
--
-- Bug herdado do SWRR original (20260718): distribuir_lead_ponderado marcava
-- o lead recém-distribuído como 'em_atendimento' — 4ª etapa do funil — em vez
-- de 'aguardando_atendimento', a 1ª etapa (a mesma que o motor v3, o import e
-- o trigger normalizar_status_lead_corretor usam). Consequências: o lead de
-- campanha nascia pulando 3 colunas do kanban E ficava invisível para o
-- repasse por SLA (que só considera status = 'aguardando_atendimento').
-- Ninguém notou antes porque as roletas de campanha quase não recebiam lead
-- direto; com as campanhas de equipe fixa (equipe-guilherme/equipe-bruno) o
-- fluxo passou a ser diário.
--
-- Única mudança na função: o THEN do CASE de status (linha ~119) passa de
-- 'em_atendimento' para 'aguardando_atendimento'. Resto idêntico à versão de
-- 20260819100000_campanhas_equipe_fixa.sql.
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
             THEN 'aguardando_atendimento'::public.lead_status
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
-- Sanidade: a função não pode mais gravar 'em_atendimento' e tem que seguir
-- respeitando equipe_fixa (não regredir o fix de 19/08).
-- ---------------------------------------------------------------------------
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.distribuir_lead_ponderado(uuid,text)'::regprocedure);
  IF position('''em_atendimento''' IN _def) > 0 THEN
    RAISE EXCEPTION 'roleta ponderada ainda grava em_atendimento';
  END IF;
  IF position('aguardando_atendimento' IN _def) = 0 THEN
    RAISE EXCEPTION 'roleta ponderada não entrega em aguardando_atendimento';
  END IF;
  IF position('equipe_fixa' IN _def) = 0 THEN
    RAISE EXCEPTION 'roleta ponderada não respeita equipe_fixa';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
