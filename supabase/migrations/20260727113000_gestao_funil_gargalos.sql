-- Camada de Gestão (Fase A7): RPCs das Telas 2 (Funil/Conversão) e 3 (Gargalo).
--
-- Todas leem o schema metrics (MVs) aplicando escopo por papel no SQL —
-- é a ponte segura entre MV (sem RLS) e RBAC. Toda RPC que lê MV devolve
-- atualizado_em (carimbo de metrics.atualizacoes) para a UI mostrar
-- "dados de HH:MM".

-- ---------------------------------------------------------------------------
-- Escopo comum: valida papel de gestão e resolve o conjunto de corretores.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gestao_escopo(OUT ve_tudo boolean, OUT equipe uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'gestor')
          OR public.has_role(_caller, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ve_tudo := public.ve_carteira_completa(_caller);
  equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT ve_tudo THEN
    equipe := equipe || _caller;
  END IF;
END;
$$;

COMMENT ON FUNCTION public._gestao_escopo() IS
  'Uso interno das RPCs gestao_*: exige papel de gestão (senão forbidden) e devolve ve_tudo (admin/superintendente) + array de corretores visíveis ao gestor (equipe + ele mesmo).';

REVOKE ALL ON FUNCTION public._gestao_escopo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gestao_escopo() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 2 — Coorte mensal (leitura correta de conversão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_funil_coorte(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _origem text DEFAULT NULL
)
RETURNS TABLE(
  mes_coorte date,
  leads int,
  atingiu_atendimento int,
  atingiu_agendado int,
  atingiu_visita int,
  atingiu_analise int,
  vendas int,
  perdidos int,
  cobertura_pct numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    m.mes_coorte,
    sum(m.leads)::int,
    sum(m.atingiu_atendimento)::int,
    sum(m.atingiu_agendado)::int,
    sum(m.atingiu_visita)::int,
    sum(m.atingiu_analise)::int,
    sum(m.vendas)::int,
    sum(m.perdidos)::int,
    -- Cobertura ponderada pelos leads da coorte visível.
    round(sum(m.cobertura_transicoes_pct * m.leads) / NULLIF(sum(m.leads), 0), 1),
    (SELECT a.atualizado_em FROM metrics.atualizacoes a WHERE a.objeto = 'funil_coorte_mensal')
  FROM metrics.funil_coorte_mensal m
  WHERE (_de IS NULL OR m.mes_coorte >= date_trunc('month', _de)::date)
    AND (_ate IS NULL OR m.mes_coorte <= date_trunc('month', _ate)::date)
    AND (_corretor IS NULL OR m.corretor_id = _corretor)
    AND (_origem IS NULL OR m.origem = _origem)
    AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
  GROUP BY m.mes_coorte
  ORDER BY m.mes_coorte;
END;
$$;

COMMENT ON FUNCTION public.gestao_funil_coorte(date, date, uuid, text) IS
  'Tela 2, leitura COORTE: dos leads criados em cada mês, quantos atingiram cada etapa até hoje (fonte metrics.funil_coorte_mensal). cobertura_pct < limiar de gestao_config ⇒ UI mostra "sem dado suficiente". Taxas de passagem são derivadas no front. Escopo: gestor só a equipe.';

REVOKE ALL ON FUNCTION public.gestao_funil_coorte(date, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_funil_coorte(date, date, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 2 — Snapshot (leitura correta de carga de trabalho)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_funil_snapshot(
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(
  etapa text,
  ordem smallint,
  quantidade int,
  vgv numeric,
  parados int,
  followups_vencidos int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    s.status::text,
    s.ordem,
    sum(s.quantidade)::int,
    sum(s.vgv_potencial),
    sum(s.parados)::int,
    sum(s.followups_vencidos)::int
  FROM metrics.snapshot_funil s
  WHERE (_corretor IS NULL OR s.corretor_id = _corretor)
    AND (_esc.ve_tudo OR s.corretor_id = ANY(_esc.equipe))
  GROUP BY s.status, s.ordem
  ORDER BY s.ordem;
END;
$$;

COMMENT ON FUNCTION public.gestao_funil_snapshot(uuid) IS
  'Tela 2, leitura SNAPSHOT: estoque ATUAL por etapa com VGV potencial, parados e follow-ups vencidos (fonte metrics.snapshot_funil, ao vivo). Leitura de carga de trabalho — não use para conversão.';

REVOKE ALL ON FUNCTION public.gestao_funil_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_funil_snapshot(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 2 — Tempo por etapa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_tempo_etapa(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(
  etapa text,
  ordem smallint,
  horas_media numeric,
  horas_p50 numeric,
  n int,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    t.etapa,
    t.ordem,
    round(sum(t.horas_media * t.n) / NULLIF(sum(t.n), 0), 1),
    -- p50 agregado = média dos p50 mensais ponderada por n (aproximação
    -- honesta: o p50 exato exigiria os valores brutos; documentado na UI).
    round(sum(t.horas_p50 * t.n) / NULLIF(sum(t.n), 0), 1),
    sum(t.n)::int,
    (SELECT a.atualizado_em FROM metrics.atualizacoes a WHERE a.objeto = 'tempo_etapa_mensal')
  FROM metrics.tempo_etapa_mensal t
  WHERE (_de IS NULL OR t.mes >= date_trunc('month', _de)::date)
    AND (_ate IS NULL OR t.mes <= date_trunc('month', _ate)::date)
    AND (_corretor IS NULL OR t.corretor_id = _corretor)
    AND (_esc.ve_tudo OR t.corretor_id = ANY(_esc.equipe))
  GROUP BY t.etapa, t.ordem
  ORDER BY t.ordem;
END;
$$;

COMMENT ON FUNCTION public.gestao_tempo_etapa(date, date, uuid) IS
  'Tela 2: horas de permanência por etapa (média e p50 ponderado por volume) no período, a partir de metrics.tempo_etapa_mensal. Só mede etapas com transição de saída registrada (desde jun/2026).';

REVOKE ALL ON FUNCTION public.gestao_tempo_etapa(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_tempo_etapa(date, date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 3 — Heatmap corretor × etapa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_heatmap_corretor_etapa(
  _metrica text DEFAULT 'conversao',
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  corretor_id uuid,
  nome text,
  etapa text,
  ordem smallint,
  valor numeric,
  base int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();

  IF _metrica = 'conversao' THEN
    -- Conversão de PASSAGEM por corretor: % dos leads que chegaram à etapa
    -- anterior e avançaram para esta (fonte: coorte). base = denominador.
    RETURN QUERY
    WITH agg AS (
      SELECT m.corretor_id,
             sum(m.leads)::int               AS leads,
             sum(m.atingiu_atendimento)::int AS a3,
             sum(m.atingiu_agendado)::int    AS a4,
             sum(m.atingiu_visita)::int      AS a5,
             sum(m.atingiu_analise)::int     AS a6,
             sum(m.vendas)::int              AS a7
      FROM metrics.funil_coorte_mensal m
      WHERE m.corretor_id IS NOT NULL
        AND (_de IS NULL OR m.mes_coorte >= date_trunc('month', _de)::date)
        AND (_ate IS NULL OR m.mes_coorte <= date_trunc('month', _ate)::date)
        AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
      GROUP BY m.corretor_id
    )
    SELECT agg.corretor_id, p.nome, e.etapa, e.ordem,
           round(100.0 * e.numerador / NULLIF(e.denominador, 0), 1),
           e.denominador
    FROM agg
    JOIN public.profiles p ON p.id = agg.corretor_id
    CROSS JOIN LATERAL (
      VALUES
        ('em_atendimento',  3::smallint, agg.a3, agg.leads),
        ('agendado',        4::smallint, agg.a4, agg.a3),
        ('visita_realizada',5::smallint, agg.a5, agg.a4),
        ('analise_credito', 6::smallint, agg.a6, agg.a5),
        ('contrato_fechado',7::smallint, agg.a7, agg.a6)
    ) AS e(etapa, ordem, numerador, denominador);

  ELSIF _metrica IN ('quantidade', 'vgv', 'parados') THEN
    RETURN QUERY
    SELECT s.corretor_id, p.nome, s.status::text, s.ordem,
           CASE _metrica
             WHEN 'quantidade' THEN sum(s.quantidade)::numeric
             WHEN 'vgv'        THEN sum(s.vgv_potencial)
             ELSE sum(s.parados)::numeric
           END,
           sum(s.quantidade)::int
    FROM metrics.snapshot_funil s
    JOIN public.profiles p ON p.id = s.corretor_id
    WHERE s.corretor_id IS NOT NULL
      AND (_esc.ve_tudo OR s.corretor_id = ANY(_esc.equipe))
    GROUP BY s.corretor_id, p.nome, s.status, s.ordem;

  ELSIF _metrica = 'dias_medio' THEN
    RETURN QUERY
    SELECT t.corretor_id, p.nome, t.etapa, t.ordem,
           round(sum(t.horas_media * t.n) / NULLIF(sum(t.n), 0) / 24.0, 1),
           sum(t.n)::int
    FROM metrics.tempo_etapa_mensal t
    JOIN public.profiles p ON p.id = t.corretor_id
    WHERE t.corretor_id IS NOT NULL
      AND (_de IS NULL OR t.mes >= date_trunc('month', _de)::date)
      AND (_ate IS NULL OR t.mes <= date_trunc('month', _ate)::date)
      AND (_esc.ve_tudo OR t.corretor_id = ANY(_esc.equipe))
    GROUP BY t.corretor_id, p.nome, t.etapa, t.ordem;

  ELSE
    RAISE EXCEPTION 'metrica_invalida: %', _metrica;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.gestao_heatmap_corretor_etapa(text, date, date) IS
  'Tela 3 (peça central): matriz corretor × etapa. _metrica=conversao (passagem etapa→etapa por coorte, base=denominador), quantidade/vgv/parados (snapshot atual) ou dias_medio (tempo na etapa). Coluna toda ruim = problema de processo; linha toda ruim = problema de pessoa.';

REVOKE ALL ON FUNCTION public.gestao_heatmap_corretor_etapa(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_heatmap_corretor_etapa(text, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 3 — Motivos de perda com R$ estimado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_motivos_perda(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(
  categoria text,
  quantidade int,
  vgv_estimado numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    m.categoria,
    sum(m.quantidade)::int,
    sum(m.vgv_estimado),
    (SELECT a.atualizado_em FROM metrics.atualizacoes a WHERE a.objeto = 'motivos_perda_mensal')
  FROM metrics.motivos_perda_mensal m
  WHERE (_de IS NULL OR m.mes >= date_trunc('month', _de)::date)
    AND (_ate IS NULL OR m.mes <= date_trunc('month', _ate)::date)
    AND (_corretor IS NULL OR m.corretor_id = _corretor)
    AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
  GROUP BY m.categoria
  ORDER BY sum(m.vgv_estimado) DESC NULLS LAST, sum(m.quantidade) DESC;
END;
$$;

COMMENT ON FUNCTION public.gestao_motivos_perda(date, date, uuid) IS
  'Tela 3: perdas agregadas por categoria estruturada (11 valores + outro) no período, com VGV estimado (valor_potencial dos leads perdidos — estimativa, sempre rotulada). Fallback do front: dashboard_motivos_perda (sem R$).';

REVOKE ALL ON FUNCTION public.gestao_motivos_perda(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_motivos_perda(date, date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 3 — Ranking de gargalos por impacto estimado em R$
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_gargalos(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
  _de_efetivo date := COALESCE(_de, date_trunc('month', now())::date - interval '2 months')::date;
  _ate_efetivo date := COALESCE(_ate, date_trunc('month', now()))::date;
  _base_de date;
  _base_ate date;
  _ticket numeric;
  _problemas jsonb := '[]'::jsonb;
BEGIN
  _esc := public._gestao_escopo();
  -- Baseline: os 3 meses ANTERIORES à janela analisada.
  _base_ate := (date_trunc('month', _de_efetivo) - interval '1 month')::date;
  _base_de := (date_trunc('month', _de_efetivo) - interval '3 months')::date;

  -- Ticket médio (6 meses) das vendas aprovadas do escopo — régua do impacto.
  SELECT avg(v.valor_venda) INTO _ticket
  FROM public.vendas v
  WHERE v.status_venda = 'aprovada' AND v.distrato = false
    AND v.created_at >= now() - interval '6 months'
    AND (_esc.ve_tudo OR v.corretor_id = ANY(_esc.equipe));

  WITH atual AS (
    SELECT sum(leads)::numeric AS leads, sum(atingiu_atendimento)::numeric AS a3,
           sum(atingiu_agendado)::numeric AS a4, sum(atingiu_visita)::numeric AS a5,
           sum(atingiu_analise)::numeric AS a6, sum(vendas)::numeric AS a7
    FROM metrics.funil_coorte_mensal m
    WHERE m.mes_coorte BETWEEN date_trunc('month', _de_efetivo)::date AND _ate_efetivo
      AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
  ),
  baseline AS (
    SELECT sum(leads)::numeric AS leads, sum(atingiu_atendimento)::numeric AS a3,
           sum(atingiu_agendado)::numeric AS a4, sum(atingiu_visita)::numeric AS a5,
           sum(atingiu_analise)::numeric AS a6, sum(vendas)::numeric AS a7
    FROM metrics.funil_coorte_mensal m
    WHERE m.mes_coorte BETWEEN _base_de AND _base_ate
      AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
  ),
  etapas AS (
    SELECT e.etapa, e.ordem,
           e.num_atual, e.den_atual, e.num_base, e.den_base,
           round(100.0 * e.num_atual / NULLIF(e.den_atual, 0), 1) AS taxa_atual,
           round(100.0 * e.num_base / NULLIF(e.den_base, 0), 1)  AS taxa_base,
           -- Vendas por lead que passa desta etapa (régua p/ traduzir a queda
           -- de passagem em vendas perdidas) — do próprio período atual.
           a.a7 / NULLIF(e.num_atual, 0)                          AS vendas_por_passante
    FROM atual a, baseline b,
    LATERAL (
      VALUES
        ('em_atendimento',   3::smallint, a.a3, a.leads, b.a3, b.leads),
        ('agendado',         4::smallint, a.a4, a.a3,    b.a4, b.a3),
        ('visita_realizada', 5::smallint, a.a5, a.a4,    b.a5, b.a4),
        ('analise_credito',  6::smallint, a.a6, a.a5,    b.a6, b.a5),
        ('contrato_fechado', 7::smallint, a.a7, a.a6,    b.a7, b.a6)
    ) AS e(etapa, ordem, num_atual, den_atual, num_base, den_base)
  ),
  quedas AS (
    SELECT jsonb_build_object(
      'tipo', 'queda_conversao',
      'etapa', et.etapa,
      'taxa_atual_pct', et.taxa_atual,
      'taxa_baseline_pct', et.taxa_base,
      'leads_afetados', round((et.taxa_base - et.taxa_atual) / 100.0 * et.den_atual)::int,
      -- Impacto: leads que deixaram de passar × vendas por passante × ticket.
      'impacto_reais', round(GREATEST(0,
          (et.taxa_base - et.taxa_atual) / 100.0 * COALESCE(et.den_atual, 0)
          * COALESCE(et.vendas_por_passante, 0) * COALESCE(_ticket, 0))),
      'drill', jsonb_build_object('status', et.etapa)
    ) AS problema,
    GREATEST(0, (et.taxa_base - et.taxa_atual) / 100.0 * COALESCE(et.den_atual, 0)
      * COALESCE(et.vendas_por_passante, 0) * COALESCE(_ticket, 0)) AS impacto
    FROM etapas et
    WHERE et.taxa_base IS NOT NULL AND et.taxa_atual IS NOT NULL
      AND et.taxa_base > et.taxa_atual
      AND et.den_base >= 20  -- baseline com amostra mínima
  ),
  perdas AS (
    SELECT jsonb_build_object(
      'tipo', 'motivo_perda',
      'categoria', m.categoria,
      'leads_afetados', sum(m.quantidade)::int,
      'impacto_reais', round(sum(m.vgv_estimado)),
      'drill', jsonb_build_object('status', 'perdido')
    ) AS problema,
    sum(m.vgv_estimado) AS impacto
    FROM metrics.motivos_perda_mensal m
    WHERE m.mes BETWEEN date_trunc('month', _de_efetivo)::date AND _ate_efetivo
      AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
    GROUP BY m.categoria
    ORDER BY sum(m.vgv_estimado) DESC NULLS LAST
    LIMIT 3
  ),
  lentidao AS (
    SELECT jsonb_build_object(
      'tipo', 'etapa_lenta',
      'etapa', t.etapa,
      'horas_media', round(sum(t.horas_media * t.n) / NULLIF(sum(t.n), 0), 1),
      'leads_afetados', sum(t.n)::int,
      'impacto_reais', NULL,
      'drill', jsonb_build_object('status', t.etapa)
    ) AS problema,
    (sum(t.horas_media * t.n) / NULLIF(sum(t.n), 0)) AS impacto_horas
    FROM metrics.tempo_etapa_mensal t
    WHERE t.mes BETWEEN date_trunc('month', _de_efetivo)::date AND _ate_efetivo
      AND (_esc.ve_tudo OR t.corretor_id = ANY(_esc.equipe))
    GROUP BY t.etapa
    ORDER BY 2 DESC NULLS LAST
    LIMIT 2
  )
  SELECT COALESCE(jsonb_agg(p.problema ORDER BY p.impacto DESC NULLS LAST), '[]'::jsonb)
  INTO _problemas
  FROM (
    SELECT problema, impacto FROM quedas
    UNION ALL
    SELECT problema, impacto FROM perdas
    UNION ALL
    SELECT problema, NULL::numeric FROM lentidao
  ) p;

  RETURN jsonb_build_object(
    'problemas', _problemas,
    'ticket_medio', round(COALESCE(_ticket, 0)),
    'periodo', jsonb_build_object('de', _de_efetivo, 'ate', _ate_efetivo,
                                  'baseline_de', _base_de, 'baseline_ate', _base_ate),
    'atualizado_em', (SELECT a.atualizado_em FROM metrics.atualizacoes a
                      WHERE a.objeto = 'funil_coorte_mensal')
  );
END;
$$;

COMMENT ON FUNCTION public.gestao_gargalos(date, date) IS
  'Tela 3: ranking de problemas por impacto ESTIMADO em R$ — quedas de passagem etapa→etapa vs baseline (3 meses anteriores, amostra mínima 20), top motivos de perda (VGV estimado) e etapas mais lentas. Impacto de queda = leads que deixaram de passar × vendas-por-passante × ticket médio 6m. Sempre rotular como estimativa na UI.';

REVOKE ALL ON FUNCTION public.gestao_gargalos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_gargalos(date, date) TO authenticated, service_role;
