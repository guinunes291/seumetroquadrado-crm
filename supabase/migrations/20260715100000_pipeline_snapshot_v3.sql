-- pipeline_snapshot_v3 — o snapshot do Kanban ganha ECONOMIA por etapa:
-- VGV potencial (preço "a partir de" do projeto de interesse; na etapa Venda,
-- o valor real da venda). A % de conversão entre etapas é derivada NO CLIENTE
-- a partir das quantidades (funil acumulado por posição atual) — nenhum dado
-- novo é necessário para isso.
--
-- NOME NOVO (sem overload). O cliente consome via rpcWithFallback: sem esta
-- migration aplicada, o board usa a v2 e apenas esconde os chips de VGV.
-- Mesmo modelo de segurança da v2 (is_active_member + pode_acessar_lead).

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
      -- valor potencial: preço de tabela do projeto de interesse; na etapa
      -- Venda, o valor assinado (real) tem precedência.
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
