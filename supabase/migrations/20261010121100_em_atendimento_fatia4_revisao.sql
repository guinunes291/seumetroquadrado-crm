-- ============================================================================
-- Regra dos 65 em "Em atendimento" — Fatia 4: a revisão mensal
-- ============================================================================
-- Desenho: docs/ops/em-atendimento-teto-65.md (§2.5 "Revisão mensal", §8.9).
--
-- A regra (Fatias 1–3b) decide quem fica nos 65 e quem sai. Esta fatia não
-- move nada: ela responde, por mês e por corretor, as duas perguntas que o
-- dono fixou para revisar a regra depois de ligada:
--
--   1. TEMPO ENTRE TOQUES NOS 65 — a cada quantas horas o corretor volta a
--      cada lead que está em Em atendimento. Meta: mediana de até 72 h
--      (65 leads ÷ 20 toques por dia = 3,25 dias).
--   2. TAXA EM ATENDIMENTO → AGENDADO — de cada conversa que entrou em Em
--      atendimento no mês, quantas saíram dali para o fundo do funil
--      (agendado em diante). Meta da casa: 70%.
--
-- O RELÓGIO É O DA REGRA, não o da casa (§4 do desenho): toque = contato real
-- — o mesmo recorte de eventos que `_em_atendimento_classificar` lê
-- (interação que entra ou que sai com autor, mensagem recebida ou enviada
-- pelo corretor, chamada feita). Mudança de status e nota não contam. Se a
-- revisão medisse por outro relógio, o painel diria "72 h" para um corretor
-- que a regra acabou de punir por 5 dias sem toque.
--
-- UMA CONVERSA É UM TOQUE. Cinco mensagens em dez minutos são um contato,
-- não cinco: toques a menos de `revisao_conversa_min` (60 min) do anterior
-- fundem na mesma conversa, e o tempo entre toques é medido do fim de uma
-- conversa ao começo da seguinte. Sem isso a mediana seria o intervalo entre
-- mensagens (minutos) e nunca diria nada sobre a cadência de retorno.
--
-- SÓ CONTA O QUE ACONTECEU ENQUANTO O LEAD ESTAVA EM ATENDIMENTO. Os períodos
-- vêm de `lead_status_transitions` (entrada `para_status = em_atendimento`,
-- saída = transição seguinte). O lead que já nasceu em atendimento (legado)
-- conta desde a criação. Toques na Minha base ou no fundo ficam de fora:
-- a pergunta é sobre a cadência DENTRO dos 65.
--
-- A SAFRA (coorte) é por mês de ENTRADA em Em atendimento: o lead que entrou
-- em outubro conta em outubro, saia quando sair. A saída é a PRIMEIRA
-- transição depois da entrada; "agendou" = essa saída foi para o fundo
-- (agendado, visita realizada, proposta, análise de crédito, contrato).
-- Quem ainda não saiu aparece em `em_aberto`, para o mês corrente ser lido
-- com a reserva certa. Mesma definição da medição de 12/09 que deu 7%
-- contra a meta de 70% (docs/ops/fila-unica-fatia1.md).
--
-- Meses no calendário de America/Sao_Paulo, como os demais painéis mensais
-- (metrics_mvs_mes_brt). Escopo decidido no banco, como a simulação: gestor
-- vê a equipe; admin e superintendência, a casa. Nada aqui tem grant para
-- anon; corretor sem equipe recebe 42501.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config: as metas e a janela de conversa moram com os outros números
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT '{"modo": "sombra", "virada_em": null, "trava_roleta": 60, "teto_base": 150,
           "dias_sem_toque": 5, "tolerancia_retorno_dias": 2,
           "retorno_max_dias": 30, "qualificacao_prazo_horas": 24,
           "escreveu_dias": 7, "fundo_topo_dias": 3, "fundo_gestor_dias": 5,
           "fundo_desfecho_dias": 10,
           "revisao_toque_meta_horas": 72, "revisao_agendado_meta_pct": 70,
           "revisao_conversa_min": 60}'::jsonb
      || COALESCE(public.gestao_config_valor('em_atendimento'), '{}'::jsonb)
      || jsonb_build_object(
           'teto', COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65));
