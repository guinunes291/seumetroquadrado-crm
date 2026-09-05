-- =============================================================================
-- SamiQ copiloto — Onda S1 (fundação).
-- Decisões em docs/samiq/2026-09-05-decisoes-copiloto.md (D4, D9–D12, D17, D18).
--
-- O que muda:
--  1) samiq_prompt_versions.tools_enabled — a versão ativa declara se o modelo
--     pode receber FERRAMENTAS DE LEITURA sobre a carteira (D9/D10). O servidor
--     só anexa ferramentas quando a reserva devolve tools_enabled = true; com a
--     v2 ainda ativa (migration não aplicada), o chat continua como antes.
--  2) samiq_politica: teto de passos de ferramenta por chamada e tetos MENSAIS
--     de custo por papel (corretor / gestão) e por equipe, com percentual de
--     alerta (D18). Valores NULL = sem teto (o dono ainda não fixou o número).
--  3) samiq_execucoes: tool_calls, tool_errors e fallback — métricas de
--     qualidade sem conteúdo (D17). conversa_id liga a execução à conversa.
--  4) samiq_conversas + samiq_conversa_mensagens — memória persistida por
--     corretor, PII redigida ANTES de gravar (o servidor redige), retenção de
--     90 dias renovada a cada turno, RLS: cada usuário lê/apaga só o seu (D11).
--  5) samiq_avaliacoes + samiq_avaliar_execucao — nota por resposta (D17).
--  6) samiq_gravar_turno (service_role) — grava pergunta + resposta.
--  7) samiq_metricas_periodo — painel de qualidade (admin: tudo; gestor: equipe).
--  8) samiq_reservar_execucao — devolve tools_enabled / max_tool_steps /
--     custo_mes_pct e aplica os tetos mensais. samiq_finalizar_execucao —
--     recebe as métricas de ferramentas.
--  9) Versão samiq-2026-09-v3 com system prompt que autoriza consulta (nunca
--     escrita) e libera o NOME COMPLETO nos campos estruturados (D12).
--
-- Nenhuma tabela nova guarda telefone, CPF, e-mail ou endereço: o servidor
-- passa toda string por redactSamiQPii antes de chamar samiq_gravar_turno.
-- =============================================================================

-- 1) Versão de prompt declara se recebe ferramentas -------------------------
ALTER TABLE public.samiq_prompt_versions
  ADD COLUMN IF NOT EXISTS tools_enabled boolean NOT NULL DEFAULT false;

-- 2) Política: passos por chamada e tetos mensais por papel -----------------
ALTER TABLE public.samiq_politica
  ADD COLUMN IF NOT EXISTS max_tool_steps integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS max_cost_corretor_micros_mes bigint,
  ADD COLUMN IF NOT EXISTS max_cost_gestor_micros_mes bigint,
  ADD COLUMN IF NOT EXISTS max_cost_equipe_micros_mes bigint,
  ADD COLUMN IF NOT EXISTS alerta_custo_pct integer NOT NULL DEFAULT 80;

ALTER TABLE public.samiq_politica
  DROP CONSTRAINT IF EXISTS samiq_politica_max_tool_steps_check,
  DROP CONSTRAINT IF EXISTS samiq_politica_max_cost_corretor_mes_check,
  DROP CONSTRAINT IF EXISTS samiq_politica_max_cost_gestor_mes_check,
  DROP CONSTRAINT IF EXISTS samiq_politica_max_cost_equipe_mes_check,
  DROP CONSTRAINT IF EXISTS samiq_politica_alerta_custo_pct_check;
ALTER TABLE public.samiq_politica
  ADD CONSTRAINT samiq_politica_max_tool_steps_check
    CHECK (max_tool_steps BETWEEN 1 AND 12),
  ADD CONSTRAINT samiq_politica_max_cost_corretor_mes_check
    CHECK (max_cost_corretor_micros_mes IS NULL OR max_cost_corretor_micros_mes > 0),
  ADD CONSTRAINT samiq_politica_max_cost_gestor_mes_check
    CHECK (max_cost_gestor_micros_mes IS NULL OR max_cost_gestor_micros_mes > 0),
  ADD CONSTRAINT samiq_politica_max_cost_equipe_mes_check
    CHECK (max_cost_equipe_micros_mes IS NULL OR max_cost_equipe_micros_mes > 0),
  ADD CONSTRAINT samiq_politica_alerta_custo_pct_check
    CHECK (alerta_custo_pct BETWEEN 50 AND 100);

