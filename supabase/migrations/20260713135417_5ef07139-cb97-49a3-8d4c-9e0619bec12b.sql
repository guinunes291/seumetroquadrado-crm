
CREATE INDEX IF NOT EXISTS idx_interacoes_tipo_ativas
  ON public.interacoes (tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interacoes_ocorreu_em_ativas
  ON public.interacoes (ocorreu_em DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lst_created_desc
  ON public.lead_status_transitions (created_at DESC);
