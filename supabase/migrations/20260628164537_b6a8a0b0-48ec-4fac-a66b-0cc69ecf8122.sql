
-- Aditivo: colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS faixa_mcmv text,
  ADD COLUMN IF NOT EXISTS tipo_renda text,
  ADD COLUMN IF NOT EXISTS decisor text,
  ADD COLUMN IF NOT EXISTS proxima_acao text,
  ADD COLUMN IF NOT EXISTS consentimento_lgpd boolean,
  ADD COLUMN IF NOT EXISTS opt_out boolean NOT NULL DEFAULT false;

-- Aditivo: status_preco em projetos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projetos' AND column_name='status_preco') THEN
    ALTER TABLE public.projetos ADD COLUMN status_preco text NOT NULL DEFAULT 'a_confirmar'
      CHECK (status_preco IN ('vigente','a_confirmar','vencido'));
  END IF;
END $$;

-- Nova tabela lead_eventos
CREATE TABLE IF NOT EXISTS public.lead_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text,
  agente text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_eventos TO authenticated;
GRANT ALL ON public.lead_eventos TO service_role;

ALTER TABLE public.lead_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_eventos read auth" ON public.lead_eventos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_eventos insert auth" ON public.lead_eventos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lead_eventos admin manage" ON public.lead_eventos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE INDEX IF NOT EXISTS idx_lead_eventos_lead_created ON public.lead_eventos(lead_id, created_at DESC);
