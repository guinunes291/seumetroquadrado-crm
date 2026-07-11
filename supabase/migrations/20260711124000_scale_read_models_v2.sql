-- Read models paginados para leads, pipeline e indicadores.
--
-- Todos os contratos deste arquivo sao aditivos, usam cursor keyset (sem
-- OFFSET) e falham fechados para contas pendentes/bloqueadas. As funcoes sao
-- SECURITY DEFINER somente para conseguirem aplicar o mesmo escopo central de
-- carteira sem depender de policies antigas; nenhuma delas ignora
-- pode_acessar_lead().

-- O indice parcial atende tanto a primeira pagina de uma etapa quanto as
-- paginas seguintes ordenadas por (created_at, id). O segundo indice evita que
-- filtros por corretor degenerem em varredura do pipeline inteiro.
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_cursor_v2
  ON public.leads (status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_owner_stage_cursor_v2
  ON public.leads (corretor_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

CREATE INDEX IF NOT EXISTS idx_leads_followup_open_v2
  ON public.leads (corretor_id, proximo_followup)
  WHERE deleted_at IS NULL
    AND na_lixeira = false
    AND proximo_followup IS NOT NULL
    AND status NOT IN ('contrato_fechado', 'pos_venda', 'perdido');

-- ---------------------------------------------------------------------------
-- 1) Busca global de leads: no maximo 50 itens, relevancia deterministica e
--    cursor (score, created_at, id). O cursor e opaco para a UI, mas continua
--    legivel/auditavel em JSON.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_search_v2(
  _query text DEFAULT NULL,
  _status public.lead_status DEFAULT NULL,
  _origem public.lead_origem DEFAULT NULL,
  _temperatura public.lead_temperatura DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _somente_sem_corretor boolean DEFAULT false,
  _na_lixeira boolean DEFAULT false,
  _periodo_inicio timestamptz DEFAULT NULL,
  _periodo_fim timestamptz DEFAULT NULL,
  _cursor jsonb DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _q text;
  _q_digits text;
  _q_pattern text;
  _q_digits_pattern text;
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _cursor_score integer;
  _cursor_created_at timestamptz;
  _cursor_id uuid;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF _periodo_inicio IS NOT NULL
     AND _periodo_fim IS NOT NULL
     AND _periodo_inicio >= _periodo_fim THEN
    RAISE EXCEPTION 'periodo_inicio deve ser anterior a periodo_fim'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_digits := regexp_replace(COALESCE(_query, ''), '\D', '', 'g');
  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';
  _q_digits_pattern := '%' || _q_digits || '%';

  IF _cursor IS NOT NULL THEN
    IF jsonb_typeof(_cursor) <> 'object'
       OR NOT (_cursor ? 'score')
       OR NOT (_cursor ? 'created_at')
       OR NOT (_cursor ? 'id') THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;

    BEGIN
      _cursor_score := (_cursor ->> 'score')::integer;
      _cursor_created_at := (_cursor ->> 'created_at')::timestamptz;
      _cursor_id := (_cursor ->> 'id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END;

    IF _cursor_score IS NULL OR _cursor_created_at IS NULL OR _cursor_id IS NULL THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH scored AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.status,
      l.origem,
      l.temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.proxima_acao,
      l.proximo_followup,
      l.ultima_interacao,
      l.created_at,
      l.updated_at,
      CASE
        WHEN _q = '' THEN 0
        WHEN lower(public.immutable_unaccent(l.nome)) = _q THEN 1000
        WHEN _q_digits <> ''
          AND regexp_replace(l.telefone, '\D', '', 'g') = _q_digits THEN 950
        WHEN strpos(lower(public.immutable_unaccent(l.nome)), _q) = 1 THEN 800
        WHEN strpos(l.search_text, _q) > 0 THEN 600
        WHEN _q_digits <> ''
          AND strpos(regexp_replace(l.telefone, '\D', '', 'g'), _q_digits) > 0 THEN 500
        ELSE 0
      END::integer AS relevance_score
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = COALESCE(_na_lixeira, false)
      AND (_status IS NULL OR l.status = _status)
      AND (_origem IS NULL OR l.origem = _origem)
      AND (_temperatura IS NULL OR l.temperatura = _temperatura)
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (NOT COALESCE(_somente_sem_corretor, false) OR l.corretor_id IS NULL)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_periodo_inicio IS NULL OR l.created_at >= _periodo_inicio)
      AND (_periodo_fim IS NULL OR l.created_at < _periodo_fim)
      AND (
        _q = ''
        OR l.search_text LIKE _q_pattern ESCAPE E'\\'
        OR (
          _q_digits <> ''
          AND l.search_text LIKE _q_digits_pattern
        )
      )
      AND public.pode_acessar_lead(_caller, l.id)
  ), after_cursor AS (
    SELECT s.*
    FROM scored AS s
    WHERE _cursor IS NULL
       OR (s.relevance_score, s.created_at, s.id)
          < (_cursor_score, _cursor_created_at, _cursor_id)
  ), page AS (
    SELECT a.*
    FROM after_cursor AS a
    ORDER BY a.relevance_score DESC, a.created_at DESC, a.id DESC
    LIMIT (_take + 1)
  ), visible AS (
    SELECT p.*
    FROM page AS p
    ORDER BY p.relevance_score DESC, p.created_at DESC, p.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'nome', v.nome,
            'email', v.email,
            'telefone', v.telefone,
            'status', v.status,
            'origem', v.origem,
            'temperatura', v.temperatura,
            'corretor_id', v.corretor_id,
            'projeto_id', v.projeto_id,
            'projeto_nome', v.projeto_nome,
            'proxima_acao', v.proxima_acao,
            'proximo_followup', v.proximo_followup,
            'ultima_interacao', v.ultima_interacao,
            'created_at', v.created_at,
            'updated_at', v.updated_at,
            'score', v.relevance_score
          )
          ORDER BY v.relevance_score DESC, v.created_at DESC, v.id DESC
        )
        FROM visible AS v
      ),
      '[]'::jsonb
    ),
    'has_more', (SELECT count(*) > _take FROM page),
    'next_cursor', CASE
      WHEN (SELECT count(*) > _take FROM page) THEN (
        SELECT jsonb_build_object(
          'score', v.relevance_score,
          'created_at', v.created_at,
          'id', v.id
        )
        FROM visible AS v
        ORDER BY v.relevance_score ASC, v.created_at ASC, v.id ASC
        LIMIT 1
      )
      ELSE NULL
    END,
    'limit', _take,
    'score_semantics', 'search_relevance'
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) TO authenticated;

