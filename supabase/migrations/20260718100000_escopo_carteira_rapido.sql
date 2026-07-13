-- Incidente de lentidão (13/07): /pipeline e /hoje "muito lentos" em produção.
-- Causa raiz: o gate de carteira roda POR LINHA. A policy de SELECT de leads
-- chama pode_acessar_lead(auth.uid(), id) para cada linha lida, e essa função
-- (SECURITY DEFINER, nunca inlinada pelo planner) refaz por chamada: lookup em
-- profiles (is_active_member), até 3 EXISTS em user_roles (has_role), um
-- EXISTS de volta em leads e o join de equipes do gestor. As policies de
-- tarefas/agendamentos repetem o padrão via lead_id. As RPCs do Kanban
-- (pipeline_snapshot_v3 e pipeline_stage_page_v2, uma chamada POR COLUNA)
-- aplicam a MESMA função linha a linha. Em varreduras org-wide isso multiplica
-- dezenas de milhares de subconsultas por carregamento de tela.
--
-- Correção: MESMA regra de acesso, avaliada UMA vez por query.
--  * Policies de SELECT reescritas no padrão InitPlan: as partes que não
--    dependem da linha (papel, conta ativa, equipe do gestor) viram
--    subconsultas escalares — o Postgres as executa uma única vez e o teste
--    por linha vira comparação/imersão em hash.
--  * RPCs do pipeline pré-computam o escopo em DECLARE.
--  * A visibilidade resultante é IDÊNTICA, caso a caso, à decomposição de
--    pode_acessar_lead/pode_acessar_corretor (documentado em cada bloco).
--    Nenhuma policy de INSERT/UPDATE/DELETE muda (operações de linha única).

-- ---------------------------------------------------------------------------
-- 1) Helpers de escopo (avaliados 1x por query via InitPlan)
-- ---------------------------------------------------------------------------

