-- Aprovação de crédito com DADOS (pedido do dono, 2026-09-23): anexar a carta
-- de aprovação do cliente e guardar, em campos próprios, o que o banco
-- aprovou — valor de financiamento, parcela, FGTS, subsídio, prazo, taxa,
-- renda considerada — para (1) o CRM oferecer ao corretor os produtos que
-- encaixam naquela aprovação e (2) a gestão puxar relatório de "clientes
-- aprovados entre X e Y que cabem no produto novo".
--
-- Decisões:
-- 1) Os campos moram em `analises_credito`, não em `leads`: a aprovação é um
--    FATO datado de uma rodada de análise (banco, validade). Nova rodada =
--    nova linha; a última por lead continua sendo o estado atual (regra do
--    fluxo 3.1). Gravar em `leads` perderia o histórico e misturaria o que o
--    cliente DISSE (renda_informada) com o que o banco APROVOU.
-- 2) Numéricos de verdade (numeric), não texto: relatório por faixa de valor
--    exige comparação numérica e índice.
-- 3) O arquivo reusa `documentacoes` (tipo 'aprovacao_credito') e o upload
--    mediado por servidor que já existe (bucket privado, versões, auditoria).
--    Aqui só guardamos a FK — um lugar só para arquivo sensível.
-- 4) CHECKs NOT VALID: o futuro entra validado, o legado não quebra o replay.
-- 5) `poder_compra` é coluna GERADA (financiamento + FGTS + subsídio +
--    entrada): o relatório filtra por ela sem recalcular em cada consumidor.

-- 1) Campos da aprovação -------------------------------------------------------
ALTER TABLE public.analises_credito
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS sistema_amortizacao text,
  ADD COLUMN IF NOT EXISTS valor_financiamento numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_parcela numeric(12,2),
  ADD COLUMN IF NOT EXISTS prazo_meses integer,
  ADD COLUMN IF NOT EXISTS taxa_juros_anual numeric(6,3),
  ADD COLUMN IF NOT EXISTS valor_fgts numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_subsidio numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_entrada numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_imovel_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS renda_familiar numeric(12,2),
  ADD COLUMN IF NOT EXISTS faixa_mcmv text,
  ADD COLUMN IF NOT EXISTS qtd_participantes smallint,
  ADD COLUMN IF NOT EXISTS cotista_fgts boolean,
  ADD COLUMN IF NOT EXISTS possui_dependente boolean,
  ADD COLUMN IF NOT EXISTS data_aprovacao date,
  ADD COLUMN IF NOT EXISTS validade_ate date,
  ADD COLUMN IF NOT EXISTS comprovante_doc_id uuid
    REFERENCES public.documentacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dados_origem text,
  ADD COLUMN IF NOT EXISTS dados_extraidos jsonb;

ALTER TABLE public.analises_credito
  ADD COLUMN IF NOT EXISTS poder_compra numeric(12,2)
  GENERATED ALWAYS AS (
    COALESCE(valor_financiamento, 0) + COALESCE(valor_fgts, 0)
    + COALESCE(valor_subsidio, 0) + COALESCE(valor_entrada, 0)
  ) STORED;

