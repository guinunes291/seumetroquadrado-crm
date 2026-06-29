ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS renda_estimada numeric,
  ADD COLUMN IF NOT EXISTS tem_fgts boolean,
  ADD COLUMN IF NOT EXISTS fgts_valor numeric,
  ADD COLUMN IF NOT EXISTS resumo_qualificacao text;