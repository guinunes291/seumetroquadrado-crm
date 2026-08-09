-- Mês das MVs de métricas no fuso da operação (auditoria 2026-08-09).
--
-- ANTES: todos os buckets mensais do schema metrics eram cortados com
-- date_trunc('month', <timestamptz>) no fuso do banco (UTC). Um lead criado
-- (ou uma visita/perda/interação ocorrida) entre 21h e 24h de Brasília no
-- último dia do mês caía no MÊS SEGUINTE — divergindo dos dashboards, que
-- cortam em America/Sao_Paulo (dashboard_atividade_periodo,
-- dashboard_serie_diaria, leads_filtered_v3).
--
-- DEPOIS: bucket mensal = mês-calendário de America/Sao_Paulo em todas as
-- MVs (funil_coorte_mensal, tempo_etapa_mensal, performance_corretor_mensal,
-- motivos_perda_mensal) e na view realizado_mensal. As janelas móveis (12/24
-- meses) passam a usar a mesma fronteira, calculada como instante (coluna
-- crua comparada a constante — preserva uso de índice).
--
-- vendas.data_assinatura é DATE (data civil, sem fuso) — permanece como está.
-- Nenhuma coluna muda de nome/tipo; apenas o valor do bucket `mes` muda para
-- linhas na borda 21h–24h BRT de virada de mês (~3h/mês de dados).
-- Definições copiadas das versões VIVAS: funil_coorte/tempo_etapa/motivos_perda
-- de 20260727111000; performance_corretor_mensal e realizado_mensal de
-- 20260731123000 (régua canônica de datas preservada).

-- ---------------------------------------------------------------------------
-- metrics.funil_coorte_mensal — conversão por coorte de criação (mês BRT)
-- ---------------------------------------------------------------------------
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
      CASE WHEN b.ordem BETWEEN 1 AND 7 THEN b.ordem ELSE 0 END
    ) AS estagio,
    t.tem_transicao
  FROM metrics.leads_base b
  LEFT JOIN LATERAL (
    SELECT
      max(public.funil_ordem(tr.para_status))
        FILTER (WHERE public.funil_ordem(tr.para_status) BETWEEN 1 AND 7) AS max_ordem_trans,
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
  count(*)::int                                            AS leads,
  count(*) FILTER (WHERE estagio >= 3)::int                AS atingiu_atendimento,
  count(*) FILTER (WHERE estagio >= 4)::int                AS atingiu_agendado,
  count(*) FILTER (WHERE estagio >= 5)::int                AS atingiu_visita,
  count(*) FILTER (WHERE estagio >= 6)::int                AS atingiu_analise,
  count(*) FILTER (WHERE estagio >= 7)::int                AS vendas,
  count(*) FILTER (WHERE status = 'perdido')::int          AS perdidos,
  round(100.0 * count(*) FILTER (WHERE tem_transicao) / count(*), 1) AS cobertura_transicoes_pct
FROM base
GROUP BY mes_coorte, corretor_id, origem;

COMMENT ON MATERIALIZED VIEW metrics.funil_coorte_mensal IS
  'COORTE: de cada N leads CRIADOS no mês X (mês-calendário de America/Sao_Paulo; por corretor × origem), quantos atingiram cada etapa até hoje. Estágio = max(funil_ordem) das transições, com o status atual como piso. cobertura_transicoes_pct marca coortes sem histórico (import legado): abaixo do limiar de gestao_config a UI diz "sem dado suficiente". Leitura correta para conversão; para carga use snapshot_funil.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_funil_coorte_chave
  ON metrics.funil_coorte_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_funil_coorte_mes
  ON metrics.funil_coorte_mensal (mes_coorte);

-- ---------------------------------------------------------------------------
-- metrics.tempo_etapa_mensal — tempo de permanência por etapa (mês BRT)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.tempo_etapa_mensal;
CREATE MATERIALIZED VIEW metrics.tempo_etapa_mensal AS
WITH trans AS (
  SELECT
    t.lead_id,
    t.corretor_id,
    t.para_status,
    t.created_at AS entrou_em,
    LEAD(t.created_at) OVER (PARTITION BY t.lead_id ORDER BY t.created_at, t.id) AS saiu_em
  FROM public.lead_status_transitions t
  JOIN public.leads l
    ON l.id = t.lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
  WHERE t.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                         - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
)
SELECT
  date_trunc('month', entrou_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
  corretor_id,
  para_status::text                    AS etapa,
  public.funil_ordem(para_status)      AS ordem,
  (date_trunc('month', entrou_em AT TIME ZONE 'America/Sao_Paulo')::date::text || ':' || COALESCE(corretor_id::text, '-') || ':' || para_status::text) AS chave,
  round(avg(EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0)::numeric, 1)  AS horas_media,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0))::numeric, 1) AS horas_p50,
  count(*)::int                        AS n
