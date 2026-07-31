-- =====================================================================
-- Régua de datas (4/4) — Painel do Gestor, pacing, campanhas e as views
-- materializadas de métricas.
--
-- Mesma régua canônica da migração 3:
--   * venda SEMPRE em vendas.data_assinatura (aprovada, sem distrato);
--     venda sem assinatura não entra em período nenhum;
--   * visita realizada = agendamento de tipo visita com status realizado,
--     contada em data_inicio — no-show deixa de ser somado como visita;
--   * interação conta na data em que foi registrada (created_at).
--
-- As funções de gestão são longas e algumas já foram corrigidas em
-- produção; por isso são corrigidas por patch sobre a definição VIVA
-- (pg_get_functiondef), que falha alto se o alvo não existir mais, em vez
-- de reescritas por cima com uma cópia possivelmente defasada do repo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) gestao_resumo_semanal — vendas pela data da assinatura
-- ---------------------------------------------------------------------
DO $mig$
DECLARE d text; antes text;
BEGIN
  d := pg_get_functiondef('public.gestao_resumo_semanal()'::regprocedure);
  antes := d;
  -- Cobre as duas formas já vistas em produção (antes e depois do patch de
  -- 30/07) e qualquer variação de espaçamento.
  d := regexp_replace(
    d,
    'COALESCE\(\s*\(?v\.data_assinatura\)?::timestamptz\s*,\s*v\.aprovado_em\s*,\s*v\.created_at\s*\)',
    '(v.data_assinatura)::timestamptz',
    'g'
  );
  d := regexp_replace(
    d,
    'COALESCE\(\s*v\.aprovado_em\s*,\s*v\.created_at\s*\)',
    '(v.data_assinatura)::timestamptz',
    'g'
  );
  -- Idempotente: reaplicar não é erro, mas sumir com o alvo é.
  IF d = antes AND d NOT LIKE '%(v.data_assinatura)::timestamptz%' THEN
    RAISE EXCEPTION 'patch gestao_resumo_semanal: data de venda não encontrada';
  END IF;
  IF d LIKE '%v.aprovado_em%' THEN
    RAISE EXCEPTION 'patch gestao_resumo_semanal: sobrou aprovado_em na contagem de vendas';
  END IF;
  -- Visita já usa status=realizado + data_inicio; falta restringir ao tipo,
  -- para que reunião/ligação marcada como realizada não vire visita.
  IF d NOT LIKE '%a.tipo = ''visita'' AND a.status = ''realizado''%' THEN
    d := replace(d, 'a.status = ''realizado''', 'a.tipo = ''visita'' AND a.status = ''realizado''');
  END IF;
  -- Interação conta no dia do registro.
  d := regexp_replace(d, 'COALESCE\(i\.ocorreu_em,\s*i\.created_at\)', 'i.created_at', 'g');
  EXECUTE d;
END
$mig$;

-- ---------------------------------------------------------------------
-- 2) gestao_pacing — ritmo do mês anterior pela data da assinatura
-- ---------------------------------------------------------------------
DO $mig$
DECLARE d text; antes text;
BEGIN
  d := pg_get_functiondef('public.gestao_pacing(integer, integer)'::regprocedure);
  antes := d;
  d := regexp_replace(
    d,
    'COALESCE\(\s*v\.aprovado_em::date\s*,\s*v\.data_assinatura\s*,\s*v\.created_at::date\s*\)',
    'v.data_assinatura',
    'g'
  );
  IF d = antes AND d NOT LIKE '%v.data_assinatura%' THEN
    RAISE EXCEPTION 'patch gestao_pacing: data de venda não encontrada';
  END IF;
  EXECUTE d;
END
$mig$;

-- ---------------------------------------------------------------------
-- 3) gestao_gargalos — ticket médio (régua do impacto em R$) pela assinatura
-- ---------------------------------------------------------------------
DO $mig$
DECLARE d text; antes text;
BEGIN
  d := pg_get_functiondef('public.gestao_gargalos(date, date)'::regprocedure);
  antes := d;
  d := replace(
    d,
    'AND v.created_at >= now() - interval ''6 months''',
    'AND v.data_assinatura >= (now() - interval ''6 months'')::date'
  );
  IF d = antes AND d NOT LIKE '%v.data_assinatura >= (now()%' THEN
    RAISE EXCEPTION 'patch gestao_gargalos: janela de ticket médio não encontrada';
  END IF;
  EXECUTE d;
