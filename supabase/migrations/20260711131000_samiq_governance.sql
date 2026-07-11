-- Governanca do SamiQ: configuracao versionada, quota distribuida e metricas
-- pseudonimas de tokens/custo. Nenhuma tabela guarda prompt do usuario,
-- contexto de lead, resposta do modelo, telefone, e-mail ou CPF.

CREATE TABLE IF NOT EXISTS public.samiq_prompt_versions (
  version text PRIMARY KEY CHECK (version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 3 AND 160),
  system_prompt text NOT NULL CHECK (char_length(system_prompt) BETWEEN 100 AND 12000),
  action_prompts jsonb NOT NULL CHECK (jsonb_typeof(action_prompts) = 'object'),
  max_output_tokens integer NOT NULL DEFAULT 700
    CHECK (max_output_tokens BETWEEN 64 AND 4000),
  pricing_version text,
  input_cost_micros_per_million bigint
    CHECK (input_cost_micros_per_million IS NULL OR input_cost_micros_per_million >= 0),
  output_cost_micros_per_million bigint
    CHECK (output_cost_micros_per_million IS NULL OR output_cost_micros_per_million >= 0),
  active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_samiq_prompt_single_active
  ON public.samiq_prompt_versions (active)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.samiq_politica (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_requests_user_10m integer NOT NULL DEFAULT 20
    CHECK (max_requests_user_10m BETWEEN 1 AND 200),
  max_requests_team_10m integer NOT NULL DEFAULT 200
    CHECK (max_requests_team_10m BETWEEN 1 AND 5000),
  max_tokens_user_day integer NOT NULL DEFAULT 60000
    CHECK (max_tokens_user_day BETWEEN 1000 AND 10000000),
  max_tokens_team_day integer NOT NULL DEFAULT 600000
    CHECK (max_tokens_team_day BETWEEN 1000 AND 100000000),
  max_cost_user_micros_day bigint
    CHECK (max_cost_user_micros_day IS NULL OR max_cost_user_micros_day > 0),
  max_cost_team_micros_day bigint
    CHECK (max_cost_team_micros_day IS NULL OR max_cost_team_micros_day > 0),
  reservation_ttl_seconds integer NOT NULL DEFAULT 300
    CHECK (reservation_ttl_seconds BETWEEN 60 AND 1800),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.samiq_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  prompt_version text NOT NULL REFERENCES public.samiq_prompt_versions(version) ON DELETE RESTRICT,
  model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 3 AND 160),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'failed')),
  reserved_input_tokens integer NOT NULL CHECK (reserved_input_tokens BETWEEN 1 AND 50000),
  reserved_output_tokens integer NOT NULL CHECK (reserved_output_tokens BETWEEN 1 AND 4000),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 200000),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 200000),
  input_cost_micros_per_million bigint
    CHECK (input_cost_micros_per_million IS NULL OR input_cost_micros_per_million >= 0),
  output_cost_micros_per_million bigint
    CHECK (output_cost_micros_per_million IS NULL OR output_cost_micros_per_million >= 0),
  estimated_cost_micros bigint CHECK (estimated_cost_micros IS NULL OR estimated_cost_micros >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 600000),
  error_code text CHECK (
    error_code IS NULL OR (
      char_length(error_code) <= 64
      AND error_code ~ '^[a-z0-9_:-]+$'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT samiq_execucao_final_consistente CHECK (
    (
      status = 'reserved'
      AND completed_at IS NULL
      AND input_tokens IS NULL
      AND output_tokens IS NULL
    )
    OR
    (
      status IN ('completed', 'failed')
      AND completed_at IS NOT NULL
      AND input_tokens IS NOT NULL
      AND output_tokens IS NOT NULL
      AND (status <> 'completed' OR error_code IS NULL)
    )
  ),
  CONSTRAINT samiq_execucao_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_user_created
  ON public.samiq_execucoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_team_created
  ON public.samiq_execucoes (equipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_action_created
  ON public.samiq_execucoes (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_expiry
  ON public.samiq_execucoes (expires_at)
  WHERE status = 'reserved';

ALTER TABLE public.samiq_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samiq_politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samiq_execucoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.samiq_prompt_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.samiq_politica FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.samiq_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_prompt_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_politica TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_execucoes TO service_role;

DROP TRIGGER IF EXISTS trg_samiq_prompt_versions_updated ON public.samiq_prompt_versions;
CREATE TRIGGER trg_samiq_prompt_versions_updated
  BEFORE UPDATE ON public.samiq_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_samiq_politica_updated ON public.samiq_politica;
CREATE TRIGGER trg_samiq_politica_updated
  BEFORE UPDATE ON public.samiq_politica
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.samiq_politica (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.samiq_prompt_versions (
  version,
  model_id,
  system_prompt,
  action_prompts,
  max_output_tokens,
  pricing_version,
  input_cost_micros_per_million,
  output_cost_micros_per_million,
  active
)
VALUES (
  'samiq-2026-07-v1',
  'google/gemini-3-flash-preview',
  $system$Você é o SamiQ, copiloto comercial da imobiliária Seu Metro Quadrado (SMQ), especialista em vendas de imóveis Minha Casa Minha Vida e lançamentos em São Paulo. Fala português do Brasil, direto e prático, como um gerente comercial experiente que respeita o tempo do corretor. Não invente dados ausentes, não prometa condições específicas de financiamento e não use markdown pesado. Nunca chame o cliente de lead em uma mensagem. Você não possui ferramentas de escrita: nunca envie mensagens, nunca altere dados e nunca afirme ter executado uma ação. Apenas produza sugestões que serão obrigatoriamente revisadas e confirmadas por uma pessoa. Quando dados pessoais forem substituídos por marcadores, preserve os marcadores e não tente inferir o valor original.$system$,
  jsonb_build_object(
    'resumo_cliente', $action$Resuma este cliente em até 6 linhas: perfil minimizado, busca, capacidade financeira, momento no funil, objeções e risco principal. Termine com uma recomendação prática.$action$,
    'mensagem_sugerida', $action$Escreva uma mensagem de WhatsApp pronta para revisão, adequada ao momento do cliente. Máximo 5 linhas curtas, tom cordial e chamada clara para o próximo passo. Use apenas o primeiro nome fornecido ou omita a saudação nominal.$action$,
    'responder_objecao', $action$Proponha uma resposta empática e segura à objeção em até 4 linhas. Use a biblioteca fornecida como base e sugira a pergunta de avanço seguinte.$action$,
    'proximo_passo', $action$Diga o próximo melhor passo comercial e o motivo em até 4 linhas. Seja específico sobre ação, momento e canal, sem alegar que a ação já foi executada.$action$,
    'projeto_ideal', $action$Indique 2 ou 3 empreendimentos compatíveis usando apenas perfil e catálogo fornecidos, com um argumento por opção. Se os dados forem insuficientes, diga o que falta.$action$,
    'checklist_docs', $action$Monte o checklist de documentos considerando somente os status fornecidos. Liste pendências primeiro e itens concluídos depois. Termine com uma sugestão curta de cobrança para revisão.$action$,
    'recuperar_frio', $action$Proponha um gancho de reativação e uma mensagem curta de reaproximação para revisão, sem parecer cobrança e sem afirmar que foi enviada.$action$,
    'script_ligacao', $action$Monte um roteiro curto: abertura, três perguntas, contorno da objeção provável e fechamento com compromisso. Use tópicos curtos.$action$,
    'analise_funil', $action$Analise as contagens do funil: maior gargalo, ponto saudável e duas ações práticas para a semana. Máximo 8 linhas.$action$,
    'prioridade_dia', $action$Com base na fila compacta priorizada, indique em ordem quem abordar e a sugestão de abordagem em uma linha. Máximo 6 itens.$action$,
    'pergunta_livre', $action$Responda objetivamente com foco em vendas imobiliárias MCMV em São Paulo. Se depender de dados ausentes, diga o que falta.$action$
  ),
  700,
  NULL,
  NULL,
  NULL,
  true
)
ON CONFLICT (version) DO NOTHING;

-- Reserva atomica. Advisory locks serializam usuarios da mesma equipe entre
-- instancias serverless; contagens e budgets nao dependem de memoria local.
CREATE OR REPLACE FUNCTION public.samiq_reservar_execucao(
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
  max_output_tokens integer
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
  _reserved_cost bigint;
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

  -- Ordem fixa (equipe, usuario) evita deadlock entre chamadas simultaneas.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('samiq:team:' || COALESCE(_team_id::text, 'sem-equipe'), 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('samiq:user:' || _user_id::text, 0));

  UPDATE public.samiq_execucoes
  SET status = 'failed',
      -- Se o processo morreu depois do gateway, não sabemos o consumo real.
      -- Mantemos a reserva conservadora no budget em vez de apagar custo.
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
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _team_requests >= _policy.max_requests_team_10m THEN
    RETURN QUERY SELECT false, 'team_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_team_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
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
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _team_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_team_day THEN
    RETURN QUERY SELECT false, 'team_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_user_micros_day IS NOT NULL
     AND _user_cost + _reserved_cost > _policy.max_cost_user_micros_day THEN
    RETURN QUERY SELECT false, 'user_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_team_micros_day IS NOT NULL
     AND _team_cost + _reserved_cost > _policy.max_cost_team_micros_day THEN
    RETURN QUERY SELECT false, 'team_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

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
    _output_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.samiq_finalizar_execucao(
  _user_id uuid,
  _execution_id uuid,
  _status text,
  _input_tokens integer DEFAULT 0,
  _output_tokens integer DEFAULT 0,
  _latency_ms integer DEFAULT 0,
  _error_code text DEFAULT NULL
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
     OR _latency_ms IS NULL OR _latency_ms < 0 OR _latency_ms > 600000 THEN
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
  uuid, uuid, text, integer, integer, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text
) TO service_role;
