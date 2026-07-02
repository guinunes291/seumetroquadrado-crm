-- ============================================================================
-- DASHBOARD ANALYTICS v2 — corrige a semântica dos dados e adiciona Receita,
-- Origem/Campanha e Velocidade. 100% idempotente (CREATE OR REPLACE / DROP IF
-- EXISTS). NÃO altera dados nem tabelas — só funções (RPCs).
--
-- Pode ser colada inteira no SQL Editor do Supabase.
--
-- Correções nesta versão:
--  * Fuso horário: agregações diárias em America/Sao_Paulo (antes, dia UTC —
--    lead criado 21h+ caía no dia seguinte).
--  * "Vendas" passam a vir da tabela `vendas` (data_assinatura, sem distrato),
--    não mais do status do lead criado no período (coorte ≠ atividade).
--  * KPIs separados em: pipeline (foto atual da carteira) × período (atividade)
--    × prev (período anterior equivalente, para deltas ↑↓).
--  * `aguardando_retorno` agora é contado (antes ficava invisível).
--  * Motivos de perda: data real da perda (transição p/ 'perdido'; fallback
--    updated_at para legado) + agrupamento pela categoria padronizada.
--  * Leads urgentes: devolve o total real (não capado no LIMIT) e distingue
--    "aguardando distribuição" de "distribuído sem contato".
--  * Período nulo (_di/_df NULL = "Todo o período") suportado em tudo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper interno: atividade de um intervalo (reusado por kpis p/ período+prev).
-- Não é exposto ao cliente (sem GRANT p/ authenticated).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_atividade_periodo(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_atividade_periodo(
  _di timestamptz,
  _df timestamptz,
  _scope uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
  _leads_novos int;
  _agendamentos int;
  _visitas int;
  _perdidos int;
  _vendas int;
  _vgv numeric;
BEGIN
  SELECT count(*)::int INTO _leads_novos
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope);

  SELECT count(*)::int INTO _agendamentos
  FROM public.agendamentos
  WHERE deleted_at IS NULL
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope);

  SELECT count(*)::int INTO _visitas
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'visita_realizada'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope);

  SELECT count(DISTINCT t.lead_id)::int INTO _perdidos
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'perdido'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope);

  SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
  FROM public.vendas
  WHERE distrato = false
    AND (_di_date IS NULL OR data_assinatura >= _di_date)
    AND (_df_date IS NULL OR data_assinatura <= _df_date)
    AND (_scope IS NULL OR corretor_id = _scope);

  RETURN jsonb_build_object(
    'leads_novos', _leads_novos,
    'agendamentos', _agendamentos,
    'visitas', _visitas,
    'perdidos', _perdidos,
    'vendas', _vendas,
    'vgv', _vgv
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_atividade_periodo(timestamptz, timestamptz, uuid) FROM PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 1) dashboard_kpis v2 — {pipeline, periodo, prev}
--    pipeline: foto ATUAL da carteira (sem filtro de data).
--    periodo:  atividade do intervalo [_di,_df).
--    prev:     mesma atividade na janela anterior equivalente (para deltas).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_kpis(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_kpis(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _pipeline jsonb;
  _periodo jsonb;
  _prev jsonb := NULL;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  SELECT jsonb_build_object(
    'novo',                  count(*) FILTER (WHERE status = 'novo'),
    'aguardando_atendimento',count(*) FILTER (WHERE status = 'aguardando_atendimento'),
    'aguardando_retorno',    count(*) FILTER (WHERE status = 'aguardando_retorno'),
    'em_atendimento',        count(*) FILTER (WHERE status = 'em_atendimento'),
    'agendado',              count(*) FILTER (WHERE status = 'agendado'),
    'visita_realizada',      count(*) FILTER (WHERE status = 'visita_realizada'),
    'analise_credito',       count(*) FILTER (WHERE status = 'analise_credito'),
    'em_aberto',             count(*) FILTER (WHERE status NOT IN ('contrato_fechado','perdido')),
    'sem_corretor',          count(*) FILTER (WHERE corretor_id IS NULL AND status NOT IN ('contrato_fechado','perdido'))
  ) INTO _pipeline
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_scope IS NULL OR corretor_id = _scope);

  _periodo := public.dashboard_atividade_periodo(_di, _df, _scope);

  IF _di IS NOT NULL AND _df IS NOT NULL THEN
    _prev := public.dashboard_atividade_periodo(_di - (_df - _di), _di, _scope);
  END IF;

  RETURN jsonb_build_object('pipeline', _pipeline, 'periodo', _periodo, 'prev', _prev);
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) dashboard_serie_diaria v2 — dias no fuso America/Sao_Paulo; vendas reais
--    (tabela vendas, sem distrato); range nulo => últimos 90 dias; a série não
--    projeta dias futuros (corta em hoje).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_serie_diaria(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(dia date, leads int, agendamentos int, visitas int, vendas int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d1 date;
  _d2 date;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  -- "Todo o período" (range nulo): série dos últimos 90 dias (o restante do
  -- dashboard cobre o histórico completo; a série diária ficaria ilegível).
  IF _di IS NULL OR _df IS NULL THEN
    _d1 := _hoje - 89;
    _d2 := _hoje;
  ELSE
    _d1 := (_di AT TIME ZONE 'America/Sao_Paulo')::date;
    _d2 := LEAST((_df AT TIME ZONE 'America/Sao_Paulo')::date, _hoje);
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(_d1, _d2, interval '1 day')::date AS d
  ),
  l AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  ag AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  vi AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.lead_status_transitions
    WHERE para_status = 'visita_realizada'
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  ),
  ve AS (
    SELECT data_assinatura AS d, count(*)::int AS n
    FROM public.vendas
    WHERE distrato = false
      AND data_assinatura BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(l.n,0), COALESCE(ag.n,0), COALESCE(vi.n,0), COALESCE(ve.n,0)
  FROM dias
  LEFT JOIN l  ON l.d = dias.d
  LEFT JOIN ag ON ag.d = dias.d
  LEFT JOIN vi ON vi.d = dias.d
  LEFT JOIN ve ON ve.d = dias.d
  ORDER BY dias.d;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_diaria(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) dashboard_funil v2 — mesma lógica de coorte, agora com range nulo
--    suportado ("Todo o período").
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_funil(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(etapa text, ordem int, quantidade int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT id, status FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (_di IS NULL OR created_at >= _di)
      AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
  )
  SELECT * FROM (VALUES
    ('Novos',            1, (SELECT count(*)::int FROM base)),
    ('Em atendimento',   2, (SELECT count(*)::int FROM base WHERE status IN ('aguardando_retorno','em_atendimento','qualificado','agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Agendados',        3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Visitas',          4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','analise_credito','contrato_fechado'))),
    ('Análise crédito',  5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','contrato_fechado'))),
    ('Fechados',         6, (SELECT count(*)::int FROM base WHERE status = 'contrato_fechado'))
  ) AS t(etapa, ordem, quantidade);
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_funil(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) dashboard_motivos_perda v2 — data real da perda (última transição para
--    'perdido'; fallback updated_at p/ legado sem transição) e agrupamento
--    pela categoria padronizada (fallback: texto livre). Range nulo suportado.
--    O frontend traduz as chaves via MOTIVO_PERDA_LABEL.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_motivos_perda(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_motivos_perda(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(motivo text, quantidade int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH perdas AS (
    SELECT
      COALESCE(
        NULLIF(trim(l.motivo_perda_categoria), ''),
        NULLIF(trim(l.motivo_perdido), ''),
        'nao_informado'
      ) AS m,
      COALESCE(
        (SELECT max(t.created_at) FROM public.lead_status_transitions t
          WHERE t.lead_id = l.id AND t.para_status = 'perdido'),
        l.updated_at
      ) AS quando
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false
      AND l.status = 'perdido'
      AND (_scope IS NULL OR l.corretor_id = _scope)
  )
  SELECT p.m, count(*)::int
  FROM perdas p
  WHERE (_di IS NULL OR p.quando >= _di)
    AND (_df IS NULL OR p.quando < _df)
  GROUP BY p.m
  ORDER BY 2 DESC
  LIMIT 12;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_motivos_perda(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) dashboard_leads_urgentes v2 — mantém as colunas atuais (compatível com o
--    Painel do Gestor) e ADICIONA: total_count (total real, além do LIMIT) e
--    distribuido (separa "na fila de distribuição" de "distribuído sem contato").
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_leads_urgentes(uuid, int);
CREATE OR REPLACE FUNCTION public.dashboard_leads_urgentes(
  _corretor uuid DEFAULT NULL,
  _min_minutos int DEFAULT 30
)
RETURNS TABLE(
  lead_id uuid,
  nome text,
  telefone text,
  corretor_id uuid,
  corretor_nome text,
  status lead_status,
  minutos_parado int,
  distribuido boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  SELECT l.id, l.nome, l.telefone, l.corretor_id,
         COALESCE(p.nome,'—')::text,
         l.status,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))::int / 60),
         (l.corretor_id IS NOT NULL),
         count(*) OVER ()
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.corretor_id
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.status IN ('novo','aguardando_atendimento')
    AND EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at))) / 60 >= _min_minutos
    AND (_scope IS NULL OR l.corretor_id = _scope)
  ORDER BY COALESCE(l.data_distribuicao, l.created_at) ASC
  LIMIT 50;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_leads_urgentes(uuid, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) NOVA dashboard_receita — VGV, vendas, ticket médio e comissão (calculada
--    dos percentuais registrados na própria venda, sem depender do schema da
--    tabela comissoes), com período anterior p/ deltas, e meta vs realizado do
--    MÊS CORRENTE (fuso America/Sao_Paulo) a partir da tabela metas.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_receita(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_receita(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
  _pdi date; _pdf date;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _mes_ini date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  _periodo jsonb; _prev jsonb := NULL; _meta jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  SELECT jsonb_build_object(
    'vendas',            count(*),
    'vgv',               COALESCE(sum(valor_venda), 0),
    'ticket_medio',      COALESCE(round(avg(valor_venda), 2), 0),
    'comissao_prevista', COALESCE(sum(round(valor_venda * percentual_comissao / 100, 2)), 0),
    'comissao_recebida', COALESCE(sum(round(valor_venda * percentual_comissao / 100, 2))
                           FILTER (WHERE status_recebimento = 'recebido'), 0)
  ) INTO _periodo
  FROM public.vendas
  WHERE distrato = false
    AND (_di_date IS NULL OR data_assinatura >= _di_date)
    AND (_df_date IS NULL OR data_assinatura <= _df_date)
    AND (_scope IS NULL OR corretor_id = _scope);

  IF _di_date IS NOT NULL AND _df_date IS NOT NULL THEN
    _pdf := _di_date - 1;
    _pdi := _pdf - (_df_date - _di_date);
    SELECT jsonb_build_object(
      'vendas',            count(*),
      'vgv',               COALESCE(sum(valor_venda), 0),
      'ticket_medio',      COALESCE(round(avg(valor_venda), 2), 0),
      'comissao_prevista', COALESCE(sum(round(valor_venda * percentual_comissao / 100, 2)), 0),
      'comissao_recebida', COALESCE(sum(round(valor_venda * percentual_comissao / 100, 2))
                             FILTER (WHERE status_recebimento = 'recebido'), 0)
    ) INTO _prev
    FROM public.vendas
    WHERE distrato = false
      AND data_assinatura BETWEEN _pdi AND _pdf
      AND (_scope IS NULL OR corretor_id = _scope);
  END IF;

  -- Meta vs realizado do MÊS CORRENTE (ritual comercial), independente do
  -- filtro de período. Metas somadas no nível corretor (linhas com corretor).
  SELECT jsonb_build_object(
    'mes',                extract(month FROM _mes_ini)::int,
    'ano',                extract(year FROM _mes_ini)::int,
    'meta_gmv',           COALESCE(sum(m.meta_gmv), 0),
    'meta_vendas',        COALESCE(sum(m.meta_vendas), 0),
    'meta_visitas',       COALESCE(sum(m.meta_visitas), 0),
    'meta_leads',         COALESCE(sum(m.meta_leads_atendidos), 0),
    'realizado_gmv',      (SELECT COALESCE(sum(v.valor_venda), 0) FROM public.vendas v
                            WHERE v.distrato = false AND v.data_assinatura >= _mes_ini AND v.data_assinatura <= _hoje
                              AND (_scope IS NULL OR v.corretor_id = _scope)),
    'realizado_vendas',   (SELECT count(*) FROM public.vendas v
                            WHERE v.distrato = false AND v.data_assinatura >= _mes_ini AND v.data_assinatura <= _hoje
                              AND (_scope IS NULL OR v.corretor_id = _scope)),
    'realizado_visitas',  (SELECT count(*) FROM public.lead_status_transitions t
                            WHERE t.para_status = 'visita_realizada'
                              AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _mes_ini
                              AND (_scope IS NULL OR t.corretor_id = _scope)),
    'realizado_leads',    (SELECT count(DISTINCT t.lead_id) FROM public.lead_status_transitions t
                            WHERE t.para_status = 'em_atendimento'
                              AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _mes_ini
                              AND (_scope IS NULL OR t.corretor_id = _scope))
  ) INTO _meta
  FROM public.metas m
  WHERE m.mes = extract(month FROM _mes_ini)::int
    AND m.ano = extract(year FROM _mes_ini)::int
    AND m.corretor_id IS NOT NULL
    AND (_scope IS NULL OR m.corretor_id = _scope);

  RETURN jsonb_build_object('periodo', _periodo, 'prev', _prev, 'meta', _meta);
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_receita(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) NOVA dashboard_origem — coorte de leads criados no período: leads, vendas
--    e conversão por ORIGEM e por CAMPANHA (utm_campaign, fallback campanha;
--    top 10). "Venda" = tem venda sem distrato OU status contrato_fechado
--    (cobre legado importado sem registro em vendas).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_origem(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.dashboard_origem(
  _di timestamptz DEFAULT NULL,
  _df timestamptz DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(nivel text, chave text, leads int, vendas int, conv_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT l.id,
           l.origem::text AS origem,
           COALESCE(NULLIF(trim(l.utm_campaign), ''), NULLIF(trim(l.campanha), '')) AS camp,
           (l.status = 'contrato_fechado'
             OR EXISTS (SELECT 1 FROM public.vendas v
                         WHERE v.lead_id = l.id AND v.distrato = false)) AS vendeu
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false
      AND (_di IS NULL OR l.created_at >= _di)
      AND (_df IS NULL OR l.created_at < _df)
      AND (_scope IS NULL OR l.corretor_id = _scope)
  ),
  por_origem AS (
    SELECT 'origem'::text AS nivel, COALESCE(b.origem, 'desconhecida') AS chave,
           count(*)::int AS leads, count(*) FILTER (WHERE b.vendeu)::int AS vendas
    FROM base b GROUP BY 2
  ),
  por_campanha AS (
    SELECT 'campanha'::text AS nivel, b.camp AS chave,
           count(*)::int AS leads, count(*) FILTER (WHERE b.vendeu)::int AS vendas
    FROM base b
    WHERE b.camp IS NOT NULL
    GROUP BY 2
    ORDER BY 3 DESC
    LIMIT 10
  )
  SELECT u.nivel, u.chave, u.leads, u.vendas,
         CASE WHEN u.leads > 0 THEN round((u.vendas::numeric / u.leads) * 100, 1) ELSE 0 END
  FROM (SELECT * FROM por_origem UNION ALL SELECT * FROM por_campanha) u
  ORDER BY u.nivel, u.leads DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_origem(timestamptz, timestamptz, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) Garantias: reaplica funções de velocidade que o dashboard passa a usar
--    (podem não ter sido aplicadas em produção). Definições idênticas às
--    migrations 20260629160000 e 20260616095924.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tempo_primeira_resposta(date, date, uuid);
CREATE OR REPLACE FUNCTION public.tempo_primeira_resposta(
  _di date,
  _df date,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE (
  corretor_id uuid,
  leads_no_periodo integer,
  leads_respondidos integer,
  tempo_medio_min integer,
  tempo_mediana_min integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin')
                      OR public.has_role(_caller,'gestor')
                      OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH leads_periodo AS (
    SELECT l.id, l.corretor_id, l.created_at
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.created_at::date BETWEEN _di AND _df
      AND (_scope IS NULL OR l.corretor_id = _scope)
  ),
  primeira_resp AS (
    SELECT lp.corretor_id,
           EXTRACT(EPOCH FROM (fr.primeira - lp.created_at)) / 60 AS resp_min
    FROM leads_periodo lp
    JOIN LATERAL (
      SELECT MIN(i.ocorreu_em) AS primeira
      FROM public.interacoes i
      WHERE i.lead_id = lp.id
        AND i.direcao = 'saida'
        AND i.deleted_at IS NULL
        AND i.ocorreu_em >= lp.created_at
    ) fr ON TRUE
    WHERE fr.primeira IS NOT NULL
  ),
  counts AS (
    SELECT lp.corretor_id, COUNT(*)::int AS leads_no_periodo
    FROM leads_periodo lp
    GROUP BY lp.corretor_id
  )
  SELECT c.corretor_id,
         c.leads_no_periodo,
         COUNT(pr.resp_min)::int AS leads_respondidos,
         COALESCE(ROUND(AVG(pr.resp_min)), 0)::int AS tempo_medio_min,
         COALESCE(
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY pr.resp_min)),
           0
         )::int AS tempo_mediana_min
  FROM counts c
  LEFT JOIN primeira_resp pr ON pr.corretor_id = c.corretor_id
  GROUP BY c.corretor_id, c.leads_no_periodo;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tempo_primeira_resposta(date, date, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.rel_tempo_medio_por_etapa(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.rel_tempo_medio_por_etapa(_di timestamptz, _df timestamptz, _corretor uuid DEFAULT NULL)
RETURNS TABLE (etapa text, media_horas numeric, p50_horas numeric, n integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH t AS (
    SELECT lst.lead_id, lst.de_status::text AS etapa, lst.created_at,
           LAG(lst.created_at) OVER (PARTITION BY lst.lead_id ORDER BY lst.created_at) AS anterior
    FROM public.lead_status_transitions lst
    WHERE (_di IS NULL OR lst.created_at >= _di)
      AND (_df IS NULL OR lst.created_at < _df)
      AND (_scope IS NULL OR lst.corretor_id = _scope)
  ),
  diffs AS (
    SELECT t.etapa, EXTRACT(EPOCH FROM (t.created_at - t.anterior))/3600.0 AS horas
    FROM t WHERE t.anterior IS NOT NULL AND t.etapa IS NOT NULL
  )
  SELECT d.etapa,
         round(avg(d.horas)::numeric, 2),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY d.horas))::numeric, 2),
         count(*)::int
  FROM diffs d
  GROUP BY d.etapa
  ORDER BY 2 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rel_tempo_medio_por_etapa(timestamptz, timestamptz, uuid) TO authenticated;