FROM trans
WHERE saiu_em IS NOT NULL
  AND public.funil_ordem(para_status) BETWEEN 1 AND 7
GROUP BY 1, 2, 3, 4;

COMMENT ON MATERIALIZED VIEW metrics.tempo_etapa_mensal IS
  'Horas de permanência em cada etapa (média e p50) por mês de ENTRADA na etapa (mês-calendário de America/Sao_Paulo) × corretor, medidas entre transições consecutivas de lead_status_transitions (janela 12 meses; leads na lixeira excluídos). Etapas sem saída registrada ainda não contam.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tempo_etapa_chave
  ON metrics.tempo_etapa_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_tempo_etapa_mes
  ON metrics.tempo_etapa_mensal (mes);

-- ---------------------------------------------------------------------------
-- metrics.realizado_mensal (view) — visitas/leads no mês BRT
-- (vendas ficam em data_assinatura, que é DATE civil — sem conversão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.realizado_mensal AS
WITH vendas_m AS (
  SELECT date_trunc('month', v.data_assinatura)::date AS mes,
         v.corretor_id,
         count(*)::int          AS vendas,
         COALESCE(sum(v.valor_venda), 0) AS vgv
  FROM public.vendas v
  WHERE v.status_venda = 'aprovada'
    AND v.distrato = false
    AND v.data_assinatura IS NOT NULL
  GROUP BY 1, 2
),
visitas_m AS (
  SELECT date_trunc('month', a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         a.corretor_id,
         count(*)::int AS visitas_realizadas
  FROM public.agendamentos a
  WHERE a.status = 'realizado'
    AND a.tipo = 'visita'
    AND a.deleted_at IS NULL
  GROUP BY 1, 2
),
leads_m AS (
  SELECT date_trunc('month', b.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         b.corretor_id,
         count(*)::int AS leads_novos,
         count(*) FILTER (WHERE b.ordem >= 3)::int AS leads_atendidos
  FROM metrics.leads_base b
  WHERE b.corretor_id IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  COALESCE(v.mes, vi.mes, le.mes)                    AS mes,
  COALESCE(v.corretor_id, vi.corretor_id, le.corretor_id) AS corretor_id,
  COALESCE(v.vendas, 0)                              AS vendas,
  COALESCE(v.vgv, 0)                                 AS vgv,
  COALESCE(vi.visitas_realizadas, 0)                 AS visitas_realizadas,
  COALESCE(le.leads_novos, 0)                        AS leads_novos,
  COALESCE(le.leads_atendidos, 0)                    AS leads_atendidos
FROM vendas_m v
FULL OUTER JOIN visitas_m vi ON vi.mes = v.mes AND vi.corretor_id IS NOT DISTINCT FROM v.corretor_id
FULL OUTER JOIN leads_m  le ON le.mes = COALESCE(v.mes, vi.mes)
                           AND le.corretor_id IS NOT DISTINCT FROM COALESCE(v.corretor_id, vi.corretor_id);

COMMENT ON VIEW metrics.realizado_mensal IS
  'Fluxo realizado por mês × corretor (mês-calendário de America/Sao_Paulo): vendas e VGV pelo MÊS DA ASSINATURA (aprovada, sem distrato; venda sem data_assinatura fica de fora), visitas realizadas (agendamento tipo visita com status realizado, mês de data_inicio) e leads atendidos (funil_ordem>=3, inclui perdido). Base do pacing (gestao_pacing).';

-- ---------------------------------------------------------------------------
-- metrics.performance_corretor_mensal — (mês BRT; régua de 20260731123000
-- preservada: interação no dia do REGISTRO, visita só status realizado,
-- venda pelo mês da assinatura)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.performance_corretor_mensal;
CREATE MATERIALIZED VIEW metrics.performance_corretor_mensal AS
WITH leads_rec AS (
  SELECT date_trunc('month', COALESCE(b.data_distribuicao, b.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         b.corretor_id,
         count(*)::int AS leads_recebidos
  FROM metrics.leads_base b
  WHERE b.corretor_id IS NOT NULL
    AND COALESCE(b.data_distribuicao, b.created_at) >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
inter AS (
  -- Data do REGISTRO da interação (não a data informada pelo corretor).
  SELECT date_trunc('month', i.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         i.autor_id AS corretor_id,
         count(*)::int AS interacoes,
         count(*) FILTER (WHERE i.tipo NOT IN ('nota', 'mudanca_status'))::int AS contatos
  FROM public.interacoes i
  WHERE i.deleted_at IS NULL
    AND i.autor_id IS NOT NULL
    AND i.created_at >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
agend AS (
  SELECT date_trunc('month', a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         a.corretor_id,
         count(*)::int AS agendamentos_criados
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.auto_gerado = false
    AND a.created_at >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
visitas_r AS (
  -- Visita realizada é só 'realizado'. No-show é métrica de qualidade da
  -- agenda e nunca deve entrar na contagem de visitas.
  SELECT date_trunc('month', a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         a.corretor_id,
         count(*) FILTER (WHERE a.status = 'realizado')::int      AS visitas_realizadas,
         count(*) FILTER (WHERE a.status = 'nao_compareceu')::int AS no_shows
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.tipo = 'visita'
    AND a.status IN ('realizado', 'nao_compareceu')
    AND a.data_inicio >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
analises AS (
  SELECT date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         t.corretor_id,
         count(DISTINCT t.lead_id)::int AS analises
  FROM public.lead_status_transitions t
  WHERE t.para_status = 'analise_credito'
    AND t.corretor_id IS NOT NULL
    AND t.created_at >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
tarefas_c AS (
  SELECT date_trunc('month', COALESCE(tf.data_conclusao, tf.updated_at) AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         tf.corretor_id,
         count(*)::int AS tarefas_concluidas
  FROM public.tarefas tf
  WHERE tf.deleted_at IS NULL
    AND tf.status = 'concluida'
    AND COALESCE(tf.data_conclusao, tf.updated_at) >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
resposta AS (
  SELECT date_trunc('month', COALESCE(b.data_distribuicao, b.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         b.corretor_id,
         count(fr.min_resposta)::int AS leads_respondidos,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY fr.min_resposta))::numeric, 0) AS primeira_resposta_p50_min
  FROM metrics.leads_base b
  LEFT JOIN LATERAL (
    SELECT min(EXTRACT(EPOCH FROM (i.created_at - COALESCE(b.data_distribuicao, b.created_at))) / 60.0) AS min_resposta
    FROM public.interacoes i
    WHERE i.lead_id = b.id
      AND i.autor_id = b.corretor_id
      AND i.deleted_at IS NULL
      AND i.tipo NOT IN ('nota', 'mudanca_status')
      AND i.created_at >= COALESCE(b.data_distribuicao, b.created_at)
  ) fr ON true
  WHERE b.corretor_id IS NOT NULL
    AND COALESCE(b.data_distribuicao, b.created_at) >=
        (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2
),
carga AS (
  SELECT b.corretor_id, count(*)::int AS carga_ativa
  FROM metrics.leads_base b
  WHERE b.corretor_id IS NOT NULL AND b.ativo
  GROUP BY 1
),
spine AS (
  SELECT mes, corretor_id FROM leads_rec
  UNION SELECT mes, corretor_id FROM inter
  UNION SELECT mes, corretor_id FROM agend
  UNION SELECT mes, corretor_id FROM visitas_r
  UNION SELECT mes, corretor_id FROM analises
  UNION SELECT mes, corretor_id FROM tarefas_c
  UNION SELECT mes, corretor_id FROM (
    SELECT rm0.mes, rm0.corretor_id
    FROM metrics.realizado_mensal rm0
    WHERE rm0.corretor_id IS NOT NULL
      AND rm0.mes >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months')::date
  ) rm
)
SELECT
  s.mes,
  s.corretor_id,
  (s.mes::text || ':' || s.corretor_id::text)     AS chave,
  COALESCE(lr.leads_recebidos, 0)                 AS leads_recebidos,
  COALESCE(i.interacoes, 0)                       AS interacoes,
  COALESCE(i.contatos, 0)                         AS contatos,
  COALESCE(ag.agendamentos_criados, 0)            AS agendamentos_criados,
  COALESCE(vr.visitas_realizadas, 0)              AS visitas_realizadas,
  COALESCE(vr.no_shows, 0)                        AS no_shows,
  COALESCE(an.analises, 0)                        AS analises,
  COALESCE(tc.tarefas_concluidas, 0)              AS tarefas_concluidas,
  COALESCE(rm.vendas, 0)                          AS vendas,
  COALESCE(rm.vgv, 0)                             AS vgv,
  r.primeira_resposta_p50_min,
  COALESCE(r.leads_respondidos, 0)                AS leads_respondidos,
  COALESCE(cg.carga_ativa, 0)                     AS carga_ativa
FROM spine s
LEFT JOIN leads_rec lr ON lr.mes = s.mes AND lr.corretor_id = s.corretor_id
LEFT JOIN inter i      ON i.mes = s.mes AND i.corretor_id = s.corretor_id
LEFT JOIN agend ag     ON ag.mes = s.mes AND ag.corretor_id = s.corretor_id
LEFT JOIN visitas_r vr ON vr.mes = s.mes AND vr.corretor_id = s.corretor_id
LEFT JOIN analises an  ON an.mes = s.mes AND an.corretor_id = s.corretor_id
LEFT JOIN tarefas_c tc ON tc.mes = s.mes AND tc.corretor_id = s.corretor_id
LEFT JOIN resposta r   ON r.mes = s.mes AND r.corretor_id = s.corretor_id
LEFT JOIN metrics.realizado_mensal rm ON rm.mes = s.mes AND rm.corretor_id = s.corretor_id
LEFT JOIN carga cg     ON cg.corretor_id = s.corretor_id;

COMMENT ON MATERIALIZED VIEW metrics.performance_corretor_mensal IS
  'Performance por corretor × mês (mês-calendário de America/Sao_Paulo; janela 12 meses) na régua canônica de datas: esforço (leads recebidos, interações pela data do registro, agendamentos criados, tarefas), conversão (visitas realizadas — só status realizado, no dia da visita — no-show em coluna própria, análises por mudança de status, 1ª resposta p50 em minutos), resultado (vendas e VGV pelo mês da assinatura) e carga ativa ATUAL.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_perf_corretor_chave
  ON metrics.performance_corretor_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_perf_corretor_mes
  ON metrics.performance_corretor_mensal (mes);

-- ---------------------------------------------------------------------------
-- metrics.motivos_perda_mensal — perdas com R$ estimado (mês BRT)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.motivos_perda_mensal;
CREATE MATERIALIZED VIEW metrics.motivos_perda_mensal AS
SELECT
  date_trunc('month', COALESCE(b.data_perda, b.ultima_atividade) AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
  b.corretor_id,
  COALESCE(b.motivo_perda_categoria, 'outro') AS categoria,
  (date_trunc('month', COALESCE(b.data_perda, b.ultima_atividade) AT TIME ZONE 'America/Sao_Paulo')::date::text
    || ':' || COALESCE(b.corretor_id::text, '-')
    || ':' || COALESCE(b.motivo_perda_categoria, 'outro'))          AS chave,
  count(*)::int                               AS quantidade,
  COALESCE(sum(b.valor_potencial), 0)         AS vgv_estimado
FROM metrics.leads_base b
WHERE b.status = 'perdido'
  AND COALESCE(b.data_perda, b.ultima_atividade) >=
      (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 months') AT TIME ZONE 'America/Sao_Paulo'
GROUP BY 1, 2, 3;

COMMENT ON MATERIALIZED VIEW metrics.motivos_perda_mensal IS
  'Perdas por mês (data_perda; fallback última atividade; mês-calendário de America/Sao_Paulo) × corretor × categoria estruturada (motivo_perda_categoria; NULL vira "outro"). vgv_estimado usa valor_potencial (preco_a_partir do projeto) — é ESTIMATIVA de VGV perdido, sempre rotulada como tal na UI.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_motivos_perda_chave
  ON metrics.motivos_perda_mensal (chave);

-- Recarrega todas as MVs para a régua nova valer já no primeiro acesso.
SELECT metrics.refresh_all();
