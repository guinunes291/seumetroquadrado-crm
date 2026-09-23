-- Funil de coorte da gestão: limiares por ETAPA NOMEADA, não por número fixo.
--
-- O BUG: metrics.funil_coorte_mensal (20260809191000) compara o ordinal de
-- public.funil_ordem com limiares fixos (>= 4 agendado, >= 7 venda), escritos
-- quando o funil tinha 7 posições. Em 20260811151000 a etapa
-- 'qualificacao_corretor' entrou na posição 3 e empurrou todas as seguintes uma
-- posição (em_atendimento 3→4, agendado 4→5, visita 5→6, análise 6→7,
-- venda 7→8). Os limiares não acompanharam, e o funil de coorte da gestão
-- (Inteligência > Funil, Relatórios por origem, Gargalos) passou a contar cada
-- coluna com UMA ETAPA DE ATRASO:
--   "Agendaram"   contava quem chegou a em_atendimento;
--   "Visitaram"   contava quem chegou a agendado;
--   "Análise"     contava quem chegou a visita_realizada;
--   "Vendas"      contava quem chegou a analise_credito;
-- e a venda de verdade (8) ficava FORA do corte BETWEEN 1 AND 7 — um lead
-- fechado só contava como venda se tivesse passado por análise no histórico.
--
-- A CORREÇÃO: cada limiar passa a ser funil_ordem('<etapa>') e o teto do
-- funil passa a ser funil_ordem('contrato_fechado'). funil_ordem é IMMUTABLE,
-- então isso é avaliado uma vez; e se a numeração mudar de novo, a MV
-- acompanha sozinha. Definição, colunas, chave e índices são os mesmos —
-- as RPCs gestao_* que leem a MV não mudam.
--
-- Depois do REFRESH, as taxas do funil do gestor CAEM em relação ao que era
-- exibido: os números antigos estavam inflados, não os novos errados.

DROP MATERIALIZED VIEW IF EXISTS metrics.funil_coorte_mensal;
CREATE MATERIALIZED VIEW metrics.funil_coorte_mensal AS
WITH base AS (
  SELECT
    b.id,
    date_trunc('month', b.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes_coorte,
    b.corretor_id,
    b.origem,
    b.status,
    GREATEST(
      COALESCE(t.max_ordem_trans, 0),
      CASE
        WHEN b.ordem BETWEEN 1 AND public.funil_ordem('contrato_fechado') THEN b.ordem
        ELSE 0
      END
    ) AS estagio,
    t.tem_transicao
  FROM metrics.leads_base b
  LEFT JOIN LATERAL (
    SELECT
      max(public.funil_ordem(tr.para_status))
        FILTER (WHERE public.funil_ordem(tr.para_status)
                      BETWEEN 1 AND public.funil_ordem('contrato_fechado')) AS max_ordem_trans,
      count(*) > 0 AS tem_transicao
    FROM public.lead_status_transitions tr
    WHERE tr.lead_id = b.id
  ) t ON true
  WHERE b.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                         - interval '24 months') AT TIME ZONE 'America/Sao_Paulo'
)
SELECT
  mes_coorte,
  corretor_id,
  origem,
  (mes_coorte::text || ':' || COALESCE(corretor_id::text, '-') || ':' || COALESCE(origem, '-')) AS chave,
  count(*)::int AS leads,
  -- Atendido = entrou no miolo do atendimento (qualificação ou em atendimento).
  count(*) FILTER (WHERE estagio >= public.funil_ordem('qualificacao_corretor'))::int AS atingiu_atendimento,
  count(*) FILTER (WHERE estagio >= public.funil_ordem('agendado'))::int              AS atingiu_agendado,
  count(*) FILTER (WHERE estagio >= public.funil_ordem('visita_realizada'))::int      AS atingiu_visita,
  count(*) FILTER (WHERE estagio >= public.funil_ordem('analise_credito'))::int       AS atingiu_analise,
  count(*) FILTER (WHERE estagio >= public.funil_ordem('contrato_fechado'))::int      AS vendas,
  count(*) FILTER (WHERE status = 'perdido')::int                                      AS perdidos,
  round(100.0 * count(*) FILTER (WHERE tem_transicao) / count(*), 1) AS cobertura_transicoes_pct
FROM base
GROUP BY mes_coorte, corretor_id, origem;

COMMENT ON MATERIALIZED VIEW metrics.funil_coorte_mensal IS
  'COORTE: de cada N leads CRIADOS no mês X (mês-calendário de America/Sao_Paulo; por corretor × origem), quantos atingiram cada etapa até hoje. Estágio = max(funil_ordem) das transições, com o status atual como piso. Limiares por etapa NOMEADA (funil_ordem(''agendado'') etc.) — acompanham qualquer renumeração do funil (20260928120000). cobertura_transicoes_pct marca coortes sem histórico (import legado): abaixo do limiar de gestao_config a UI diz "sem dado suficiente". Leitura correta para conversão; para carga use snapshot_funil.';

-- REFRESH CONCURRENTLY (metrics.refresh_all) exige o índice único.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_funil_coorte_chave
  ON metrics.funil_coorte_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_funil_coorte_mes
  ON metrics.funil_coorte_mensal (mes_coorte);
