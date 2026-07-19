-- =====================================================================
-- Auditoria 2026-07-19 — consistência dos KPIs confirmada pela suíte SQL
-- (tests/db/kpis-consistencia.test.ts e tests/db/jornada-lead-venda.test.ts).
--
-- PRINCÍPIO: a RLS/carteira é a autoridade de escopo — a mesma pergunta
-- tem que dar o mesmo número em qualquer RPC. Vendas = vendas APROVADAS.
-- Perda é fato histórico (lixeira não apaga). pos_venda é terminal.
--
--  1) ESCOPO DE GESTOR = EQUIPE. leads_status_counts_v2, dashboard_kpis,
--     dashboard_funil, dashboard_serie_diaria, dashboard_motivos_perda,
--     dashboard_atividade_periodo, leads_sla_pendentes e leads_com_sla
--     tratavam gestor como visão GLOBAL (via has_role), divergindo do
--     kanban (pipeline_snapshot_v3) e do RLS (pode_acessar_lead). Todas
--     passam a usar a MESMA régua do pipeline_snapshot_v3:
--       ve_carteira_completa(caller)  → admin/superintendente veem tudo;
--       corretores_do_gestor(caller)  → gestor vê carteira própria + equipe
--                                       (leads SEM corretor ficam de fora,
--                                       igual RLS);
--       corretor                      → só a própria carteira.
--     Nas contagens por transição (visitas/perdidos), a atribuição usa
--     COALESCE(transição.corretor_id, lead.corretor_id) — a perda continua
--     do corretor que perdeu mesmo se o lead foi redistribuído depois.
--  2) dashboard_atividade_periodo: 'vendas'/'vgv' contavam QUALQUER linha
--     de public.vendas sem distrato (pendente/rascunho inclusas). Passam a
--     contar apenas status_venda = 'aprovada' (mesmo número do
--     metricas_periodo_v2). O contador de 'perdidos' deixa de filtrar
--     na_lixeira: o fluxo padrão de perda (marcar_lead_perdido_v2 sem
--     elegível para repasse) manda o lead à lixeira e ele sumia da métrica
--     no instante em que era perdido. Perda é fato histórico.
--  3) dashboard_motivos_perda: idem — deixa de filtrar na_lixeira.
--  4) gestao_metricas: o bloco 'aderencia' não filtrava deleted_at — lead
--     soft-deletado contava como lead ativo da operação. Ganha o filtro
--     deleted_at IS NULL (único medidor que faltava).
--  5) dashboard_kpis: 'em_aberto' e 'sem_corretor' tratavam pos_venda
--     (status terminal, protegido pelo guard de fechamento) como lead em
--     aberto. Passam a excluir ('contrato_fechado','perdido','pos_venda').
--  6) dashboard_funil: 'Fechados' passa a incluir pos_venda (negócio
--     fechado que avançou não pode sumir da conversão final); os status
--     proposta_enviada (legado) e pos_venda passam a contar nas etapas
--     cumulativas anteriores pertinentes (pos_venda passou por
--     atendimento/agendado/visita/análise/fechado; proposta_enviada conta
--     até 'Visitas' — veio depois da visita, antes da análise).
--  7) leads_status_counts_v2: removida a exclusão de status 'novo' para
--     corretor — o kanban e o próprio RLS mostram o lead 'novo' da
--     carteira; a lista tinha que bater.
-- Idempotente (CREATE OR REPLACE; assinaturas preservadas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1)+(7) leads_status_counts_v2 — escopo carteira/equipe + corretor vê 'novo'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_status_counts_v2(_na_lixeira boolean DEFAULT false, _origem text DEFAULT NULL::text, _corretor text DEFAULT NULL::text, _temperatura text DEFAULT NULL::text, _periodo_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _periodo_end timestamp with time zone DEFAULT NULL::timestamp with time zone, _search text DEFAULT NULL::text, _search_digits text DEFAULT NULL::text, _contato text DEFAULT NULL::text)
 RETURNS TABLE(status text, quantidade bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean;
  _ve_tudo boolean;
  _equipe uuid[];
  _tz text := 'America/Sao_Paulo';
  _hoje0 timestamptz;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _is_gestor := public.has_role(_caller,'admin')
             OR public.has_role(_caller,'gestor')
             OR public.has_role(_caller,'superintendente');
  -- Mesma régua do pipeline_snapshot_v3/RLS: admin/superintendente veem
  -- tudo; gestor vê carteira própria + equipe (sem leads órfãos); corretor
  -- vê a própria carteira (INCLUSIVE status 'novo', igual kanban/RLS).
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  _hoje0 := date_trunc('day', now() AT TIME ZONE _tz) AT TIME ZONE _tz;

  RETURN QUERY
  WITH ultima_venda AS (
    SELECT DISTINCT ON (v.lead_id)
      v.lead_id,
      v.data_assinatura
    FROM public.vendas v
    WHERE v.lead_id IS NOT NULL
      AND COALESCE(v.distrato, false) = false
    ORDER BY v.lead_id, v.data_assinatura DESC NULLS LAST, v.created_at DESC
  ),
  base AS (
    SELECT
      l.status::text AS status,
      l.ultima_interacao,
      EXISTS (
        SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = l.id
          AND t.tipo = 'follow_up'
          AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL
          AND (_is_gestor OR t.corretor_id = _caller)
      ) AS tem_followup,
      CASE
        WHEN l.status::text = 'contrato_fechado' THEN COALESCE(uv.data_assinatura::timestamptz, l.created_at)
        ELSE l.created_at
      END AS data_filtro
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (
        _corretor IS NULL OR _corretor = 'all'
        OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
        OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor)
      )
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (
        _search IS NULL OR _search = ''
        OR l.search_text ILIKE '%'||_search||'%'
        OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%')
      )
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
  ),
  com_contato AS (
    SELECT * FROM base b
    WHERE
      CASE COALESCE(_contato, 'all')
        WHEN 'all' THEN true
        WHEN 'contato_ontem' THEN
          b.ultima_interacao >= _hoje0 - interval '1 day' AND b.ultima_interacao < _hoje0
        WHEN 'contato_7d' THEN b.ultima_interacao >= now() - interval '7 days'
        WHEN 'contato_30d' THEN b.ultima_interacao >= now() - interval '30 days'
        WHEN 'com_followup' THEN b.tem_followup
        WHEN 'sem_contato_5d' THEN
          (b.ultima_interacao IS NULL OR b.ultima_interacao < now() - interval '5 days')
          AND b.status NOT IN ('contrato_fechado','pos_venda','perdido')
        ELSE true
      END
  ),
  filtrado AS (
    SELECT c.status
    FROM com_contato c
    WHERE (_periodo_start IS NULL OR c.data_filtro >= _periodo_start)
      AND (_periodo_end IS NULL OR c.data_filtro <= _periodo_end)
  )
  SELECT f.status, count(*) AS quantidade
  FROM filtrado f
  GROUP BY f.status
  UNION ALL
  SELECT '__total__', count(*) FROM filtrado;
