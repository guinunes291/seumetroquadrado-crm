-- Índices para as consultas mais quentes do catálogo de projetos/empreendimentos.
-- Idempotentes e não-destrutivos (CREATE INDEX IF NOT EXISTS).
--
-- Complementam os índices criados em 20260616174437 (cidade, bairro, preço,
-- ano_entrega, status_entrega, ativo) cobrindo os filtros que ainda faziam
-- varredura sequencial.

-- Filtro por Zona SMQ (pills da barra de filtros e Oferta Ativa).
CREATE INDEX IF NOT EXISTS idx_projetos_zona_smq
  ON public.projetos (zona_smq)
  WHERE zona_smq IS NOT NULL;

-- Estado "ativo e não excluído": predicado usado por praticamente toda listagem
-- e pelos seletores de projeto em novas vendas/ofertas. O índice parcial mantém
-- apenas as linhas vivas, ficando pequeno e seletivo.
CREATE INDEX IF NOT EXISTS idx_projetos_ativo_vivos
  ON public.projetos (ativo)
  WHERE deleted_at IS NULL;
