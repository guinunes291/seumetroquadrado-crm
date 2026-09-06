-- =============================================================================
-- SAMIQ COPILOTO — ONDA S4: um cérebro, dois canais (decisões D8 parte 2, D15)
-- Ref.: docs/samiq/2026-09-05-decisoes-copiloto.md
--
-- A Sami do WhatsApp (n8n) deixa de ter cérebro próprio: passa a chamar
-- /api/sami no CRM, que roda o MESMO loop (prompt versionado, ferramentas de
-- leitura, propostas, governança, memória) com a sessão do corretor resolvida
-- pelo telefone. Para medir e separar os dois canais, execuções e conversas
-- ganham a coluna `canal` ('painel' | 'whatsapp').
--
-- O que muda:
--  1) samiq_execucoes.canal e samiq_conversas.canal (default 'painel', então
--     nada do que já existe muda de significado) + índice por canal.
--  2) samiq_reservar_execucao ganha _canal (DEFAULT 'painel'): assinatura
--     antiga sai (DROP) para não haver overload ambíguo no PostgREST; os
--     chamadores antigos continuam válidos pelo default.
--  3) samiq_gravar_turno ganha _canal: a conversa nasce no canal certo, e a
--     retomada (12 h) passa a ser por canal — a conversa do painel não se
--     mistura com a do WhatsApp.
--
-- Nenhum prompt novo: a versão ativa (v4) já serve aos dois canais; o que é
-- específico do WhatsApp (texto corrido, CONFIRMAR/CANCELAR) vai no cabeçalho
-- da mensagem, montado pelo servidor.
-- =============================================================================

SET LOCAL lock_timeout = '10s';

-- 1) Canal em execuções e conversas ------------------------------------------
ALTER TABLE public.samiq_execucoes
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'painel';
ALTER TABLE public.samiq_execucoes
  DROP CONSTRAINT IF EXISTS samiq_execucoes_canal_check;
ALTER TABLE public.samiq_execucoes
  ADD CONSTRAINT samiq_execucoes_canal_check CHECK (canal IN ('painel', 'whatsapp'));

ALTER TABLE public.samiq_conversas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'painel';
ALTER TABLE public.samiq_conversas
  DROP CONSTRAINT IF EXISTS samiq_conversas_canal_check;
ALTER TABLE public.samiq_conversas
  ADD CONSTRAINT samiq_conversas_canal_check CHECK (canal IN ('painel', 'whatsapp'));

-- "última conversa deste corretor neste canal" (retomada de 12 h por canal)
CREATE INDEX IF NOT EXISTS samiq_conversas_user_canal_recentes_idx
  ON public.samiq_conversas (user_id, canal, atualizado_em DESC);

-- 2) Reserva com canal ---------------------------------------------------------
-- Corpo idêntico ao da Onda S2 + validação e gravação do canal.
DROP FUNCTION IF EXISTS public.samiq_reservar_execucao(uuid, text, integer, integer);