COMMENT ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) IS 'Busca autorizada de leads com cursor keyset (score, created_at, id) e pagina maxima de 50; score e relevancia de busca, nao probabilidade de conversao.';

-- ---------------------------------------------------------------------------
-- 2) Snapshot compacto do pipeline. Retorna sempre uma linha por valor do enum,
--    inclusive etapas vazias, sem transferir os leads para o navegador.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_snapshot_v2(
  _query text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL
)
RETURNS TABLE(
  etapa public.lead_status,
  quantidade bigint,
  followups_vencidos bigint,
  sem_proxima_acao bigint,
  parados_ha_7_dias bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _q text := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_pattern text;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  RETURN QUERY
  WITH etapas AS (
    SELECT unnest(enum_range(NULL::public.lead_status)) AS etapa
  ), base AS (
    SELECT
      l.status,
      l.proximo_followup,
      l.proxima_acao,
      l.ultima_interacao,
      l.created_at
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_q = '' OR l.search_text LIKE _q_pattern ESCAPE E'\\')
      AND public.pode_acessar_lead(_caller, l.id)
  ), agregado AS (
    SELECT
      b.status AS etapa,
      count(*)::bigint AS quantidade,
      count(*) FILTER (
        WHERE b.proximo_followup IS NOT NULL
          AND b.proximo_followup < now()
          AND b.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS followups_vencidos,
      count(*) FILTER (
        WHERE NULLIF(btrim(b.proxima_acao), '') IS NULL
          AND b.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS sem_proxima_acao,
      count(*) FILTER (
        WHERE COALESCE(b.ultima_interacao, b.created_at) < now() - interval '7 days'
          AND b.status NOT IN ('novo', 'contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS parados_ha_7_dias
    FROM base AS b
    GROUP BY b.status
  )
  SELECT
    e.etapa,
    COALESCE(a.quantidade, 0::bigint),
    COALESCE(a.followups_vencidos, 0::bigint),
    COALESCE(a.sem_proxima_acao, 0::bigint),
    COALESCE(a.parados_ha_7_dias, 0::bigint)
  FROM etapas AS e
  LEFT JOIN agregado AS a ON a.etapa = e.etapa
  ORDER BY e.etapa;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_snapshot_v2(text, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_snapshot_v2(text, uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Cards de uma etapa: no maximo 20 itens por chamada e cursor estavel
--    (created_at, id). A primeira chamada usa cursor NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_stage_page_v2(
  _status public.lead_status,
  _query text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _cursor jsonb DEFAULT NULL,
  _limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _q text := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_pattern text;
  _take integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 20);
  _cursor_created_at timestamptz;
  _cursor_id uuid;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'status obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  IF _cursor IS NOT NULL THEN
    IF jsonb_typeof(_cursor) <> 'object'
       OR NOT (_cursor ? 'created_at')
       OR NOT (_cursor ? 'id') THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;

    BEGIN
      _cursor_created_at := (_cursor ->> 'created_at')::timestamptz;
      _cursor_id := (_cursor ->> 'id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END;

    IF _cursor_created_at IS NULL OR _cursor_id IS NULL THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH page AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.status,
      l.origem,
      l.temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.observacoes,
      l.proxima_acao,
      l.proximo_followup,
      l.ultima_interacao,
      l.data_distribuicao,
      l.tentativas_redistribuicao,
      l.via_webhook,
      l.created_at
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status = _status
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_q = '' OR l.search_text LIKE _q_pattern ESCAPE E'\\')
      AND (
        _cursor IS NULL
        OR (l.created_at, l.id) < (_cursor_created_at, _cursor_id)
      )
      AND public.pode_acessar_lead(_caller, l.id)
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT (_take + 1)
  ), visible AS (
    SELECT p.*
    FROM page AS p
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC, v.id DESC)
        FROM visible AS v
      ),
      '[]'::jsonb
    ),
    'has_more', (SELECT count(*) > _take FROM page),
    'next_cursor', CASE
      WHEN (SELECT count(*) > _take FROM page) THEN (
        SELECT jsonb_build_object('created_at', v.created_at, 'id', v.id)
        FROM visible AS v
        ORDER BY v.created_at ASC, v.id ASC
        LIMIT 1
      )
      ELSE NULL
    END,
    'limit', _take,
    'status', _status
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) TO authenticated;

COMMENT ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) IS 'Pagina de ate 20 cards de uma etapa, ordenada por (created_at, id) e restrita a carteira autorizada.';

-- ---------------------------------------------------------------------------
-- 4) Ranking compacto. A fonte e atividades_diarias: a migration de aprovacao
--    de vendas deve manter esse ledger somente a partir de vendas aprovadas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_periodo_v2(
  _inicio date,
  _fim date,
  _limit integer DEFAULT 50
)
RETURNS TABLE(
  posicao bigint,
  corretor_id uuid,
  nome text,
  pontuacao bigint,
  ligacoes bigint,
  whatsapps bigint,
  agendamentos bigint,
  visitas bigint,
  documentacoes bigint,
  vendas bigint,
  vgv numeric,
  leads bigint,
  alteracoes bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS papel
        WHERE papel.user_id = p.id
          AND papel.role = 'corretor'::public.app_role
      )
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_agregado AS (
    SELECT l.corretor_id, count(*)::bigint AS leads
    FROM public.leads AS l
    WHERE l.created_at >= (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND l.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND public.pode_acessar_lead(_caller, l.id)
    GROUP BY l.corretor_id
  ), transicoes_agregado AS (
    SELECT t.corretor_id, count(*)::bigint AS alteracoes
    FROM public.lead_status_transitions AS t
    WHERE t.created_at >= (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND t.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND public.pode_acessar_lead(_caller, t.lead_id)
    GROUP BY t.corretor_id
  ), agregado AS (
    SELECT
      e.id AS corretor_id,
      e.nome,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao,
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(max(la.leads), 0)::bigint AS leads,
      COALESCE(max(ta.alteracoes), 0)::bigint AS alteracoes
    FROM escopo AS e
    LEFT JOIN public.atividades_diarias AS a
      ON a.corretor_id = e.id
     AND a.dia BETWEEN _inicio AND _fim
    LEFT JOIN leads_agregado AS la ON la.corretor_id = e.id
    LEFT JOIN transicoes_agregado AS ta ON ta.corretor_id = e.id
    GROUP BY e.id, e.nome
  ), ranqueado AS (
    SELECT
      dense_rank() OVER (
        ORDER BY a.pontuacao DESC, a.vendas DESC, a.vgv DESC
      ) AS posicao,
      a.*
    FROM agregado AS a
  )
  SELECT
    r.posicao,
    r.corretor_id,
    r.nome,
    r.pontuacao,
    r.ligacoes,
    r.whatsapps,
    r.agendamentos,
    r.visitas,
    r.documentacoes,
    r.vendas,
    r.vgv,
    r.leads,
    r.alteracoes
  FROM ranqueado AS r
  ORDER BY r.posicao, r.corretor_id
  LIMIT _take;
END;
$$;

REVOKE ALL ON FUNCTION public.ranking_periodo_v2(date, date, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ranking_periodo_v2(date, date, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Metricas compactas do periodo, sem materializar eventos no cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.metricas_periodo_v2(
  _inicio date,
  _fim date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _inicio_ts timestamptz;
  _fim_exclusive timestamptz;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  _inicio_ts := _inicio::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _fim_exclusive := (_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  WITH escopo_corretores AS (
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_periodo AS (
    SELECT
      l.id,
      l.status,
      l.proxima_acao,
      l.proximo_followup
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.created_at >= _inicio_ts
      AND l.created_at < _fim_exclusive
      AND public.pode_acessar_lead(_caller, l.id)
  ), totais_leads AS (
    SELECT
      count(*)::bigint AS recebidos,
      count(*) FILTER (WHERE status = 'contrato_fechado')::bigint AS fechados,
      count(*) FILTER (WHERE status = 'perdido')::bigint AS perdidos,
      count(*) FILTER (
        WHERE status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
          AND NULLIF(btrim(proxima_acao), '') IS NULL
      )::bigint AS sem_proxima_acao,
      count(*) FILTER (
        WHERE status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
          AND proximo_followup IS NOT NULL
          AND proximo_followup < now()
      )::bigint AS followups_vencidos
    FROM leads_periodo
  ), totais_atividades AS (
    SELECT
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao
    FROM public.atividades_diarias AS a
    WHERE a.dia BETWEEN _inicio AND _fim
      AND EXISTS (
        SELECT 1 FROM escopo_corretores AS e WHERE e.id = a.corretor_id
      )
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _inicio, 'fim', _fim),
    'leads_recebidos', l.recebidos,
    'fechados', l.fechados,
    'perdidos', l.perdidos,
    'sem_proxima_acao', l.sem_proxima_acao,
    'followups_vencidos', l.followups_vencidos,
    'ligacoes', a.ligacoes,
    'whatsapps', a.whatsapps,
    'agendamentos', a.agendamentos,
    'visitas', a.visitas,
    'documentacoes', a.documentacoes,
    'vendas', a.vendas,
    'vgv', a.vgv,
    'pontuacao', a.pontuacao,
    'conversao_percentual', CASE
      WHEN l.recebidos = 0 THEN 0::numeric
      ELSE round((a.vendas::numeric / l.recebidos::numeric) * 100, 1)
    END
  )
  INTO _result
  FROM totais_leads AS l
  CROSS JOIN totais_atividades AS a;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.metricas_periodo_v2(date, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.metricas_periodo_v2(date, date)
  TO authenticated;
