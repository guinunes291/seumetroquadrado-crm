
-- Mapear valores legados para o novo vocabulário
UPDATE public.leads SET motivo_perda_categoria = 'sem_contato'
  WHERE motivo_perda_categoria IN ('sem_resposta','contato_invalido');
UPDATE public.leads SET motivo_perda_categoria = 'outro'
  WHERE motivo_perda_categoria = 'sem_interesse';
UPDATE public.leads SET motivo_perda_categoria = 'sem_perfil'
  WHERE motivo_perda_categoria = 'sem_perfil_credito';

-- Passo 1: CHECK nos 11 valores permitidos
ALTER TABLE public.leads
  ADD CONSTRAINT leads_motivo_perda_categoria_check
  CHECK (
    motivo_perda_categoria IS NULL OR motivo_perda_categoria IN (
      'sem_contato','sumiu_pos_proposta','credito_score','credito_renda',
      'estourou_teto','ja_possui_imovel','preco_parcela','comprou_concorrente',
      'timing_adiou','sem_perfil','outro'
    )
  );

-- Passo 3: nova coluna data_perda
ALTER TABLE public.leads ADD COLUMN data_perda timestamptz NULL;

-- Passo 4: trigger para preencher data_perda automaticamente
CREATE OR REPLACE FUNCTION public.set_data_perda_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'perdido'
     AND (OLD.status IS DISTINCT FROM 'perdido')
     AND NEW.data_perda IS NULL THEN
    NEW.data_perda := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_data_perda ON public.leads;
CREATE TRIGGER trg_leads_set_data_perda
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_data_perda_on_status_change();
