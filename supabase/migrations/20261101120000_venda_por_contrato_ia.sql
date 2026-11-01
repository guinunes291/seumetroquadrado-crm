-- =============================================================================
-- Venda por contrato (IA) — pedido do dono, 01/11/2026.
--
-- O corretor (ou a gestão) anexa o contrato de compra e venda da construtora,
-- a IA lê os dados do comprador e da venda, o CRM acha (ou cria) o cliente e
-- abre o cadastro de venda JÁ PREENCHIDO. Tudo é editável; nada é gravado sem
-- o usuário confirmar.
--
-- Decisões (respostas do dono às 10 perguntas, 01/11/2026):
--  1) Dados pessoais completos do comprador: RG, nascimento, estado civil,
--     profissão, nacionalidade, endereço residencial e cônjuge/2º comprador.
--     Moram em `leads` (como nome, CPF e e-mail) e entram em
--     `_cliente_campos()`: o gatilho do registro mãe os leva para `clientes`
--     e o registro filho criado depois já nasce com eles.
--  2) `endereco_bairro` é o bairro onde o cliente MORA. Não reaproveita
--     `leads.bairro`: aquele é o bairro de interesse que decide a ZONA da
--     roleta — misturar os dois mudaria a fila de quem atende o cliente.
--  3) A gravação passa por `aplicar_dados_contrato_lead`, SECURITY INVOKER:
--     roda com a RLS de quem chama (o mesmo poder do "Editar dados"), aceita só
--     a lista fechada de campos e grava tudo num UPDATE só. Os gatilhos de
--     sempre (telefone do corretor, registro mãe, auditoria) continuam valendo.
--  4) Status: a trava `proteger_fechamento_sem_venda_aprovada` FICA (decisão do
--     dono). A venda entra pendente; a aprovação da gestão já move o lead para
--     "Contrato fechado" (aplicar_efeitos_status_venda). Nada muda aqui.
--  5) IA sob a governança do SamiQ: ação `ler_contrato_venda` numa versão
--     NOVA derivada da ativa (mesmo padrão da ler_aprovacao_credito). Execuções
--     antigas continuam apontando o prompt que usaram.
--  6) CHECKs NOT VALID: o que entra daqui em diante é validado; o legado não
--     quebra o replay.
-- Idempotente.
-- =============================================================================

SET LOCAL lock_timeout = '10s';

-- 1) Campos do comprador -------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS rg_orgao_emissor text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS regime_casamento text,
  ADD COLUMN IF NOT EXISTS profissao text,
  ADD COLUMN IF NOT EXISTS nacionalidade text,
  ADD COLUMN IF NOT EXISTS endereco_logradouro text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text,
  ADD COLUMN IF NOT EXISTS endereco_bairro text,
  ADD COLUMN IF NOT EXISTS endereco_cidade text,
  ADD COLUMN IF NOT EXISTS endereco_uf text,
  ADD COLUMN IF NOT EXISTS endereco_cep text,
  ADD COLUMN IF NOT EXISTS conjuge_nome text,
  ADD COLUMN IF NOT EXISTS conjuge_cpf text;

COMMENT ON COLUMN public.leads.endereco_bairro IS
  'Bairro onde o cliente MORA (contrato). Diferente de leads.bairro, o bairro '
  'de interesse que decide a zona da roleta.';
COMMENT ON COLUMN public.leads.conjuge_nome IS
  'Cônjuge ou segundo comprador (contrato de compra e venda).';

