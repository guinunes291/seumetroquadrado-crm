-- =============================================================================
-- SamiQ copiloto — Onda S2: escrita por PROPOSTA confirmada pelo corretor.
-- Decisões em docs/samiq/2026-09-05-decisoes-copiloto.md (D1, D2, D5, D7).
--
-- O modelo continua sem gravar nada. As ferramentas `propor_*` produzem uma
-- proposta tipada; ela fica em samiq_propostas como 'pendente'; o painel mostra
-- um card "Registrar N itens?"; um toque do corretor executa a escrita com a
-- SESSÃO DELE (RLS, triggers, autor = corretor) e o servidor registra a
-- decisão aqui (aceita/editada/rejeitada/falhou) com o `resultado` — os ids
-- gravados e o snapshot do lead — que é o que permite DESFAZER por 24 h.
--
--  1) samiq_prompt_versions.propostas_enabled — a versão ativa declara se o
--     modelo recebe as ferramentas de proposta (a v3 segue só leitura).
--  2) samiq_propostas — uma linha por proposta; RLS: cada usuário lê as suas;
--     nenhuma escrita pelo browser (só RPCs de service_role).
--  3) samiq_registrar_propostas / samiq_decidir_proposta / samiq_desfazer_proposta.
--  4) samiq_reservar_execucao devolve propostas_enabled.
--  5) Versão samiq-2026-09-v4: consulta + proposta; escrita direta continua
--     proibida; "Não consegui" como marcador de fallback.
-- =============================================================================

-- 1) Versão de prompt declara se recebe ferramentas de proposta ------------
ALTER TABLE public.samiq_prompt_versions
  ADD COLUMN IF NOT EXISTS propostas_enabled boolean NOT NULL DEFAULT false;

-- 2) Propostas -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.samiq_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.samiq_execucoes(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.samiq_conversas(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  -- nome do cliente resolvido no servidor (D12) — poupa uma consulta no card
  lead_nome text CHECK (lead_nome IS NULL OR char_length(lead_nome) <= 120),
  tipo text NOT NULL CHECK (tipo IN (
    'registrar_contato', 'anotar', 'criar_tarefa',
    'atualizar_qualificacao', 'agendar_visita', 'mudar_etapa'
  )),
  -- o que o modelo propôs (validado pelo servidor antes de entrar aqui)
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- o que o corretor confirmou (igual ao payload quando não editou)
  payload_final jsonb CHECK (payload_final IS NULL OR jsonb_typeof(payload_final) = 'object'),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'aceita', 'editada', 'rejeitada', 'desfeita', 'falhou'
  )),
  -- ids gravados + snapshot do lead ANTES da escrita (é o que o desfazer usa)
  resultado jsonb CHECK (resultado IS NULL OR jsonb_typeof(resultado) = 'object'),
  erro text CHECK (erro IS NULL OR char_length(erro) <= 300),
  criado_em timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  desfazer_ate timestamptz,
  desfeito_em timestamptz
);

