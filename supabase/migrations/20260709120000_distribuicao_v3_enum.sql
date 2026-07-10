-- ============================================================================
-- Distribuição v3 — passo 0/4: valor novo de enum.
--
-- Micro-migration isolada porque um valor adicionado a um enum não pode ser
-- usado na MESMA transação em que foi criado (restrição do Postgres). As
-- migrations seguintes da distribuição v3 usam 'distribuicao' em alertas.
-- ============================================================================

ALTER TYPE public.alerta_tipo ADD VALUE IF NOT EXISTS 'distribuicao';
