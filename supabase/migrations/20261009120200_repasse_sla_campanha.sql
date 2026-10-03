-- ============================================================================
-- REPASSE POR SLA DE LEAD DE CAMPANHA — o repasse que nunca acontecia
-- ============================================================================
-- O defeito: o repasse imediato (disparar_repasse_sla_lead, chamado pela tela
-- quando o relógio zera) e o cron de leads parados (redistribuir_leads_parados)
-- mandavam o lead de CAMPANHA para distribuir_lead_ponderado sem liberá-lo. A
-- roleta ponderada começa pela idempotência de lead novo — "lead com dono não
-- é comigo" — e devolvia {ok:false, motivo:'ja_atribuido'}. Resultado:
--
--   * o lead ficava com o mesmo corretor que estourou o SLA;
--   * tentativas_redistribuicao só sobe quando o repasse dá certo, então o
--     lead nunca escalava para a gestão (escala em 2 tentativas);
--   * no cron de parados, o lead falho não abria exceção (sem backoff) e
--     voltava como candidato a CADA MINUTO. A busca pega os 50 mais antigos —
--     ~50 leads de campanha travados bastavam para nenhum outro lead parado
--     ser repassado;
--   * só o cron de SLA (redistribuir_sla_webhook) repassava, e jogava fora o
--     pino da campanha (ia para a triagem geral), contra o que a política e o
--     painel de Campanhas prometem ("o repasse por SLA fica dentro da equipe").
--
-- O conserto — uma régua só para os TRÊS caminhos de repasse:
--   _repassar_lead_campanha: repassa um lead QUE JÁ TEM DONO dentro da equipe
--   da campanha (SWRR por tier, cota diária), pulando quem já teve o lead,
--   reiniciando o relógio do SLA e respeitando a zona estrita
--   (20261009120100):
--     * campanha comum + lead com zona  → time da zona (motor, 'redistribuicao');
--     * equipe fixa    + lead com zona  → quem da equipe atende a zona; sem
--       ninguém, o time da zona;
--     * lead sem zona                   → equipe da campanha;
--     * campanha desligada              → motor (a triagem normal, como o
--       token desligado já faz na entrada);
--     * ninguém para receber            → o lead fica com o dono atual, a
--       exceção abre (alerta + backoff do cron) — nunca mais o laço infinito.
--
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._repassar_lead_campanha(
  _lead_id uuid,
  _roleta_slug text,
  _gatilho text,
  _contexto_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record;
  _lead record;
  _zona text;
  _estrita boolean := public._zona_estrita();
  _tentaram uuid[];
  _picked uuid;
  _picked_nome text;
  _tier_picked text;
  _sum_pesos int;
  _n_zona int;
  _ctx jsonb;
  _log_id uuid;
  _excecao_id uuid;
  _motivo_log text;
BEGIN
  SELECT l.id, l.corretor_id, l.corretores_que_tentaram, l.deleted_at, l.na_lixeira
    INTO _lead
    FROM public.leads l WHERE l.id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  _zona := public.zona_do_lead(_lead_id);
  -- Quem já teve o lead não recebe de volta — o dono atual incluído, mesmo
  -- que o chamador não o tenha posto na lista.
  _tentaram := array_append(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]),
                            _lead.corretor_id);
  _ctx := jsonb_build_object('campanha', _roleta_slug, 'repasse', true)
          || COALESCE(_contexto_extra, '{}'::jsonb);

  SELECT * INTO _roleta FROM public.roletas
   WHERE slug = _roleta_slug AND tipo = 'campanha' AND ativo;

  -- Campanha desligada (ou não é campanha): a triagem normal decide — zona
  -- estrita, pino de zona e origem, como o motor faz com qualquer repasse.
  IF NOT FOUND THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
      _ctx || jsonb_build_object('campanha_inativa', true));
  END IF;

  -- Zona estrita: campanha comum com lead de zona é do time da zona.
  IF _estrita AND _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho, _ctx);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _rlc_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _rlc_elegiveis;

  -- Mesma elegibilidade da roleta ponderada (20261009120100), menos quem já
  -- teve o lead.
  INSERT INTO _rlc_elegiveis
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
    AND NOT (rp.corretor_id = ANY(_tentaram))
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

  IF _estrita THEN
    -- Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _rlc_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _rlc_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _rlc_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _rlc_elegiveis;

  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    -- Equipe fixa com lead de zona e ninguém da equipe na zona: time da zona.
    IF _estrita AND _zona IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
        _ctx || jsonb_build_object('equipe_fixa', true, 'equipe_sem_apto_na_zona', true));
    END IF;

    -- Ninguém mais na equipe: o lead fica com o dono atual e a exceção abre
    -- (alerta à gestão + backoff do cron). Antes, o cron de parados o
    -- re-tentava a cada minuto, sem fim.
    _motivo_log := 'Repasse na campanha ' || _roleta.slug
                   || ' sem outro corretor apto — lead segue com o dono atual';
    _ctx := _ctx || jsonb_build_object('roleta', _roleta.slug, 'gatilho', _gatilho,
                                       'zona', _zona, 'excluidos_por_tentativa', to_jsonb(_tentaram));
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'sem_corretor_elegivel', _motivo_log, _roleta.slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, 'redistribuicao', _motivo_log, _roleta.slug,
       'repasse_campanha', 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_elegivel',
                              'excecao_id', _excecao_id, 'roleta', _roleta.slug);
  END IF;

  -- [V2] O estouro do dono que perdeu o lead conta para a pausa automática,
  -- como no repasse do motor.
  IF public._modelo_v2_ativo() AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _roleta.slug);
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _rlc_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _rlc_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  -- Repasse = entrega nova: relógio do SLA reinicia, dono anterior registrado,
  -- pino da campanha mantido.
  UPDATE public.leads
     SET corretor_anterior_id = corretor_id,
         corretor_id = _picked,
         roleta_slug = _roleta.slug,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         corretores_que_tentaram = CASE
           WHEN _picked = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _picked) END
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;
  SELECT p.nome INTO _picked_nome FROM public.profiles p WHERE p.id = _picked;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _picked, 'redistribuicao',
     'Repasse na campanha ' || _roleta.slug || ' (' || _gatilho || ') — tier ' || COALESCE(_tier_picked, 'B'),
     _roleta.slug, 'repasse_campanha:' || _roleta.slug || ':tier' || COALESCE(_tier_picked, 'B'),
     'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object(
    'roleta', _roleta.slug, 'gatilho', _gatilho, 'zona', _zona,
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'vencedor', jsonb_build_object('corretor_id', _picked, 'nome', _picked_nome)));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolucao = 'Repassado na campanha para ' || COALESCE(_picked_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked, 'corretor_nome', _picked_nome,
    'tier', _tier_picked, 'roleta', _roleta.slug, 'zona', _zona);