DO $$
BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_dados_contrato_check
    CHECK (
      (endereco_uf IS NULL OR endereco_uf ~ '^[A-Z]{2}$')
      AND (endereco_cep IS NULL OR endereco_cep ~ '^\d{8}$')
      AND (conjuge_cpf IS NULL OR conjuge_cpf ~ '^\d{11}$')
      AND (data_nascimento IS NULL OR data_nascimento BETWEEN DATE '1900-01-01' AND DATE '2100-01-01')
      AND length(COALESCE(rg, '')) <= 30
      AND length(COALESCE(rg_orgao_emissor, '')) <= 40
      AND length(COALESCE(estado_civil, '')) <= 40
      AND length(COALESCE(regime_casamento, '')) <= 80
      AND length(COALESCE(profissao, '')) <= 80
      AND length(COALESCE(nacionalidade, '')) <= 40
      AND length(COALESCE(endereco_logradouro, '')) <= 160
      AND length(COALESCE(endereco_numero, '')) <= 20
      AND length(COALESCE(endereco_complemento, '')) <= 80
      AND length(COALESCE(endereco_bairro, '')) <= 80
      AND length(COALESCE(endereco_cidade, '')) <= 80
      AND length(COALESCE(conjuge_nome, '')) <= 160
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Registro mãe: os campos novos sobem para `clientes` -----------------------
-- Mesma lista de 20261010120300, com os campos do contrato no fim. A função é
-- a fonte única do gatilho de registro, do backfill e do registro filho.
CREATE OR REPLACE FUNCTION public._cliente_campos()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT ARRAY[
    'nome', 'email', 'cpf',
    'renda_informada', 'renda_estimada', 'tipo_renda', 'faixa_mcmv',
    'usa_fgts', 'tem_fgts', 'fgts_valor', 'entrada_disponivel', 'decisor',
    'zona', 'bairro', 'dorms_desejados', 'precisa_vaga', 'prioridades',
    'objecoes', 'resumo_qualificacao', 'projeto_nome', 'construtora',
    'consentimento_lgpd',
    -- Venda por contrato (20261101120000)
    'rg', 'rg_orgao_emissor', 'data_nascimento', 'estado_civil',
    'regime_casamento', 'profissao', 'nacionalidade',
    'endereco_logradouro', 'endereco_numero', 'endereco_complemento',
    'endereco_bairro', 'endereco_cidade', 'endereco_uf', 'endereco_cep',
    'conjuge_nome', 'conjuge_cpf'
  ]::text[];
$$;

-- 3) Gravação dos dados lidos do contrato ---------------------------------------
-- Só os campos da lista; chave desconhecida é ERRO (não some em silêncio).
-- Chave presente com valor vazio limpa o campo opcional; nome e telefone (NOT
-- NULL) nunca são apagados. Sem acesso ao lead (RLS) = "não encontrado".
CREATE OR REPLACE FUNCTION public.aplicar_dados_contrato_lead(
  _lead_id uuid,
  _dados jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _permitidos constant text[] := ARRAY[
    'nome', 'telefone', 'email', 'cpf', 'renda_estimada',
    'rg', 'rg_orgao_emissor', 'data_nascimento', 'estado_civil',
    'regime_casamento', 'profissao', 'nacionalidade',
    'endereco_logradouro', 'endereco_numero', 'endereco_complemento',
    'endereco_bairro', 'endereco_cidade', 'endereco_uf', 'endereco_cep',
    'conjuge_nome', 'conjuge_cpf'
  ];
  _desconhecida text;
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;
  IF _dados IS NULL OR jsonb_typeof(_dados) <> 'object' THEN
    RAISE EXCEPTION 'dados inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT k INTO _desconhecida
    FROM jsonb_object_keys(_dados) AS k
   WHERE k <> ALL (_permitidos)
   LIMIT 1;
  IF _desconhecida IS NOT NULL THEN
    RAISE EXCEPTION 'campo não permitido: %', _desconhecida USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_dados)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'campos', 0);
  END IF;

  UPDATE public.leads AS l SET
    nome = CASE WHEN _dados ? 'nome'
      THEN COALESCE(NULLIF(btrim(_dados ->> 'nome'), ''), l.nome) ELSE l.nome END,
    telefone = CASE WHEN _dados ? 'telefone'
      THEN COALESCE(NULLIF(btrim(_dados ->> 'telefone'), ''), l.telefone) ELSE l.telefone END,
    email = CASE WHEN _dados ? 'email'
      THEN NULLIF(lower(btrim(_dados ->> 'email')), '') ELSE l.email END,
    cpf = CASE WHEN _dados ? 'cpf'
      THEN NULLIF(btrim(_dados ->> 'cpf'), '') ELSE l.cpf END,
    renda_estimada = CASE WHEN _dados ? 'renda_estimada'
      THEN NULLIF(_dados ->> 'renda_estimada', '')::numeric ELSE l.renda_estimada END,
    rg = CASE WHEN _dados ? 'rg'
      THEN NULLIF(btrim(_dados ->> 'rg'), '') ELSE l.rg END,
    rg_orgao_emissor = CASE WHEN _dados ? 'rg_orgao_emissor'
      THEN NULLIF(btrim(_dados ->> 'rg_orgao_emissor'), '') ELSE l.rg_orgao_emissor END,
    data_nascimento = CASE WHEN _dados ? 'data_nascimento'
      THEN NULLIF(_dados ->> 'data_nascimento', '')::date ELSE l.data_nascimento END,
    estado_civil = CASE WHEN _dados ? 'estado_civil'
      THEN NULLIF(btrim(_dados ->> 'estado_civil'), '') ELSE l.estado_civil END,
    regime_casamento = CASE WHEN _dados ? 'regime_casamento'
      THEN NULLIF(btrim(_dados ->> 'regime_casamento'), '') ELSE l.regime_casamento END,
    profissao = CASE WHEN _dados ? 'profissao'
      THEN NULLIF(btrim(_dados ->> 'profissao'), '') ELSE l.profissao END,
    nacionalidade = CASE WHEN _dados ? 'nacionalidade'
      THEN NULLIF(btrim(_dados ->> 'nacionalidade'), '') ELSE l.nacionalidade END,
    endereco_logradouro = CASE WHEN _dados ? 'endereco_logradouro'
      THEN NULLIF(btrim(_dados ->> 'endereco_logradouro'), '') ELSE l.endereco_logradouro END,
    endereco_numero = CASE WHEN _dados ? 'endereco_numero'
      THEN NULLIF(btrim(_dados ->> 'endereco_numero'), '') ELSE l.endereco_numero END,
    endereco_complemento = CASE WHEN _dados ? 'endereco_complemento'
      THEN NULLIF(btrim(_dados ->> 'endereco_complemento'), '') ELSE l.endereco_complemento END,
    endereco_bairro = CASE WHEN _dados ? 'endereco_bairro'
      THEN NULLIF(btrim(_dados ->> 'endereco_bairro'), '') ELSE l.endereco_bairro END,
    endereco_cidade = CASE WHEN _dados ? 'endereco_cidade'
      THEN NULLIF(btrim(_dados ->> 'endereco_cidade'), '') ELSE l.endereco_cidade END,
    endereco_uf = CASE WHEN _dados ? 'endereco_uf'
      THEN NULLIF(upper(btrim(_dados ->> 'endereco_uf')), '') ELSE l.endereco_uf END,
    endereco_cep = CASE WHEN _dados ? 'endereco_cep'
      THEN NULLIF(regexp_replace(_dados ->> 'endereco_cep', '\D', '', 'g'), '') ELSE l.endereco_cep END,
    conjuge_nome = CASE WHEN _dados ? 'conjuge_nome'
      THEN NULLIF(btrim(_dados ->> 'conjuge_nome'), '') ELSE l.conjuge_nome END,
    conjuge_cpf = CASE WHEN _dados ? 'conjuge_cpf'
      THEN NULLIF(regexp_replace(_dados ->> 'conjuge_cpf', '\D', '', 'g'), '') ELSE l.conjuge_cpf END
  WHERE l.id = _lead_id
    AND l.deleted_at IS NULL;

  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN
    RAISE EXCEPTION 'cliente não encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'campos', (SELECT count(*) FROM jsonb_object_keys(_dados))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_dados_contrato_lead(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_dados_contrato_lead(uuid, jsonb) TO authenticated, service_role;

