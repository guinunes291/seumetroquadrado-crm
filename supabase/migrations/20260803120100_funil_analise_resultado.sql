-- Resultado da análise de crédito (parte 2/3): máquina de transições e ordem
-- do funil. Transação separada da parte 1 — os valores do enum já commitados.

-- ---------------------------------------------------------------------------
-- 1. Transições permitidas (a AUTORIDADE — transicionar_lead rejeita o resto)
-- ---------------------------------------------------------------------------
-- Regra de produto (decisão do dono): o CORRETOR marca aprovada e reprovada,
-- como em qualquer outra etapa — é ele quem recebe o retorno da Caixa. Nenhuma
-- das duas exige p_gestao.
--
-- Reprovada NÃO é terminal: fica no funil, em coluna própria, e volta para
-- atendimento/retorno/visita para tentar outra composição de renda, outro
-- projeto ou nova entrada. Só sai por 'perdido' quando o corretor desistir.
CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(
  p_de public.lead_status,
  p_para public.lead_status,
  p_gestao boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','visita_realizada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','agendado','proposta_enviada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','analise_credito','contrato_fechado','perdido'])
    -- Em análise: agora resolve para aprovada/reprovada. O caminho direto para
    -- contrato_fechado CONTINUA — quem registra a venda sem passar pelo
    -- resultado (fluxo de hoje) não é bloqueado.
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','visita_realizada','proposta_enviada','analise_aprovada','analise_reprovada','contrato_fechado','perdido'])
    -- Aprovada: o destino natural é a venda. Volta para 'analise_credito' se a
    -- Caixa reabrir a análise (pendência documental depois do aprovado).
    WHEN p_de::text = 'analise_aprovada'
      THEN p_para::text = ANY (ARRAY['contrato_fechado','analise_credito','analise_reprovada','em_atendimento','aguardando_retorno','perdido'])
    -- Reprovada: continua viva. Nova tentativa reabre a análise; mudar de
    -- projeto ou de composição volta para atendimento/visita.
    WHEN p_de::text = 'analise_reprovada'
      THEN p_para::text = ANY (ARRAY['analise_credito','em_atendimento','aguardando_retorno','agendado','visita_realizada','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = ANY (ARRAY['pos_venda','analise_credito'])
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno'])
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.transicao_lead_permitida(public.lead_status, public.lead_status, boolean) IS
  'Máquina de estados do funil (espelhada em TRANSICOES, src/lib/leads.ts). Autoridade única: transicionar_lead rejeita qualquer transição fora daqui. analise_aprovada/analise_reprovada são marcadas pelo corretor; reprovada não é terminal.';

-- ---------------------------------------------------------------------------
-- 2. Ordem comercial do funil
-- ---------------------------------------------------------------------------
-- Os dois resultados entram na MESMA profundidade de 'analise_credito' (6), de
-- propósito:
--   a) funil_ordem mede PROFUNDIDADE no funil, não sucesso. Crédito aprovado
--      ainda é etapa de análise até virar contrato; um reprovado ATINGIU a
--      análise e deve continuar contando nas coortes de conversão.
--   b) metrics_mvs filtra `funil_ordem(...) BETWEEN 1 AND 7` em dois pontos
--      (linhas 35 e 94). Renumerar contrato_fechado para abrir espaço entre 6
--      e 7 tiraria as vendas da coorte silenciosamente.
-- A distinção aprovada/reprovada é ESTADO dentro da etapa — quem carrega isso
-- é o status, não a ordem.
CREATE OR REPLACE FUNCTION public.funil_ordem(_s public.lead_status)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE _s
    -- Pré-funil (caixa de entrada, ainda não distribuído/aceito).
    WHEN 'novo'                   THEN 0
    WHEN 'aguardando_corretor'    THEN 0
    -- Funil comercial (mesma ordem de LEAD_STATUS_ORDER).
    WHEN 'aguardando_atendimento' THEN 1
    WHEN 'aguardando_retorno'     THEN 2
    WHEN 'em_atendimento'         THEN 3
    WHEN 'qualificado'            THEN 3  -- legado: equivale a em_atendimento
    WHEN 'agendado'               THEN 4
    WHEN 'visita_realizada'       THEN 5
    WHEN 'proposta_enviada'       THEN 5  -- legado: pós-visita, pré-análise
    WHEN 'analise_credito'        THEN 6
    WHEN 'analise_aprovada'       THEN 6  -- resultado da análise, mesma etapa
    WHEN 'analise_reprovada'      THEN 6  -- idem: atingiu a análise
    WHEN 'contrato_fechado'       THEN 7
    WHEN 'pos_venda'              THEN 7  -- terminal de sucesso
    WHEN 'perdido'                THEN 99
  END;
$$;

COMMENT ON FUNCTION public.funil_ordem(public.lead_status) IS
  'Ordem comercial do funil (espelho de LEAD_STATUS_ORDER em src/lib/leads.ts). 0 = pré-funil; 1-7 = etapas; 99 = perdido. Legados: qualificado=3, proposta_enviada=5, pos_venda=7. Resultados da análise (aprovada/reprovada) compartilham a ordem 6 com analise_credito — ordem é profundidade, não desfecho. Nunca ordene etapa por enum_range().';

GRANT EXECUTE ON FUNCTION public.funil_ordem(public.lead_status) TO authenticated, service_role;
