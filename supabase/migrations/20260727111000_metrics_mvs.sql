-- Camada de Gestão (Fase A5): materialized views + refresh (15 min).
--
-- Materializa o que varre lead_status_transitions/leads inteiros (coorte,
-- tempo por etapa, performance, perdas). Grão mensal e janela móvel limitam
-- o custo. Cada MV tem uma coluna `chave` (texto, única) para permitir
-- REFRESH CONCURRENTLY (exige unique index de colunas simples).
--
-- Honestidade estatística: coortes do import legado (pré-jun/2026) não têm
-- transições — cobertura_transicoes_pct expõe isso por coorte e a UI mostra
-- "sem dado suficiente" abaixo do limiar em gestao_config, nunca 0% falso.
-- O status ATUAL do lead entra apenas como piso do estágio máximo (nunca
-- inferimos passagens intermediárias retroativas).

-- ---------------------------------------------------------------------------
-- metrics.funil_coorte_mensal — conversão por coorte de criação
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.funil_coorte_mensal;
CREATE MATERIALIZED VIEW metrics.funil_coorte_mensal AS
WITH base AS (
  SELECT
    b.id,
    date_trunc('month', b.created_at)::date AS mes_coorte,
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
  WHERE b.created_at >= date_trunc('month', now()) - interval '24 months'
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
  'COORTE: de cada N leads CRIADOS no mês X (por corretor × origem), quantos atingiram cada etapa até hoje. Estágio = max(funil_ordem) das transições, com o status atual como piso. cobertura_transicoes_pct marca coortes sem histórico (import legado): abaixo do limiar de gestao_config a UI diz "sem dado suficiente". Leitura correta para conversão; para carga use snapshot_funil.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_funil_coorte_chave
  ON metrics.funil_coorte_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_funil_coorte_mes
  ON metrics.funil_coorte_mensal (mes_coorte);

-- ---------------------------------------------------------------------------
-- metrics.tempo_etapa_mensal — tempo de permanência por etapa
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
  WHERE t.created_at >= date_trunc('month', now()) - interval '12 months'
)
SELECT
  date_trunc('month', entrou_em)::date AS mes,
  corretor_id,
  para_status::text                    AS etapa,
  public.funil_ordem(para_status)      AS ordem,
  (date_trunc('month', entrou_em)::date::text || ':' || COALESCE(corretor_id::text, '-') || ':' || para_status::text) AS chave,
  round(avg(EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0)::numeric, 1)  AS horas_media,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0))::numeric, 1) AS horas_p50,
  count(*)::int                        AS n
FROM trans
WHERE saiu_em IS NOT NULL
  AND public.funil_ordem(para_status) BETWEEN 1 AND 7
GROUP BY 1, 2, 3, 4;

COMMENT ON MATERIALIZED VIEW metrics.tempo_etapa_mensal IS
  'Horas de permanência em cada etapa (média e p50) por mês de ENTRADA na etapa × corretor, medidas entre transições consecutivas de lead_status_transitions (janela 12 meses; leads na lixeira excluídos). Etapas sem saída registrada ainda não contam.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tempo_etapa_chave
  ON metrics.tempo_etapa_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_tempo_etapa_mes
  ON metrics.tempo_etapa_mensal (mes);