$$;

COMMENT ON FUNCTION public.em_atendimento_config() IS
  'Config vigente da regra dos 65 (chave em_atendimento + teto de '
  'capacidade_leads_ativos_por_corretor). Fatia 4: revisao_toque_meta_horas, '
  'revisao_agendado_meta_pct e revisao_conversa_min sao as metas e a janela '
  'de conversa da revisao mensal. Aberta a membro ativo.';

-- ---------------------------------------------------------------------------
-- 2) Os toques de um lead numa janela: o recorte da regra, em lista
-- ---------------------------------------------------------------------------
-- `_em_atendimento_classificar` precisa só do ÚLTIMO toque e por isso agrega
-- (max) inline. A revisão precisa da lista. O recorte é o mesmo, linha a
-- linha; o teste de banco confere que o último desta lista é o `movimento`
-- da regra para o mesmo lead.
CREATE OR REPLACE FUNCTION public._em_atendimento_toques(_lead uuid, _de timestamptz, _ate timestamptz)
RETURNS TABLE (em timestamptz)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT i.ocorreu_em
  FROM public.interacoes AS i
  WHERE i.lead_id = _lead
    AND i.deleted_at IS NULL
    AND i.tipo NOT IN ('nota', 'mudanca_status')
    AND (i.direcao = 'entrada' OR i.autor_id IS NOT NULL)
    AND i.ocorreu_em >= _de AND i.ocorreu_em < _ate
  UNION ALL
  SELECT m.recebida_em
  FROM public.mensagens AS m
  WHERE m.lead_id = _lead
    AND (m.direcao = 'entrada'
         OR (m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha'))
    AND m.recebida_em >= _de AND m.recebida_em < _ate
  UNION ALL
  SELECT ch.criado_em
  FROM public.chamadas AS ch
  WHERE ch.lead_id = _lead
    AND ch.direcao = 'saida' AND ch.status <> 'falha'
    AND ch.criado_em >= _de AND ch.criado_em < _ate;
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_toques(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._em_atendimento_toques(uuid, timestamptz, timestamptz) IS
  'Regra dos 65, Fatia 4: os contatos reais de um lead na janela [de, ate) — '
  'o mesmo recorte de _em_atendimento_classificar (entrada do cliente, saida '
  'humana, mensagem recebida/enviada pelo corretor, chamada feita). Sem grant.';

-- A saída de Em atendimento é lida por `de_status`; a tabela só tinha índice
-- por `para_status`. Parcial: a revisão é a única leitora.
CREATE INDEX IF NOT EXISTS idx_lst_saida_em_atendimento
  ON public.lead_status_transitions (created_at)
  WHERE de_status = 'em_atendimento'::public.lead_status;

-- ---------------------------------------------------------------------------
-- 3) A revisão: por mês × corretor, e a linha da casa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_revisao_v1(_meses integer DEFAULT 6)
RETURNS TABLE (
  mes date,
  casa boolean,
  corretor_id uuid,
  nome text,
  dias integer,
  leads_65 integer,
  leads_tocados integer,
  toques integer,
  intervalos integer,
  mediana_horas numeric,
  entraram integer,
  agendaram integer,
  em_aberto integer,
  taxa_agendado numeric,
  perderam_vaga integer,
  sairam_base integer,
  trocas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '30s'
AS $$
DECLARE
  _corretores uuid[] := public._em_atendimento_corretores_visiveis(auth.uid());
  _cfg jsonb := public.em_atendimento_config();
  _conversa interval :=
    make_interval(mins => GREATEST(COALESCE((_cfg ->> 'revisao_conversa_min')::int, 60), 0));
  _n integer := LEAST(GREATEST(COALESCE(_meses, 6), 1), 24);
  _agora_local timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  _mes_atual date := date_trunc('month', _agora_local)::date;
  _primeiro date := (_mes_atual - make_interval(months => _n - 1))::date;
  _de timestamptz := _primeiro::timestamp AT TIME ZONE 'America/Sao_Paulo';
  -- Para o primeiro toque da janela, o anterior pode estar muito atrás. A
  -- mediana só precisa saber que a espera foi "longa": corta em 90 dias
  -- antes da janela, para não varrer anos de histórico de lead legado.
  _corte timestamptz := _de - interval '90 days';
BEGIN
  RETURN QUERY
  WITH meses AS (
    SELECT
      m::date AS mes,
      m AT TIME ZONE 'America/Sao_Paulo' AS ini,
      (m + interval '1 month') AT TIME ZONE 'America/Sao_Paulo' AS fim,
      CASE WHEN m::date = _mes_atual THEN EXTRACT(day FROM _agora_local)::int
           ELSE EXTRACT(day FROM (m + interval '1 month' - interval '1 day'))::int END AS dias
    FROM generate_series(_primeiro::timestamp, _mes_atual::timestamp, interval '1 month') AS m
  ),
  -- Períodos em Em atendimento que tocam a janela: os que FECHARAM desde o
  -- início dela (saída registrada) e os ABERTOS hoje (status atual).
  periodos AS (
    SELECT
      s.lead_id,
      s.corretor_id,
      COALESCE((SELECT max(e.created_at)
                  FROM public.lead_status_transitions AS e
                 WHERE e.lead_id = s.lead_id
                   AND e.para_status = 'em_atendimento'::public.lead_status
                   AND e.created_at < s.created_at),
               l.created_at)                                   AS ini,
      s.created_at                                             AS fim
    FROM public.lead_status_transitions AS s
    JOIN public.leads AS l ON l.id = s.lead_id
    WHERE s.de_status = 'em_atendimento'::public.lead_status
      AND s.created_at >= _de
      AND s.corretor_id = ANY(_corretores)
    UNION ALL
    SELECT
      l.id,
      l.corretor_id,
      COALESCE((SELECT max(e.created_at)
                  FROM public.lead_status_transitions AS e
                 WHERE e.lead_id = l.id
                   AND e.para_status = 'em_atendimento'::public.lead_status),
               l.created_at),
      'infinity'::timestamptz
    FROM public.leads AS l
    WHERE l.status = 'em_atendimento'::public.lead_status
      AND l.corretor_id = ANY(_corretores)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
  ),
  -- Os toques de cada período (só dentro dele), e o anterior de cada um.
  brutos AS (
    SELECT
      p.lead_id, p.corretor_id, p.ini, p.fim, t.em,
      lag(t.em) OVER (PARTITION BY p.lead_id, p.ini ORDER BY t.em) AS anterior
    FROM periodos AS p
    CROSS JOIN LATERAL public._em_atendimento_toques(
      p.lead_id, GREATEST(p.ini, _corte), LEAST(p.fim, now())) AS t
  ),
  -- Conversa = toques a menos de `_conversa` do anterior. A sessão é
  -- numerada por lead × período, na ordem do tempo.
  numerados AS (
    SELECT
      b.*,
      sum(CASE WHEN b.anterior IS NULL OR b.em - b.anterior >= _conversa THEN 1 ELSE 0 END)
        OVER (PARTITION BY b.lead_id, b.ini ORDER BY b.em ROWS UNBOUNDED PRECEDING) AS sessao
    FROM brutos AS b
  ),
  conversas AS (
    SELECT n.lead_id, n.corretor_id, n.ini, n.sessao,
           min(n.em) AS comeco, max(n.em) AS termino
    FROM numerados AS n
    GROUP BY n.lead_id, n.corretor_id, n.ini, n.sessao
  ),
  -- Espera = do fim da conversa anterior ao começo desta. A primeira do
  -- período conta desde a entrada em atendimento (ou desde o corte).
  esperas AS (
    SELECT
      c.lead_id, c.corretor_id, c.comeco,
      c.comeco - COALESCE(
        lag(c.termino) OVER (PARTITION BY c.lead_id, c.ini ORDER BY c.sessao),
        GREATEST(c.ini, _corte)) AS espera
    FROM conversas AS c
  ),
  -- A safra: primeira entrada do lead em Em atendimento em cada mês; a saída
  -- é a transição seguinte, seja ela qual for.
  entradas AS (
    SELECT
      date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
      t.corretor_id,
      t.lead_id,
      min(t.created_at) AS em
    FROM public.lead_status_transitions AS t
    WHERE t.para_status = 'em_atendimento'::public.lead_status
      AND t.created_at >= _de
      AND t.corretor_id = ANY(_corretores)
    GROUP BY 1, 2, 3
  ),
  safra AS (
    SELECT
      e.mes, e.corretor_id, e.lead_id,
      sai.para_status IS NOT NULL                                     AS saiu,
      COALESCE(sai.para_status IN ('agendado', 'visita_realizada', 'proposta_enviada',
                                   'analise_credito', 'contrato_fechado'), false) AS agendou
    FROM entradas AS e
    LEFT JOIN LATERAL (
      SELECT x.para_status
      FROM public.lead_status_transitions AS x
      WHERE x.lead_id = e.lead_id AND x.created_at > e.em
      ORDER BY x.created_at, x.id
      LIMIT 1
    ) AS sai ON true
  ),
  -- Fatos num formato só, para agregar por corretor e pela casa de uma vez.
  fatos AS (
    SELECT m.mes, p.corretor_id, p.lead_id, 'nos65'::text AS k, NULL::numeric AS v
    FROM meses AS m
    JOIN periodos AS p ON p.ini < m.fim AND p.fim > m.ini
    UNION ALL
    SELECT m.mes, c.corretor_id, c.lead_id, 'toque', NULL
    FROM meses AS m
    JOIN conversas AS c ON c.comeco >= m.ini AND c.comeco < m.fim
    UNION ALL
    SELECT m.mes, e.corretor_id, e.lead_id, 'espera',
           EXTRACT(EPOCH FROM e.espera) / 3600.0
    FROM meses AS m
    JOIN esperas AS e ON e.comeco >= m.ini AND e.comeco < m.fim
    WHERE e.espera >= _conversa
    UNION ALL
    SELECT s.mes, s.corretor_id, s.lead_id,
           CASE WHEN s.agendou THEN 'agendou' WHEN s.saiu THEN 'saiu' ELSE 'aberto' END, NULL
    FROM safra AS s
    UNION ALL
    SELECT date_trunc('month', mv.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
           mv.corretor_id, mv.lead_id,
           CASE WHEN mv.acao IN ('perde_vaga', 'excedente') THEN 'perde_vaga' ELSE 'sai_base' END,
           NULL
    FROM public.em_atendimento_movimentos AS mv
    WHERE mv.aplicado AND mv.modo = 'ligado' AND mv.desfeito_em IS NULL
      AND mv.created_at >= _de
      AND mv.corretor_id = ANY(_corretores)
      AND (mv.acao IN ('perde_vaga', 'excedente') OR mv.destino IN ('roleta', 'bolsao', 'reativacao'))
    UNION ALL
    SELECT date_trunc('month', ev.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
           (ev.payload ->> 'alterado_por')::uuid, ev.lead_id, 'troca', NULL
    FROM public.lead_eventos AS ev
    WHERE ev.tipo = 'troca_em_atendimento'
      AND ev.payload ->> 'papel' = 'entra'
      AND ev.created_at >= _de
      AND (ev.payload ->> 'alterado_por')::uuid = ANY(_corretores)
  ),
  agg AS (
    SELECT
      f.mes,
      GROUPING(f.corretor_id) = 1                                      AS casa,
      f.corretor_id,
      count(DISTINCT f.lead_id) FILTER (WHERE f.k = 'nos65')::int       AS leads_65,
      count(DISTINCT f.lead_id) FILTER (WHERE f.k = 'toque')::int       AS leads_tocados,
      count(*) FILTER (WHERE f.k = 'toque')::int                        AS toques,
      count(*) FILTER (WHERE f.k = 'espera')::int                       AS intervalos,
      round((percentile_cont(0.5) WITHIN GROUP (ORDER BY f.v)
               FILTER (WHERE f.k = 'espera'))::numeric, 1)              AS mediana_horas,
      count(*) FILTER (WHERE f.k IN ('agendou', 'saiu', 'aberto'))::int AS entraram,
      count(*) FILTER (WHERE f.k = 'agendou')::int                      AS agendaram,
      count(*) FILTER (WHERE f.k = 'aberto')::int                       AS em_aberto,
      count(*) FILTER (WHERE f.k = 'perde_vaga')::int                   AS perderam_vaga,
      count(*) FILTER (WHERE f.k = 'sai_base')::int                     AS sairam_base,
      count(*) FILTER (WHERE f.k = 'troca')::int                        AS trocas
    FROM fatos AS f
    GROUP BY GROUPING SETS ((f.mes, f.corretor_id), (f.mes))
  )
  SELECT
    m.mes,
    COALESCE(a.casa, true),
    a.corretor_id,
    p.nome,
    m.dias,
    COALESCE(a.leads_65, 0),
    COALESCE(a.leads_tocados, 0),
    COALESCE(a.toques, 0),
    COALESCE(a.intervalos, 0),
    a.mediana_horas,
    COALESCE(a.entraram, 0),
    COALESCE(a.agendaram, 0),
    COALESCE(a.em_aberto, 0),
    CASE WHEN COALESCE(a.entraram, 0) > 0
         THEN round(100.0 * a.agendaram / a.entraram, 1) END,
    COALESCE(a.perderam_vaga, 0),
    COALESCE(a.sairam_base, 0),
    COALESCE(a.trocas, 0)
  FROM meses AS m
  LEFT JOIN agg AS a ON a.mes = m.mes
  LEFT JOIN public.profiles AS p ON p.id = a.corretor_id
  ORDER BY m.mes DESC, COALESCE(a.casa, true) DESC, p.nome, a.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_revisao_v1(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_revisao_v1(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.em_atendimento_revisao_v1(integer) IS
  'Regra dos 65, Fatia 4: revisao mensal (ultimos N meses, calendario de '
  'America/Sao_Paulo) por corretor e a linha da casa (casa = true). '
  'mediana_horas = tempo entre conversas nos 65 (toques a menos de '
  'revisao_conversa_min fundem); taxa_agendado = % da safra do mes (leads que '
  'entraram em Em atendimento) cuja saida foi para o fundo do funil; '
  'em_aberto = ainda nao sairam. perderam_vaga/sairam_base: movimentos da '
  'regra ligada no mes; trocas: entra-um-sai-um feitas pelo corretor. Escopo '
  'de _em_atendimento_corretores_visiveis.';

-- ---------------------------------------------------------------------------
-- 4) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _c jsonb := public.em_atendimento_config();
BEGIN
  IF (_c ->> 'revisao_toque_meta_horas')::int <= 0
     OR (_c ->> 'revisao_agendado_meta_pct')::int NOT BETWEEN 1 AND 100
     OR (_c ->> 'revisao_conversa_min')::int < 0 THEN
    RAISE EXCEPTION 'fatia4: metas da revisao fora da faixa';
  END IF;
  IF has_function_privilege('anon', 'public.em_atendimento_revisao_v1(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._em_atendimento_toques(uuid, timestamptz, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fatia4: EXECUTE indevido';
  END IF;
END $$;
