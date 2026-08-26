-- ============================================================================
-- Distribuição v2 — MOTOR (2/2) — Política de Distribuição de Leads SMQ v1
--
-- O motor v2 vive DENTRO do motor v3 atrás da flag modelo_v2_ativo (a
-- fundação 20260826120000 criou tudo desligado). Com a flag DESLIGADA o
-- comportamento é bit a bit o vigente (rodízio "há mais tempo sem receber");
-- rollback = 1 UPDATE em distribuicao_settings, sem migração de dados.
--
-- Com a flag LIGADA:
--   * classe_lead='base' roteia para a roleta 'base' (rodízio puro, o piso);
--   * lead quente usa SWRR por FAIXA DE VELOCIDADE (tier A/B/C = peso 3/2/1,
--     mediana do 1º contato em minutos úteis, devolvido por SLA vale 60);
--   * elegibilidade ganha a régua extra do v2 (onboarding concluído, vínculo
--     definido, WIP abaixo do disjuntor), auditada em 'inaptos_v2';
--   * cada devolução por SLA registra estouro; 2 no dia pausam o corretor no
--     QUENTE até o dia seguinte (a base continua — decisão de política);
--   * SLA do quente passa a ser global (sla_quente_minutos, 15) em minutos
--     úteis, para todo lead quente distribuído (não só via_webhook);
--   * posse 7/30: lead sem registro volta para a casa como BASE (cron diário);
--   * o recálculo semanal de tiers passa a calcular FAIXAS DE VELOCIDADE
--     para todas as roletas (com a flag desligada, mantém o cálculo de
--     campanha por agendamento/venda, intocado).
--
-- Modo SOMBRA (modelo_v2_sombra=true com a flag desligada): cada atribuição
-- real grava em distribuicao_sombra quem o v2 teria escolhido na MESMA
-- roleta (sem mexer em cursor nenhum) — validação antes da virada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Flag helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._modelo_v2_ativo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_dist_setting('modelo_v2_ativo') #>> '{}')::boolean, false)
$$;

