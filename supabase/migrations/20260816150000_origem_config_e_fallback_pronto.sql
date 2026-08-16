-- ============================================================================
-- Consolidação das roletas de origem — decisão de produto de 2026-08-16 (2/2):
-- mesclar ou desativar roleta passa a ser operação de DADOS, segura e feita
-- pela UI, sem migration. Duas mudanças:
--
--  1) A precedência fixa da Landing sai do código: canal 'webhook_landing'
--     passa a resolver pela LINHA EDITÁVEL da origem 'site' em
--     distribuicao_config (o seed garante a linha; o valor padrão continua
--     'landing', então nada muda até a gestão mexer). Reapontar 'site' para
--     outra roleta agora move TAMBÉM os leads de landing page — antes o
--     hardcode furava o mapeamento e impedia a mesclagem.
--  2) Roleta de origem DESPREPARADA (inativa ou sem participante ativo não
--     pausado) não represa lead: a triagem cai para o Plantão quando o
--     Plantão está pronto. Desativar Marquinhos/Landing vira um switch sem
--     efeito colateral — os leads seguem sendo atendidos. O desvio fica
--     auditável no contexto ('origem_fallback'). Plantão despreparado mantém
--     o comportamento de sempre: fila de exceções + alerta + cron.
--
-- Slug explícito (manual/exceção/repasse) e roleta da ZONA não passam pelo
-- fallback — decisão deliberada continua mandando, e zona já tem a própria
-- guarda de prontidão (roleta_da_zona).
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) _roleta_pronta — a MESMA régua de prontidão da roleta_da_zona, agora
--    nomeada e reutilizável: ativa e com pelo menos um participante ativo
--    não pausado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_pronta(_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.roletas r
    JOIN public.roleta_participantes rp ON rp.roleta_id = r.id
    WHERE r.slug = _slug
      AND r.ativo
      AND rp.ativo
      AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
  )
$$;

REVOKE ALL ON FUNCTION public._roleta_pronta(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_pronta(text) TO service_role;

-- roleta_da_zona passa a usar a régua nomeada (comportamento idêntico).
CREATE OR REPLACE FUNCTION public.roleta_da_zona(_zona text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT zr.roleta_slug
  FROM public.zonas_roletas zr
  WHERE zr.zona = _zona
    AND public._roleta_pronta(zr.roleta_slug)
$$;

GRANT EXECUTE ON FUNCTION public.roleta_da_zona(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) _resolver_roleta_lead — canal landing resolve pela linha 'site' do
--    mapeamento editável (seed da fundação garante 1 linha por origem).
--    'Nenhuma' escolhida pela gestão é respeitada (NULL → exceção).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolver_roleta_lead(_canal text, _origem public.lead_origem)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _canal = 'webhook_landing' THEN
      (SELECT dc.roleta_slug FROM public.distribuicao_config dc
        WHERE dc.origem = 'site'::public.lead_origem)
    ELSE
      (SELECT dc.roleta_slug FROM public.distribuicao_config dc
        WHERE dc.origem = _origem)
  END;
$$;
REVOKE ALL ON FUNCTION public._resolver_roleta_lead(text, public.lead_origem) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolver_roleta_lead(text, public.lead_origem) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Motor v3 — fallback de prontidão na triagem por origem. Corpo idêntico
--    ao de 20260816120000 fora o bloco de resolução do slug e o contexto.
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
  -- Resolução da roleta (2026-08-16): slug explícito manda; depois a roleta
  -- da ZONA (se pronta); por fim a triagem por canal/origem — e aí, roleta
  -- de origem despreparada cai para o Plantão pronto em vez de represar o
  -- lead (torna seguro desativar/mesclar roletas de origem pela UI).
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

    -- Vencedor: apto há mais tempo sem receber NESTA roleta (cursor único),
    -- com lock no cursor para concorrência entre webhook/cron/manual.
    SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
    FROM public.roleta_participantes rp
    JOIN public.profiles p ON p.id = rp.corretor_id
    WHERE rp.roleta_id = _r.id
      AND rp.corretor_id = ANY(_aptos_ids)
    ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
    FOR UPDATE OF rp SKIP LOCKED
    LIMIT 1;

    _regra := 'rodizio_menos_recente';
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
    'origem_fallback', _origem_fallback
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
-- 4) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public._roleta_pronta(text)') IS NULL THEN
    RAISE EXCEPTION '_roleta_pronta ausente';
  END IF;
  IF position('_roleta_pronta' IN pg_get_functiondef(
       'public.roleta_da_zona(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roleta_da_zona sem a régua de prontidão';
  END IF;
  IF position('distribuicao_config' IN pg_get_functiondef(
       'public._resolver_roleta_lead(text,public.lead_origem)'::regprocedure)) = 0
     OR position('''landing''' IN pg_get_functiondef(
       'public._resolver_roleta_lead(text,public.lead_origem)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION '_resolver_roleta_lead ainda tem destino fixo para landing';
  END IF;
  IF position('_origem_fallback' IN pg_get_functiondef(
       'public._distribuir_lead_v3(uuid,public.distribuicao_tipo,text,uuid,uuid,text,jsonb,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'motor v3 sem fallback de prontidão da origem';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