-- admin/superintendente ativos enxergam a carteira inteira — exatamente os
-- dois primeiros has_role() do OR de pode_acessar_lead.
CREATE OR REPLACE FUNCTION public.ve_carteira_completa(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'superintendente'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.ve_carteira_completa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ve_carteira_completa(uuid)
  TO authenticated, service_role;

-- Conjunto de corretores que um GESTOR enxerga — decomposição literal do
-- branch de gestor de pode_acessar_lead/pode_acessar_corretor:
--   has_role(gestor) AND corretor.equipe_id IS NOT NULL AND
--   (equipe do gestor = equipe do corretor OU corretor em equipe gerida).
-- Para quem não é gestor devolve conjunto vazio.
CREATE OR REPLACE FUNCTION public.corretores_do_gestor(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.id
  FROM public.profiles AS c
  WHERE public.has_role(_user_id, 'gestor'::public.app_role)
    AND c.equipe_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles AS g
        WHERE g.id = _user_id
          AND g.equipe_id IS NOT NULL
          AND g.equipe_id = c.equipe_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.equipes AS e
        WHERE e.id = c.equipe_id
          AND e.gestor_id = _user_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.corretores_do_gestor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corretores_do_gestor(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Policies de SELECT no padrão InitPlan — visibilidade idêntica
-- ---------------------------------------------------------------------------

-- leads: pode_acessar_lead(uid, id) re-lia a PRÓPRIA linha por id para então
-- testar (corretor_id = uid | admin/super | equipe do gestor). Aplicado à
-- própria linha, isso equivale aos predicados diretos abaixo. O AND externo de
-- is_active_member é preservado (dono de linha com conta inativa continua sem
-- acesso). Corretor sem papel algum mas dono da linha continua vendo (branch 1
-- do OR original não exigia has_role).
DROP POLICY IF EXISTS "leads_select_carteira" ON public.leads;
CREATE POLICY "leads_select_carteira"
  ON public.leads FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      corretor_id = (SELECT auth.uid())
      OR (SELECT public.ve_carteira_completa(auth.uid()))
      OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
    )
  );

-- tarefas/agendamentos: acesso continua vindo do LEAD (nunca do corretor
-- denormalizado da linha — regra pós-transferência preservada). O EXISTS por
-- linha permanece (precisa achar o lead), mas vira um lookup de PK com
-- parâmetros InitPlan em vez de 3 funções SECURITY DEFINER aninhadas. O RLS de
-- leads se aplica dentro do EXISTS e é o MESMO predicado — interseção idêntica.
-- Branch lead_id IS NULL espelha pode_acessar_corretor (corretor_id NOT NULL AND
-- (próprio | admin/super | equipe do gestor)).
DROP POLICY IF EXISTS "tarefas_select_carteira" ON public.tarefas;
CREATE POLICY "tarefas_select_carteira"
  ON public.tarefas FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      (
        lead_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.leads AS l
          WHERE l.id = lead_id
            AND (
              l.corretor_id = (SELECT auth.uid())
              OR (SELECT public.ve_carteira_completa(auth.uid()))
              OR l.corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
            )
        )
      )
      OR (
        lead_id IS NULL
        AND corretor_id IS NOT NULL
        AND (
          corretor_id = (SELECT auth.uid())
          OR (SELECT public.ve_carteira_completa(auth.uid()))
          OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "agendamentos_select_carteira" ON public.agendamentos;
CREATE POLICY "agendamentos_select_carteira"
  ON public.agendamentos FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      (
        lead_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.leads AS l
          WHERE l.id = lead_id
            AND (
              l.corretor_id = (SELECT auth.uid())
              OR (SELECT public.ve_carteira_completa(auth.uid()))
              OR l.corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
            )
        )
      )
      OR (
        lead_id IS NULL
        AND corretor_id IS NOT NULL
        AND (
          corretor_id = (SELECT auth.uid())
          OR (SELECT public.ve_carteira_completa(auth.uid()))
          OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) RPCs do Kanban com escopo pré-computado (1x por chamada)
-- ---------------------------------------------------------------------------

-- pipeline_snapshot_v3: corpo idêntico ao de 20260715100000, trocando apenas
-- o pode_acessar_lead(_caller, l.id) por predicados sobre o escopo declarado.
CREATE OR REPLACE FUNCTION public.pipeline_snapshot_v3(
  _query text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL
)
RETURNS TABLE(
  etapa public.lead_status,
  quantidade bigint,
  followups_vencidos bigint,
  sem_proxima_acao bigint,
  parados_ha_7_dias bigint,
  vgv numeric
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
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  RETURN QUERY
  WITH etapas AS (
    SELECT unnest(enum_range(NULL::public.lead_status)) AS etapa
  ), ultima_venda AS (
    SELECT DISTINCT ON (v.lead_id)
      v.lead_id,
      v.valor_venda
    FROM public.vendas v
    WHERE v.lead_id IS NOT NULL
      AND COALESCE(v.distrato, false) = false
    ORDER BY v.lead_id, v.data_assinatura DESC NULLS LAST, v.created_at DESC
  ), base AS (
    SELECT
      l.status,
      l.proximo_followup,
      l.proxima_acao,
      l.ultima_interacao,
      l.created_at,
      CASE
        WHEN l.status = 'contrato_fechado' THEN COALESCE(uv.valor_venda, p.preco_a_partir)
        ELSE p.preco_a_partir
      END AS valor_potencial
    FROM public.leads AS l
    LEFT JOIN public.projetos AS p ON p.id = l.projeto_id
    LEFT JOIN ultima_venda AS uv ON uv.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_q = '' OR l.search_text LIKE _q_pattern ESCAPE E'\\')
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
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
      )::bigint AS parados_ha_7_dias,
      COALESCE(sum(b.valor_potencial), 0)::numeric AS vgv
    FROM base AS b
    GROUP BY b.status
  )
  SELECT
    e.etapa,
    COALESCE(a.quantidade, 0::bigint),
    COALESCE(a.followups_vencidos, 0::bigint),
    COALESCE(a.sem_proxima_acao, 0::bigint),
    COALESCE(a.parados_ha_7_dias, 0::bigint),
    COALESCE(a.vgv, 0::numeric)
  FROM etapas AS e
  LEFT JOIN agregado AS a ON a.etapa = e.etapa
  ORDER BY e.etapa;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_snapshot_v3(text, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_snapshot_v3(text, uuid, uuid)
  TO authenticated;

-- pipeline_stage_page_v2: corpo idêntico ao de 20260711124000, mesma troca.
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
  _ve_tudo boolean;
  _equipe uuid[];
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

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

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
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
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

-- ---------------------------------------------------------------------------
-- 4) leads_sem_acao — guardrail da home no servidor
-- ---------------------------------------------------------------------------
-- O widget baixava TODAS as tarefas pendentes e TODOS os agendamentos futuros
-- da organização para descartar quase tudo no cliente. Esta RPC faz o mesmo
-- recorte (mesmos filtros, mesmo escopo por _corretores que o cliente passava
-- em .in("corretor_id", scopeIds)) com anti-joins indexados, devolvendo só os
-- candidatos. O ranqueamento (scoreLead) permanece no cliente — regra de
-- negócio intocada.
CREATE OR REPLACE FUNCTION public.leads_sem_acao(
  _corretores uuid[] DEFAULT NULL,
  _limit integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  nome text,
  telefone text,
  status text,
  temperatura public.lead_temperatura,
  proximo_followup timestamptz,
  ultima_interacao timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _take integer := LEAST(GREATEST(COALESCE(_limit, 60), 1), 100);
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  SELECT
    l.id,
    l.nome,
    l.telefone,
    l.status::text,
    l.temperatura,
    l.proximo_followup,
    l.ultima_interacao
  FROM public.leads AS l
  WHERE l.na_lixeira = false
    AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
    AND (_corretores IS NULL OR l.corretor_id = ANY(_corretores))
    AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
    AND (l.proximo_followup IS NULL OR l.proximo_followup <= now())
    AND NOT EXISTS (
      SELECT 1
      FROM public.tarefas AS t
      WHERE t.lead_id = l.id
        AND t.status IN ('pendente', 'em_andamento')
        AND (_corretores IS NULL OR t.corretor_id = ANY(_corretores))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.agendamentos AS a
      WHERE a.lead_id = l.id
        AND a.data_inicio >= now()
        AND a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')
        AND (_corretores IS NULL OR a.corretor_id = ANY(_corretores))
    )
  ORDER BY l.ultima_interacao ASC NULLS FIRST, l.created_at ASC
  LIMIT _take;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_sem_acao(uuid[], integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.leads_sem_acao(uuid[], integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Índices dos caminhos quentes (home + kanban)
-- ---------------------------------------------------------------------------

-- Página de coluna do Kanban: WHERE status = X + ativo, ORDER BY (created_at,
-- id) DESC — vira index-scan direto.
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_pagina
  ON public.leads (status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

-- Fila de quentes e leads_sem_acao: leads ativos ordenados por última
-- interação (mais negligenciado primeiro).
CREATE INDEX IF NOT EXISTS idx_leads_ativos_ultima_interacao
  ON public.leads (ultima_interacao ASC NULLS FIRST)
  WHERE na_lixeira = false
    AND status NOT IN ('perdido', 'contrato_fechado', 'pos_venda');

-- Anti-joins de leads_sem_acao.
CREATE INDEX IF NOT EXISTS idx_tarefas_lead_abertas
  ON public.tarefas (lead_id)
  WHERE lead_id IS NOT NULL AND status IN ('pendente', 'em_andamento');

CREATE INDEX IF NOT EXISTS idx_agendamentos_lead_futuro
  ON public.agendamentos (lead_id, data_inicio)
  WHERE lead_id IS NOT NULL;

-- Widgets do dia: tarefas pendentes por vencimento e agenda por data.
CREATE INDEX IF NOT EXISTS idx_tarefas_pendentes_vencimento
  ON public.tarefas (data_vencimento)
  WHERE status IN ('pendente', 'em_andamento');

CREATE INDEX IF NOT EXISTS idx_agendamentos_data_inicio
  ON public.agendamentos (data_inicio);

NOTIFY pgrst, 'reload schema';