-- ---------------------------------------------------------------------------
-- metrics.performance_corretor_mensal — atividade/conversão/resultado
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.performance_corretor_mensal;
CREATE MATERIALIZED VIEW metrics.performance_corretor_mensal AS
WITH leads_rec AS (
  SELECT date_trunc('month', COALESCE(b.data_distribuicao, b.created_at))::date AS mes,
         b.corretor_id,
         count(*)::int AS leads_recebidos
  FROM metrics.leads_base b
  WHERE b.corretor_id IS NOT NULL
    AND COALESCE(b.data_distribuicao, b.created_at) >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
inter AS (
  SELECT date_trunc('month', COALESCE(i.ocorreu_em, i.created_at))::date AS mes,
         i.autor_id AS corretor_id,
         count(*)::int AS interacoes,
         count(*) FILTER (WHERE i.tipo NOT IN ('nota', 'mudanca_status'))::int AS contatos
  FROM public.interacoes i
  WHERE i.deleted_at IS NULL
    AND i.autor_id IS NOT NULL
    AND COALESCE(i.ocorreu_em, i.created_at) >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
agend AS (
  SELECT date_trunc('month', a.created_at)::date AS mes,
         a.corretor_id,
         count(*)::int AS agendamentos_criados
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.created_at >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
visitas_r AS (
  SELECT date_trunc('month', a.data_inicio)::date AS mes,
         a.corretor_id,
         count(*)::int AS visitas_realizadas,
         count(*) FILTER (WHERE a.status = 'nao_compareceu')::int AS no_shows
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.status IN ('realizado', 'nao_compareceu')
    AND a.data_inicio >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
analises AS (
  SELECT date_trunc('month', t.created_at)::date AS mes,
         t.corretor_id,
         count(DISTINCT t.lead_id)::int AS analises
  FROM public.lead_status_transitions t
  WHERE t.para_status = 'analise_credito'
    AND t.corretor_id IS NOT NULL
    AND t.created_at >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
tarefas_c AS (
  SELECT date_trunc('month', COALESCE(tf.data_conclusao, tf.updated_at))::date AS mes,
         tf.corretor_id,
         count(*)::int AS tarefas_concluidas
  FROM public.tarefas tf
  WHERE tf.deleted_at IS NULL
    AND tf.status = 'concluida'
    AND COALESCE(tf.data_conclusao, tf.updated_at) >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
resposta AS (
  SELECT date_trunc('month', COALESCE(b.data_distribuicao, b.created_at))::date AS mes,
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
    AND COALESCE(b.data_distribuicao, b.created_at) >= date_trunc('month', now()) - interval '12 months'
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
  UNION SELECT mes, corretor_id FROM (SELECT mes, corretor_id FROM metrics.realizado_mensal WHERE corretor_id IS NOT NULL AND mes >= date_trunc('month', now()) - interval '12 months') rm
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
  'Performance por corretor × mês (janela 12 meses): esforço (leads recebidos, interações, contatos reais, agendamentos, tarefas), conversão (visitas realizadas/no-show, análises, 1ª resposta p50 em minutos — PROXY pela 1ª interação de contato do corretor no lead, não existe data_primeiro_contato), resultado (vendas aprovadas, VGV) e carga ativa ATUAL (mesma em todos os meses do corretor; capacidade% é calculada na RPC com gestao_config).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_perf_corretor_chave
  ON metrics.performance_corretor_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_perf_corretor_mes
  ON metrics.performance_corretor_mensal (mes);

-- ---------------------------------------------------------------------------
-- metrics.motivos_perda_mensal — perdas com R$ estimado
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS metrics.motivos_perda_mensal;
CREATE MATERIALIZED VIEW metrics.motivos_perda_mensal AS
SELECT
  date_trunc('month', COALESCE(b.data_perda, b.ultima_atividade))::date AS mes,
  b.corretor_id,
  COALESCE(b.motivo_perda_categoria, 'outro') AS categoria,
  (date_trunc('month', COALESCE(b.data_perda, b.ultima_atividade))::date::text
    || ':' || COALESCE(b.corretor_id::text, '-')
    || ':' || COALESCE(b.motivo_perda_categoria, 'outro'))          AS chave,
  count(*)::int                               AS quantidade,
  COALESCE(sum(b.valor_potencial), 0)         AS vgv_estimado
FROM metrics.leads_base b
WHERE b.status = 'perdido'
  AND COALESCE(b.data_perda, b.ultima_atividade) >= date_trunc('month', now()) - interval '12 months'
GROUP BY 1, 2, 3;

COMMENT ON MATERIALIZED VIEW metrics.motivos_perda_mensal IS
  'Perdas por mês (data_perda; fallback última atividade) × corretor × categoria estruturada (motivo_perda_categoria; NULL vira "outro"). vgv_estimado usa valor_potencial (preco_a_partir do projeto) — é ESTIMATIVA de VGV perdido, sempre rotulada como tal na UI.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_motivos_perda_chave
  ON metrics.motivos_perda_mensal (chave);

-- ---------------------------------------------------------------------------
-- Refresh + cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION metrics.refresh_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, metrics, public
AS $$
DECLARE
  _mv text;
BEGIN
  FOREACH _mv IN ARRAY ARRAY[
    'funil_coorte_mensal',
    'tempo_etapa_mensal',
    'performance_corretor_mensal',
    'motivos_perda_mensal'
  ] LOOP
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY metrics.%I', _mv);
    EXCEPTION WHEN OTHERS THEN
      -- 1ª carga (MV nunca populada) não aceita CONCURRENTLY.
      EXECUTE format('REFRESH MATERIALIZED VIEW metrics.%I', _mv);
    END;
    INSERT INTO metrics.atualizacoes (objeto, atualizado_em)
    VALUES (_mv, now())
    ON CONFLICT (objeto) DO UPDATE SET atualizado_em = EXCLUDED.atualizado_em;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION metrics.refresh_all() IS
  'Atualiza todas as MVs do schema metrics (CONCURRENTLY com fallback na 1ª carga) e carimba metrics.atualizacoes. Agendada a cada 15 min via pg_cron (job metrics-refresh).';

REVOKE ALL ON FUNCTION metrics.refresh_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION metrics.refresh_all() TO service_role;

-- Primeira carga imediata (as MVs nascem populadas e carimbadas).
SELECT metrics.refresh_all();

-- Agendamento idempotente (padrão do repo).
DO $$
BEGIN
  PERFORM cron.unschedule('metrics-refresh')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-refresh');
END $$;
SELECT cron.schedule('metrics-refresh', '*/15 * * * *', $$SELECT metrics.refresh_all();$$);
