CREATE INDEX IF NOT EXISTS dlog_sucesso_created_idx ON public.distribution_log (created_at) INCLUDE (roleta_slug, regra_aplicada, id) WHERE resultado = 'sucesso';
ANALYZE public.distribution_log;