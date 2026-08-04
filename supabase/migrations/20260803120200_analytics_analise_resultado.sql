-- Resultado da análise de crédito (parte 3/3): as funções analíticas que
-- enumeram status um a um.
--
-- Por que isto é obrigatório e não cosmético: dashboard_funil e dashboard_kpis
-- montam os degraus do funil com `status IN (...)` explícito. Sem incluir os
-- valores novos, um lead que fosse marcado como APROVADO desapareceria de
-- "Em atendimento", "Agendados", "Visitas" e "Análise crédito" ao mesmo tempo
-- — a tela mostraria o funil encolhendo enquanto a operação avança. Errado em
-- silêncio é pior que quebrado.

-- ---------------------------------------------------------------------------
-- 1. Funil cumulativo — os dois resultados contam como "passou pela análise"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _df timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _corretor uuid DEFAULT NULL::uuid,
  _campo_data text DEFAULT 'criacao'::text
)
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
  -- analise_aprovada/analise_reprovada passaram pela análise: entram em TODOS
  -- os degraus onde analise_credito entra.
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
    ('Em atendimento', 2, (SELECT count(*)::int FROM base WHERE status IN ('aguardando_retorno','em_atendimento','qualificado','agendado','visita_realizada','proposta_enviada','analise_credito','analise_aprovada','analise_reprovada','contrato_fechado','pos_venda'))),
    ('Agendados', 3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','proposta_enviada','analise_credito','analise_aprovada','analise_reprovada','contrato_fechado','pos_venda'))),
    ('Visitas', 4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','proposta_enviada','analise_credito','analise_aprovada','analise_reprovada','contrato_fechado','pos_venda'))),
    ('Análise crédito', 5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','analise_aprovada','analise_reprovada','contrato_fechado','pos_venda'))),
    -- Degrau novo entre a análise e a venda: o que a gestão não conseguia ver.
    ('Crédito aprovado', 6, (SELECT count(*)::int FROM base WHERE status IN ('analise_aprovada','contrato_fechado','pos_venda'))),
    ('Fechados', 7, (SELECT count(*)::int FROM base WHERE status IN ('contrato_fechado','pos_venda')))
  ) AS t(etapa, ordem, quantidade);
END;
$function$;

COMMENT ON FUNCTION public.dashboard_funil(timestamptz, timestamptz, uuid, text) IS
  'Funil cumulativo por etapa (cada degrau conta quem está nele ou já passou). Ganhou o degrau "Crédito aprovado" entre a análise e a venda. Reprovado conta como "passou pela análise" mas não como aprovado.';

-- ---------------------------------------------------------------------------
-- 2. KPIs — contagem por status ganha os dois resultados
-- ---------------------------------------------------------------------------
-- Corpo copiado da definição vigente (20260719130000_kpis_consistencia.sql):
-- muda SÓ o jsonb do `_pipeline`, ganhando dois contadores. Preservados
-- textualmente: o pipeline como FOTO da carteira (sem filtro de data — só
-- `periodo`/`prev` recortam por data), o cálculo de `prev` por deslocamento da
-- janela, e o retorno {pipeline, periodo, prev}.
--
-- 'em_aberto' e 'sem_corretor' já usam NOT IN dos terminais, então aprovada e
-- reprovada entram sozinhas na conta de leads em aberto — que é o correto:
-- nenhuma das duas é desfecho, o negócio segue vivo.
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
    -- Resultado da analise: o que a gestao nao conseguia ver sem abrir
    -- lead por lead. Ambos seguem contando em 'em_aberto' (nao sao desfecho).
    'analise_aprovada',      count(*) FILTER (WHERE status = 'analise_aprovada'),
    'analise_reprovada',     count(*) FILTER (WHERE status = 'analise_reprovada'),
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

-- ---------------------------------------------------------------------------
-- 3. Radar de fechamento — crédito aprovado é o sinal mais forte do funil
-- ---------------------------------------------------------------------------
-- A tabela de etapas do fechamento_sinais_v1 mapeia status -> índice base de
-- probabilidade. 'analise_credito' vale 72. Aprovado entra acima de tudo (88):
-- é o negócio mais perto de assinar que existe na carteira.
-- Reprovado NÃO entra: sinal de fechamento com crédito negado é ruído — o lead
-- continua no funil, mas fora do radar de "vai fechar este mês".
CREATE OR REPLACE FUNCTION public.fechamento_sinais_v1(
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
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  WITH etapas_radar(status, indice_base, rotulo) AS (
    VALUES
      -- Credito aprovado: o negocio mais perto de assinar que existe na
      -- carteira. Reprovado NAO entra no radar de proposito (o lead segue
      -- no funil, mas nao e candidato a fechar o mes).
      ('analise_aprovada'::public.lead_status, 88, 'Credito aprovado'::text),
      ('analise_credito'::public.lead_status, 72, 'Em analise de credito'::text),
      ('proposta_enviada'::public.lead_status, 60, 'Proposta enviada'::text),
      ('visita_realizada'::public.lead_status, 48, 'Visita realizada'::text),
      ('agendado'::public.lead_status, 35, 'Visita agendada'::text),
      ('qualificado'::public.lead_status, 24, 'Qualificado'::text),
      ('aguardando_retorno'::public.lead_status, 16, 'Aguardando retorno'::text),
      ('em_atendimento'::public.lead_status, 14, 'Em atendimento'::text)
  ), entradas_coorte AS (
    -- Uma observacao por lead/etapa. A janela contem 365 dias completos de
    -- coortes, cada uma ja acompanhada durante todo o horizonte de 90 dias.
    SELECT
      t.lead_id,
      t.para_status AS status,
      min(t.created_at) AS entrada_em
    FROM public.lead_status_transitions AS t
    JOIN etapas_radar AS e ON e.status = t.para_status
    WHERE t.created_at >= now() - interval '455 days'
      AND t.created_at < now() - interval '90 days'
    GROUP BY t.lead_id, t.para_status
  ), entradas_maduras AS (
    -- Autoriza uma vez por lead/etapa, depois da deduplicacao do historico.
    SELECT e.*
    FROM entradas_coorte AS e
    JOIN public.leads AS historico ON historico.id = e.lead_id
    WHERE historico.deleted_at IS NULL
      AND public.pode_acessar_lead(_caller, historico.id)
  ), amostra_por_etapa AS (
    SELECT
      e.status,
      count(*)::integer AS amostra,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM public.vendas AS v
          WHERE v.lead_id = e.lead_id
            AND v.status_venda = 'aprovada'::public.status_venda
            AND v.aprovado_em >= e.entrada_em
            AND v.aprovado_em <= e.entrada_em + interval '90 days'
        )
      )::integer AS vendas_aprovadas
    FROM entradas_maduras AS e
    GROUP BY e.status
  ), leads_ativos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      e.indice_base,
      e.rotulo,
      COALESCE(a.amostra, 0) AS amostra,
      COALESCE(a.vendas_aprovadas, 0) AS vendas_aprovadas,
      COALESCE(d.pendentes, 0) AS documentos_pendentes
    FROM public.leads AS l
    JOIN etapas_radar AS e ON e.status = l.status
    LEFT JOIN amostra_por_etapa AS a ON a.status = l.status
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS pendentes
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS d ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND public.pode_acessar_lead(_caller, l.id)
  ), fatores AS (
    SELECT
      l.*,
      (
        CASE l.temperatura::text
          WHEN 'quente' THEN 15
          WHEN 'frio' THEN -12
          ELSE 0
        END
        + CASE
            WHEN l.ultima_interacao IS NULL THEN -10
            WHEN l.ultima_interacao >= now() - interval '2 days' THEN 10
            WHEN l.ultima_interacao < now() - interval '14 days' THEN -18
            WHEN l.ultima_interacao < now() - interval '7 days' THEN -8
            ELSE 0
          END
        + CASE
            WHEN l.proximo_followup >= now() THEN 5
            ELSE 0
          END
      )::integer AS ajuste_engajamento,
      array_remove(ARRAY[
        l.rotulo,
        CASE l.temperatura::text
          WHEN 'quente' THEN 'Temperatura quente'
          WHEN 'frio' THEN 'Temperatura fria'
          ELSE NULL
        END,
        CASE
          WHEN l.ultima_interacao IS NULL THEN 'Sem interacao registrada'
          WHEN l.ultima_interacao >= now() - interval '2 days' THEN 'Interacao nos ultimos 2 dias'
          WHEN l.ultima_interacao < now() - interval '14 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          WHEN l.ultima_interacao < now() - interval '7 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          ELSE NULL
        END,
        CASE
          WHEN l.proximo_followup >= now() THEN 'Follow-up programado'
          ELSE NULL
        END
      ], NULL)::text[] AS fatores
    FROM leads_ativos AS l
  ), calculados AS (
    SELECT
      f.*,
      CASE
        WHEN f.amostra >= 30 THEN LEAST(100, GREATEST(0, round(
          (100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0))
          + (f.ajuste_engajamento * 0.5)
        )::integer))
        ELSE LEAST(100, GREATEST(0, f.indice_base + f.ajuste_engajamento))
      END AS indice,
      CASE
        WHEN f.amostra >= 30 THEN 'historico_calibrado'
        ELSE 'heuristico'
      END AS metodo,
      CASE
        WHEN f.amostra >= 30
          THEN round(100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0), 1)
        ELSE NULL
      END AS taxa_historica_pct
    FROM fatores AS f
  ), ordenados AS (
    SELECT
      c.*,
      CASE
        WHEN c.indice >= 55 THEN 'alta'
        WHEN c.indice >= 30 THEN 'media'
        ELSE 'baixa'
      END AS nivel
    FROM calculados AS c
  ), visiveis AS (
    SELECT o.*
    FROM ordenados AS o
    ORDER BY o.indice DESC, o.ultima_interacao DESC NULLS LAST, o.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'nome', v.nome,
            'telefone', v.telefone,
            'status', v.status,
            'temperatura', v.temperatura,
            'ultima_interacao', v.ultima_interacao,
            'proximo_followup', v.proximo_followup,
            'projeto_nome', v.projeto_nome,
            'indice', v.indice,
            'nivel', v.nivel,
            'metodo', v.metodo,
            'taxa_historica_pct', v.taxa_historica_pct,
            'amostra_etapa', v.amostra,
            'vendas_aprovadas_etapa', v.vendas_aprovadas,
            'documentos_pendentes', v.documentos_pendentes,
            'fatores', to_jsonb(v.fatores)
          )
          ORDER BY v.indice DESC, v.ultima_interacao DESC NULLS LAST, v.id DESC
        )
        FROM visiveis AS v
      ),
      '[]'::jsonb
    ),
    'total_count', (SELECT count(*) FROM ordenados),
    'contagens', jsonb_build_object(
      'alta', (SELECT count(*) FROM ordenados WHERE nivel = 'alta'),
      'media', (SELECT count(*) FROM ordenados WHERE nivel = 'media'),
      'baixa', (SELECT count(*) FROM ordenados WHERE nivel = 'baixa')
    ),
    'limit', _take,
    'amostra_minima', 30,
    'janela_coorte_dias', 365,
    'horizonte_conversao_dias', 90,
    'indice_semantica', 'sinal_de_priorizacao_nao_probabilidade'
  )
  INTO _result;

  RETURN _result;
END;
$$;
