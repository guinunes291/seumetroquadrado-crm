-- Camada de Gestão (Fase A8): RPCs das Telas 4 (Time) e 5 (Meta e Ritmo).

-- ---------------------------------------------------------------------------
-- Tela 4 — Performance por corretor (mês)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_performance_corretores(
  _mes date DEFAULT NULL
)
RETURNS TABLE(
  corretor_id uuid,
  nome text,
  presente boolean,
  limite_diario_leads int,
  leads_recebidos int,
  interacoes int,
  contatos int,
  agendamentos_criados int,
  visitas_realizadas int,
  no_shows int,
  analises int,
  tarefas_concluidas int,
  vendas int,
  vgv numeric,
  primeira_resposta_p50_min numeric,
  leads_respondidos int,
  carga_ativa int,
  capacidade_pct numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
  _mes_ref date := COALESCE(date_trunc('month', _mes)::date, date_trunc('month', now())::date);
  _capacidade int := GREATEST(COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 40), 1);
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.presente,
    p.limite_diario_leads,
    COALESCE(m.leads_recebidos, 0),
    COALESCE(m.interacoes, 0),
    COALESCE(m.contatos, 0),
    COALESCE(m.agendamentos_criados, 0),
    COALESCE(m.visitas_realizadas, 0),
    COALESCE(m.no_shows, 0),
    COALESCE(m.analises, 0),
    COALESCE(m.tarefas_concluidas, 0),
    COALESCE(m.vendas, 0),
    COALESCE(m.vgv, 0),
    m.primeira_resposta_p50_min,
    COALESCE(m.leads_respondidos, 0),
    COALESCE(m.carga_ativa, 0),
    round(100.0 * COALESCE(m.carga_ativa, 0) / _capacidade, 0),
    (SELECT a.atualizado_em FROM metrics.atualizacoes a
     WHERE a.objeto = 'performance_corretor_mensal')
  FROM public.profiles p
  LEFT JOIN metrics.performance_corretor_mensal m
    ON m.corretor_id = p.id AND m.mes = _mes_ref
  WHERE p.ativo = true
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = p.id AND ur.role = 'corretor')
    AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  ORDER BY COALESCE(m.vgv, 0) DESC, COALESCE(m.vendas, 0) DESC, p.nome;
END;
$$;

COMMENT ON FUNCTION public.gestao_performance_corretores(date) IS
  'Tela 4: linha por corretor ativo (papel corretor) do escopo, com esforço/conversão/resultado do mês (metrics.performance_corretor_mensal) + capacidade (carga ativa ÷ gestao_config.capacidade_leads_ativos_por_corretor). 1ª resposta é proxy pela 1ª interação de contato. Corretores sem atividade aparecem zerados — ausência de linha na MV não é ausência de corretor.';

