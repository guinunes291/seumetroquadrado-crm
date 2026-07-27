ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS import_batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_leads_import_batch_id ON public.leads (import_batch_id) WHERE import_batch_id IS NOT NULL;