-- Camada de Gestão (Fase A4): schema metrics — camada semântica.
--
-- Toda métrica de gestão é definida UMA vez aqui (view ou MV comentada),
-- nunca solta no front-end. O schema fica FORA da API (PostgREST expõe só
-- public) e sem grants para anon/authenticated: a leitura acontece
-- exclusivamente via RPCs SECURITY DEFINER em public (gestao_*), que
-- aplicam o escopo por papel com ve_carteira_completa/corretores_do_gestor.
-- É esse desenho que concilia materialized views (que ignoram RLS) com o
-- RBAC do CRM.

CREATE SCHEMA IF NOT EXISTS metrics;

REVOKE ALL ON SCHEMA metrics FROM PUBLIC;
REVOKE ALL ON SCHEMA metrics FROM anon;
REVOKE ALL ON SCHEMA metrics FROM authenticated;
GRANT USAGE ON SCHEMA metrics TO service_role;

COMMENT ON SCHEMA metrics IS
  'Camada semântica da gestão: cada métrica definida uma única vez, com comentário de negócio. Sem acesso direto de authenticated — leitura só via RPCs gestao_* (SECURITY DEFINER com escopo por papel).';

-- Carimbo de atualização por objeto materializado ("dados de HH:MM" na UI).
CREATE TABLE IF NOT EXISTS metrics.atualizacoes (
  objeto text PRIMARY KEY,
  atualizado_em timestamptz NOT NULL
);

COMMENT ON TABLE metrics.atualizacoes IS
  'Última atualização de cada materialized view do schema (upsert feito por metrics.refresh_all). Toda RPC que lê MV devolve este carimbo.';

-- ---------------------------------------------------------------------------
-- metrics.leads_base — base canônica de leads para TODA métrica de gestão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.leads_base AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.corretor_id,
  p.equipe_id,
  p.nome                                   AS corretor_nome,
  l.status,
  public.funil_ordem(l.status)             AS ordem,
  l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido') AS ativo,
  l.origem::text                           AS origem,
  l.canal_entrada,
  l.campanha,
  l.temperatura::text                      AS temperatura,
  public.faixa_mcmv_norm(l.faixa_mcmv)     AS faixa,
  l.projeto_id,
  COALESCE(pr.nome, l.projeto_nome)        AS projeto_nome,
  l.construtora,
  l.created_at,
  l.data_distribuicao,
  l.proximo_followup,
  public.lead_ultima_atividade(l.ultima_interacao, l.ultimo_contato, l.updated_at) AS ultima_atividade,
  GREATEST(
    0,
    EXTRACT(DAY FROM (now() - public.lead_ultima_atividade(l.ultima_interacao, l.ultimo_contato, l.updated_at)))::int
  )                                        AS dias_parado,
  l.motivo_perda_categoria,
  l.data_perda,
  -- Valor potencial: mesma régua do pipeline_snapshot_v3 — venda aprovada
  -- (não distratada) quando fechado, senão preço "a partir de" do projeto.
  COALESCE(v.valor_venda, pr.preco_a_partir) AS valor_potencial
FROM public.leads l
LEFT JOIN public.profiles p  ON p.id = l.corretor_id
LEFT JOIN public.projetos pr ON pr.id = l.projeto_id
LEFT JOIN LATERAL (
  SELECT vv.valor_venda
  FROM public.vendas vv
  WHERE vv.lead_id = l.id
    AND vv.status_venda = 'aprovada'
    AND vv.distrato = false
  ORDER BY vv.created_at DESC
  LIMIT 1
) v ON l.status IN ('contrato_fechado', 'pos_venda')
WHERE l.deleted_at IS NULL
  AND l.na_lixeira = false;

COMMENT ON VIEW metrics.leads_base IS
  'Base canônica: leads FORA da lixeira (deleted_at IS NULL e na_lixeira=false), com ordem comercial (funil_ordem), dias_parado (régua COALESCE(ultima_interacao, ultimo_contato, updated_at)), faixa MCMV normalizada e valor_potencial (venda aprovada se fechado, senão preco_a_partir do projeto). Todo objeto de metrics deriva daqui.';

-- ---------------------------------------------------------------------------
-- metrics.snapshot_funil — estoque ATUAL por corretor × etapa (live)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.snapshot_funil AS
SELECT
  b.corretor_id,
  b.equipe_id,
  b.status,
  b.ordem,
  count(*)::int                            AS quantidade,
  COALESCE(sum(b.valor_potencial), 0)      AS vgv_potencial,
  count(*) FILTER (
    WHERE b.ativo
      AND b.dias_parado >= public.gestao_limiar_parado(b.temperatura)
  )::int                                   AS parados,
  count(*) FILTER (
    WHERE b.ativo AND b.proximo_followup < now()
  )::int                                   AS followups_vencidos
FROM metrics.leads_base b
GROUP BY b.corretor_id, b.equipe_id, b.status, b.ordem;

COMMENT ON VIEW metrics.snapshot_funil IS
  'Foto de AGORA: estoque por corretor × etapa com VGV potencial, parados (limiar por temperatura em gestao_config) e follow-ups vencidos. Leitura de carga de trabalho — para conversão use funil_coorte_mensal (coorte).';

-- ---------------------------------------------------------------------------
-- metrics.realizado_mensal — fluxo realizado por mês × corretor (live)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.realizado_mensal AS
WITH vendas_m AS (
  SELECT date_trunc('month', COALESCE(v.aprovado_em, v.data_assinatura::timestamptz, v.created_at))::date AS mes,
         v.corretor_id,
         count(*)::int          AS vendas,
         COALESCE(sum(v.valor_venda), 0) AS vgv
  FROM public.vendas v
  WHERE v.status_venda = 'aprovada' AND v.distrato = false
  GROUP BY 1, 2
),
visitas_m AS (
  SELECT date_trunc('month', a.data_inicio)::date AS mes,
         a.corretor_id,
         count(*)::int AS visitas_realizadas
  FROM public.agendamentos a
  WHERE a.status = 'realizado' AND a.deleted_at IS NULL
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
  'Fluxo realizado por mês × corretor: vendas e VGV (status_venda=aprovada e distrato=false, mês de COALESCE(aprovado_em, data_assinatura, created_at)), visitas realizadas (agendamentos status=realizado, mês de data_inicio — mesma régua de src/lib/metas.ts) e leads atendidos (funil_ordem>=3, inclui perdido). Base do pacing (gestao_pacing).';