REVOKE ALL ON FUNCTION public._modelo_v2_ativo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._modelo_v2_ativo() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Estouro de SLA — 1 linha por (corretor, lead), conta da pausa automática.
--    A pausa NÃO alcança a roleta 'base': o corretor pausado no quente segue
--    recebendo base (piso preservado, decisão explícita da política).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._registrar_estouro_sla(_corretor uuid, _lead uuid, _slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limite int := COALESCE((public.get_dist_setting('pausa_estouros_dia') #>> '{}')::int, 2);
  _sla int := COALESCE((public.get_dist_setting('sla_quente_minutos') #>> '{}')::int, 15);
  _hoje int;
  _pausa_ate timestamptz;
BEGIN
  IF _corretor IS NULL THEN RETURN; END IF;

  -- Idempotência: o cron pode re-tentar o repasse do mesmo lead — o estouro
  -- daquele corretor naquele lead conta uma única vez.
  IF EXISTS (SELECT 1 FROM public.sla_estouros e
              WHERE e.corretor_id = _corretor AND e.lead_id = _lead) THEN
    RETURN;
  END IF;

  INSERT INTO public.sla_estouros (corretor_id, lead_id, roleta_slug, sla_minutos)
  VALUES (_corretor, _lead, _slug, _sla);

  SELECT count(*) INTO _hoje
  FROM public.sla_estouros e
  WHERE e.corretor_id = _corretor
    AND (e.criado_em AT TIME ZONE 'America/Sao_Paulo')::date
        = (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF _hoje >= _limite THEN
    _pausa_ate := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                   + interval '1 day') AT TIME ZONE 'America/Sao_Paulo';

    UPDATE public.roleta_participantes rp
       SET pausado_ate = GREATEST(COALESCE(rp.pausado_ate, _pausa_ate), _pausa_ate),
           motivo_pausa = 'Pausa automática: ' || _hoje || ' estouros de SLA no dia'
      FROM public.roletas r
     WHERE r.id = rp.roleta_id
       AND rp.corretor_id = _corretor
       AND rp.ativo
       AND r.slug <> 'base';

    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    SELECT rp.roleta_id, _corretor, 'pausado',
           'Automática: ' || _hoje || ' estouros de SLA no dia (pausado no quente até o dia seguinte)',
           NULL
    FROM public.roleta_participantes rp
    JOIN public.roletas r ON r.id = rp.roleta_id
    WHERE rp.corretor_id = _corretor AND rp.ativo AND r.slug <> 'base';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public._registrar_estouro_sla(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._registrar_estouro_sla(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Motor — corpo vigente (20260816150000) + ramos v2. Diferenças marcadas
--    com [V2]. Com _v2=false o caminho é o mesmo de antes, linha a linha.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(_lead_id uuid, _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo, _roleta_slug text DEFAULT NULL::text, _corretor_id uuid DEFAULT NULL::uuid, _distribuido_por uuid DEFAULT NULL::uuid, _gatilho text DEFAULT 'manual'::text, _contexto_extra jsonb DEFAULT '{}'::jsonb, _registrar_excecao boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
  _vencedor_zonas text[];
  _tentaram uuid[];
  _aptos_ids uuid[];
  _aptos_json jsonb;
  _inaptos_json jsonb;
  _n_ativos int;
  _agora_brt time;
  _dentro_horario boolean;
  _contexto jsonb;
  _log_id uuid;
  _motivo_falha text;
  _motivo_log text;
  _excecao_id uuid;
  _zona text;
  _aptos_zona uuid[];
  _zona_fallback boolean := false;
  _divergencia_zona boolean := false;
  _roleta_tipo text;
  _origem_fallback text;
  -- [V2]
  _v2 boolean := public._modelo_v2_ativo();
  _sombra boolean := COALESCE((public.get_dist_setting('modelo_v2_sombra') #>> '{}')::boolean, false);
  _classe text;
  _inaptos_v2 jsonb := '[]'::jsonb;
  _sum_pesos int;
  _faixa_vencedor text;
  _sombra_vencedor uuid;
  _sombra_faixa text;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  -- Lead na lixeira/excluído NUNCA é distribuído; exceção aberta (se houver)
  -- é arquivada para não assombrar a fila.
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead está na lixeira — distribuição bloqueada'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_na_lixeira');
  END IF;

  -- Idempotência: distribuição automática nunca rouba lead já atribuído.
  -- Fecha exceção aberta órfã — senão "Reprocessar" vira beco sem saída.
  IF _lead.corretor_id IS NOT NULL AND _tipo = 'automatica' AND _corretor_id IS NULL THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead já estava atribuído'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  _tentaram := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  _zona := public.zona_do_lead(_lead_id);
  _classe := COALESCE(_lead.classe_lead, 'quente');

  -- Resolução da roleta. [V2] Lead de BASE vai direto para a esteira 'base'
  -- (o piso universal) — zona e origem não decidem fila para base. Nos
  -- demais casos, precedência vigente: slug explícito; roleta da ZONA (se
  -- pronta); triagem por canal/origem com fallback de prontidão do Plantão.
  IF _v2 AND _corretor_id IS NULL AND _roleta_slug IS NULL AND _classe = 'base' THEN
    _slug := 'base';
  ELSE
    _slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona));
    IF _slug IS NULL THEN
      _slug := public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem);
      IF _slug IS NOT NULL AND _slug <> 'plantao'
         AND NOT public._roleta_pronta(_slug)
         AND public._roleta_pronta('plantao') THEN
        _origem_fallback := _slug;
        _slug := 'plantao';
      END IF;
    END IF;
  END IF;

  -- [V2] Devolução por SLA: o estouro do dono anterior conta (uma vez por
  -- lead) e alimenta a pausa automática — mesmo se este repasse falhar.
  IF _v2 AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _slug);
  END IF;

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome, p.zonas INTO _vencedor_nome, _vencedor_zonas
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
    -- Fora da zona: a decisão humana vale, mas o desvio fica visível no
    -- retorno (aviso na UI) e no log (auditoria).
    IF _zona IS NOT NULL AND COALESCE(array_length(_vencedor_zonas, 1), 0) > 0
       AND NOT (_zona = ANY(_vencedor_zonas)) THEN
      _divergencia_zona := true;
    END IF;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      _motivo_falha := 'origem_nao_mapeada';
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      IF _registrar_excecao THEN
        _excecao_id := public._registrar_excecao_distribuicao(
          _lead_id, _motivo_falha,
          'Origem "' || _lead.origem::text || '" sem roleta vinculada', NULL, _contexto);
      END IF;
      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
      VALUES
        (_lead_id, NULL, _tipo, 'Origem sem roleta vinculada — lead na fila de exceções',
         _distribuido_por, NULL, 'triagem', 'excecao')
      RETURNING id INTO _log_id;
      INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);
      RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha);
    END IF;

    SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roleta % inexistente', _slug;
    END IF;
    _roleta_tipo := _r.tipo;

    -- Janela de funcionamento (BRT). Fora da janela sem permissão: o lead
    -- espera o cron — sem exceção e sem log (evita 1 registro por minuto).
    IF _r.horario_inicio IS NOT NULL AND _r.horario_fim IS NOT NULL THEN
      _agora_brt := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
      IF _r.horario_inicio <= _r.horario_fim THEN
        _dentro_horario := _agora_brt BETWEEN _r.horario_inicio AND _r.horario_fim;
      ELSE
        _dentro_horario := (_agora_brt >= _r.horario_inicio OR _agora_brt <= _r.horario_fim);
      END IF;
      IF NOT _dentro_horario AND NOT _r.permitir_fora_horario
         AND _tipo IN ('automatica','redistribuicao') AND auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'fora_do_horario', 'roleta', _slug);
      END IF;
    END IF;

    -- Snapshot de elegibilidade (fonte única) — vira contexto auditável.
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'ultimo_lead_em', e.ultimo_lead_em)
        ORDER BY e.ultimo_lead_em ASC NULLS FIRST)
        FILTER (WHERE e.apto), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'motivos', to_jsonb(e.motivos), 'pct_trabalhado', e.pct_trabalhado,
          'recebidos_hoje', e.recebidos_hoje, 'limite_diario', e.limite_diario)
        ORDER BY e.nome)
        FILTER (WHERE NOT e.apto), '[]'::jsonb),
      COALESCE(array_agg(e.corretor_id) FILTER (WHERE e.apto), ARRAY[]::uuid[]),
      count(*) FILTER (WHERE e.participante_ativo AND NOT e.pausado)
    INTO _aptos_json, _inaptos_json, _aptos_ids, _n_ativos
    FROM public._elegibilidade_roleta(_slug) e;

    IF NOT _r.ativo THEN
      _aptos_ids := ARRAY[]::uuid[];
      _n_ativos := 0;
    END IF;

    -- Exclui quem já teve o lead (redistribuição nunca devolve ao mesmo).
    _aptos_ids := ARRAY(SELECT unnest(_aptos_ids) EXCEPT SELECT unnest(_tentaram));

    -- [V2] Régua extra de elegibilidade: onboarding concluído, vínculo
    -- (fixo/autônomo) definido e WIP abaixo do disjuntor. Quem cai aqui fica
    -- auditado em 'inaptos_v2' no contexto da decisão.
    IF _v2 AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      SELECT
        COALESCE(array_agg(x.corretor_id) FILTER (WHERE x.apto), ARRAY[]::uuid[]),
        COALESCE(jsonb_agg(jsonb_build_object(
            'corretor_id', x.corretor_id, 'motivos', to_jsonb(x.motivos)))
          FILTER (WHERE NOT x.apto), '[]'::jsonb)
      INTO _aptos_ids, _inaptos_v2
      FROM (
        SELECT u.corretor_id, e.apto, e.motivos
        FROM unnest(_aptos_ids) AS u(corretor_id)
        CROSS JOIN LATERAL public._apto_extra_v2(u.corretor_id) e
      ) x;
    END IF;

    -- Fila por zona: o lead vai para corretor que atende a zona dele
    -- (corretor sem zona configurada atende todas). Se NINGUÉM apto atende
    -- a zona, cai para qualquer apto — atender rápido vale mais que o corte
    -- geográfico; o desvio fica registrado no contexto ('zona_fallback').
    -- Na roleta de ZONA o filtro é PULADO — a participação já é o corte.
    IF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'
       AND array_length(_aptos_ids, 1) > 0 THEN
      _aptos_zona := ARRAY(
        SELECT p.id FROM public.profiles p
         WHERE p.id = ANY(_aptos_ids)
           AND (COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas))
      );
      IF COALESCE(array_length(_aptos_zona, 1), 0) > 0 THEN
        _aptos_ids := _aptos_zona;
      ELSE
        _zona_fallback := true;
      END IF;
    END IF;

    IF _v2 AND _classe = 'quente' AND _slug <> 'base' THEN
      -- [V2] QUENTE: smooth weighted round-robin por faixa de velocidade
      -- (tier A/B/C = peso 3/2/1). Advisory lock serializa o cursor SWRR;
      -- desempate: cursor maior, depois há mais tempo sem receber, depois id.
      PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _r.id::text));

      SELECT sum(CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END)
        INTO _sum_pesos
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

      IF COALESCE(_sum_pesos, 0) > 0 THEN
        UPDATE public.roleta_participantes rp
           SET wrr_current = rp.wrr_current
               + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
         WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

        SELECT rp.corretor_id, p.nome, rp.tier
          INTO _vencedor, _vencedor_nome, _faixa_vencedor
        FROM public.roleta_participantes rp
        JOIN public.profiles p ON p.id = rp.corretor_id
        WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
        ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
        LIMIT 1;

        UPDATE public.roleta_participantes
           SET wrr_current = wrr_current - _sum_pesos
         WHERE roleta_id = _r.id AND corretor_id = _vencedor;
      END IF;

      _regra := 'ponderado_velocidade' ||
                COALESCE(':faixa' || _faixa_vencedor, '');
    ELSE
      -- Rodízio por cursor: apto há mais tempo sem receber NESTA roleta,
      -- com lock no cursor para concorrência entre webhook/cron/manual.
      -- [V2] É também a mecânica da esteira BASE (rodízio puro, o piso).
      SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
      FROM public.roleta_participantes rp
      JOIN public.profiles p ON p.id = rp.corretor_id
      WHERE rp.roleta_id = _r.id
        AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      FOR UPDATE OF rp SKIP LOCKED
      LIMIT 1;

      _regra := CASE WHEN _v2 THEN 'rodizio_base' ELSE 'rodizio_menos_recente' END;
    END IF;
  END IF;

  _contexto := jsonb_build_object(
    'roleta', _slug,
    'roleta_tipo', _roleta_tipo,
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'divergencia_zona', _divergencia_zona,
    'origem_fallback', _origem_fallback,
    'modelo_v2', _v2,
    'classe_lead', _classe,
    'inaptos_v2', _inaptos_v2,
    'faixa_vencedor', _faixa_vencedor
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF COALESCE(_n_ativos, 0) = 0 THEN
      _motivo_falha := 'sem_corretor_ativo';
      _motivo_log := 'Roleta ' || _slug || ' sem participante ativo — lead na fila de exceções';
    ELSE
      _motivo_falha := 'sem_corretor_elegivel';
      _motivo_log := 'Roleta ' || _slug || ' sem corretor apto no momento — lead na fila de exceções';
    END IF;

    IF _registrar_excecao THEN
      _excecao_id := public._registrar_excecao_distribuicao(
        _lead_id, _motivo_falha, _motivo_log, _slug, _contexto);
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, _slug, _regra, 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha, 'roleta', _slug);
  END IF;

  -- ----------------------------- vencedor ----------------------------------
  _contexto := _contexto || jsonb_build_object(
    'vencedor', jsonb_build_object('corretor_id', _vencedor, 'nome', _vencedor_nome));

  UPDATE public.leads
     SET corretor_anterior_id = CASE
           WHEN corretor_id IS NOT NULL AND corretor_id <> _vencedor THEN corretor_id
           ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         -- Memória da roleta de ZONA — repasse por SLA fica no mesmo time
         -- da zona (o pino de campanha continua intocado).
         roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(_tentaram) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor) END
   WHERE id = _lead_id;

  -- Cursor único da roleta (se o corretor participa dela).
  IF _slug IS NOT NULL THEN
    UPDATE public.roleta_participantes rp
       SET ultimo_lead_em = now()
      FROM public.roletas r
     WHERE r.id = rp.roleta_id AND r.slug = _slug AND rp.corretor_id = _vencedor;
  END IF;

  -- Cursor global informativo (integrações externas). Os contadores legados
  -- de fila_distribuicao NÃO são mais escritos: cota deriva do log.
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _vencedor, _tipo,
     CASE
       WHEN _regra = 'manual_direta' AND _divergencia_zona
         THEN 'Atribuição manual direta (corretor fora da Zona ' || _zona || ')'
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       WHEN _regra LIKE 'ponderado_velocidade%'
         THEN 'Roleta ' || _slug || ' — ponderado por velocidade (faixa ' || COALESCE(_faixa_vencedor, 'B') || ')'
       WHEN _regra = 'rodizio_base'
         THEN 'Roleta ' || _slug || ' — rodízio universal (há mais tempo sem receber)'
       WHEN _origem_fallback IS NOT NULL
         THEN 'Roleta ' || _slug || ' — rodízio (roleta ' || _origem_fallback || ' inativa/sem time; caiu no Plantão)'
       WHEN _zona_fallback
         THEN 'Roleta ' || _slug || ' — rodízio (sem apto na Zona ' || _zona || '; fallback para qualquer apto)'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     _distribuido_por, _slug, _regra, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  -- [V2] Modo SOMBRA: com o v2 desligado, registra quem o v2 teria escolhido
  -- na MESMA roleta (régua extra + argmax de wrr_current + peso da faixa),
  -- sem tocar cursor nenhum. Nunca pode derrubar a distribuição real.
  IF NOT _v2 AND _sombra AND _regra <> 'manual_direta'
     AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
    BEGIN
      SELECT rp.corretor_id, rp.tier
        INTO _sombra_vencedor, _sombra_faixa
      FROM public.roleta_participantes rp
      JOIN LATERAL public._apto_extra_v2(rp.corretor_id) e ON e.apto
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY (rp.wrr_current + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END) DESC,
               rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
      LIMIT 1;

      INSERT INTO public.distribuicao_sombra
        (lead_id, roleta_slug, classe_lead, vencedor_real, vencedor_v2, faixa_v2, contexto)
      VALUES
        (_lead_id, _slug, _classe, _vencedor, _sombra_vencedor, _sombra_faixa,
         jsonb_build_object('gatilho', _gatilho,
                            'seria_fila_base', _classe = 'base'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra,
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'aviso_zona', CASE WHEN _divergencia_zona
      THEN 'Corretor não atende a Zona ' || _zona ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) SLA do quente — com a flag LIGADA a régua é global (sla_quente_minutos,
--    em minutos úteis, todo lead QUENTE com dono aguardando atendimento);
--    com a flag DESLIGADA o corpo é o vigente (por origem, só via_webhook).
--    O ramo v2 injeta 'corretor_anterior_sla' no contexto — é essa chave que
--    faz o motor registrar o estouro e armar a pausa automática.
-- ---------------------------------------------------------------------------
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

      _res := public._distribuir_lead_v3(
        _lead.id, 'redistribuicao', _zslug, NULL, NULL, 'sla_webhook',
        jsonb_build_object('sla_minutos', _sla,
                           'corretor_anterior_sla', _anterior));

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

    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', _zslug, NULL, NULL, 'sla_webhook',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));

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

REVOKE ALL ON FUNCTION public.redistribuir_sla_webhook() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redistribuir_sla_webhook() TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Posse 7/30 — lead sem NENHUM registro volta para a casa como BASE.
--    O cron de fila (processar_distribuicao_automatica, por minuto) pega o
--    lead devolvido e o roteia pela esteira base — nada novo a orquestrar.
--    Não retroativa: ultima_atividade_em nasceu = now() na fundação.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.devolver_leads_posse_expirada()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record; _qtd int := 0; _log_id uuid;
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
BEGIN
  IF NOT public._modelo_v2_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.status, l.ultima_atividade_em,
             CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                  THEN _d_av ELSE _d_ini END AS regra_dias,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.ultima_atividade_em ASC) AS rn
      FROM public.leads l
      WHERE l.corretor_id IS NOT NULL
        AND l.na_lixeira = false
        AND l.deleted_at IS NULL
        AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
        AND l.ultima_atividade_em < now() - (
              CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                   THEN _d_av ELSE _d_ini END || ' days')::interval
    )
    SELECT id, corretor_id, status, regra_dias
    FROM candidatos
    WHERE rn <= 10          -- máx. 10 devoluções por corretor por rodada
    ORDER BY ultima_atividade_em ASC
    LIMIT 50                -- e 50 no total — devolução gradual, sem tsunami
  LOOP
    UPDATE public.leads
       SET corretor_anterior_id = corretor_id,
           corretor_id = NULL,
           classe_lead = 'base',
           status = 'aguardando_atendimento',
           tentativas_redistribuicao = 0,
           -- Ciclo novo: só o dono que sentou no lead fica de fora da
           -- próxima rodada (a lista antiga não pode excluir o time todo).
           corretores_que_tentaram = ARRAY[corretor_id]
     WHERE id = _lead.id AND corretor_id = _lead.corretor_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead.id, NULL, 'redistribuicao',
       'Posse expirada (' || _lead.regra_dias || ' dias sem registro) — devolvido para a base',
       'base', 'posse_expirada', 'sucesso')
    RETURNING id INTO _log_id;

    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_build_object(
      'gatilho', 'posse_expirada',
      'corretor_anterior', _lead.corretor_id,
      'status_no_momento', _lead.status,
      'regra_dias', _lead.regra_dias));

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $$;

