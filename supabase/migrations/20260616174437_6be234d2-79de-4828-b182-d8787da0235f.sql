
-- Limpeza completa
DELETE FROM public.historico_precos;
DELETE FROM public.unidades;
UPDATE public.leads SET projeto_id = NULL WHERE projeto_id IS NOT NULL;
UPDATE public.templates_mensagem SET projeto_id = NULL WHERE projeto_id IS NOT NULL;
DELETE FROM public.projeto_foco;
DELETE FROM public.projetos;

-- Novos campos estruturados
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS metragem_min numeric(10,2),
  ADD COLUMN IF NOT EXISTS metragem_max numeric(10,2),
  ADD COLUMN IF NOT EXISTS dorms_min smallint,
  ADD COLUMN IF NOT EXISTS dorms_max smallint,
  ADD COLUMN IF NOT EXISTS suites smallint,
  ADD COLUMN IF NOT EXISTS tipo_extra text,
  ADD COLUMN IF NOT EXISTS vagas_min smallint,
  ADD COLUMN IF NOT EXISTS vagas_max smallint,
  ADD COLUMN IF NOT EXISTS vagas_observacao text,
  ADD COLUMN IF NOT EXISTS preco_a_partir numeric(14,2),
  ADD COLUMN IF NOT EXISTS sob_consulta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_entrega text,
  ADD COLUMN IF NOT EXISTS mes_entrega smallint,
  ADD COLUMN IF NOT EXISTS ano_entrega smallint,
  ADD COLUMN IF NOT EXISTS fonte text;

CREATE INDEX IF NOT EXISTS idx_projetos_status_entrega ON public.projetos(status_entrega);
CREATE INDEX IF NOT EXISTS idx_projetos_preco_a_partir ON public.projetos(preco_a_partir);
CREATE INDEX IF NOT EXISTS idx_projetos_ano_entrega ON public.projetos(ano_entrega);
CREATE INDEX IF NOT EXISTS idx_projetos_cidade ON public.projetos(cidade);
CREATE INDEX IF NOT EXISTS idx_projetos_bairro ON public.projetos(bairro);