REVOKE ALL ON FUNCTION public.gestao_performance_corretores(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_performance_corretores(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 4 — Drill: série mensal de um corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_performance_corretor_drill(
  _corretor uuid,
  _meses int DEFAULT 6
)
RETURNS TABLE(
  mes date,
  leads_recebidos int,
  interacoes int,
  contatos int,
  agendamentos_criados int,
  visitas_realizadas int,
  no_shows int,
  analises int,
  tarefas_concluidas int,
  vendas int,
  vgv numeric,
  primeira_resposta_p50_min numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  -- Corretor pode ver o PRÓPRIO drill (evolução para comissão); gestão vê o escopo.
  IF _corretor <> _caller THEN
    IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'gestor')
            OR public.has_role(_caller, 'superintendente')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    _ve_tudo := public.ve_carteira_completa(_caller);
    _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
    IF NOT _ve_tudo AND NOT (_corretor = ANY(_equipe)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    m.mes, m.leads_recebidos, m.interacoes, m.contatos, m.agendamentos_criados,
    m.visitas_realizadas, m.no_shows, m.analises, m.tarefas_concluidas,
    m.vendas, m.vgv, m.primeira_resposta_p50_min,
    (SELECT a.atualizado_em FROM metrics.atualizacoes a
     WHERE a.objeto = 'performance_corretor_mensal')
  FROM metrics.performance_corretor_mensal m
  WHERE m.corretor_id = _corretor
    AND m.mes >= date_trunc('month', now())::date - (GREATEST(_meses, 1) - 1) * interval '1 month'
  ORDER BY m.mes;
END;
$$;

COMMENT ON FUNCTION public.gestao_performance_corretor_drill(uuid, int) IS
  'Tela 4 (drill): série mensal de um corretor (padrão 6 meses) para evolução trimestral/escalonamento de comissão. O corretor pode consultar a si mesmo; gestor só corretores da equipe; admin/superintendente qualquer um.';

REVOKE ALL ON FUNCTION public.gestao_performance_corretor_drill(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_performance_corretor_drill(uuid, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tela 5 — Meta e Ritmo (pacing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_pacing(
  _ano int DEFAULT NULL,
  _mes int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
  _ano_ref int := COALESCE(_ano, EXTRACT(YEAR FROM now())::int);
  _mes_ref int := COALESCE(_mes, EXTRACT(MONTH FROM now())::int);
  _ini date;
  _fim date;
  _tri_ini date;
  _cfg jsonb := COALESCE(public.gestao_config_valor('pacing'),
                         '{"dias_uteis":[1,2,3,4,5,6],"feriados":[]}'::jsonb);
  _du_total int;
  _du_passados int;
  _nth_dia_util_mes_anterior date;
  _resultado jsonb;
BEGIN
  _esc := public._gestao_escopo();
  _ini := make_date(_ano_ref, _mes_ref, 1);
  _fim := (_ini + interval '1 month - 1 day')::date;
  _tri_ini := make_date(_ano_ref, ((_mes_ref - 1) / 3) * 3 + 1, 1);

  -- Dias úteis do mês segundo a config (ISO dow + feriados).
  WITH cal AS (
    SELECT d::date AS dia
    FROM generate_series(_ini, _fim, interval '1 day') d
    WHERE EXTRACT(ISODOW FROM d)::int IN (
            SELECT jsonb_array_elements_text(_cfg -> 'dias_uteis')::int)
      AND d::date::text NOT IN (
            SELECT jsonb_array_elements_text(COALESCE(_cfg -> 'feriados', '[]'::jsonb)))
  )
  SELECT count(*), count(*) FILTER (WHERE dia <= current_date)
  INTO _du_total, _du_passados
  FROM cal;

  -- N-ésimo dia útil do mês ANTERIOR (para comparar ritmo com ritmo).
  WITH cal_ant AS (
    SELECT d::date AS dia,
           row_number() OVER (ORDER BY d) AS n
    FROM generate_series(
      (_ini - interval '1 month')::date,
      (_ini - interval '1 day')::date,
      interval '1 day') d
    WHERE EXTRACT(ISODOW FROM d)::int IN (
            SELECT jsonb_array_elements_text(_cfg -> 'dias_uteis')::int)
      AND d::date::text NOT IN (
            SELECT jsonb_array_elements_text(COALESCE(_cfg -> 'feriados', '[]'::jsonb)))
  )
  SELECT dia INTO _nth_dia_util_mes_anterior
  FROM cal_ant WHERE n = GREATEST(_du_passados, 1)
  ORDER BY n LIMIT 1;

  WITH corretores_escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles p
    WHERE p.ativo = true
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor')
      AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  ),
  metas_mes AS (
    SELECT mt.corretor_id,
           sum(mt.meta_vendas)::int AS meta_vendas,
           sum(mt.meta_gmv)         AS meta_gmv,
           sum(mt.meta_visitas)::int AS meta_visitas
    FROM public.metas mt
    WHERE mt.ano = _ano_ref AND mt.mes = _mes_ref AND mt.corretor_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM corretores_escopo ce WHERE ce.id = mt.corretor_id)
    GROUP BY mt.corretor_id
  ),
  metas_tri AS (
    SELECT sum(mt.meta_vendas)::int AS meta_vendas, sum(mt.meta_gmv) AS meta_gmv
    FROM public.metas mt
    WHERE make_date(mt.ano, mt.mes, 1) BETWEEN _tri_ini AND (_tri_ini + interval '2 months')::date
      AND mt.corretor_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM corretores_escopo ce WHERE ce.id = mt.corretor_id)
  ),
  realizado_mes AS (
    SELECT rm.corretor_id, rm.vendas, rm.vgv, rm.visitas_realizadas
    FROM metrics.realizado_mensal rm
    WHERE rm.mes = _ini
      AND EXISTS (SELECT 1 FROM corretores_escopo ce WHERE ce.id = rm.corretor_id)
  ),
  realizado_tri AS (
    SELECT COALESCE(sum(rm.vendas), 0)::int AS vendas, COALESCE(sum(rm.vgv), 0) AS vgv
    FROM metrics.realizado_mensal rm
    WHERE rm.mes BETWEEN _tri_ini AND (_tri_ini + interval '2 months')::date
      AND EXISTS (SELECT 1 FROM corretores_escopo ce WHERE ce.id = rm.corretor_id)
  ),
  -- Taxas vigentes (90 dias ≈ 3 meses de MV) para o cálculo reverso.
  taxas AS (
    SELECT COALESCE(sum(m.vendas), 0)::numeric            AS vendas,
           COALESCE(sum(m.visitas_realizadas), 0)::numeric AS visitas,
           COALESCE(sum(m.analises), 0)::numeric           AS analises,
           COALESCE(sum(m.leads_recebidos), 0)::numeric    AS leads
    FROM metrics.performance_corretor_mensal m
    WHERE m.mes >= date_trunc('month', now())::date - interval '2 months'
      AND EXISTS (SELECT 1 FROM corretores_escopo ce WHERE ce.id = m.corretor_id)
  ),
  ritmo_anterior AS (
    SELECT count(*)::int AS vendas, COALESCE(sum(v.valor_venda), 0) AS vgv
    FROM public.vendas v
    WHERE v.status_venda = 'aprovada' AND v.distrato = false
      AND COALESCE(v.aprovado_em::date, v.data_assinatura, v.created_at::date)
            BETWEEN (_ini - interval '1 month')::date
                AND COALESCE(_nth_dia_util_mes_anterior, (_ini - interval '1 day')::date)
      AND (_esc.ve_tudo OR v.corretor_id = ANY(_esc.equipe))
  ),
  por_corretor AS (
    SELECT jsonb_agg(jsonb_build_object(
      'corretor_id', ce.id,
      'nome', ce.nome,
      'meta_vendas', COALESCE(mm.meta_vendas, 0),
      'meta_gmv', COALESCE(mm.meta_gmv, 0),
      'meta_visitas', COALESCE(mm.meta_visitas, 0),
      'vendas', COALESCE(r.vendas, 0),
      'vgv', COALESCE(r.vgv, 0),
      'visitas', COALESCE(r.visitas_realizadas, 0)
    ) ORDER BY COALESCE(mm.meta_gmv, 0) DESC, ce.nome) AS arr
    FROM corretores_escopo ce
    LEFT JOIN metas_mes mm ON mm.corretor_id = ce.id
    LEFT JOIN realizado_mes r ON r.corretor_id = ce.id
    WHERE COALESCE(mm.meta_vendas, 0) > 0 OR COALESCE(mm.meta_gmv, 0) > 0
       OR COALESCE(r.vendas, 0) > 0 OR COALESCE(r.vgv, 0) > 0
  )
  SELECT jsonb_build_object(
    'ano', _ano_ref,
    'mes', _mes_ref,
    'dias_uteis', jsonb_build_object(
      'total', _du_total, 'passados', _du_passados,
      'restantes', GREATEST(_du_total - _du_passados, 0)),
    'mes_atual', jsonb_build_object(
      'meta_vendas', COALESCE((SELECT sum(meta_vendas) FROM metas_mes), 0),
      'meta_gmv', COALESCE((SELECT sum(meta_gmv) FROM metas_mes), 0),
      'meta_visitas', COALESCE((SELECT sum(meta_visitas) FROM metas_mes), 0),
      'vendas', COALESCE((SELECT sum(vendas) FROM realizado_mes), 0),
      'vgv', COALESCE((SELECT sum(vgv) FROM realizado_mes), 0),
      'visitas', COALESCE((SELECT sum(visitas_realizadas) FROM realizado_mes), 0)),
    'trimestre', jsonb_build_object(
      'inicio', _tri_ini,
      'meta_vendas', COALESCE((SELECT meta_vendas FROM metas_tri), 0),
      'meta_gmv', COALESCE((SELECT meta_gmv FROM metas_tri), 0),
      'vendas', (SELECT vendas FROM realizado_tri),
      'vgv', (SELECT vgv FROM realizado_tri)),
    'taxas_90d', (SELECT jsonb_build_object(
      'venda_por_visita', round(vendas / NULLIF(visitas, 0), 4),
      'venda_por_analise', round(vendas / NULLIF(analises, 0), 4),
      'venda_por_lead', round(vendas / NULLIF(leads, 0), 4)) FROM taxas),
    'mes_anterior_mesmo_dia_util', (SELECT jsonb_build_object(
      'vendas', vendas, 'vgv', vgv,
      'ate_dia', _nth_dia_util_mes_anterior) FROM ritmo_anterior),
    'por_corretor', COALESCE((SELECT arr FROM por_corretor), '[]'::jsonb),
    'atualizado_em', now()
  )
  INTO _resultado;

  RETURN _resultado;
END;
$$;

COMMENT ON FUNCTION public.gestao_pacing(int, int) IS
  'Tela 5: meta (tabela metas, nível corretor — trimestre = soma dos 3 meses) vs realizado (metrics.realizado_mensal: vendas aprovadas sem distrato, visitas realizadas) vs ritmo, com dias úteis da config pacing (feriados editáveis), taxas 90d para o cálculo reverso (projeção e "quantas visitas faltam" derivadas no front, testadas em src/features/metas/pacing.ts) e comparação com o mesmo dia útil do mês anterior. Escopo: gestor só a equipe.';

REVOKE ALL ON FUNCTION public.gestao_pacing(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_pacing(int, int) TO authenticated, service_role;
