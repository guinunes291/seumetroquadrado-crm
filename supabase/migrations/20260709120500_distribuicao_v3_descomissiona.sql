-- ============================================================================
-- Distribuição v3 — DESCOMISSIONAMENTO do motor legado.
--
-- Depois do cutover (nenhum caller usa mais os motores antigos):
--   • DROP dos pickers legados sem chamadores: distribuir_lead_webhook,
--     gestor_fallback_webhook, distribuir_lead_elegivel;
--   • distribuir_lead / corretor_elegivel / produtividade_corretores viram
--     WRAPPERS finos sobre o motor v3 (assinaturas preservadas — protege a
--     janela de deploy do edge function e integrações externas);
--   • o motor deixa de escrever nos contadores legados de fila_distribuicao
--     (a cota agora deriva 100% do distribution_log) e o cron de reset é
--     removido; a tabela vira legado somente-leitura.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) DROP dos pickers sem chamadores.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.distribuir_lead_webhook();
DROP FUNCTION IF EXISTS public.gestor_fallback_webhook();
DROP FUNCTION IF EXISTS public.distribuir_lead_elegivel(uuid);
DROP FUNCTION IF EXISTS public.distribuir_lead_elegivel(uuid, boolean);

-- ---------------------------------------------------------------------------
-- 2) distribuir_lead — wrapper de compatibilidade sobre o motor v3.
--    (Assinatura idêntica; retorna o corretor ou NULL como antes.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo,
  _distribuido_por uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _res jsonb;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _res := public._distribuir_lead_v3(
    _lead_id, _tipo, NULL, NULL,
    COALESCE(_distribuido_por, _caller), 'compat_distribuir_lead', '{}'::jsonb);

  IF (_res->>'ok')::boolean THEN
    RETURN (_res->>'corretor_id')::uuid;
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) corretor_elegivel — wrapper: apto na roleta PLANTÃO pelo motor v3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretor_elegivel(_corretor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT e.apto FROM public._elegibilidade_roleta('plantao') e
      WHERE e.corretor_id = _corretor_id),
    false);
$$;

GRANT EXECUTE ON FUNCTION public.corretor_elegivel(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) produtividade_corretores — wrapper sobre a fonte única de elegibilidade
--    (mesmo shape de retorno da versão de 20260702120000).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.produtividade_corretores()
RETURNS TABLE (
  corretor_id uuid,
  total_ativos integer,
  aguardando integer,
  pct_trabalhado numeric,
  elegivel boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.corretor_id,
         e.carteira_total AS total_ativos,
         e.aguardando,
         e.pct_trabalhado,
         e.apto AS elegivel
  FROM public._elegibilidade_roleta('plantao') e;
$$;

GRANT EXECUTE ON FUNCTION public.produtividade_corretores() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Motor v3 sem os contadores legados: redefine _distribuir_lead_v3
--    (substitui a versão de 20260709120200 — única mudança: o bloco de
--    compat para de escrever em fila_distribuicao; last_lead_assigned_at é
--    mantido por ser inofensivo e útil a integrações externas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _roleta_slug text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _distribuido_por uuid DEFAULT NULL,
  _gatilho text DEFAULT 'manual',
  _contexto_extra jsonb DEFAULT '{}'::jsonb,
  _registrar_excecao boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
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
  _slug := COALESCE(_roleta_slug, public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem));

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome INTO _vencedor_nome
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
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
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram)
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
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     _distribuido_por, _slug, _regra, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  -- Distribuiu → fecha exceção aberta do lead (se havia).
  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida',
         resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Lead distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Remove o cron de reset da cota legada e marca a tabela como legado.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-cotas-diarias') THEN
    PERFORM cron.unschedule('reset-cotas-diarias');
  END IF;
END $$;

COMMENT ON TABLE public.fila_distribuicao IS
  'LEGADO (distribuição v3): substituída por roletas/roleta_participantes. '
  'Cotas e cursores agora derivam de distribution_log e roleta_participantes.ultimo_lead_em. '
  'Mantida somente-leitura para histórico; não usar em código novo.';

NOTIFY pgrst, 'reload schema';
