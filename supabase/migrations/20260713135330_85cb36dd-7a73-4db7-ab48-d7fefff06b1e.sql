
CREATE INDEX IF NOT EXISTS idx_leads_active_created_desc
  ON public.leads (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

CREATE INDEX IF NOT EXISTS idx_leads_sem_dono_created_desc
  ON public.leads (status, created_at DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_nome_ativos
  ON public.leads (nome)
  WHERE deleted_at IS NULL;