END;
$function$;

REVOKE ALL ON FUNCTION public._repassar_lead_campanha(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._repassar_lead_campanha(uuid, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Os três caminhos de repasse passam pela régua acima. Corpos vigentes
-- (disparar_repasse_sla_lead: 20260718172727; redistribuir_leads_parados:
-- 20260816150000; redistribuir_sla_webhook: 20260826121000) com só o ramo de
-- campanha trocado. A condição de campanha deixa de exigir roleta ATIVA: a
-- desligada também vai para _repassar_lead_campanha, que a manda para a
-- triagem normal (antes ia ao motor com o slug da campanha desligada, que
-- não tem apto — exceção na certa).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _lead record; _res jsonb; _anterior uuid; _novo uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, l.roleta_slug, dc.timeout_minutos
    INTO _lead
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.id = _lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
    PERFORM public._escalar_lead_gestor(_lead_id, _lead.tentativas_redistribuicao);
    RETURN false;
  END IF;

  _anterior := _lead.corretor_id;

  UPDATE public.leads
     SET corretores_que_tentaram = array_append(
           COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
   WHERE id = _lead_id
     AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  -- Lead de campanha repassa DENTRO da campanha (equipe/tier/pino), com a
  -- zona estrita; campanha desligada cai na triagem normal. Antes ia para a
  -- roleta ponderada de lead NOVO, que recusa lead com dono ('ja_atribuido')
  -- — o repasse nunca acontecia (20261009120200).
  IF _lead.roleta_slug IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.roletas r
        WHERE r.slug = _lead.roleta_slug AND r.tipo = 'campanha'
     ) THEN
    _res := public._repassar_lead_campanha(
      _lead_id, _lead.roleta_slug, 'sla_webhook_imediato',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));
  ELSE
    _res := public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', _lead.roleta_slug, NULL, _caller, 'sla_webhook_imediato',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));
  END IF;

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id
     RETURNING corretor_id INTO _novo;

    IF _novo IS NOT NULL AND _novo <> _anterior THEN
      PERFORM public._auditar_redistribuicao(
        _lead_id, _anterior, _novo,
        'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
      PERFORM public._notificar_handoff_novo_dono(
        _lead_id, _novo,
        'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
        ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record; _res jsonb; _qtd int := 0; _anterior uuid; _novo uuid;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao, l.roleta_slug,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             COALESCE(l.tentativas_redistribuicao, 0) AS tentativas,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL AND l.data_distribuicao IS NOT NULL
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.distribuicao_excecoes e
          WHERE e.lead_id = l.id AND e.status IN ('pendente','em_analise')
            AND e.tentativas >= _max_tent AND e.updated_at > now() - interval '30 minutes'
        )
    )
    SELECT id, corretor_id, data_distribuicao, roleta_slug, timeout_horas, tentativas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    IF _lead.tentativas >= 2 THEN
      PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas);
      CONTINUE;
    END IF;

    _anterior := _lead.corretor_id;

    UPDATE public.leads
       SET corretores_que_tentaram = array_append(
             COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    -- Campanha do lead → repasse dentro da mesma equipe (20261009120200: a
    -- ponderada recusava lead com dono e este laço o re-tentava a cada
    -- minuto, sem exceção nem backoff — travando os 50 mais antigos).
    IF _lead.roleta_slug IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _lead.roleta_slug AND r.tipo='campanha')
    THEN
      _res := public._repassar_lead_campanha(
        _lead.id, _lead.roleta_slug, 'lead_parado',
        jsonb_build_object('timeout_horas', _lead.timeout_horas,
                           'corretor_anterior_parado', _anterior));
    ELSE
      -- Pino de zona (mesma regra do repasse imediato): lead de roleta de
      -- zona redistribui NO time da zona; os demais re-triam do zero.
      _res := public._distribuir_lead_v3(
        _lead.id, 'redistribuicao',
        CASE
          WHEN _lead.roleta_slug IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.roletas r
            WHERE r.slug = _lead.roleta_slug AND r.tipo = 'zona')
          THEN _lead.roleta_slug ELSE NULL END,
        NULL, NULL, 'lead_parado',
        jsonb_build_object('timeout_horas', _lead.timeout_horas,
                           'corretor_anterior_parado', _anterior));
    END IF;

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id
       RETURNING corretor_id INTO _novo;

      IF _novo IS NOT NULL AND _novo <> _anterior THEN
        PERFORM public._auditar_redistribuicao(
          _lead.id, _anterior, _novo,
          'SLA/redistribuição ('||COALESCE(_lead.roleta_slug,'geral')||')');
      END IF;

      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END;