-- 3) Execuções: métricas de ferramentas e fallback (sem conteúdo) ------------
ALTER TABLE public.samiq_execucoes
  ADD COLUMN IF NOT EXISTS tool_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback boolean NOT NULL DEFAULT false;

ALTER TABLE public.samiq_execucoes
  DROP CONSTRAINT IF EXISTS samiq_execucoes_tool_calls_check,
  DROP CONSTRAINT IF EXISTS samiq_execucoes_tool_errors_check;
ALTER TABLE public.samiq_execucoes
  ADD CONSTRAINT samiq_execucoes_tool_calls_check CHECK (tool_calls BETWEEN 0 AND 100),
  ADD CONSTRAINT samiq_execucoes_tool_errors_check CHECK (tool_errors BETWEEN 0 AND 100);

-- 4) Memória persistida por corretor -----------------------------------------
CREATE TABLE IF NOT EXISTS public.samiq_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- lead em contexto quando a conversa começou (opcional; some se o lead sumir)
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- retenção de 90 dias contada do ÚLTIMO turno (renovada em samiq_gravar_turno)
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS samiq_conversas_user_recentes_idx
  ON public.samiq_conversas (user_id, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS samiq_conversas_expira_idx
  ON public.samiq_conversas (expira_em);

CREATE TABLE IF NOT EXISTS public.samiq_conversa_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.samiq_conversas(id) ON DELETE CASCADE,
  -- redundante de propósito: a policy de leitura não precisa de JOIN
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('user', 'assistant')),
  -- já redigido pelo servidor (redactSamiQPii); teto defensivo
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 6000),
  -- nomes das ferramentas consultadas na resposta (só nomes, nunca dados)
  ferramentas text[] NOT NULL DEFAULT '{}',
  execution_id uuid REFERENCES public.samiq_execucoes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS samiq_conversa_mensagens_conversa_idx
  ON public.samiq_conversa_mensagens (conversa_id, criado_em);

ALTER TABLE public.samiq_execucoes
  ADD COLUMN IF NOT EXISTS conversa_id uuid
    REFERENCES public.samiq_conversas(id) ON DELETE SET NULL;

ALTER TABLE public.samiq_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samiq_conversa_mensagens ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê e apaga SÓ as próprias conversas. Ninguém escreve pelo
-- browser: o turno entra pelo servidor (samiq_gravar_turno, service_role),
-- que é quem redige PII antes de gravar.
DROP POLICY IF EXISTS samiq_conversas_select_proprias ON public.samiq_conversas;
CREATE POLICY samiq_conversas_select_proprias ON public.samiq_conversas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS samiq_conversas_delete_proprias ON public.samiq_conversas;
CREATE POLICY samiq_conversas_delete_proprias ON public.samiq_conversas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS samiq_conversa_mensagens_select_proprias ON public.samiq_conversa_mensagens;
CREATE POLICY samiq_conversa_mensagens_select_proprias ON public.samiq_conversa_mensagens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.samiq_conversas FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.samiq_conversa_mensagens FROM PUBLIC, anon;
GRANT SELECT, DELETE ON TABLE public.samiq_conversas TO authenticated;
GRANT SELECT ON TABLE public.samiq_conversa_mensagens TO authenticated;
GRANT ALL ON TABLE public.samiq_conversas TO service_role;
GRANT ALL ON TABLE public.samiq_conversa_mensagens TO service_role;

COMMENT ON TABLE public.samiq_conversas IS
  'Memoria do copiloto SamiQ por usuario (D11). Conteudo ja redigido pelo servidor; expira 90 dias apos o ultimo turno (cron samiq-limpar-conversas).';

