-- =====================================================================
-- Auditoria 2026-07-19 (B4) — rate limit distribuído para a API pública.
-- O limiter em memória (src/lib/rate-limit.ts) é por processo: em
-- Cloudflare Workers o teto efetivo multiplica pelo nº de instâncias e
-- zera a cada deploy. O landing webhook já usa janela fixa no banco
-- (consume_landing_webhook_rate_limit); esta migration generaliza o mesmo
-- mecanismo para as demais rotas públicas. O in-memory permanece como
-- primeira barreira barata; o banco é a régua real.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_hash text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expira
  ON public.api_rate_limits (expires_at);

CREATE OR REPLACE FUNCTION public.consumir_api_rate_limit(
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
  _row public.api_rate_limits%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'key_hash invalida' USING ERRCODE = '22023';
  END IF;
  IF _max_requests IS NULL OR _max_requests < 1 OR _max_requests > 10000 THEN
    RAISE EXCEPTION 'max_requests invalido' USING ERRCODE = '22023';
  END IF;
  IF _window_seconds IS NULL OR _window_seconds < 1 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'window_seconds invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.api_rate_limits AS current_window (
    key_hash, request_count, window_started_at, expires_at
  )
  VALUES (
    _key_hash, 1, _now, _now + make_interval(secs => _window_seconds)
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
      ELSE GREATEST(ceil(extract(epoch FROM (_row.expires_at - _now)))::integer, 1)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_api_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_api_rate_limit(text, integer, integer)
  TO service_role;

-- Limpeza horária das janelas expiradas.
CREATE OR REPLACE FUNCTION public.limpar_api_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.api_rate_limits
   WHERE expires_at < clock_timestamp() - interval '1 hour';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_api_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_api_rate_limits() TO service_role;

SELECT cron.unschedule('limpar-api-rate-limits')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-api-rate-limits');
SELECT cron.schedule('limpar-api-rate-limits', '15 * * * *',
  $$ SELECT public.limpar_api_rate_limits(); $$);
