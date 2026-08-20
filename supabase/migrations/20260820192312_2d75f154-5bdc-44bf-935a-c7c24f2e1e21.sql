CREATE INDEX IF NOT EXISTS idx_leads_telefone_trgm ON public.leads USING gin (telefone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_telefone_e164_trgm ON public.leads USING gin (telefone_e164 extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documentacoes_url_presente ON public.documentacoes (created_at DESC) WHERE url IS NOT NULL;