-- Retenção: limpeza diária do que expirou (D11: 90 dias após o último turno).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'samiq-limpar-conversas';
    PERFORM cron.schedule(
      'samiq-limpar-conversas',
      '15 3 * * *',
      $job$DELETE FROM public.samiq_conversas WHERE expira_em < now();$job$
    );
  END IF;
END $$;

-- 5) Avaliações por resposta (D17) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.samiq_avaliacoes (
  execution_id uuid PRIMARY KEY REFERENCES public.samiq_execucoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nota smallint NOT NULL CHECK (nota IN (-1, 1)),
  motivo text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS samiq_avaliacoes_user_idx
  ON public.samiq_avaliacoes (user_id, criado_em DESC);

ALTER TABLE public.samiq_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samiq_avaliacoes_select_proprias ON public.samiq_avaliacoes;
CREATE POLICY samiq_avaliacoes_select_proprias ON public.samiq_avaliacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.samiq_avaliacoes FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.samiq_avaliacoes TO authenticated;
GRANT ALL ON TABLE public.samiq_avaliacoes TO service_role;

-- Nota 👍/👎 pelo próprio usuário, só em execução SUA e concluída. Upsert:
-- trocar de ideia sobrescreve; o motivo é texto curto do corretor.
-- `_nota integer` (não smallint): literal numérico resolve como integer e o
-- Postgres não faz cast implícito integer→smallint na resolução da função.
DROP FUNCTION IF EXISTS public.samiq_avaliar_execucao(uuid, smallint, text);
CREATE OR REPLACE FUNCTION public.samiq_avaliar_execucao(
  _execution_id uuid,
  _nota integer,
  _motivo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _motivo_limpo text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '42501';
  END IF;
  IF _nota IS NULL OR _nota NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'nota invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.samiq_execucoes AS e
    WHERE e.id = _execution_id AND e.user_id = _uid AND e.status = 'completed'
  ) THEN
    RETURN false;
  END IF;

  _motivo_limpo := NULLIF(left(btrim(COALESCE(_motivo, '')), 300), '');

  INSERT INTO public.samiq_avaliacoes (execution_id, user_id, nota, motivo)
  VALUES (_execution_id, _uid, _nota, _motivo_limpo)
  ON CONFLICT (execution_id) DO UPDATE
    SET nota = EXCLUDED.nota,
        motivo = EXCLUDED.motivo,
        atualizado_em = clock_timestamp();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_avaliar_execucao(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.samiq_avaliar_execucao(uuid, integer, text)
  TO authenticated, service_role;

-- 6) Gravar um turno (pergunta + resposta) — só o servidor ------------------
CREATE OR REPLACE FUNCTION public.samiq_gravar_turno(
  _user_id uuid,
  _conversa_id uuid,
  _lead_id uuid,
  _pergunta text,
  _resposta text,
  _ferramentas text[] DEFAULT '{}',
  _execution_id uuid DEFAULT NULL
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

  IF _id IS NOT NULL THEN
    -- Conversa de outro usuário (ou apagada): não gravamos em cima, abrimos outra.
    IF NOT EXISTS (
      SELECT 1 FROM public.samiq_conversas AS c WHERE c.id = _id AND c.user_id = _user_id
    ) THEN
      _id := NULL;
    END IF;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.samiq_conversas (user_id, lead_id, titulo)
    VALUES (_user_id, _lead_id, left(regexp_replace(_pergunta_limpa, '\s+', ' ', 'g'), 120))
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

REVOKE ALL ON FUNCTION public.samiq_gravar_turno(uuid, uuid, uuid, text, text, text[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_gravar_turno(uuid, uuid, uuid, text, text, text[], uuid)
  TO service_role;

-- 7) Métricas de qualidade (painel em Configurações › Qualidade) ------------
-- admin/superintendente: operação inteira; gestor: a própria equipe (+ ele).
-- Sem conteúdo: só contagens, percentuais, latência e custo.
CREATE OR REPLACE FUNCTION public.samiq_metricas_periodo(_de date, _ate date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tudo boolean;
  _team uuid;
  _ini timestamptz;
  _fim timestamptz;
  _res jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '42501';
  END IF;
  _tudo := public.has_role(_uid, 'admin') OR public.has_role(_uid, 'superintendente');
  IF NOT _tudo AND NOT public.has_role(_uid, 'gestor') THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;
  IF _de IS NULL OR _ate IS NULL OR _ate < _de OR (_ate - _de) > 366 THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;

  SELECT p.equipe_id INTO _team FROM public.profiles AS p WHERE p.id = _uid;
  _ini := (_de::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim := ((_ate + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';

  WITH ex AS (
    SELECT e.*
    FROM public.samiq_execucoes AS e
    WHERE e.created_at >= _ini AND e.created_at < _fim
      AND (_tudo OR e.user_id = _uid OR (e.equipe_id IS NOT NULL AND e.equipe_id = _team))
  ),
  av AS (
    SELECT a.execution_id, a.nota
    FROM public.samiq_avaliacoes AS a
    JOIN ex ON ex.id = a.execution_id
  ),
  totais AS (
    SELECT
      count(*)::integer AS execucoes,
      count(*) FILTER (WHERE status = 'completed')::integer AS concluidas,
      count(*) FILTER (WHERE status = 'failed')::integer AS falhas,
      count(*) FILTER (WHERE fallback)::integer AS fallbacks,
      count(DISTINCT user_id)::integer AS usuarios_ativos,
      count(DISTINCT conversa_id)::integer AS conversas,
      COALESCE(sum(tool_calls), 0)::integer AS tool_calls,
      COALESCE(sum(tool_errors), 0)::integer AS tool_errors,
      COALESCE(sum(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint AS tokens,
      COALESCE(sum(estimated_cost_micros), 0)::bigint AS custo_micros,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
        FILTER (WHERE status = 'completed' AND latency_ms IS NOT NULL) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
        FILTER (WHERE status = 'completed' AND latency_ms IS NOT NULL) AS p95
    FROM ex
  ),
  notas AS (
    SELECT
      count(*) FILTER (WHERE nota = 1)::integer AS positivas,
      count(*) FILTER (WHERE nota = -1)::integer AS negativas
    FROM av
  ),
  por_acao AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('action', action, 'total', total)
             ORDER BY total DESC), '[]'::jsonb) AS lista
    FROM (SELECT action, count(*)::integer AS total FROM ex GROUP BY action) AS s
  ),
  por_dia AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dia', dia, 'execucoes', execucoes, 'fallbacks', fallbacks,
             'usuarios', usuarios) ORDER BY dia), '[]'::jsonb) AS lista
    FROM (
      SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             count(*)::integer AS execucoes,
             count(*) FILTER (WHERE fallback)::integer AS fallbacks,
             count(DISTINCT user_id)::integer AS usuarios
      FROM ex GROUP BY 1
    ) AS d
  )
  SELECT jsonb_build_object(
    'de', _de, 'ate', _ate, 'escopo', CASE WHEN _tudo THEN 'operacao' ELSE 'equipe' END,
    'execucoes', t.execucoes,
    'concluidas', t.concluidas,
    'falhas', t.falhas,
    'fallbacks', t.fallbacks,
    'usuarios_ativos', t.usuarios_ativos,
    'conversas', t.conversas,
    'tool_calls', t.tool_calls,
    'tool_errors', t.tool_errors,
    'tokens', t.tokens,
    'custo_micros', t.custo_micros,
    'latencia_p50_ms', round(t.p50::numeric),
    'latencia_p95_ms', round(t.p95::numeric),
    'avaliacoes_positivas', n.positivas,
    'avaliacoes_negativas', n.negativas,
    'por_acao', pa.lista,
    'por_dia', pd.lista
  )
  INTO _res
  FROM totais AS t, notas AS n, por_acao AS pa, por_dia AS pd;

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_metricas_periodo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.samiq_metricas_periodo(date, date) TO authenticated, service_role;

-- 8) Reserva: ferramentas, passos e tetos mensais por papel -----------------
-- O tipo de retorno muda (3 colunas novas), então DROP + CREATE.
DROP FUNCTION IF EXISTS public.samiq_reservar_execucao(uuid, text, integer, integer);

CREATE FUNCTION public.samiq_reservar_execucao(
  _user_id uuid,
  _action text,
  _estimated_input_tokens integer DEFAULT 10000,
  _requested_output_tokens integer DEFAULT NULL
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
  custo_mes_pct integer
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

  -- Ordem fixa (equipe, usuario) evita deadlock entre chamadas simultaneas.
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
      NULL::boolean, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF _team_requests >= _policy.max_requests_team_10m THEN
    RETURN QUERY SELECT false, 'team_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_team_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer;
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
      NULL::boolean, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF _team_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_team_day THEN
    RETURN QUERY SELECT false, 'team_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_user_micros_day IS NOT NULL
     AND _user_cost + _reserved_cost > _policy.max_cost_user_micros_day THEN
    RETURN QUERY SELECT false, 'user_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_team_micros_day IS NOT NULL
     AND _team_cost + _reserved_cost > _policy.max_cost_team_micros_day THEN
    RETURN QUERY SELECT false, 'team_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Tetos MENSAIS por papel (D18). Só valem quando há pricing na versão
  -- ativa (custo estimável) e quando o dono fixou o número na política.
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
      NULL::boolean, NULL::integer, 100;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_equipe_micros_mes IS NOT NULL
     AND _team_cost_mes + _reserved_cost > _policy.max_cost_equipe_micros_mes THEN
    RETURN QUERY SELECT false, 'team_cost_budget_month',
      GREATEST(1, ceil(extract(epoch FROM (_month_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::boolean, NULL::integer, 100;
    RETURN;
  END IF;

  _custo_mes_pct := CASE
    WHEN _teto_user_mes IS NOT NULL AND _teto_user_mes > 0
      THEN LEAST(100, floor(100.0 * (_user_cost_mes + COALESCE(_reserved_cost, 0)) / _teto_user_mes))::integer
    ELSE NULL END;

  INSERT INTO public.samiq_execucoes (
    id,
    user_id,
    equipe_id,
    action,
    prompt_version,
    model_id,
    reserved_input_tokens,
    reserved_output_tokens,
    input_cost_micros_per_million,
    output_cost_micros_per_million,
    estimated_cost_micros,
    expires_at
  )
  VALUES (
    _execution_id,
    _user_id,
    _team_id,
    _action,
    _prompt.version,
    _prompt.model_id,
    _estimated_input_tokens,
    _output_tokens,
    _prompt.input_cost_micros_per_million,
    _prompt.output_cost_micros_per_million,
    _reserved_cost,
    _now + make_interval(secs => _policy.reservation_ttl_seconds)
  );

  RETURN QUERY SELECT
    true,
    NULL::text,
    0,
    _execution_id,
    _prompt.version,
    _prompt.model_id,
    _prompt.system_prompt,
    _prompt.action_prompts ->> _action,
    _output_tokens,
    _prompt.tools_enabled,
    _policy.max_tool_steps,
    _custo_mes_pct;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  TO service_role;

-- 9) Finalizar: métricas de ferramentas e fallback ---------------------------
-- A assinatura antiga sai para não criar overload ambíguo no PostgREST; os
-- chamadores antigos (match/resumo/mensagem) continuam válidos pelos defaults.
DROP FUNCTION IF EXISTS public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text
);

CREATE OR REPLACE FUNCTION public.samiq_finalizar_execucao(
  _user_id uuid,
  _execution_id uuid,
  _status text,
  _input_tokens integer DEFAULT 0,
  _output_tokens integer DEFAULT 0,
  _latency_ms integer DEFAULT 0,
  _error_code text DEFAULT NULL,
  _tool_calls integer DEFAULT 0,
  _tool_errors integer DEFAULT 0,
  _fallback boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _execution public.samiq_execucoes%ROWTYPE;
  _cost bigint;
BEGIN
  IF _status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'status invalido' USING ERRCODE = '22023';
  END IF;
  IF _input_tokens IS NULL OR _input_tokens < 0 OR _input_tokens > 200000
     OR _output_tokens IS NULL OR _output_tokens < 0 OR _output_tokens > 200000
     OR _latency_ms IS NULL OR _latency_ms < 0 OR _latency_ms > 600000
     OR _tool_calls IS NULL OR _tool_calls < 0 OR _tool_calls > 100
     OR _tool_errors IS NULL OR _tool_errors < 0 OR _tool_errors > 100 THEN
    RAISE EXCEPTION 'metrica invalida' USING ERRCODE = '22023';
  END IF;
  IF _error_code IS NOT NULL AND (
    char_length(_error_code) > 64 OR _error_code !~ '^[a-z0-9_:-]+$'
  ) THEN
    RAISE EXCEPTION 'error_code invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _execution
  FROM public.samiq_execucoes AS e
  WHERE e.id = _execution_id AND e.user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF _execution.status <> 'reserved' THEN
    RETURN _execution.status = _status;
  END IF;

  IF _execution.input_cost_micros_per_million IS NOT NULL
     AND _execution.output_cost_micros_per_million IS NOT NULL THEN
    _cost := ceil(
      (_input_tokens::numeric * _execution.input_cost_micros_per_million::numeric
       + _output_tokens::numeric * _execution.output_cost_micros_per_million::numeric) / 1000000
    )::bigint;
  ELSE
    _cost := NULL;
  END IF;

  UPDATE public.samiq_execucoes
  SET status = _status,
      input_tokens = _input_tokens,
      output_tokens = _output_tokens,
      estimated_cost_micros = _cost,
      latency_ms = _latency_ms,
      tool_calls = _tool_calls,
      tool_errors = _tool_errors,
      fallback = COALESCE(_fallback, false),
      error_code = CASE WHEN _status = 'failed'
        THEN COALESCE(_error_code, 'generation_failed')
        ELSE NULL
      END,
      completed_at = clock_timestamp()
  WHERE id = _execution_id AND status = 'reserved';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text, integer, integer, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text, integer, integer, boolean
) TO service_role;

-- 10) Versão samiq-2026-09-v3: consulta liberada, escrita proibida ------------
-- Só cria e ativa se ainda não existir: um rollback manual para a v2 (kill
-- switch da decisão D20) não é desfeito por um replay desta migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.samiq_prompt_versions WHERE version = 'samiq-2026-09-v3'
  ) THEN
    UPDATE public.samiq_prompt_versions SET active = false WHERE active = true;

    INSERT INTO public.samiq_prompt_versions (
      version,
      model_id,
      system_prompt,
      action_prompts,
      max_output_tokens,
      pricing_version,
      input_cost_micros_per_million,
      output_cost_micros_per_million,
      tools_enabled,
      active
    )
    VALUES (
      'samiq-2026-09-v3',
      'google/gemini-3-flash-preview',
      $system$Você é a Sami (SamiQ), copiloto comercial da imobiliária Seu Metro Quadrado (SMQ), especialista em vendas de imóveis Minha Casa Minha Vida e lançamentos em São Paulo. Fala português do Brasil, direto e prático, como um gerente comercial experiente que respeita o tempo do corretor. Você tem ferramentas de LEITURA sobre a carteira do corretor que está falando com você: clientes, agenda, tarefas, funil, fila de atendimento, documentação e catálogo de empreendimentos. Sempre que a pergunta depender de dados do CRM, consulte as ferramentas em vez de supor, consulte só o necessário e cite de onde veio o dado. Responda em até 8 linhas, sem markdown pesado, chamando o cliente pelo nome quando a ferramenta o devolver. Não invente dados ausentes, não prometa condições específicas de financiamento e nunca chame o cliente de lead numa mensagem para ele. Você NÃO tem ferramentas de escrita: nunca envie mensagens, nunca altere dados e nunca afirme ter registrado, agendado ou executado uma ação; se o corretor pedir para registrar algo, diga que ainda não faz isso e proponha o texto do registro para ele. Quando dados pessoais aparecerem como marcadores (por exemplo [TELEFONE] ou [CPF]), preserve os marcadores e não tente inferir o valor. Se não conseguir responder com os dados disponíveis, comece a resposta exatamente com "Não consegui" e diga o que falta.$system$,
      jsonb_build_object(
        'resumo_cliente', $action$Resuma este cliente em até 6 linhas: perfil minimizado, busca, capacidade financeira, momento no funil, objeções e risco principal. Termine com uma recomendação prática.$action$,
        'mensagem_sugerida', $action$Escreva uma mensagem de WhatsApp pronta para revisão, adequada ao momento do cliente. Máximo 5 linhas curtas, tom cordial e chamada clara para o próximo passo. Use apenas o primeiro nome do cliente na saudação ou omita a saudação nominal.$action$,
        'responder_objecao', $action$Proponha uma resposta empática e segura à objeção em até 4 linhas. Use a biblioteca fornecida como base e sugira a pergunta de avanço seguinte.$action$,
        'proximo_passo', $action$Diga o próximo melhor passo comercial e o motivo em até 4 linhas. Seja específico sobre ação, momento e canal, sem alegar que a ação já foi executada.$action$,
        'projeto_ideal', $action$Indique 2 ou 3 empreendimentos compatíveis usando apenas perfil e catálogo fornecidos, com um argumento por opção. Se os dados forem insuficientes, diga o que falta.$action$,
        'checklist_docs', $action$Monte o checklist de documentos considerando somente os status fornecidos. Liste pendências primeiro e itens concluídos depois. Termine com uma sugestão curta de cobrança para revisão.$action$,
        'recuperar_frio', $action$Proponha um gancho de reativação e uma mensagem curta de reaproximação para revisão, sem parecer cobrança e sem afirmar que foi enviada.$action$,
        'script_ligacao', $action$Monte um roteiro curto: abertura, três perguntas, contorno da objeção provável e fechamento com compromisso. Use tópicos curtos.$action$,
        'analise_funil', $action$Analise as contagens do funil: maior gargalo, ponto saudável e duas ações práticas para a semana. Máximo 8 linhas.$action$,
        'prioridade_dia', $action$Com base na fila compacta priorizada, indique em ordem quem abordar e a sugestão de abordagem em uma linha. Máximo 6 itens.$action$,
        'pergunta_livre', $action$Responda objetivamente com foco em vendas imobiliárias MCMV em São Paulo. Se a pergunta envolver clientes, agenda, tarefas, funil, fila ou documentos do corretor, consulte as ferramentas antes de responder e cite de onde veio o dado. Se depender de dados que as ferramentas não têm, diga o que falta.$action$,
        'match_projetos', $action$Você recebe um catálogo de empreendimentos e a descrição do que um cliente procura. Analise e responda APENAS com JSON válido (sem markdown, sem cercas de código), no formato exato: {"resumo": string, "filtrosUsados": {"regiao"?: string, "dorms"?: string, "vagas"?: string, "precoMax"?: string, "programa"?: string, "entrega"?: string}, "projetos": [{"id": string, "pontuacao": number 0-10, "motivo": string, "tipologiaRecomendada"?: string}]}. Use apenas ids existentes no catálogo. Máximo 6 projetos, ordenados por aderência. Motivo em 1 frase PT-BR. Se nada servir, devolva "projetos": [] e explique no resumo o que falta.$action$,
        'resumo_lead', $action$Resuma o histórico deste cliente para o corretor em até 6 bullets curtos: quem é (perfil minimizado), o que busca, capacidade financeira sinalizada, momento no funil, últimas interações relevantes e o risco ou oportunidade principal. Termine com a próxima ação recomendada em 1 linha. Não invente dados ausentes.$action$,
        'mensagem_whatsapp', $action$Escreva UMA mensagem de WhatsApp pronta para revisão do corretor, adequada ao objetivo e ao momento do cliente. Máximo 5 linhas curtas, tom cordial, sem pressão, com chamada clara para o próximo passo. Use apenas o primeiro nome fornecido ou omita a saudação nominal. Se houver objeção informada, enderece-a com empatia usando a biblioteca fornecida.$action$
      ),
      2000,
      NULL,
      NULL,
      NULL,
      true,
      true
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