$function$;

CREATE OR REPLACE FUNCTION public.redistribuir_sla_webhook()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record; _res jsonb; _qtd int := 0; _anterior uuid; _novo uuid; _zslug text;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
  _v2 boolean := public._modelo_v2_ativo();
  _sla int := COALESCE((public.get_dist_setting('sla_quente_minutos') #>> '{}')::int, 15);
BEGIN
  IF NOT public._dentro_horario_comercial_brt() THEN
    RETURN 0;
  END IF;

  IF _v2 THEN
    FOR _lead IN
      SELECT l.id, l.corretor_id, l.tentativas_redistribuicao, l.roleta_slug, l.data_distribuicao
      FROM public.leads l
      WHERE l.classe_lead = 'quente'
        AND l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL
        AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND l.data_distribuicao IS NOT NULL
        AND l.data_distribuicao < now() - (_sla || ' minutes')::interval
        -- Guarda de virada: o SLA de 15 min cuida do lead RECÉM-entregue;
        -- estoque antigo (distribuído há mais de 7 dias) é assunto da regra
        -- de posse, não deste repasse — evita rajada no go-live da flag.
        AND l.data_distribuicao >= now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM public.distribuicao_excecoes e
          WHERE e.lead_id = l.id
            AND e.status IN ('pendente','em_analise')
            AND e.tentativas >= _max_tent
            AND e.updated_at > now() - interval '30 minutes'
        )
      ORDER BY l.data_distribuicao ASC
      LIMIT 50
      FOR UPDATE OF l SKIP LOCKED
    LOOP
      -- Minutos ÚTEIS de verdade (08:00-19:00 BRT): lead distribuído no fim
      -- do expediente só estoura quando a janela útil somar o SLA.
      IF public._minutos_uteis_entre(_lead.data_distribuicao, now()) < _sla THEN
        CONTINUE;
      END IF;

      IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
        PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas_redistribuicao);
        CONTINUE;
      END IF;

      _anterior := _lead.corretor_id;

      UPDATE public.leads
         SET corretores_que_tentaram = array_append(
               COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
       WHERE id = _lead.id
         AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

      -- Pino de zona: lead distribuído por roleta de zona repassa NO time dela.
      _zslug := CASE
        WHEN _lead.roleta_slug IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.roletas r
          WHERE r.slug = _lead.roleta_slug AND r.tipo = 'zona')
        THEN _lead.roleta_slug ELSE NULL END;

      -- Lead de campanha repassa dentro da campanha (20261009120200);
      -- antes este cron jogava o pino fora e mandava para a triagem geral.
      IF _lead.roleta_slug IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.roletas r
            WHERE r.slug = _lead.roleta_slug AND r.tipo = 'campanha') THEN
        _res := public._repassar_lead_campanha(
          _lead.id, _lead.roleta_slug, 'sla_webhook',
          jsonb_build_object('sla_minutos', _sla,
                             'corretor_anterior_sla', _anterior));
      ELSE
        _res := public._distribuir_lead_v3(
          _lead.id, 'redistribuicao', _zslug, NULL, NULL, 'sla_webhook',
          jsonb_build_object('sla_minutos', _sla,
                             'corretor_anterior_sla', _anterior));
      END IF;

      IF (_res->>'ok')::boolean THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento',
               tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
         WHERE id = _lead.id
         RETURNING corretor_id INTO _novo;

        IF _novo IS NOT NULL AND _novo <> _anterior THEN
          PERFORM public._auditar_redistribuicao(
            _lead.id, _anterior, _novo,
            'Lead redistribuído por SLA (' || _sla || 'min úteis sem 1º contato)');
          PERFORM public._notificar_handoff_novo_dono(
            _lead.id, _novo,
            'redistribuido por SLA (' || _sla || 'min): ' ||
            COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
            ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
        END IF;
        _qtd := _qtd + 1;
      END IF;
    END LOOP;

    RETURN _qtd;
  END IF;

  -- ------------------- flag DESLIGADA: corpo vigente -----------------------
  FOR _lead IN
    SELECT l.id, l.corretor_id, l.tentativas_redistribuicao, l.roleta_slug, dc.timeout_minutos
    FROM public.leads l
    JOIN public.distribuicao_config dc
      ON dc.origem = l.origem AND dc.timeout_minutos IS NOT NULL
    WHERE l.via_webhook = true
      AND l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
      AND l.data_distribuicao < now() - (dc.timeout_minutos || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
    ORDER BY l.data_distribuicao ASC
    LIMIT 50
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
      PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas_redistribuicao);
      CONTINUE;
    END IF;

    _anterior := _lead.corretor_id;

    UPDATE public.leads
       SET corretores_que_tentaram = array_append(
             COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    _zslug := CASE
      WHEN _lead.roleta_slug IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.roletas r
        WHERE r.slug = _lead.roleta_slug AND r.tipo = 'zona')
      THEN _lead.roleta_slug ELSE NULL END;

    -- Lead de campanha repassa dentro da campanha (20261009120200).
    IF _lead.roleta_slug IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.roletas r
          WHERE r.slug = _lead.roleta_slug AND r.tipo = 'campanha') THEN
      _res := public._repassar_lead_campanha(
        _lead.id, _lead.roleta_slug, 'sla_webhook',
        jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                           'corretor_anterior_sla', _anterior));
    ELSE
      _res := public._distribuir_lead_v3(
        _lead.id, 'redistribuicao', _zslug, NULL, NULL, 'sla_webhook',
        jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                           'corretor_anterior_sla', _anterior));
    END IF;

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id
       RETURNING corretor_id INTO _novo;

      IF _novo IS NOT NULL AND _novo <> _anterior THEN
        PERFORM public._auditar_redistribuicao(
          _lead.id, _anterior, _novo,
          'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
        PERFORM public._notificar_handoff_novo_dono(
          _lead.id, _novo,
          'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
          COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
          ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
      END IF;
      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END; $function$;

-- ---------------------------------------------------------------------------
-- Sanidade: nenhum caminho de repasse chama mais a ponderada de lead novo.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.disparar_repasse_sla_lead(uuid)',
    'public.redistribuir_leads_parados()',
    'public.redistribuir_sla_webhook()'
  ] LOOP
    IF position('distribuir_lead_ponderado' IN pg_get_functiondef(_fn::regprocedure)) > 0 THEN
      RAISE EXCEPTION 'repasse: % ainda chama distribuir_lead_ponderado', _fn;
    END IF;
    IF position('_repassar_lead_campanha' IN pg_get_functiondef(_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'repasse: % não usa _repassar_lead_campanha', _fn;
    END IF;
  END LOOP;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