-- 4) IA: leitura do contrato sob a governança do SamiQ --------------------------
-- Versão NOVA derivada da ativa; só ACRESCENTA a ação. Kill switch: reativar a
-- versão anterior (a tela cai no prompt legado do código).
DO $$
DECLARE
  _ativa public.samiq_prompt_versions%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.samiq_prompt_versions WHERE version = 'samiq-2026-11-contrato') THEN
    RETURN;
  END IF;
  SELECT * INTO _ativa
  FROM public.samiq_prompt_versions
  WHERE active = true
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND OR _ativa.action_prompts ? 'ler_contrato_venda' THEN
    RETURN;
  END IF;

  UPDATE public.samiq_prompt_versions SET active = false WHERE active = true;

  INSERT INTO public.samiq_prompt_versions (
    version, model_id, system_prompt, action_prompts, max_output_tokens,
    pricing_version, input_cost_micros_per_million, output_cost_micros_per_million,
    tools_enabled, propostas_enabled, active
  )
  VALUES (
    'samiq-2026-11-contrato',
    _ativa.model_id,
    _ativa.system_prompt,
    _ativa.action_prompts || jsonb_build_object(
      'ler_contrato_venda', $action$Você recebe trechos de um CONTRATO DE COMPRA E VENDA de imóvel na planta (promessa de venda e compra de construtora/incorporadora: quadro-resumo, resumo da venda, ficha cadastral, página de assinatura). O texto vem separado por "=== Página N ===". Extraia os dados do COMPRADOR e da VENDA e responda APENAS com JSON válido (sem markdown, sem cercas de código), no formato exato:
{"comprador":{"nome":string|null,"cpf":string|null,"rg":string|null,"rg_orgao_emissor":string|null,"data_nascimento":"AAAA-MM-DD"|null,"estado_civil":string|null,"regime_casamento":string|null,"profissao":string|null,"nacionalidade":string|null,"email":string|null,"telefone":string|null,"renda_familiar":number|null,"endereco":{"logradouro":string|null,"numero":string|null,"complemento":string|null,"bairro":string|null,"cidade":string|null,"uf":string|null,"cep":string|null}},"segundo_comprador":{"nome":string|null,"cpf":string|null}|null,"venda":{"construtora":string|null,"empreendimento":string|null,"unidade":string|null,"valor_venda":number|null,"data_assinatura":"AAAA-MM-DD"|null},"confianca":number 0-1,"observacoes":string|null}
Regras:
- COMPRADOR é o PROMISSÁRIO COMPRADOR / "COMPRADOR(ES)" — nunca a VENDEDORA, a incorporadora, a imobiliária, o corretor, o gerente ou testemunhas. Se houver dois compradores, o primeiro vai em "comprador" e o segundo (cônjuge ou co-comprador) em "segundo_comprador"; sem segundo comprador, use null.
- CPF e CEP só com os dígitos. Telefone com DDD, só dígitos (prefira o celular). E-mail em minúsculas. UF com 2 letras. Datas sempre AAAA-MM-DD.
- Campos preenchidos com "XXXXXXXX", "-", "não informado" ou em branco valem null.
- "construtora" é a MARCA comercial do grupo (ex.: "Plano&Plano", "Vibra Residencial", "MRV", "Cury", "Tenda"), não a razão social da SPE vendedora ("... EMPREENDIMENTOS IMOBILIÁRIOS SPE LTDA"). Use pistas como o campo "Construtora:", o site no rodapé (planoeplano.com.br → Plano&Plano) ou o nome do grupo. Se só houver a razão social da SPE, devolva-a.
- "empreendimento" é o nome comercial do condomínio/residencial (ex.: "Vibra Sabará", "Condomínio Jardim das Origens - Parque Aruá"), sem endereço.
- "unidade" junta número e torre/bloco como aparecem (ex.: "1008 - Torre A", "B0101").
- "valor_venda" é o PREÇO TOTAL da unidade (preço/valor negociado/valor total do contrato), em reais, número puro (ex.: 351100). Nunca use o valor do sinal, de uma parcela ou só do financiamento.
- "data_assinatura" é a data do contrato/da venda (ex.: "Data da Venda", "São Paulo, 30 de outubro de 2026"), não datas de vencimento de parcelas nem de entrega da obra.
- "renda_familiar" só se o contrato declarar a renda (ex.: "RENDA FAMILIAR DECLARADA", "Valor bruto percebido"); some formal e informal só se ambas aparecerem explicitamente para o mesmo comprador.
- Use null para o que o texto não mostra — nunca invente, nunca complete com dados de exemplo.
- Em "observacoes", até 2 frases curtas sobre o que ficou ambíguo (ex.: "dois CPFs diferentes para o comprador"). Não repita dados pessoais nas observações.$action$
    ),
    _ativa.max_output_tokens,
    _ativa.pricing_version, _ativa.input_cost_micros_per_million, _ativa.output_cost_micros_per_million,
    _ativa.tools_enabled, _ativa.propostas_enabled, true
  );
END $$;

NOTIFY pgrst, 'reload schema';
