-- =====================================================================
-- Régua de datas (1/4) — marco de PASTA
--
-- "Pasta" não existia como evento datado: só havia o checklist de
-- documentos por lead (pendente/recebido/aprovado/reprovado). Sem marco,
-- não há data para o relatório recortar.
--
-- Regra de negócio definida com a operação: a pasta é considerada montada
-- quando o lead acumula ao menos 3 documentos resolvidos (recebido ou
-- aprovado) — documentação completa NÃO é exigida — e nesse momento o lead
-- migra sozinho para Análise de crédito.
--
--   leads.pasta_montada_em  = data/hora do marco (a data da métrica "pasta")
--
-- A automação nunca pode derrubar o upload de um documento: a transição de
-- status roda em bloco protegido e, se falhar (guard de transição, carteira,
-- etc.), o marco continua gravado e o documento é salvo do mesmo jeito.
-- =====================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pasta_montada_em timestamptz;

COMMENT ON COLUMN public.leads.pasta_montada_em IS
  'Momento em que a pasta do cliente foi considerada montada (3+ documentos recebidos/aprovados). É a data canônica da métrica "pasta" nos relatórios.';

CREATE INDEX IF NOT EXISTS idx_leads_pasta_montada_em
  ON public.leads (pasta_montada_em)
  WHERE pasta_montada_em IS NOT NULL;

-- Limiar em função própria: mudar a régua é uma linha, sem tocar no trigger.
CREATE OR REPLACE FUNCTION public.pasta_min_documentos()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT 3 $$;

COMMENT ON FUNCTION public.pasta_min_documentos() IS
  'Quantos documentos resolvidos (recebido/aprovado) fecham a pasta e disparam a migração automática para Análise de crédito.';

-- ---------------------------------------------------------------------
-- Trigger: 3º documento resolvido → marca a pasta e migra para análise
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pasta_montada_after_doc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _resolvidos int;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.status NOT IN ('recebido', 'aprovado') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = NEW.lead_id;
  IF NOT FOUND OR _lead.deleted_at IS NOT NULL OR _lead.pasta_montada_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _resolvidos
  FROM public.documentacoes d
  WHERE d.lead_id = NEW.lead_id
    AND d.status IN ('recebido', 'aprovado');

  IF _resolvidos < public.pasta_min_documentos() THEN
    RETURN NEW;
  END IF;

  UPDATE public.leads
     SET pasta_montada_em = now()
   WHERE id = NEW.lead_id
     AND pasta_montada_em IS NULL;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    NEW.lead_id,
    'pasta_montada',
    'Pasta montada: ' || _resolvidos || ' documentos recebidos.',
    'pasta_automatica',
    jsonb_build_object('documentos_resolvidos', _resolvidos, 'documentacao_id', NEW.id)
  );

  -- Migração automática para Análise de crédito. Só onde o guard permite
  -- (lead que ainda nem foi atendido não pula etapa) e sem nunca derrubar
  -- o upload do documento.
  IF public.transicao_lead_permitida(_lead.status, 'analise_credito'::public.lead_status, false) THEN
    BEGIN
      -- próxima ação é obrigatória nesta transição (guard do transicionar_lead)
      -- e, de qualquer forma, pasta enviada sem próximo passo vira lead parado.
      PERFORM public.transicionar_lead(
        NEW.lead_id,
        'analise_credito'::public.lead_status,
        'Pasta montada automaticamente (' || _resolvidos || ' documentos recebidos)',
        'Acompanhar a análise de crédito da pasta enviada'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pasta_montada_after_doc: transição automática falhou para o lead % (%)', NEW.lead_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pasta_montada_doc ON public.documentacoes;
CREATE TRIGGER trg_pasta_montada_doc
  AFTER INSERT OR UPDATE OF status ON public.documentacoes
  FOR EACH ROW EXECUTE FUNCTION public.pasta_montada_after_doc();

-- ---------------------------------------------------------------------
-- Backfill: leads que JÁ têm 3+ documentos resolvidos ganham o marco na
-- data do 3º documento (a data em que a pasta ficou de pé de verdade).
-- Não mexemos no status desses leads retroativamente — reabrir a esteira
-- de status de lead antigo faria mais estrago do que corrige.
-- ---------------------------------------------------------------------
WITH ordenados AS (
  SELECT
    d.lead_id,
    COALESCE(d.recebido_em, d.updated_at, d.created_at) AS quando,
    row_number() OVER (
      PARTITION BY d.lead_id
      ORDER BY COALESCE(d.recebido_em, d.updated_at, d.created_at)
    ) AS n
  FROM public.documentacoes d
  JOIN public.leads l ON l.id = d.lead_id AND l.deleted_at IS NULL
  WHERE d.status IN ('recebido', 'aprovado')
)
UPDATE public.leads l
   SET pasta_montada_em = o.quando
  FROM ordenados o
 WHERE o.lead_id = l.id
   AND o.n = (SELECT public.pasta_min_documentos())
   AND l.pasta_montada_em IS NULL;
