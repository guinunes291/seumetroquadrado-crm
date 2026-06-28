
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS desfecho text,
  ADD COLUMN IF NOT EXISTS fase text,
  ADD COLUMN IF NOT EXISTS visita_data date,
  ADD COLUMN IF NOT EXISTS visita_hora text,
  ADD COLUMN IF NOT EXISTS visita_empreendimento text,
  ADD COLUMN IF NOT EXISTS docs_recebidos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS docs_pendentes jsonb DEFAULT '[]'::jsonb;
