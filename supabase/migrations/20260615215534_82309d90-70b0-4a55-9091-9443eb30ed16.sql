ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS legacy_id bigint UNIQUE;
CREATE INDEX IF NOT EXISTS idx_leads_legacy_id ON public.leads(legacy_id);