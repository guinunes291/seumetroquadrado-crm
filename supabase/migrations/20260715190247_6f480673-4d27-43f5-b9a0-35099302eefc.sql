CREATE INDEX IF NOT EXISTS idx_alertas_user_created_desc
  ON public.alertas (user_id, created_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_leads_telefone_trgm
  ON public.leads USING gin (telefone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_nome_trgm
  ON public.leads USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm
  ON public.leads USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_interacoes_tipo_ocorreu
  ON public.interacoes (tipo, ocorreu_em DESC);