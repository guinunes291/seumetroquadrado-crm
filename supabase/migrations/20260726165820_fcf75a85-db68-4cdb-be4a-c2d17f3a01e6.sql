CREATE INDEX IF NOT EXISTS idx_projetos_nome_norm
  ON public.projetos (public._norm_projeto_nome(nome))
  WHERE deleted_at IS NULL;

ANALYZE public.projetos;