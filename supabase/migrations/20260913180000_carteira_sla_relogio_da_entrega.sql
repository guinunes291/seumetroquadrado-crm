-- ============================================================================
-- Carteira ativa: o SLA mede a ENTREGA, não o nascimento do lead
-- ============================================================================
-- Bug encontrado com dado de produção em 13/09/2026, logo depois que a Fatia 3
-- subiu (PR #194). A faixa SLA usava `created_at` — quando o lead NASCEU — para
-- decidir se o primeiro contato ainda está no prazo. Medido:
--
--   SELECT count(*) FILTER (WHERE created_at        >= now() - interval '72h'),
--          count(*) FILTER (WHERE data_distribuicao >= now() - interval '72h')
--     FROM public.leads WHERE corretor_id IS NOT NULL
--      AND status IN ('novo','aguardando_atendimento');
--   -> criados_72h = 23 | distribuidos_72h = 142
--
-- Ou seja: 119 dos 142 leads (84%) que chegaram à mesa de um corretor nas
-- últimas 72 h nasceram ANTES disso — são o estoque da importação de julho que
-- a roleta escoa de 10 em 10 minutos. Com o relógio errado, nenhum deles
-- entrava na faixa SLA.
--
-- O que isso quebrava, em ordem de gravidade:
--   1. `carteira_vagas_entrada_v1` nunca apertava. Ela limita a roleta por
--      `cap_sla - ocupadas na faixa SLA`; com a faixa SLA travada em zero, o
--      limite ficava sempre no teto (20) e a trava que a migration
--      20260913120100 existe para criar simplesmente não travava.
--   2. O anel "N de 65" subcontava: o lead entregue hoje não aparecia na
--      carteira ativa.
--   3. A Reserva rotulava um lead entregue há duas horas como "nunca respondeu
--      ao primeiro contato" — verdade literal, leitura errada.
--
-- O que NÃO quebrava, e vale registrar para a próxima pessoa não procurar
-- defeito onde não há: a LISTA da Fila Única não passa por aqui. Ela vem de
-- `atendimento_inbox_v4` (hook use-fila-unica), então o corretor continuou
-- vendo os leads recém-entregues no balde "Chegaram agora" o tempo todo.
--
-- A CORREÇÃO é de uma linha de conceito: o SLA do primeiro contato começa
-- quando o lead vira responsabilidade do corretor — `data_distribuicao`, que
-- `_distribuir_lead_v3` reescreve a cada entrega —, não quando o lead nasceu.
--
-- O que deliberadamente NÃO muda: o relógio de `movimento`
-- (`GREATEST(ultima_interacao, ultimo_contato)`, com `created_at` de fallback),
-- que decide `dias_parado` e o motivo "sem movimento há N dias". Ele é o
-- relógio da Higiene, compartilhado com fila_funil_v1, fila_equipe_v1 e as
-- views de higiene; mexer nele aqui criaria duas definições de "parado" na
-- casa. Um lead do estoque de julho entregue ontem segue, corretamente, como
-- um lead sem movimento há ~50 dias — mudou de dono, não esquentou.
--
-- Reverter: reaplicar o corpo de `_carteira_classificar` de 20260913120000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._carteira_classificar(_corretor uuid)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  status text,
  temperatura text,
  projeto_nome text,
  created_at timestamptz,
  movimento timestamptz,
  dias_parado integer,
  proximo_followup timestamptz,
  valor numeric,
  faixa text,
  posicao integer,
  ativa boolean,
  motivo text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT
      COALESCE((c.v ->> 'teto')::int, 65)                            AS teto,
      COALESCE((c.v ->> 'cap_conversa')::int, 23)                    AS cap_conversa,
      COALESCE((c.v ->> 'cap_sla')::int, 20)                         AS cap_sla,
      COALESCE((c.v ->> 'cap_resgate')::int, 13)                     AS cap_resgate,
      COALESCE((c.v ->> 'conversa_dias')::int, 7)                    AS conversa_dias,
      COALESCE((c.v ->> 'sla_horas')::int, 72)                       AS sla_horas,
      COALESCE((c.v ->> 'devolver_sem_movimento_dias')::int, 30)     AS sem_movimento_dias,
      COALESCE((c.v ->> 'devolver_sem_proximo_passo_dias')::int, 2)  AS sem_passo_dias
    FROM (SELECT public.carteira_ativa_config() AS v) AS c
  ),
  vivos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status::text                                                       AS status,
      l.temperatura::text                                                  AS temperatura,
      COALESCE(NULLIF(l.projeto_nome, ''), pr.nome)                        AS projeto_nome,
      l.created_at,
      -- O relógio do SLA: quando o lead virou responsabilidade DESTE corretor.
      -- `data_distribuicao` é reescrita a cada entrega por _distribuir_lead_v3,
      -- então numa redistribuição vale a mais recente — que é o que o SLA do
      -- primeiro contato mede. Sem dono nunca distribuído, cai em created_at.
      COALESCE(l.data_distribuicao, l.timestamp_recebimento, l.created_at)   AS entregue_em,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      l.proximo_followup,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END       AS valor
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.corretor_id = _corretor
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
  ),
  -- "Respondeu" é caro de calcular (interacoes + mensagens + chamadas), e só
  -- pode ser verdade para quem teve movimento na janela da conversa. Restringir
  -- o conjunto ANTES da chamada é o que mantém a RPC dentro do timeout numa
  -- carteira de 1.500 leads.
  recentes AS (
    SELECT v.id
    FROM vivos AS v, cfg
    WHERE v.movimento >= now() - make_interval(days => cfg.conversa_dias)
  ),
  resp AS (
    SELECT r.lead_id, r.aguardando
    FROM public.conversas_aguardando_resposta(ARRAY(SELECT id FROM recentes)) AS r
  ),
  marcados AS (
    SELECT
      v.*,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - v.movimento)) / 86400)::int) AS dias_parado,
      COALESCE(rs.aguardando, false)                                        AS respondeu,
      (rg.lead_id IS NOT NULL)                                              AS resgatado,
      -- A mesma régua de leads_sem_acao: nada aberto que diga o próximo passo.
      (
        (v.proximo_followup IS NULL OR v.proximo_followup <= now())
        AND NOT EXISTS (
          SELECT 1 FROM public.tarefas AS t
          WHERE t.lead_id = v.id AND t.status IN ('pendente', 'em_andamento')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.agendamentos AS a
          WHERE a.lead_id = v.id
            AND a.data_inicio >= now()
            AND a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')
        )
      ) AS sem_proximo_passo
    FROM vivos AS v
    LEFT JOIN resp AS rs ON rs.lead_id = v.id
    LEFT JOIN public.carteira_resgates AS rg
      ON rg.lead_id = v.id AND rg.corretor_id = _corretor
  ),
  -- Faixa: a precedência é a do documento. Fundo antes de tudo — um lead em
  -- análise parado há 80 dias vale mais que 200 leads frios novos.
  comfaixa AS (
    SELECT
      m.*,
      CASE
        WHEN m.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
          THEN 'fundo'
        WHEN m.resgatado THEN 'resgate'
        WHEN m.respondeu OR (m.proximo_followup IS NOT NULL AND m.proximo_followup > now())
          THEN 'conversa'
        WHEN m.status IN ('novo', 'aguardando_atendimento')
         AND m.entregue_em >= now() - make_interval(hours => cfg.sla_horas)
          THEN 'sla'
        ELSE 'reserva'
      END AS faixa,
      cfg.teto,
      cfg.cap_conversa,
      cfg.cap_sla,
      cfg.cap_resgate,
      cfg.sem_movimento_dias,
      cfg.sem_passo_dias
    FROM marcados AS m, cfg
  ),
  -- Ordem DENTRO de cada faixa. Fundo: mais parado primeiro (é a chave da
  -- Fila Única). Conversa: quem espera há mais tempo. SLA: quem chegou antes.
  rankeado AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.faixa
        ORDER BY
          CASE c.faixa
            WHEN 'fundo'    THEN EXTRACT(EPOCH FROM c.movimento)
            WHEN 'conversa' THEN EXTRACT(EPOCH FROM c.movimento)
            WHEN 'sla'      THEN EXTRACT(EPOCH FROM c.entregue_em)
            ELSE              EXTRACT(EPOCH FROM c.movimento)
          END ASC,
          c.id ASC
      )::int AS rank_faixa
    FROM comfaixa AS c
  ),
  -- Cabe na faixa? O fundo não tem cap: se ele sozinho estourar o teto, o
  -- corretor simplesmente não recebe mais nada (é o caso medido de quem tem
  -- 53 no fundo). Os demais respeitam o cap da sua faixa.
  naFaixa AS (
    SELECT
      r.*,
      CASE r.faixa
        WHEN 'fundo'    THEN true
        WHEN 'resgate'  THEN r.rank_faixa <= r.cap_resgate
        WHEN 'conversa' THEN r.rank_faixa <= r.cap_conversa
        WHEN 'sla'      THEN r.rank_faixa <= r.cap_sla
        ELSE false
      END AS cabe_na_faixa,
      CASE r.faixa
        WHEN 'fundo'    THEN 1
        WHEN 'resgate'  THEN 2
        WHEN 'conversa' THEN 3
        WHEN 'sla'      THEN 4
        ELSE 5
      END AS ordem_faixa
    FROM rankeado AS r
  ),
  final AS (
    SELECT
      n.*,
      CASE
        WHEN n.cabe_na_faixa THEN
          row_number() OVER (
            PARTITION BY n.cabe_na_faixa
            ORDER BY n.ordem_faixa ASC, n.rank_faixa ASC, n.id ASC
          )::int
        ELSE NULL
      END AS posicao
    FROM naFaixa AS n
  )
  SELECT
    f.id,
    f.nome,
    f.telefone,
    f.status,
    f.temperatura,
    f.projeto_nome,
    f.created_at,
    f.movimento,
    f.dias_parado,
    f.proximo_followup,
    f.valor,
    f.faixa,
    f.posicao,
    -- O fundo do funil NUNCA é o excedente (§4.1 do documento): quando ele
    -- sozinho estoura o teto, o corretor para de receber (carteira_vagas_v1
    -- vai a zero) mas nenhum negócio avançado cai na Reserva. Sem esta
    -- exceção, quem tem 45 no fundo veria os 5 mais RECENTES — os recém
    -- agendados — saírem da carteira, que é o oposto do que a regra quer.
    (f.faixa = 'fundo' OR (f.posicao IS NOT NULL AND f.posicao <= f.teto)) AS ativa,
    -- O motivo separa DUAS perguntas diferentes, e misturá-las produzia a
    -- acusação errada: um lead do estoque entregue há 30 minutos que não coube
    -- na faixa SLA saía rotulado "sem movimento há 50 dias" — verdade pelo
    -- relógio da Higiene, e uma bronca no corretor por algo que ele não teve
    -- tempo de fazer.
    CASE
      WHEN f.faixa = 'fundo'
        OR (f.posicao IS NOT NULL AND f.posicao <= f.teto) THEN NULL
      -- (1) Fora por CAPACIDADE: o lead qualificou para uma faixa e não coube.
      -- O motivo é a vaga, não o estado dele.
      WHEN f.faixa <> 'reserva' AND NOT f.cabe_na_faixa
        THEN 'faixa cheia (' || f.faixa || ')'
      WHEN f.faixa <> 'reserva'
        THEN 'acima do teto de ' || f.teto
      -- (2) Fora por ESTADO: não qualificou para faixa nenhuma. Aqui sim o
      -- diagnóstico é o que importa, do mais forte para o mais fraco.
      WHEN f.dias_parado >= f.sem_movimento_dias
        THEN 'sem movimento há ' || f.dias_parado || ' dias'
      WHEN f.sem_proximo_passo AND f.dias_parado >= f.sem_passo_dias
        THEN 'sem próximo passo definido'
      WHEN f.status IN ('novo', 'aguardando_atendimento')
        THEN 'nunca respondeu ao primeiro contato'
      ELSE 'sem conversa viva'
    END AS motivo
  FROM final AS f;
$$;

REVOKE ALL ON FUNCTION public._carteira_classificar(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._carteira_classificar(uuid) IS
  'Regra unica da carteira ativa: classifica TODO lead vivo do corretor em faixa (fundo/resgate/conversa/sla/reserva), ordena, aplica caps de faixa e o teto, e diz o motivo de quem ficou fora. A faixa SLA mede desde a ENTREGA (data_distribuicao), nao desde created_at — 84% dos leads entregues vem do estoque antigo e nasceram muito antes de chegar a mesa.';

-- Sanidade: aborta o deploy se o relogio da entrega sumir numa edicao futura.
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public._carteira_classificar(uuid)'::regprocedure);
  IF position('entregue_em' IN _def) = 0 THEN
    RAISE EXCEPTION '_carteira_classificar sem o relogio da entrega na faixa SLA';
  END IF;
  IF position('data_distribuicao' IN _def) = 0 THEN
    RAISE EXCEPTION '_carteira_classificar: a faixa SLA precisa medir desde data_distribuicao';
  END IF;
END $$;
