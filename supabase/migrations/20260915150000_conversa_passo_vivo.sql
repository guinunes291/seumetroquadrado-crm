-- ============================================================================
-- A faixa `conversa` passa a ler a mesma regra de próximo passo
-- ============================================================================
-- `20260914190000` consertou o "sem próximo passo" (tarefa vencida é dívida,
-- não passo) e criou `public.lead_sem_proximo_passo(uuid)` como fonte única.
-- Mas consertou só metade de `_carteira_classificar`: o MOTIVO passou a usar a
-- regra nova, e a FAIXA continuou com a expressão velha —
--
--   WHEN m.respondeu OR (m.proximo_followup IS NOT NULL
--                        AND m.proximo_followup > now()) THEN 'conversa'
--
-- `proximo_followup` é espelho de `min(data_vencimento)` das tarefas pendentes
-- (`sync_proximo_followup`, 20260708155905). Sendo `min`, ele aponta para a
-- dívida mais VELHA. Um lead com uma tarefa esquecida de 40 dias e outra
-- marcada para daqui a 3 dias tem o espelho no passado — e caía em `reserva`.
--
-- Medido no harness sobre a definição viva, antes deste arquivo:
--
--   A_so_tarefa_futura   faixa=conversa  ativa=true
--   B_vencida_e_futura   faixa=reserva   ativa=false  motivo='sem conversa viva'
--
-- O lead B tem compromisso marcado e ficava fora da carteira ativa. Note o
-- motivo: 'sem conversa viva', e não 'sem próximo passo definido' — dentro da
-- MESMA função, a regra nova reconhecia o passo e a faixa não.
--
-- Por que isso é urgente: a Reserva é de onde a régua de devolução tira lead.
-- Com a faixa errada, a varredura devolveria leads que o corretor agendou.
--
-- ----------------------------------------------------------------------------
-- O QUE A PRIMEIRA TENTATIVA DESTE ARQUIVO ERROU
-- ----------------------------------------------------------------------------
-- Trocar a expressão velha por `NOT m.sem_proximo_passo` e parar aí QUEBRA um
-- caso legítimo, e a suíte pegou: `transicionar_lead` (20260811151000, entre
-- outras) escreve `leads.proximo_followup` DIRETO, sem tarefa correspondente.
-- Esse lead tem próximo passo de verdade e não tem tarefa nenhuma.
--
-- A assimetria que importa: `proximo_followup > now()` é condição SUFICIENTE
-- para existir próximo passo, nunca NECESSÁRIA. Se o espelho está no futuro, o
-- `min` está no futuro, logo TODA tarefa aberta está no futuro. O espelho só
-- mente na direção negativa — estar no passado não prova ausência de passo.
--
-- Então o espelho entra na regra como mais um sinal POSITIVO, dentro da função
-- única. Para os espelhos mantidos pelo trigger isso não muda nada (se o min
-- está no futuro, a checagem de tarefa futura já deu verdadeiro); só recupera
-- o caso do followup escrito à mão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A regra única ganha o terceiro sinal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_sem_proximo_passo(_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.tarefas AS t
            WHERE t.lead_id = _lead
              AND t.deleted_at IS NULL
              AND t.status IN ('pendente', 'em_andamento')
              AND t.data_vencimento IS NOT NULL
              AND t.data_vencimento > now()
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.agendamentos AS a
            WHERE a.lead_id = _lead
              AND a.deleted_at IS NULL
              AND a.data_inicio >= now()
              AND a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')
         )
     -- Espelho no FUTURO é prova de passo (min no futuro => tudo no futuro).
     -- Espelho no passado não é prova de nada, e é por isso que ele não pode
     -- ser o único teste — foi esse o defeito de 20260914190000.
     AND NOT EXISTS (
           SELECT 1 FROM public.leads AS l
            WHERE l.id = _lead
              AND l.proximo_followup IS NOT NULL
              AND l.proximo_followup > now()
         );
$$;

COMMENT ON FUNCTION public.lead_sem_proximo_passo(uuid) IS
  'true quando o lead nao tem NENHUMA tarefa aberta com vencimento no futuro, nenhum agendamento futuro e nenhum proximo_followup no futuro. Tarefa vencida e divida, nao proximo passo. Fonte unica da regra: _carteira_classificar, fila_equipe_v1 e carteira_stats_por_corretor_v1 chamam esta funcao.';

-- ---------------------------------------------------------------------------
-- 2) A faixa `conversa` passa a usar a regra, em vez de reimplementá-la
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._carteira_classificar(_corretor uuid)
 RETURNS TABLE(lead_id uuid, nome text, telefone text, status text, temperatura text, projeto_nome text, created_at timestamp with time zone, movimento timestamp with time zone, dias_parado integer, proximo_followup timestamp with time zone, valor numeric, faixa text, posicao integer, ativa boolean, motivo text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      public.lead_sem_proximo_passo(v.id) AS sem_proximo_passo
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
        -- `sem_proximo_passo` já é public.lead_sem_proximo_passo(v.id),
        -- calculado em `marcados`. Usar o MESMO valor aqui é o ponto desta
        -- migration: a faixa e o motivo do lead passam a concordar por
        -- construção, não por coincidência de duas expressões parecidas.
        WHEN m.respondeu OR NOT m.sem_proximo_passo
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
$function$;

-- ---------------------------------------------------------------------------
-- 3) Guardas
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _def  text := pg_get_functiondef('public._carteira_classificar(uuid)'::regprocedure);
  _regra text := pg_get_functiondef('public.lead_sem_proximo_passo(uuid)'::regprocedure);
BEGIN
  -- O relógio da entrega na faixa SLA (20260913180000) continua de pé.
  IF position('entregue_em' IN _def) = 0
     OR position('data_distribuicao' IN _def) = 0 THEN
    RAISE EXCEPTION '_carteira_classificar perdeu o relogio da entrega na faixa SLA';
  END IF;
  -- A faixa decide pela regra única, não por uma expressão paralela.
  IF position('NOT m.sem_proximo_passo' IN _def) = 0 THEN
    RAISE EXCEPTION 'A faixa conversa precisa decidir por lead_sem_proximo_passo';
  END IF;
  IF position('lead_sem_proximo_passo(' IN _def) = 0 THEN
    RAISE EXCEPTION 'A regra do proximo passo precisa vir de lead_sem_proximo_passo';
  END IF;
  -- E a regra única continua exigindo tarefa NÃO vencida: sem isso voltamos ao
  -- defeito de 20260914190000, onde dívida de 40 dias contava como passo.
  IF position('t.data_vencimento > now()' IN _regra) = 0 THEN
    RAISE EXCEPTION 'lead_sem_proximo_passo voltou a aceitar tarefa vencida como passo';
  END IF;
END;
$guard$;
