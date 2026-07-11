-- Hardening do webhook publico da landing.
--
-- O navegador envia somente o token publico do Turnstile e uma
-- Idempotency-Key aleatoria. Segredos, IPs crus e respostas com PII nunca sao
-- persistidos nestas estruturas. Todas as funcoes abaixo sao exclusivas do
-- service_role usado pela rota server-side.

-- A hash da idempotency key fica permanentemente no staging para impedir duas
-- linhas de lead mesmo se o registro temporario de replay ja tiver expirado.
ALTER TABLE public.leads_landing
  ADD COLUMN IF NOT EXISTS idempotency_key_hash text,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_landing_idempotency_hash_format'
      AND conrelid = 'public.leads_landing'::regclass
  ) THEN
    ALTER TABLE public.leads_landing
      ADD CONSTRAINT leads_landing_idempotency_hash_format CHECK (
        (idempotency_key_hash IS NULL AND idempotency_request_hash IS NULL)
        OR (
          idempotency_key_hash ~ '^[0-9a-f]{64}$'
          AND idempotency_request_hash ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_landing_idempotency_key_hash
  ON public.leads_landing (idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.landing_webhook_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  request_count integer NOT NULL CHECK (request_count > 0),
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT landing_webhook_rate_window_valid
    CHECK (expires_at > window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_landing_webhook_rate_limits_expiry
  ON public.landing_webhook_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS public.landing_webhook_idempotency (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  response_status smallint,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT landing_webhook_idempotency_state_valid CHECK (
    (
      state = 'processing'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND response_status IS NULL
      AND response_body IS NULL
    )
    OR (
      state = 'completed'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND response_status IS NOT NULL
      AND response_status BETWEEN 200 AND 599
      AND response_body IS NOT NULL
      AND jsonb_typeof(response_body) = 'object'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_landing_webhook_idempotency_expiry
  ON public.landing_webhook_idempotency (expires_at);

ALTER TABLE public.landing_webhook_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_webhook_idempotency ENABLE ROW LEVEL SECURITY;

-- O navegador só precisa marcar o status operacional do staging. Sem este
-- recorte, o GRANT UPDATE histórico também permitiria adulterar hashes de
-- idempotência; DELETE removeria a chave permanente e reabriria requisições
-- já processadas.
REVOKE INSERT, UPDATE, DELETE ON public.leads_landing FROM authenticated;
GRANT UPDATE (status) ON public.leads_landing TO authenticated;

REVOKE ALL ON public.landing_webhook_rate_limits
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.landing_webhook_idempotency
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_webhook_rate_limits
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_webhook_idempotency
  TO service_role;

-- Janela fixa iniciada na primeira requisicao. O UPSERT serializa duas
-- requisicoes simultaneas para a mesma hash e devolve a contagem ja consumida.
CREATE OR REPLACE FUNCTION public.consume_landing_webhook_rate_limit(
  _key_hash text,
  _max_requests integer,
  _window_seconds integer
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _row public.landing_webhook_rate_limits%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'key_hash invalida' USING ERRCODE = '22023';
  END IF;
  IF _max_requests IS NULL OR _max_requests < 1 OR _max_requests > 1000 THEN
    RAISE EXCEPTION 'max_requests invalido' USING ERRCODE = '22023';
  END IF;
  IF _window_seconds IS NULL OR _window_seconds < 1 OR _window_seconds > 3600 THEN
    RAISE EXCEPTION 'window_seconds invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.landing_webhook_rate_limits AS current_window (
    key_hash,
    request_count,
    window_started_at,
    expires_at
  )
  VALUES (
    _key_hash,
    1,
    _now,
    _now + make_interval(secs => _window_seconds)
  )
  ON CONFLICT (key_hash) DO UPDATE
  SET request_count = CASE
        WHEN current_window.expires_at <= _now THEN 1
        ELSE current_window.request_count + 1
      END,
      window_started_at = CASE
        WHEN current_window.expires_at <= _now THEN _now
        ELSE current_window.window_started_at
      END,
      expires_at = CASE
        WHEN current_window.expires_at <= _now
          THEN _now + make_interval(secs => _window_seconds)
        ELSE current_window.expires_at
      END
  RETURNING * INTO _row;

  RETURN QUERY SELECT
    _row.request_count <= _max_requests,
    GREATEST(_max_requests - _row.request_count, 0),
    CASE
      WHEN _row.request_count <= _max_requests THEN 0
      ELSE GREATEST(
        ceil(extract(epoch FROM (_row.expires_at - _now)))::integer,
        1
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_landing_webhook_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_landing_webhook_rate_limit(text, integer, integer)
  TO service_role;

-- Claim atomico da Idempotency-Key. A linha e bloqueada ate o fim da RPC; uma
-- chamada concorrente espera e entao recebe replay/in_progress, nunca um
-- segundo claim. Lease permite recuperar uma execucao interrompida.
CREATE OR REPLACE FUNCTION public.begin_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _ttl_seconds integer DEFAULT 86400,
  _lease_seconds integer DEFAULT 180
)
RETURNS TABLE(
  disposition text,
  response_status integer,
  response_body jsonb,
  lease_token uuid,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _new_lease uuid := gen_random_uuid();
  _inserted integer;
  _row public.landing_webhook_idempotency%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$'
     OR _request_hash IS NULL OR _request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'hash invalida' USING ERRCODE = '22023';
  END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds < 300 OR _ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'ttl invalido' USING ERRCODE = '22023';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds < 30 OR _lease_seconds > 600 THEN
    RAISE EXCEPTION 'lease invalida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.landing_webhook_idempotency (
    key_hash,
    request_hash,
    state,
    lease_token,
    lease_expires_at,
    expires_at
  )
  VALUES (
    _key_hash,
    _request_hash,
    'processing',
    _new_lease,
    _now + make_interval(secs => _lease_seconds),
    _now + make_interval(secs => _ttl_seconds)
  )
  ON CONFLICT (key_hash) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  IF _inserted = 1 THEN
    RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
      _new_lease, 0;
    RETURN;
  END IF;

  SELECT * INTO _row
  FROM public.landing_webhook_idempotency AS i
  WHERE i.key_hash = _key_hash
  FOR UPDATE;

  -- A limpeza pode ter removido uma linha expirada entre o ON CONFLICT e o
  -- SELECT. Reinsere uma vez; se outra requisicao vencer a corrida, bloqueia a
  -- linha dela e segue pelo mesmo fluxo abaixo.
  IF NOT FOUND THEN
    _new_lease := gen_random_uuid();
    INSERT INTO public.landing_webhook_idempotency (
      key_hash,
      request_hash,
      state,
      lease_token,
      lease_expires_at,
      expires_at
    )
    VALUES (
      _key_hash,
      _request_hash,
      'processing',
      _new_lease,
      _now + make_interval(secs => _lease_seconds),
      _now + make_interval(secs => _ttl_seconds)
    )
    ON CONFLICT (key_hash) DO NOTHING;
    GET DIAGNOSTICS _inserted = ROW_COUNT;

    IF _inserted = 1 THEN
      RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
        _new_lease, 0;
      RETURN;
    END IF;

    SELECT * INTO _row
    FROM public.landing_webhook_idempotency AS i
    WHERE i.key_hash = _key_hash
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'falha ao adquirir idempotencia'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF _row.request_hash <> _request_hash THEN
    RETURN QUERY SELECT 'conflict', NULL::integer, NULL::jsonb,
      NULL::uuid, 0;
    RETURN;
  END IF;

  IF _row.state = 'completed' AND _row.expires_at > _now THEN
    RETURN QUERY SELECT 'replay', _row.response_status::integer,
      _row.response_body, NULL::uuid, 0;
    RETURN;
  END IF;

  IF _row.state = 'processing' AND _row.lease_expires_at > _now THEN
    RETURN QUERY SELECT 'in_progress', NULL::integer, NULL::jsonb,
      NULL::uuid,
      GREATEST(
        ceil(extract(epoch FROM (_row.lease_expires_at - _now)))::integer,
        1
      );
    RETURN;
  END IF;

  _new_lease := gen_random_uuid();
  UPDATE public.landing_webhook_idempotency
  SET state = 'processing',
      request_hash = _request_hash,
      lease_token = _new_lease,
      lease_expires_at = _now + make_interval(secs => _lease_seconds),
      response_status = NULL,
      response_body = NULL,
      updated_at = _now,
      expires_at = _now + make_interval(secs => _ttl_seconds)
  WHERE key_hash = _key_hash;

  RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
    _new_lease, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_landing_webhook_request(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_landing_webhook_request(text, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _lease_token uuid,
  _response_status integer,
  _response_body jsonb,
  _ttl_seconds integer DEFAULT 86400
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _updated integer;
BEGIN
  IF _response_status IS NULL
     OR _response_body IS NULL
     OR _response_status < 200 OR _response_status > 599
     OR jsonb_typeof(_response_body) <> 'object'
     OR octet_length(_response_body::text) > 4096
     OR NOT (_response_body ? 'ok')
     OR jsonb_typeof(_response_body -> 'ok') <> 'boolean'
     OR (
       _response_body ? 'accepted'
       AND jsonb_typeof(_response_body -> 'accepted') <> 'boolean'
     )
     OR (
       _response_body ? 'error'
       AND (
         jsonb_typeof(_response_body -> 'error') <> 'string'
         OR char_length(_response_body ->> 'error') > 64
       )
     )
     OR (
       _response_body ? 'retry_after_s'
       AND jsonb_typeof(_response_body -> 'retry_after_s') <> 'number'
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(_response_body) AS response_key(key)
       WHERE response_key.key NOT IN ('ok', 'accepted', 'error', 'retry_after_s')
     ) THEN
    RAISE EXCEPTION 'resposta invalida' USING ERRCODE = '22023';
  END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds < 300 OR _ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'ttl invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.landing_webhook_idempotency
  SET state = 'completed',
      lease_token = NULL,
      lease_expires_at = NULL,
      response_status = _response_status,
      response_body = _response_body,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + make_interval(secs => _ttl_seconds)
  WHERE key_hash = _key_hash
    AND request_hash = _request_hash
    AND state = 'processing'
    AND lease_token = _lease_token;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_landing_webhook_request(
  text, text, uuid, integer, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_landing_webhook_request(
  text, text, uuid, integer, jsonb, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _deleted integer;
BEGIN
  DELETE FROM public.landing_webhook_idempotency
  WHERE key_hash = _key_hash
    AND request_hash = _request_hash
    AND state = 'processing'
    AND lease_token = _lease_token;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.release_landing_webhook_request(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_landing_webhook_request(text, text, uuid)
  TO service_role;

-- Chamar por cron (por exemplo, a cada hora). SKIP LOCKED permite mais de um
-- worker sem bloquear requisicoes em andamento.
CREATE OR REPLACE FUNCTION public.cleanup_landing_webhook_state(
  _batch_size integer DEFAULT 1000
)
RETURNS TABLE(idempotency_deleted integer, rate_limits_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _take integer := LEAST(GREATEST(COALESCE(_batch_size, 1000), 1), 5000);
  _idempotency_deleted integer;
  _rate_limits_deleted integer;
BEGIN
  WITH expired AS (
    SELECT i.key_hash
    FROM public.landing_webhook_idempotency AS i
    WHERE i.expires_at <= clock_timestamp()
    ORDER BY i.expires_at
    LIMIT _take
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.landing_webhook_idempotency AS i
  USING expired AS e
  WHERE i.key_hash = e.key_hash;
  GET DIAGNOSTICS _idempotency_deleted = ROW_COUNT;

  WITH expired AS (
    SELECT r.key_hash
    FROM public.landing_webhook_rate_limits AS r
    WHERE r.expires_at <= clock_timestamp()
    ORDER BY r.expires_at
    LIMIT _take
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.landing_webhook_rate_limits AS r
  USING expired AS e
  WHERE r.key_hash = e.key_hash;
  GET DIAGNOSTICS _rate_limits_deleted = ROW_COUNT;

  RETURN QUERY SELECT _idempotency_deleted, _rate_limits_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_landing_webhook_state(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_landing_webhook_state(integer)
  TO service_role;