END
$mig$;

-- ---------------------------------------------------------------------
-- 4) equipe_metricas_campanha — venda da campanha pela data da assinatura
-- ---------------------------------------------------------------------
DO $mig$
DECLARE d text; antes text;
BEGIN
  d := pg_get_functiondef('public.equipe_metricas_campanha(uuid)'::regprocedure);
  antes := d;
  d := replace(
    d,
    'AND v.created_at > now() - (_r.janela_venda_dias || '' days'')::interval',
    'AND v.data_assinatura > (now() - (_r.janela_venda_dias || '' days'')::interval)::date'
  );
  IF d = antes AND d NOT LIKE '%v.data_assinatura > (now()%' THEN
    RAISE EXCEPTION 'patch equipe_metricas_campanha: janela de venda não encontrada';
  END IF;
  EXECUTE d;
END
$mig$;

-- ---------------------------------------------------------------------
-- 5) metrics.realizado_mensal — mês da venda = mês da assinatura
--    (venda sem assinatura sai da view; ela não pertence a mês nenhum)
-- ---------------------------------------------------------------------
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
  SELECT date_trunc('month', a.data_inicio)::date AS mes,
         a.corretor_id,
         count(*)::int AS visitas_realizadas
  FROM public.agendamentos a
  WHERE a.status = 'realizado'
    AND a.tipo = 'visita'
    AND a.deleted_at IS NULL
  GROUP BY 1, 2
),
leads_m AS (
  SELECT date_trunc('month', b.created_at)::date AS mes,
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
  'Fluxo realizado por mês × corretor: vendas e VGV pelo MÊS DA ASSINATURA (aprovada, sem distrato; venda sem data_assinatura fica de fora), visitas realizadas (agendamento tipo visita com status realizado, mês de data_inicio) e leads atendidos (funil_ordem>=3, inclui perdido). Base do pacing (gestao_pacing).';

-- ---------------------------------------------------------------------
-- 6) metrics.performance_corretor_mensal — no-show deixa de contar como
--    visita realizada e a interação passa a contar no dia do registro.
--    (MV derivada: recriada inteira e repopulada no fim da migração)
-- ---------------------------------------------------------------------
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
  -- Data do REGISTRO da interação (não a data informada pelo corretor).
  SELECT date_trunc('month', i.created_at)::date AS mes,
         i.autor_id AS corretor_id,
         count(*)::int AS interacoes,
         count(*) FILTER (WHERE i.tipo NOT IN ('nota', 'mudanca_status'))::int AS contatos
  FROM public.interacoes i
  WHERE i.deleted_at IS NULL
    AND i.autor_id IS NOT NULL
    AND i.created_at >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
agend AS (
  SELECT date_trunc('month', a.created_at)::date AS mes,
         a.corretor_id,
         count(*)::int AS agendamentos_criados
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.auto_gerado = false
    AND a.created_at >= date_trunc('month', now()) - interval '12 months'
  GROUP BY 1, 2
),
visitas_r AS (
  -- Visita realizada é só 'realizado'. No-show é métrica de qualidade da
  -- agenda e nunca deve entrar na contagem de visitas (bug corrigido aqui).
  SELECT date_trunc('month', a.data_inicio)::date AS mes,
         a.corretor_id,
         count(*) FILTER (WHERE a.status = 'realizado')::int      AS visitas_realizadas,
         count(*) FILTER (WHERE a.status = 'nao_compareceu')::int AS no_shows
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.tipo = 'visita'
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
  'Performance por corretor × mês (janela 12 meses) na régua canônica de datas: esforço (leads recebidos, interações pela data do registro, agendamentos criados, tarefas), conversão (visitas realizadas — só status realizado, no dia da visita — no-show em coluna própria, análises por mudança de status, 1ª resposta p50), resultado (vendas e VGV pelo mês da assinatura) e carga ativa ATUAL.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_perf_corretor_chave
  ON metrics.performance_corretor_mensal (chave);
CREATE INDEX IF NOT EXISTS idx_mv_perf_corretor_mes
  ON metrics.performance_corretor_mensal (mes);

-- Recarrega todas as MVs para a régua nova valer já no primeiro acesso.
SELECT metrics.refresh_all();
