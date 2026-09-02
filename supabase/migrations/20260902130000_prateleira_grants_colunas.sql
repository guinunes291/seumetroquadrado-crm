-- =====================================================================
-- Prateleira — GRANT das colunas novas de projetos (hotfix, 2026-09-02)
--
-- Desde 20260711136000_projetos_webhook_token_lockdown.sql, `projetos` NÃO
-- tem grant de tabela para authenticated: os privilégios são por COLUNA
-- (allowlist sem webhook_token). Toda coluna nova precisa entrar na lista,
-- senão o SELECT dela devolve 42501 "permission denied for table projetos"
-- para o browser — foi o que derrubou /projetos-foco após a migration
-- 20260902120000 criar preco_atualizado_em / tabela_atualizada_em.
--
-- Só SELECT: quem escreve nessas colunas é o trigger
-- tg_projetos_marca_atualizacao, não o usuário.
-- =====================================================================

GRANT SELECT (preco_atualizado_em, tabela_atualizada_em)
  ON TABLE public.projetos TO authenticated;