-- 2) Vocabulários e sanidade (só escritas novas) -------------------------------
DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_modalidade_check
    CHECK (modalidade IS NULL OR modalidade IN ('mcmv', 'sbpe', 'pro_cotista', 'outro')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_amortizacao_check
    CHECK (sistema_amortizacao IS NULL OR sistema_amortizacao IN ('price', 'sac')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_faixa_check
    CHECK (faixa_mcmv IS NULL OR faixa_mcmv IN ('1', '2', '3', '4')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_dados_origem_check
    CHECK (dados_origem IS NULL OR dados_origem IN ('manual', 'ia', 'ia_revisado')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_valores_check
    CHECK (
      COALESCE(valor_financiamento, 0) >= 0
      AND COALESCE(valor_parcela, 0) >= 0
      AND COALESCE(valor_fgts, 0) >= 0
      AND COALESCE(valor_subsidio, 0) >= 0
      AND COALESCE(valor_entrada, 0) >= 0
      AND COALESCE(valor_imovel_max, 0) >= 0
      AND COALESCE(renda_familiar, 0) >= 0
      AND (prazo_meses IS NULL OR prazo_meses BETWEEN 1 AND 480)
      AND (taxa_juros_anual IS NULL OR taxa_juros_anual BETWEEN 0 AND 100)
      AND (qtd_participantes IS NULL OR qtd_participantes BETWEEN 1 AND 10)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Índices para o relatório (só aprovações — é o que se consulta por valor) --
CREATE INDEX IF NOT EXISTS analises_credito_aprov_financiamento_idx
  ON public.analises_credito (valor_financiamento)
  WHERE status IN ('aprovada', 'aprovada_condicionada');
CREATE INDEX IF NOT EXISTS analises_credito_aprov_poder_compra_idx
  ON public.analises_credito (poder_compra)
  WHERE status IN ('aprovada', 'aprovada_condicionada');

-- 4) Relatório: a aprovação VIGENTE de cada cliente ----------------------------
-- Só a ÚLTIMA análise do lead conta (se depois da aprovação veio uma
-- reprovação, o cliente não está aprovado). security_invoker: quem consulta
-- enxerga só o que a RLS de analises_credito/leads já lhe dá — o corretor vê
-- a própria carteira, a gestão vê tudo.
CREATE OR REPLACE VIEW public.aprovacoes_credito_vigentes
WITH (security_invoker = true) AS
SELECT
  ult.id AS analise_id,
  ult.lead_id,
  l.nome AS lead_nome,
  l.telefone AS lead_telefone,
  l.status::text AS lead_status,
  l.corretor_id,
  l.projeto_nome,
  ult.status AS status_analise,
  ult.banco,
  ult.modalidade,
  ult.sistema_amortizacao,
  ult.valor_financiamento,
  ult.valor_parcela,
  ult.prazo_meses,
  ult.taxa_juros_anual,
  ult.valor_fgts,
  ult.valor_subsidio,
  ult.valor_entrada,
  ult.valor_imovel_max,
  ult.poder_compra,
  ult.renda_familiar,
  ult.faixa_mcmv,
  ult.qtd_participantes,
  ult.cotista_fgts,
  ult.possui_dependente,
  ult.data_aprovacao,
  ult.validade_ate,
  (ult.validade_ate IS NOT NULL AND ult.validade_ate < CURRENT_DATE) AS vencida,
  ult.comprovante_doc_id,
  ult.updated_at
FROM (
  SELECT DISTINCT ON (ac.lead_id) ac.*
  FROM public.analises_credito ac
  WHERE ac.lead_id IS NOT NULL
  ORDER BY ac.lead_id, ac.created_at DESC
) ult
JOIN public.leads l ON l.id = ult.lead_id
WHERE ult.status IN ('aprovada', 'aprovada_condicionada')
  AND l.deleted_at IS NULL
  AND l.na_lixeira = false;

GRANT SELECT ON public.aprovacoes_credito_vigentes TO authenticated;

COMMENT ON VIEW public.aprovacoes_credito_vigentes IS
  'Aprovacao de credito vigente por cliente (ultima analise do lead, se aprovada/condicionada), com os valores aprovados. Base do relatorio "clientes aprovados entre X e Y" e do encaixe em produtos novos. security_invoker: respeita a RLS de quem consulta.';

-- 5) IA: leitura da carta de aprovação sob a governança do SamiQ ---------------
-- Versão NOVA derivada da ativa (padrão da S5): execuções antigas continuam
-- apontando o prompt que usaram. Só ACRESCENTA a ação ler_aprovacao_credito;
-- nada mais muda. Idempotente: se a ativa já tem a ação, não faz nada.
DO $$
DECLARE
  _ativa public.samiq_prompt_versions%ROWTYPE;
BEGIN
  SELECT * INTO _ativa
  FROM public.samiq_prompt_versions
  WHERE active = true
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND OR _ativa.action_prompts ? 'ler_aprovacao_credito' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.samiq_prompt_versions WHERE version = 'samiq-2026-09-v6') THEN
    RETURN;
  END IF;

  UPDATE public.samiq_prompt_versions SET active = false WHERE active = true;

  INSERT INTO public.samiq_prompt_versions (
    version, model_id, system_prompt, action_prompts, max_output_tokens,
    pricing_version, input_cost_micros_per_million, output_cost_micros_per_million,
    tools_enabled, propostas_enabled, active
  )
  VALUES (
    'samiq-2026-09-v6',
    _ativa.model_id,
    _ativa.system_prompt,
    _ativa.action_prompts || jsonb_build_object(
      'ler_aprovacao_credito', $action$Você recebe a carta/print de APROVAÇÃO DE CRÉDITO imobiliário de um cliente (Caixa, correspondente bancário ou outro banco). Extraia SOMENTE os números e condições da aprovação e responda APENAS com JSON válido (sem markdown, sem cercas de código), no formato exato: {"banco": string|null, "modalidade": "mcmv"|"sbpe"|"pro_cotista"|"outro"|null, "sistema_amortizacao": "price"|"sac"|null, "valor_financiamento": number|null, "valor_parcela": number|null, "prazo_meses": number|null, "taxa_juros_anual": number|null, "valor_fgts": number|null, "valor_subsidio": number|null, "valor_entrada": number|null, "valor_imovel_max": number|null, "renda_familiar": number|null, "faixa_mcmv": "1"|"2"|"3"|"4"|null, "qtd_participantes": number|null, "cotista_fgts": boolean|null, "possui_dependente": boolean|null, "data_aprovacao": "AAAA-MM-DD"|null, "validade_ate": "AAAA-MM-DD"|null, "confianca": number 0-1, "observacoes": string|null}. Valores em reais como número puro (ex.: 185000.5), taxa em % ao ano (ex.: 7.66), prazo em meses. valor_parcela é a primeira prestação aprovada (com seguros, se o documento mostrar). valor_imovel_max é o valor máximo de compra e venda ou de avaliação aprovado. ATENÇÃO ao formato "Simulador - Detalhamento" da CAIXA (retorno do SIRIC): "Valor de Financiamento + Despesa Cartorária" = valor_financiamento; "Prestação Máxima - SIRIC" = valor_parcela (se ausente, use "Primeira Prestação"); "Valor do imóvel" = valor_imovel_max; "Juros Nominais" = taxa_juros_anual; "Renda Familiar" = renda_familiar; "Número De Participantes" = qtd_participantes; "FGTS Há Mais De 3 Anos" = cotista_fgts; "PRICE FGTS"/"SAC" = sistema_amortizacao; origem de recurso FGTS ou NPMCMV/MCMV = modalidade "mcmv", SBPE = "sbpe". O campo "Valor de entrada" do simulador é a DIFERENÇA entre imóvel e financiamento, NÃO é recurso do cliente: NUNCA o coloque em valor_entrada — valor_entrada só quando o documento disser explicitamente recursos próprios/poupança do cliente. valor_fgts só com saldo/uso de FGTS explícito; valor_subsidio só com desconto/subsídio explícito. Use null para o que o documento não mostra — nunca invente nem calcule. NÃO devolva nome, CPF, endereço nem qualquer dado pessoal. Em observacoes, até 2 frases com condições ou ressalvas do banco.$action$
    ),
    _ativa.max_output_tokens,
    _ativa.pricing_version, _ativa.input_cost_micros_per_million, _ativa.output_cost_micros_per_million,
    _ativa.tools_enabled, _ativa.propostas_enabled, true
  );
END $$;

NOTIFY pgrst, 'reload schema';