CREATE FUNCTION public.samiq_reservar_execucao(
  _user_id uuid,
  _action text,
  _estimated_input_tokens integer DEFAULT 10000,
  _requested_output_tokens integer DEFAULT NULL,
  _canal text DEFAULT 'painel'
)
RETURNS TABLE(
  allowed boolean,
  denial_reason text,
  retry_after_seconds integer,
  execution_id uuid,
  prompt_version text,
  model_id text,
  system_prompt text,
  action_prompt text,
  max_output_tokens integer,
  tools_enabled boolean,
  max_tool_steps integer,
  custo_mes_pct integer,
  propostas_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _day_start timestamptz;
  _day_end timestamptz;
  _month_start timestamptz;
  _month_end timestamptz;
  _team_id uuid;
  _prompt public.samiq_prompt_versions%ROWTYPE;
  _policy public.samiq_politica%ROWTYPE;
  _output_tokens integer;
  _user_requests integer;
  _team_requests integer;
  _user_oldest timestamptz;
  _team_oldest timestamptz;
  _user_tokens bigint;
  _team_tokens bigint;
  _user_cost bigint;
  _team_cost bigint;
  _user_cost_mes bigint;
  _team_cost_mes bigint;
  _teto_user_mes bigint;
  _is_gestao boolean;
  _reserved_cost bigint;
  _custo_mes_pct integer;
  _execution_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_active_member(_user_id) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR _action !~ '^[a-z][a-z0-9_]{2,63}$' THEN
    RAISE EXCEPTION 'acao invalida' USING ERRCODE = '22023';
  END IF;
  IF _estimated_input_tokens IS NULL
     OR _estimated_input_tokens < 1
     OR _estimated_input_tokens > 50000 THEN
    RAISE EXCEPTION 'estimativa de tokens invalida' USING ERRCODE = '22023';
  END IF;
  IF _canal IS NULL OR _canal NOT IN ('painel', 'whatsapp') THEN
    RAISE EXCEPTION 'canal invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT _prompt
  FROM public.samiq_prompt_versions AS p
  WHERE p.active = true
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF NOT (_prompt.action_prompts ? _action) THEN
    RAISE EXCEPTION 'acao sem prompt versionado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT _policy FROM public.samiq_politica WHERE id = 1;
  SELECT p.equipe_id INTO _team_id FROM public.profiles AS p WHERE p.id = _user_id;

  IF _requested_output_tokens IS NOT NULL AND _requested_output_tokens < 1 THEN
    RAISE EXCEPTION 'output tokens invalido' USING ERRCODE = '22023';
  END IF;
  _output_tokens := LEAST(
    COALESCE(_requested_output_tokens, _prompt.max_output_tokens),
    _prompt.max_output_tokens
  );

  _day_start := date_trunc('day', _now AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';
  _day_end := _day_start + interval '1 day';
  _month_start := date_trunc('month', _now AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';
  _month_end := (date_trunc('month', _now AT TIME ZONE 'America/Sao_Paulo') + interval '1 month')
    AT TIME ZONE 'America/Sao_Paulo';

  PERFORM pg_advisory_xact_lock(
    hashtextextended('samiq:team:' || COALESCE(_team_id::text, 'sem-equipe'), 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('samiq:user:' || _user_id::text, 0));

  UPDATE public.samiq_execucoes
  SET status = 'failed',
      input_tokens = reserved_input_tokens,
      output_tokens = reserved_output_tokens,
      error_code = 'reservation_expired',
      completed_at = _now
  WHERE status = 'reserved'
    AND expires_at <= _now
    AND (
      user_id = _user_id
      OR equipe_id IS NOT DISTINCT FROM _team_id
    );

  SELECT count(*)::integer, min(e.created_at)
  INTO _user_requests, _user_oldest
  FROM public.samiq_execucoes AS e
  WHERE e.user_id = _user_id
    AND e.created_at >= _now - interval '10 minutes';

  SELECT count(*)::integer, min(e.created_at)
  INTO _team_requests, _team_oldest
  FROM public.samiq_execucoes AS e
  WHERE e.equipe_id IS NOT DISTINCT FROM _team_id
    AND e.created_at >= _now - interval '10 minutes';

  IF _user_requests >= _policy.max_requests_user_10m THEN
    RETURN QUERY SELECT false, 'user_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_user_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;
  IF _team_requests >= _policy.max_requests_team_10m THEN
    RETURN QUERY SELECT false, 'team_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_team_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;

  SELECT
    COALESCE(sum(COALESCE(e.input_tokens, e.reserved_input_tokens)
      + COALESCE(e.output_tokens, e.reserved_output_tokens)), 0)::bigint,
    COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _user_tokens, _user_cost
  FROM public.samiq_execucoes AS e
  WHERE e.user_id = _user_id
    AND e.created_at >= _day_start
    AND e.created_at < _day_end;

  SELECT
    COALESCE(sum(COALESCE(e.input_tokens, e.reserved_input_tokens)
      + COALESCE(e.output_tokens, e.reserved_output_tokens)), 0)::bigint,
    COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _team_tokens, _team_cost
  FROM public.samiq_execucoes AS e
  WHERE e.equipe_id IS NOT DISTINCT FROM _team_id
    AND e.created_at >= _day_start
    AND e.created_at < _day_end;

  IF _prompt.input_cost_micros_per_million IS NOT NULL
     AND _prompt.output_cost_micros_per_million IS NOT NULL THEN
    _reserved_cost := ceil(
      (_estimated_input_tokens::numeric * _prompt.input_cost_micros_per_million::numeric
       + _output_tokens::numeric * _prompt.output_cost_micros_per_million::numeric) / 1000000
    )::bigint;
  ELSE
    _reserved_cost := NULL;
  END IF;

  IF _user_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_user_day THEN
    RETURN QUERY SELECT false, 'user_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;
  IF _team_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_team_day THEN
    RETURN QUERY SELECT false, 'team_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_user_micros_day IS NOT NULL
     AND _user_cost + _reserved_cost > _policy.max_cost_user_micros_day THEN
    RETURN QUERY SELECT false, 'user_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_team_micros_day IS NOT NULL
     AND _team_cost + _reserved_cost > _policy.max_cost_team_micros_day THEN
    RETURN QUERY SELECT false, 'team_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer, NULL::boolean;
    RETURN;
  END IF;

  _is_gestao := public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'gestor')
    OR public.has_role(_user_id, 'superintendente');
  _teto_user_mes := CASE WHEN _is_gestao
    THEN _policy.max_cost_gestor_micros_mes
    ELSE _policy.max_cost_corretor_micros_mes END;

  SELECT COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _user_cost_mes
  FROM public.samiq_execucoes AS e
  WHERE e.user_id = _user_id
    AND e.created_at >= _month_start
    AND e.created_at < _month_end;

  SELECT COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _team_cost_mes
  FROM public.samiq_execucoes AS e
  WHERE e.equipe_id IS NOT DISTINCT FROM _team_id
    AND e.created_at >= _month_start
    AND e.created_at < _month_end;

  IF _reserved_cost IS NOT NULL
     AND _teto_user_mes IS NOT NULL
     AND _user_cost_mes + _reserved_cost > _teto_user_mes THEN
    RETURN QUERY SELECT false, 'user_cost_budget_month',
      GREATEST(1, ceil(extract(epoch FROM (_month_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, 100, NULL::boolean;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_equipe_micros_mes IS NOT NULL
     AND _team_cost_mes + _reserved_cost > _policy.max_cost_equipe_micros_mes THEN
    RETURN QUERY SELECT false, 'team_cost_budget_month',
      GREATEST(1, ceil(extract(epoch FROM (_month_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, 100, NULL::boolean;
    RETURN;
  END IF;

  _custo_mes_pct := CASE
    WHEN _teto_user_mes IS NOT NULL AND _teto_user_mes > 0
      THEN LEAST(100, floor(100.0 * (_user_cost_mes + COALESCE(_reserved_cost, 0)) / _teto_user_mes))::integer
    ELSE NULL END;

  INSERT INTO public.samiq_execucoes (
    id, user_id, equipe_id, action, prompt_version, model_id,
    reserved_input_tokens, reserved_output_tokens,
    input_cost_micros_per_million, output_cost_micros_per_million,
    estimated_cost_micros, expires_at, canal
  )
  VALUES (
    _execution_id, _user_id, _team_id, _action, _prompt.version, _prompt.model_id,
    _estimated_input_tokens, _output_tokens,
    _prompt.input_cost_micros_per_million, _prompt.output_cost_micros_per_million,
    _reserved_cost, _now + make_interval(secs => _policy.reservation_ttl_seconds),
    _canal
  );

  RETURN QUERY SELECT
    true, NULL::text, 0, _execution_id, _prompt.version, _prompt.model_id,
    _prompt.system_prompt, _prompt.action_prompts ->> _action, _output_tokens,
    _prompt.tools_enabled, _policy.max_tool_steps, _custo_mes_pct,
    _prompt.propostas_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer, text)
  TO service_role;

-- 3) Memória com canal ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.samiq_gravar_turno(uuid, uuid, uuid, text, text, text[], uuid);

CREATE FUNCTION public.samiq_gravar_turno(
  _user_id uuid,
  _conversa_id uuid,
  _lead_id uuid,
  _pergunta text,
  _resposta text,
  _ferramentas text[] DEFAULT '{}',
  _execution_id uuid DEFAULT NULL,
  _canal text DEFAULT 'painel'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _id uuid := _conversa_id;
  _pergunta_limpa text := left(btrim(COALESCE(_pergunta, '')), 6000);
  _resposta_limpa text := left(btrim(COALESCE(_resposta, '')), 6000);
  _now timestamptz := clock_timestamp();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'usuario ausente' USING ERRCODE = '22023';
  END IF;
  IF _pergunta_limpa = '' OR _resposta_limpa = '' THEN
    RAISE EXCEPTION 'turno vazio' USING ERRCODE = '22023';
  END IF;
  IF _canal IS NULL OR _canal NOT IN ('painel', 'whatsapp') THEN
    RAISE EXCEPTION 'canal invalido' USING ERRCODE = '22023';
  END IF;

  IF _id IS NOT NULL THEN
    -- Conversa de outro usuário (ou apagada): não gravamos em cima, abrimos outra.
    IF NOT EXISTS (
      SELECT 1 FROM public.samiq_conversas AS c WHERE c.id = _id AND c.user_id = _user_id
    ) THEN
      _id := NULL;
    END IF;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.samiq_conversas (user_id, lead_id, titulo, canal)
    VALUES (_user_id, _lead_id, left(regexp_replace(_pergunta_limpa, '\s+', ' ', 'g'), 120), _canal)
    RETURNING id INTO _id;
  ELSE
    UPDATE public.samiq_conversas
       SET atualizado_em = _now,
           expira_em = _now + interval '90 days',
           lead_id = COALESCE(_lead_id, lead_id)
     WHERE id = _id;
  END IF;

  INSERT INTO public.samiq_conversa_mensagens (conversa_id, user_id, papel, conteudo)
  VALUES (_id, _user_id, 'user', _pergunta_limpa);
  INSERT INTO public.samiq_conversa_mensagens
    (conversa_id, user_id, papel, conteudo, ferramentas, execution_id)
  VALUES (_id, _user_id, 'assistant', _resposta_limpa,
          COALESCE(_ferramentas, '{}'), _execution_id);

  IF _execution_id IS NOT NULL THEN
    UPDATE public.samiq_execucoes
       SET conversa_id = _id
     WHERE id = _execution_id AND user_id = _user_id;
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_gravar_turno(uuid, uuid, uuid, text, text, text[], uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_gravar_turno(uuid, uuid, uuid, text, text, text[], uuid, text)
  TO service_role;
