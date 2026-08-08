-- =============================================================================
-- pg_stat_statements (estrategia-2026-08, item 0.2 — métrica M4).
--
-- Liga a coleta de estatísticas por statement para responder, com dados, quais
-- das ~30 RPCs "órfãs" (sem consumidor no frontend) são chamadas por bots,
-- n8n ou MCP — o item 3.4 da auditoria ux-ia-2026-08 exige 7+ dias de medição
-- ANTES de qualquer eliminação. O relógio dos 7 dias começa quando esta
-- migration chega em produção; o roteiro de leitura está em
-- docs/ops/medicao-rpcs-orfas.md.
--
-- No Supabase a biblioteca já está em shared_preload_libraries — o CREATE
-- EXTENSION basta. No harness local (postgres:16-alpine) a extensão existe no
-- contrib; o bloco tolera ambientes onde ela não esteja disponível para nunca
-- quebrar o replay.
-- =============================================================================

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_stat_statements indisponível neste ambiente (%) — seguindo sem a coleta', SQLERRM;
END $$;