REVOKE ALL ON FUNCTION public.devolver_leads_posse_expirada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_leads_posse_expirada() TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Faixas de velocidade — recálculo semanal. Amostras da janela: leads com
--    1º contato do corretor (minutos úteis) + devoluções por SLA valendo 60.
--    Amostra < mínima = faixa B (neutra) — novato não nasce punido nem
--    premiado. A faixa do corretor é a MESMA em todas as roletas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_faixas_velocidade(_gatilho text DEFAULT 'cron')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _janela int := COALESCE((public.get_dist_setting('janela_faixa_dias') #>> '{}')::int, 14);
  _amin   int := COALESCE((public.get_dist_setting('amostra_minima_faixa') #>> '{}')::int, 5);
  _fa     int := COALESCE((public.get_dist_setting('faixa_a_max_min') #>> '{}')::int, 15);
  _fb     int := COALESCE((public.get_dist_setting('faixa_b_max_min') #>> '{}')::int, 60);
  _mudancas int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _fx_faixas (
    corretor_id uuid PRIMARY KEY, mediana numeric, amostra int, faixa text
  ) ON COMMIT DROP;
  TRUNCATE _fx_faixas;

  INSERT INTO _fx_faixas (corretor_id, mediana, amostra, faixa)
  WITH contatos AS (
    SELECT dl.corretor_id,
           public._minutos_uteis_entre(dl.created_at, i.primeiro_contato)::numeric AS minutos
    FROM public.distribution_log dl
    JOIN LATERAL (
      SELECT min(i.ocorreu_em) AS primeiro_contato
      FROM public.interacoes i
      WHERE i.lead_id = dl.lead_id
        AND i.autor_id = dl.corretor_id
        AND i.ocorreu_em >= dl.created_at
    ) i ON i.primeiro_contato IS NOT NULL
    WHERE dl.resultado = 'sucesso'
      AND dl.corretor_id IS NOT NULL
      AND dl.created_at >= now() - (_janela || ' days')::interval
  ),
  estouros AS (
    SELECT e.corretor_id, 60::numeric AS minutos
    FROM public.sla_estouros e
    WHERE e.criado_em >= now() - (_janela || ' days')::interval
  ),
  amostras AS (
    SELECT * FROM contatos UNION ALL SELECT * FROM estouros
  )
  SELECT a.corretor_id,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutos),
         count(*)::int,
         NULL
  FROM amostras a
  GROUP BY a.corretor_id;

  UPDATE _fx_faixas
     SET faixa = CASE
       WHEN amostra < _amin THEN 'B'
       WHEN mediana <= _fa THEN 'A'
       WHEN mediana <= _fb THEN 'B'
       ELSE 'C'
     END;

  -- Histórico ANTES do update (uma linha por participação cuja faixa muda).
  WITH alvos AS (
    SELECT rp.roleta_id, rp.corretor_id, rp.tier AS tier_ant,
           COALESCE(f.faixa, 'B') AS tier_novo,
           COALESCE(f.mediana, 0) AS mediana,
           COALESCE(f.amostra, 0) AS amostra
    FROM public.roleta_participantes rp
    JOIN public.roletas r ON r.id = rp.roleta_id AND r.ativo
    LEFT JOIN _fx_faixas f ON f.corretor_id = rp.corretor_id
    WHERE rp.ativo
  ),
  hist AS (
    INSERT INTO public.roleta_tier_historico
      (roleta_id, corretor_id, tier_anterior, tier_novo, score, leads_janela, gatilho)
    SELECT roleta_id, corretor_id, tier_ant, tier_novo, mediana, amostra,
           'velocidade:' || _gatilho
    FROM alvos
    WHERE tier_ant IS DISTINCT FROM tier_novo
    RETURNING 1
  )
  SELECT count(*) INTO _mudancas FROM hist;

  UPDATE public.roleta_participantes rp
     SET tier = f.faixa,
         tier_score = f.mediana,
         tier_updated_at = now(),
         faixa_amostra = f.amostra
    FROM _fx_faixas f, public.roletas r
   WHERE r.id = rp.roleta_id AND r.ativo AND rp.ativo
     AND f.corretor_id = rp.corretor_id;

  -- Quem não tem amostra nenhuma volta ao neutro explicitamente.
  UPDATE public.roleta_participantes rp
     SET tier = 'B', tier_score = NULL, tier_updated_at = now(), faixa_amostra = 0
    FROM public.roletas r
   WHERE r.id = rp.roleta_id AND r.ativo AND rp.ativo
     AND NOT EXISTS (SELECT 1 FROM _fx_faixas f WHERE f.corretor_id = rp.corretor_id);

  RETURN _mudancas;
END; $$;

REVOKE ALL ON FUNCTION public.recalcular_faixas_velocidade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_faixas_velocidade(text) TO authenticated, service_role;

-- O cron semanal existente (recalc-tiers-roletas-weekly, segunda 08:00 BRT)
-- passa a rotear pela flag: v2 ligado = faixas de velocidade para todas as
-- roletas; desligado = cálculo de campanha vigente, intocado.
CREATE OR REPLACE FUNCTION public.recalcular_tiers_todas(_gatilho text DEFAULT 'cron')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _r record; _total int := 0;
BEGIN
  IF public._modelo_v2_ativo() THEN
    RETURN public.recalcular_faixas_velocidade(_gatilho);
  END IF;

  FOR _r IN SELECT slug FROM public.roletas WHERE tipo='campanha' AND ativo LOOP
    _total := _total + public.recalcular_tiers_roleta(_r.slug, _gatilho);
  END LOOP;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_tiers_todas(text) FROM public;
GRANT EXECUTE ON FUNCTION public.recalcular_tiers_todas(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Cron diário da posse (09:00 BRT = 12:00 UTC). Com a flag desligada a
--    função retorna 0 — agendar aqui não muda comportamento nenhum.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('posse-expirada-diaria')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'posse-expirada-diaria');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'posse-expirada-diaria',
  '0 12 * * *',
  $$SELECT public.devolver_leads_posse_expirada()$$
);

-- ---------------------------------------------------------------------------
-- 8) Sanidade — aborta o deploy se algum ramo do v2 (ou o caminho vigente)
--    tiver sumido.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public._distribuir_lead_v3(uuid,public.distribuicao_tipo,text,uuid,uuid,text,jsonb,boolean)'::regprocedure);
  IF position('_modelo_v2_ativo' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor sem a flag do v2';
  END IF;
  IF position('rodizio_menos_recente' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor perdeu o caminho vigente (rodizio_menos_recente) — rollback quebrado';
  END IF;
  IF position('ponderado_velocidade' IN _def) = 0 OR position('rodizio_base' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor sem os ramos do v2 (ponderado_velocidade/rodizio_base)';
  END IF;
  IF position('_apto_extra_v2' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor sem a régua extra de elegibilidade do v2';
  END IF;
  IF position('_registrar_estouro_sla' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor sem o registro de estouro de SLA';
  END IF;

  _def := pg_get_functiondef('public.redistribuir_sla_webhook()'::regprocedure);
  IF position('sla_quente_minutos' IN _def) = 0 OR position('timeout_minutos' IN _def) = 0 THEN
    RAISE EXCEPTION 'SLA sem os dois ramos (v2 global + vigente por origem)';
  END IF;
  IF position('_minutos_uteis_entre' IN _def) = 0 THEN
    RAISE EXCEPTION 'SLA v2 sem minutos úteis';
  END IF;

  _def := pg_get_functiondef('public.recalcular_tiers_todas(text)'::regprocedure);
  IF position('recalcular_faixas_velocidade' IN _def) = 0
     OR position('recalcular_tiers_roleta' IN _def) = 0 THEN
    RAISE EXCEPTION 'recalculo semanal sem o roteamento por flag';
  END IF;

  IF to_regprocedure('public.devolver_leads_posse_expirada()') IS NULL THEN
    RAISE EXCEPTION 'devolver_leads_posse_expirada ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
