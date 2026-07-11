-- Sinais de fechamento calibrados por resultados comerciais observados.
--
-- A taxa historica abaixo nunca e apresentada como probabilidade individual.
-- Ela mede a conversao observada, em ate 90 dias, dos leads que entraram em
-- cada etapa. Somente vendas aprovadas contam como conversao. Quando a carteira
-- autorizada nao oferece ao menos 30 observacoes maduras, o contrato devolve um
-- indice heuristico explicitamente identificado como tal.

CREATE INDEX IF NOT EXISTS idx_vendas_aprovadas_lead_calibracao
  ON public.vendas (lead_id, aprovado_em)
  WHERE lead_id IS NOT NULL
    AND status_venda = 'aprovada'::public.status_venda;

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

REVOKE ALL ON FUNCTION public.fechamento_sinais_v1(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fechamento_sinais_v1(integer)
  TO authenticated;

COMMENT ON FUNCTION public.fechamento_sinais_v1(integer) IS
  'Retorna ate 50 sinais de fechamento da carteira autorizada. Usa somente vendas aprovadas para taxa historica; indice e sinal de priorizacao, nunca probabilidade individual.';