CREATE INDEX IF NOT EXISTS samiq_propostas_user_recentes_idx
  ON public.samiq_propostas (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS samiq_propostas_execucao_idx
  ON public.samiq_propostas (execution_id);
CREATE INDEX IF NOT EXISTS samiq_propostas_pendentes_idx
  ON public.samiq_propostas (user_id)
  WHERE status = 'pendente';

ALTER TABLE public.samiq_propostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samiq_propostas_select_proprias ON public.samiq_propostas;
CREATE POLICY samiq_propostas_select_proprias ON public.samiq_propostas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.samiq_propostas FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.samiq_propostas TO authenticated;
GRANT ALL ON TABLE public.samiq_propostas TO service_role;

COMMENT ON TABLE public.samiq_propostas IS
  'Propostas de escrita da Sami (Onda S2). O modelo propoe; o corretor confirma no painel; o servidor executa com a sessao do corretor e registra aqui a decisao e o resultado (ids + snapshot) para desfazer em 24h.';

-- 3a) Registrar as propostas de uma execução (só o servidor) -------------------
CREATE OR REPLACE FUNCTION public.samiq_registrar_propostas(
  _user_id uuid,
  _execution_id uuid,
  _conversa_id uuid,
  _propostas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _item jsonb;
  _ids uuid[] := '{}';
  _id uuid;
  _n integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'usuario ausente' USING ERRCODE = '22023';
  END IF;
  IF _propostas IS NULL OR jsonb_typeof(_propostas) <> 'array' THEN
    RAISE EXCEPTION 'propostas invalidas' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_propostas) > 10 THEN
    RAISE EXCEPTION 'maximo de 10 propostas por execucao' USING ERRCODE = '22023';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_propostas) LOOP
    IF jsonb_typeof(_item) <> 'object'
       OR NOT (_item ? 'tipo') OR NOT (_item ? 'payload')
       OR jsonb_typeof(_item -> 'payload') <> 'object' THEN
      RAISE EXCEPTION 'proposta invalida' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.samiq_propostas (
      user_id, execution_id, conversa_id, lead_id, lead_nome, tipo, payload
    )
    VALUES (
      _user_id,
      _execution_id,
      _conversa_id,
      NULLIF(_item ->> 'lead_id', '')::uuid,
      left(NULLIF(btrim(COALESCE(_item ->> 'lead_nome', '')), ''), 120),
      _item ->> 'tipo',
      _item -> 'payload'
    )
    RETURNING id INTO _id;
    _ids := _ids || _id;
    _n := _n + 1;
  END LOOP;

  RETURN to_jsonb(_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_registrar_propostas(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_registrar_propostas(uuid, uuid, uuid, jsonb)
  TO service_role;

-- 3b) Decidir: aceita / editada / rejeitada / falhou (só o servidor) ---------
CREATE OR REPLACE FUNCTION public.samiq_decidir_proposta(
  _user_id uuid,
  _proposta_id uuid,
  _status text,
  _payload_final jsonb DEFAULT NULL,
  _resultado jsonb DEFAULT NULL,
  _erro text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _p public.samiq_propostas%ROWTYPE;
  _now timestamptz := clock_timestamp();
  _pode_desfazer boolean;
BEGIN
  IF _status NOT IN ('aceita', 'editada', 'rejeitada', 'falhou') THEN
    RAISE EXCEPTION 'status invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _p
  FROM public.samiq_propostas AS p
  WHERE p.id = _proposta_id AND p.user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- 'falhou' pode ser tentada de novo; as demais decisões são finais.
  IF _p.status NOT IN ('pendente', 'falhou') THEN RETURN false; END IF;

  _pode_desfazer := _status IN ('aceita', 'editada') AND _p.tipo <> 'mudar_etapa';

  UPDATE public.samiq_propostas
     SET status = _status,
         payload_final = CASE WHEN _status IN ('aceita', 'editada')
                              THEN COALESCE(_payload_final, payload) ELSE payload_final END,
         resultado = CASE WHEN _status IN ('aceita', 'editada') THEN _resultado ELSE resultado END,
         erro = CASE WHEN _status = 'falhou' THEN left(COALESCE(_erro, 'falha'), 300) ELSE NULL END,
         decidido_em = _now,
         desfazer_ate = CASE WHEN _pode_desfazer THEN _now + interval '24 hours' ELSE NULL END
   WHERE id = _proposta_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_decidir_proposta(uuid, uuid, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_decidir_proposta(uuid, uuid, text, jsonb, jsonb, text)
  TO service_role;

-- 3c) Desfazer em 24 h (só o servidor; a proposta tem de ser do usuário) -------
-- Reverte pelo `resultado`: interação e tarefa viram soft-delete, agendamento
-- vira cancelado + soft-delete, e o lead volta ao snapshot dos campos de
-- qualificação. Mudança de etapa não se desfaz aqui (máquina de estados).
CREATE OR REPLACE FUNCTION public.samiq_desfazer_proposta(
  _user_id uuid,
  _proposta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _p public.samiq_propostas%ROWTYPE;
  _r jsonb;
  _snap jsonb;
  _now timestamptz := clock_timestamp();
  _feito jsonb := '[]'::jsonb;
  _id uuid;
  _lead uuid;
BEGIN
  SELECT * INTO _p
  FROM public.samiq_propostas AS p
  WHERE p.id = _proposta_id AND p.user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposta nao encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _p.status NOT IN ('aceita', 'editada') THEN
    RAISE EXCEPTION 'proposta nao esta confirmada' USING ERRCODE = '22023';
  END IF;
  IF _p.tipo = 'mudar_etapa' THEN
    RAISE EXCEPTION 'mudanca de etapa nao se desfaz pelo botao' USING ERRCODE = '22023';
  END IF;
  IF _p.desfazer_ate IS NULL OR _p.desfazer_ate < _now THEN
    RAISE EXCEPTION 'janela de desfazer expirada' USING ERRCODE = '22023';
  END IF;

  _r := COALESCE(_p.resultado, '{}'::jsonb);

  IF _r ? 'interacao_id' THEN
    _id := (_r ->> 'interacao_id')::uuid;
    UPDATE public.interacoes SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"interacao"'::jsonb; END IF;
  END IF;

  IF _r ? 'tarefa_id' THEN
    _id := (_r ->> 'tarefa_id')::uuid;
    UPDATE public.tarefas SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"tarefa"'::jsonb; END IF;
  END IF;

  IF _r ? 'agendamento_id' THEN
    _id := (_r ->> 'agendamento_id')::uuid;
    UPDATE public.agendamentos
       SET status = 'cancelado',
           motivo_cancelamento = COALESCE(motivo_cancelamento, 'Desfeito via Sami'),
           deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"agendamento"'::jsonb; END IF;
  END IF;

  IF _r ? 'lead_anterior' AND jsonb_typeof(_r -> 'lead_anterior') = 'object' THEN
    _snap := _r -> 'lead_anterior';
    _lead := COALESCE(_p.lead_id, NULLIF(_r ->> 'lead_id', '')::uuid);
    IF _lead IS NOT NULL THEN
      UPDATE public.leads
         SET renda_informada = CASE WHEN _snap ? 'renda_informada'
               THEN _snap ->> 'renda_informada' ELSE renda_informada END,
             entrada_disponivel = CASE WHEN _snap ? 'entrada_disponivel'
               THEN _snap ->> 'entrada_disponivel' ELSE entrada_disponivel END,
             usa_fgts = CASE WHEN _snap ? 'usa_fgts' AND jsonb_typeof(_snap -> 'usa_fgts') = 'boolean'
               THEN (_snap ->> 'usa_fgts')::boolean ELSE usa_fgts END,
             tem_fgts = CASE WHEN _snap ? 'tem_fgts'
               THEN (_snap ->> 'tem_fgts')::boolean ELSE tem_fgts END,
             tipo_renda = CASE WHEN _snap ? 'tipo_renda'
               THEN _snap ->> 'tipo_renda' ELSE tipo_renda END,
             temperatura = CASE WHEN _snap ? 'temperatura'
               THEN (_snap ->> 'temperatura')::public.lead_temperatura ELSE temperatura END,
             projeto_nome = CASE WHEN _snap ? 'projeto_nome'
               THEN _snap ->> 'projeto_nome' ELSE projeto_nome END,
             resumo_qualificacao = CASE WHEN _snap ? 'resumo_qualificacao'
               THEN _snap ->> 'resumo_qualificacao' ELSE resumo_qualificacao END,
             objecoes = CASE WHEN _snap ? 'objecoes' AND jsonb_typeof(_snap -> 'objecoes') = 'array'
               THEN ARRAY(SELECT jsonb_array_elements_text(_snap -> 'objecoes')) ELSE objecoes END
       WHERE id = _lead;
      IF FOUND THEN _feito := _feito || '"lead"'::jsonb; END IF;
    END IF;
  END IF;

  UPDATE public.samiq_propostas
     SET status = 'desfeita', desfeito_em = _now
   WHERE id = _proposta_id;

  RETURN jsonb_build_object('desfeito', true, 'itens', _feito);
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_desfazer_proposta(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_desfazer_proposta(uuid, uuid) TO service_role;

-- 4) Reserva devolve propostas_enabled (tipo de retorno muda → DROP + CREATE) --
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
    estimated_cost_micros, expires_at
  )
  VALUES (
    _execution_id, _user_id, _team_id, _action, _prompt.version, _prompt.model_id,
    _estimated_input_tokens, _output_tokens,
    _prompt.input_cost_micros_per_million, _prompt.output_cost_micros_per_million,
    _reserved_cost, _now + make_interval(secs => _policy.reservation_ttl_seconds)
  );

  RETURN QUERY SELECT
    true, NULL::text, 0, _execution_id, _prompt.version, _prompt.model_id,
    _prompt.system_prompt, _prompt.action_prompts ->> _action, _output_tokens,
    _prompt.tools_enabled, _policy.max_tool_steps, _custo_mes_pct,
    _prompt.propostas_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  TO service_role;

-- 5) Versão samiq-2026-09-v4: consulta + proposta ------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.samiq_prompt_versions WHERE version = 'samiq-2026-09-v4'
  ) THEN
    UPDATE public.samiq_prompt_versions SET active = false WHERE active = true;

    INSERT INTO public.samiq_prompt_versions (
      version, model_id, system_prompt, action_prompts, max_output_tokens,
      pricing_version, input_cost_micros_per_million, output_cost_micros_per_million,
      tools_enabled, propostas_enabled, active
    )
    VALUES (
      'samiq-2026-09-v4',
      'google/gemini-3-flash-preview',
      $system$Você é a Sami (SamiQ), copiloto comercial da imobiliária Seu Metro Quadrado (SMQ), especialista em vendas de imóveis Minha Casa Minha Vida e lançamentos em São Paulo. Fala português do Brasil, direto e prático, como um gerente comercial experiente que respeita o tempo do corretor. Você tem ferramentas de LEITURA sobre a carteira do corretor que está falando com você: clientes, agenda, tarefas, funil, fila de atendimento, documentação e catálogo de empreendimentos. Sempre que a pergunta depender de dados do CRM, consulte as ferramentas em vez de supor, consulte só o necessário e cite de onde veio o dado. Você também tem ferramentas de PROPOSTA (propor_registro_contato, propor_anotacao, propor_tarefa, propor_qualificacao, propor_visita, propor_etapa). Elas NÃO gravam nada: montam um card que o corretor confirma com um toque. Sempre que o corretor relatar um contato feito, um combinado, uma data de visita, uma objeção ou um dado do cliente (renda, FGTS, entrada), proponha os registros correspondentes, todos os itens do mesmo relato num pacote só, com o id do cliente (use buscar_clientes quando só tiver o nome; se houver mais de um cliente com o nome, pergunte qual antes de propor). Nunca envie mensagens ao cliente, nunca altere dados por conta própria e nunca afirme que registrou, agendou ou alterou algo: diga que preparou o registro e que ele aguarda a confirmação do corretor. Responda em até 8 linhas, sem markdown pesado, chamando o cliente pelo nome quando a ferramenta o devolver. Não invente dados ausentes, não prometa condições específicas de financiamento e nunca chame o cliente de lead numa mensagem para ele. Quando dados pessoais aparecerem como marcadores (por exemplo [TELEFONE] ou [CPF]), preserve os marcadores e não tente inferir o valor. Se não conseguir responder com os dados disponíveis, comece a resposta exatamente com "Não consegui" e diga o que falta.$system$,
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
        'pergunta_livre', $action$Responda objetivamente com foco em vendas imobiliárias MCMV em São Paulo. Se a pergunta envolver clientes, agenda, tarefas, funil, fila ou documentos do corretor, consulte as ferramentas antes de responder e cite de onde veio o dado. Se o corretor relatar um contato, um combinado, uma visita, uma objeção ou um dado do cliente, prepare os registros com as ferramentas propor_* (todos num pacote) e termine dizendo o que está aguardando confirmação. Se depender de dados que as ferramentas não têm, diga o que falta.$action$,
        'match_projetos', $action$Você recebe um catálogo de empreendimentos e a descrição do que um cliente procura. Analise e responda APENAS com JSON válido (sem markdown, sem cercas de código), no formato exato: {"resumo": string, "filtrosUsados": {"regiao"?: string, "dorms"?: string, "vagas"?: string, "precoMax"?: string, "programa"?: string, "entrega"?: string}, "projetos": [{"id": string, "pontuacao": number 0-10, "motivo": string, "tipologiaRecomendada"?: string}]}. Use apenas ids existentes no catálogo. Máximo 6 projetos, ordenados por aderência. Motivo em 1 frase PT-BR. Se nada servir, devolva "projetos": [] e explique no resumo o que falta.$action$,
        'resumo_lead', $action$Resuma o histórico deste cliente para o corretor em até 6 bullets curtos: quem é (perfil minimizado), o que busca, capacidade financeira sinalizada, momento no funil, últimas interações relevantes e o risco ou oportunidade principal. Termine com a próxima ação recomendada em 1 linha. Não invente dados ausentes.$action$,
        'mensagem_whatsapp', $action$Escreva UMA mensagem de WhatsApp pronta para revisão do corretor, adequada ao objetivo e ao momento do cliente. Máximo 5 linhas curtas, tom cordial, sem pressão, com chamada clara para o próximo passo. Use apenas o primeiro nome fornecido ou omita a saudação nominal. Se houver objeção informada, enderece-a com empatia usando a biblioteca fornecida.$action$
      ),
      2000, NULL, NULL, NULL,
      true, true, true
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