END;
$function$;

-- ---------------------------------------------------------------------
-- (1)+(2) dashboard_atividade_periodo — escopo carteira/equipe; vendas
-- só aprovadas; 'perdidos' sem filtro de lixeira (perda é histórica)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_atividade_periodo(_di timestamp with time zone, _df timestamp with time zone, _scope uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
  _use_evento boolean := (_campo_data = 'evento');
  _caller uuid := auth.uid();
  -- Sem caller (contexto de serviço, sem JWT) mantém o comportamento
  -- histórico: sem recorte de carteira, o _scope manda sozinho.
  _sem_caller boolean := (_caller IS NULL);
  _ve_tudo boolean := public.ve_carteira_completa(_caller);
  _equipe uuid[] := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  _leads_novos int;
  _agendamentos int;
  _visitas int;
  _perdidos int;
  _vendas int;
  _vgv numeric;
BEGIN
  -- Leads: só têm data de criação; ambos os modos usam created_at.
  SELECT count(*)::int INTO _leads_novos
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Agendamentos: 'evento' usa data_inicio; 'criacao' usa created_at.
  IF _use_evento THEN
    SELECT count(*)::int INTO _agendamentos
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (_di IS NULL OR data_inicio >= _di) AND (_df IS NULL OR data_inicio < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));
  ELSE
    SELECT count(*)::int INTO _agendamentos
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));
  END IF;

  -- Visitas via transições: a linha de transição JÁ é o registro
  -- do evento; created_at coincide com o momento do registro.
  SELECT count(*)::int INTO _visitas
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'visita_realizada'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
    AND (_sem_caller OR _ve_tudo
         OR COALESCE(t.corretor_id, l.corretor_id) = _caller
         OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe));

  -- Perdidos: perda é fato histórico — o lead que foi para a lixeira
  -- depois de perdido (fluxo padrão do marcar_lead_perdido_v2 sem
  -- elegível para repasse) CONTINUA contando. Só soft-delete apaga.
  SELECT count(DISTINCT t.lead_id)::int INTO _perdidos
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'perdido'
    AND l.deleted_at IS NULL
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
    AND (_sem_caller OR _ve_tudo
         OR COALESCE(t.corretor_id, l.corretor_id) = _caller
         OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe));

  -- Vendas: SÓ vendas APROVADAS contam (pendente/rascunho ficam de fora),
  -- mantendo a exclusão de distrato — mesma régua do metricas_periodo_v2.
  -- 'evento' usa data_assinatura; 'criacao' (padrão) usa created_at.
  IF _use_evento THEN
    SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
    FROM public.vendas
    WHERE distrato = false
      AND status_venda = 'aprovada'
      AND (_di_date IS NULL OR data_assinatura >= _di_date)
      AND (_df_date IS NULL OR data_assinatura <= _df_date)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));
  ELSE
    SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
    FROM public.vendas
    WHERE distrato = false
      AND status_venda = 'aprovada'
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));
  END IF;

  RETURN jsonb_build_object(
    'leads_novos', _leads_novos,
    'agendamentos', _agendamentos,
    'visitas', _visitas,
    'perdidos', _perdidos,
    'vendas', _vendas,
    'vgv', _vgv
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- (1)+(5) dashboard_kpis — escopo carteira/equipe; pos_venda é terminal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_kpis(_di timestamp with time zone DEFAULT NULL::timestamp with time zone, _df timestamp with time zone DEFAULT NULL::timestamp with time zone, _corretor uuid DEFAULT NULL::uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
  _pipeline jsonb;
  _periodo jsonb;
  _prev jsonb := NULL;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  -- Mesma régua do pipeline_snapshot_v3: gestor vê carteira + equipe.
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  SELECT jsonb_build_object(
    'novo',                  count(*) FILTER (WHERE status = 'novo'),
    'aguardando_atendimento',count(*) FILTER (WHERE status = 'aguardando_atendimento'),
    'aguardando_retorno',    count(*) FILTER (WHERE status = 'aguardando_retorno'),
    'em_atendimento',        count(*) FILTER (WHERE status = 'em_atendimento'),
    'agendado',              count(*) FILTER (WHERE status = 'agendado'),
    'visita_realizada',      count(*) FILTER (WHERE status = 'visita_realizada'),
    'analise_credito',       count(*) FILTER (WHERE status = 'analise_credito'),
    -- pos_venda é terminal (guard de fechamento): não é lead em aberto.
    'em_aberto',             count(*) FILTER (WHERE status NOT IN ('contrato_fechado','perdido','pos_venda')),
    'sem_corretor',          count(*) FILTER (WHERE corretor_id IS NULL AND status NOT IN ('contrato_fechado','perdido','pos_venda'))
  ) INTO _pipeline
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  _periodo := public.dashboard_atividade_periodo(_di, _df, _scope, _campo_data);

  IF _di IS NOT NULL AND _df IS NOT NULL THEN
    _prev := public.dashboard_atividade_periodo(_di - (_df - _di), _di, _scope, _campo_data);
  END IF;

  RETURN jsonb_build_object('pipeline', _pipeline, 'periodo', _periodo, 'prev', _prev);
END;
$function$;

-- ---------------------------------------------------------------------
-- (1)+(6) dashboard_funil — escopo carteira/equipe; funil cumulativo não
-- perde proposta_enviada (legado) nem pos_venda; Fechados inclui pos_venda
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_funil(_di timestamp with time zone DEFAULT NULL::timestamp with time zone, _df timestamp with time zone DEFAULT NULL::timestamp with time zone, _corretor uuid DEFAULT NULL::uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS TABLE(etapa text, ordem integer, quantidade integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  PERFORM _campo_data;  -- reservado para uso futuro; leads só têm created_at

  -- Funil cumulativo: cada etapa conta quem está nela OU já passou por ela.
  -- pos_venda passou por atendimento/agendado/visita/análise/fechado;
  -- proposta_enviada (legado) veio depois da visita e antes da análise.
  RETURN QUERY
  WITH base AS (
    SELECT id, status FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (_di IS NULL OR created_at >= _di)
      AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
  )
  SELECT * FROM (VALUES
    ('Novos', 1, (SELECT count(*)::int FROM base)),
    ('Em atendimento', 2, (SELECT count(*)::int FROM base WHERE status IN ('aguardando_retorno','em_atendimento','qualificado','agendado','visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda'))),
    ('Agendados', 3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda'))),
    ('Visitas', 4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda'))),
    ('Análise crédito', 5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','contrato_fechado','pos_venda'))),
    ('Fechados', 6, (SELECT count(*)::int FROM base WHERE status IN ('contrato_fechado','pos_venda')))
  ) AS t(etapa, ordem, quantidade);
END;
$function$;

-- ---------------------------------------------------------------------
-- (1) dashboard_serie_diaria — escopo carteira/equipe (buckets em SP intactos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(_di timestamp with time zone DEFAULT NULL::timestamp with time zone, _df timestamp with time zone DEFAULT NULL::timestamp with time zone, _corretor uuid DEFAULT NULL::uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS TABLE(dia date, leads integer, agendamentos integer, visitas integer, vendas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
  _use_evento boolean := (_campo_data = 'evento');
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d1 date;
  _d2 date;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

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
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  ),
  ag AS (
    SELECT (
      CASE WHEN _use_evento THEN (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
           ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
    ) AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND (
        CASE WHEN _use_evento THEN (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
             ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
      ) BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  ),
  vi AS (
    SELECT (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.lead_status_transitions t
    JOIN public.leads le ON le.id = t.lead_id
    WHERE t.para_status = 'visita_realizada'
      AND le.deleted_at IS NULL AND le.na_lixeira = false
      AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR COALESCE(t.corretor_id, le.corretor_id) = _scope)
      AND (_ve_tudo
           OR COALESCE(t.corretor_id, le.corretor_id) = _caller
           OR COALESCE(t.corretor_id, le.corretor_id) = ANY(_equipe))
    GROUP BY 1
  ),
  ve AS (
    SELECT (
      CASE WHEN _use_evento THEN data_assinatura
           ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
    ) AS d, count(*)::int AS n
    FROM public.vendas
    WHERE distrato = false
      AND (
        CASE WHEN _use_evento THEN data_assinatura
             ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date END
      ) BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(l.n,0),
         COALESCE(ag.n,0),
         COALESCE(vi.n,0),
         COALESCE(ve.n,0)
  FROM dias
  LEFT JOIN l  ON l.d  = dias.d
  LEFT JOIN ag ON ag.d = dias.d
  LEFT JOIN vi ON vi.d = dias.d
  LEFT JOIN ve ON ve.d = dias.d
  ORDER BY dias.d;
END;
$function$;

-- ---------------------------------------------------------------------
-- (1)+(3) dashboard_motivos_perda — escopo carteira/equipe (atribuição ao
-- corretor da transição de perda) e sem filtro de lixeira: perda é
-- fato histórico, a lixeira não apaga a métrica.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_motivos_perda(_di timestamp with time zone DEFAULT NULL::timestamp with time zone, _df timestamp with time zone DEFAULT NULL::timestamp with time zone, _corretor uuid DEFAULT NULL::uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS TABLE(motivo text, quantidade integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  PERFORM _campo_data;

  -- A perda pertence ao corretor que a registrou (transição para 'perdido'),
  -- mesmo que o lead tenha sido redistribuído/ido à lixeira depois —
  -- COALESCE(transição.corretor_id, lead.corretor_id), igual aos contadores
  -- de perdidos/visitas do dashboard_atividade_periodo.
  RETURN QUERY
  WITH perdas AS (
    SELECT
      COALESCE(
        NULLIF(trim(l.motivo_perda_categoria), ''),
        NULLIF(trim(l.motivo_perdido), ''),
        'nao_informado'
      ) AS m,
      COALESCE(t.quando, l.updated_at) AS quando
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT t0.created_at AS quando, t0.corretor_id
      FROM public.lead_status_transitions t0
      WHERE t0.lead_id = l.id AND t0.para_status = 'perdido'
      ORDER BY t0.created_at DESC
      LIMIT 1
    ) t ON true
    WHERE l.deleted_at IS NULL
      AND l.status = 'perdido'
      AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
      AND (_ve_tudo
           OR COALESCE(t.corretor_id, l.corretor_id) = _caller
           OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe))
  )
  SELECT p.m, count(*)::int
  FROM perdas p
  WHERE (_di IS NULL OR p.quando >= _di)
    AND (_df IS NULL OR p.quando < _df)
  GROUP BY p.m
  ORDER BY 2 DESC
  LIMIT 12;
END;
$function$;

-- ---------------------------------------------------------------------
-- (1) leads_sla_pendentes — escopo carteira/equipe
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_sla_pendentes(_corretor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(lead_id uuid, corretor_id uuid, nome text, telefone text, status text, sla_minutos integer, minutos_decorridos integer, sla_status text, temperatura_calc lead_temperatura)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  -- Mesma régua do pipeline_snapshot_v3/RLS: gestor vê carteira + equipe
  -- (leads sem corretor ficam de fora, igual RLS).
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  SELECT l.id,
         l.corretor_id,
         l.nome,
         l.telefone,
         l.status::text,
         sla.efetivo AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > sla.efetivo THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (sla.efetivo * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
           WHEN l.created_at > now() - interval '48 hours' AND l.ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           WHEN l.created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN l.via_webhook AND dc.timeout_minutos IS NOT NULL
        THEN LEAST(dc.timeout_minutos, COALESCE(dc.sla_minutos, 30))
      ELSE COALESCE(dc.sla_minutos, 30)
    END AS efetivo
  ) sla
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status IN ('novo','aguardando_atendimento')
    AND (_scope IS NULL OR l.corretor_id = _scope)
    AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe));
END;
$function$;

-- ---------------------------------------------------------------------
-- (1) leads_com_sla — escopo carteira/equipe
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_com_sla(_corretor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(lead_id uuid, corretor_id uuid, nome text, telefone text, status text, sla_minutos integer, minutos_decorridos integer, sla_status text, temperatura_calc lead_temperatura)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  SELECT l.id,
         l.corretor_id,
         l.nome,
         l.telefone,
         l.status::text,
         sla.efetivo AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN l.status NOT IN ('novo','aguardando_atendimento') THEN 'ok'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > sla.efetivo THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (sla.efetivo * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
           WHEN l.created_at > now() - interval '48 hours' AND l.ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           WHEN l.created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN l.via_webhook AND dc.timeout_minutos IS NOT NULL
        THEN LEAST(dc.timeout_minutos, COALESCE(dc.sla_minutos, 30))
      ELSE COALESCE(dc.sla_minutos, 30)
    END AS efetivo
  ) sla
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND (_scope IS NULL OR l.corretor_id = _scope)
    AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe));
END;
$function$;

-- ---------------------------------------------------------------------
-- (4) gestao_metricas — 'aderencia' ganha o filtro deleted_at IS NULL
-- (SECURITY INVOKER: o escopo continua sendo o RLS do chamador)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_metricas(_periodo_start timestamp with time zone, _periodo_end timestamp with time zone, _campo_data text DEFAULT 'criacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _use_evento boolean := (_campo_data = 'evento');
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'atividade', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'autor_id', a.autor_id,
          'ligacao', a.ligacao,
          'whatsapp', a.whatsapp,
          'visita', a.visita,
          'outras', a.outras,
          'total', a.total
        )
        ORDER BY a.total DESC
      )
      FROM (
        SELECT
          i.autor_id,
          count(*) FILTER (WHERE i.tipo = 'ligacao')  AS ligacao,
          count(*) FILTER (WHERE i.tipo = 'whatsapp') AS whatsapp,
          count(*) FILTER (WHERE i.tipo = 'visita')   AS visita,
          count(*) FILTER (WHERE i.tipo NOT IN ('ligacao', 'whatsapp', 'visita')) AS outras,
          count(*) AS total
        FROM public.interacoes i
        WHERE i.deleted_at IS NULL
          AND (
            (NOT _use_evento AND i.created_at >= _periodo_start AND i.created_at <= _periodo_end)
            OR (_use_evento AND i.ocorreu_em >= _periodo_start AND i.ocorreu_em <= _periodo_end)
          )
        GROUP BY i.autor_id
      ) a
    ), '[]'::jsonb),
    'aderencia', (
      SELECT jsonb_build_object(
        'total', count(*),
        'sem_corretor', count(*) FILTER (WHERE l.corretor_id IS NULL),
        'sem_email', count(*) FILTER (WHERE l.email IS NULL),
        'sem_renda', count(*) FILTER (WHERE l.renda_informada IS NULL)
      )
      FROM public.leads l
      WHERE l.deleted_at IS NULL      -- lead soft-deletado não é lead ativo
        AND l.na_lixeira = false
        AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
    )
  ) INTO _result;
  RETURN _result;
END;
$function$;
