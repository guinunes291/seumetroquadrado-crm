-- Ponte de identidade para o histórico do Manus em leads e projetos (espelha
-- profiles.legacy_user_id). Necessário para vincular agendamentos/visitas/análises
-- (que referenciam leadId/projectId inteiros do Manus) aos registros UUID do CRM.

ALTER TABLE public.leads    ADD COLUMN IF NOT EXISTS legacy_id bigint;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS legacy_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS leads_legacy_id_key
  ON public.leads(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projetos_legacy_id_key
  ON public.projetos(legacy_id) WHERE legacy_id IS NOT NULL;
