-- ============================================================================
-- "Próximo passo" passa a exigir tarefa NÃO vencida
-- ============================================================================
-- A regra de `sem_proximo_passo` existia em dois lugares, com o mesmo texto:
--
--   (proximo_followup IS NULL OR proximo_followup <= now())
--   AND NOT EXISTS (SELECT 1 FROM tarefas
--                    WHERE lead_id = ... AND status IN ('pendente','em_andamento'))
--   AND NOT EXISTS (agendamento futuro)
--
-- O `NOT EXISTS` das tarefas não olha o VENCIMENTO. Uma tarefa que venceu há 40
-- dias e ninguém fechou continua `pendente` — e faz o lead contar como "tem
-- próximo passo". Isso não é um próximo passo, é uma dívida.
--
-- Medido em produção em 14/09/2026, nos quatro corretores acima do teto:
--   444 leads em tratativa · 567 tarefas abertas JÁ VENCIDAS · atraso máximo
--   de 88 dias (o CRM tem 91 dias de vida) · apenas 79 leads (18%) com alguma
--   tarefa ou agendamento no futuro.
-- Com a regra antiga, 365 desses leads apareciam como "com próximo passo".
-- A tela de equipe do gestor mostrava time em dia.
--
-- O `proximo_followup` também sai da conta, e não por descuido: ele é um
-- ESPELHO de `min(data_vencimento)` das tarefas pendentes (`sync_proximo_followup`,
-- 20260708155905). Como é `min`, ele aponta para a dívida mais VELHA, não para
-- o próximo passo — usá-lo aqui seria herdar o mesmo defeito por outra porta.
-- As tabelas de origem respondem melhor a pergunta do que o espelho delas.
--
-- Some-se `deleted_at IS NULL`, que faltava: tarefa apagada em soft-delete
-- também blindava o lead.
--
-- O que este arquivo NÃO faz: mudar o que é "em tratativa". A carteira continua
-- sendo contada pelo relógio do último toque, o MESMO da régua de devolução —
-- tela e operação medindo tempo de formas diferentes é o pior dos dois mundos.
-- O "sem próximo passo vivo" entra como número PRÓPRIO na gestão de carteira.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A regra, num lugar só
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER e sem grant para authenticated, como `_carteira_classificar`:
-- quem chama são as DEFINER, que fazem o recorte de acesso. Duplicar a regra
-- em três funções foi exatamente o que permitiu o defeito sobreviver em dois
-- lugares sem ninguém notar.
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
         );
$$;

REVOKE ALL ON FUNCTION public.lead_sem_proximo_passo(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.lead_sem_proximo_passo(uuid) IS
  'true quando o lead nao tem NENHUMA tarefa aberta com vencimento no futuro nem agendamento futuro. Tarefa vencida e divida, nao proximo passo. Fonte unica da regra: _carteira_classificar, fila_equipe_v1 e carteira_stats_por_corretor_v1 chamam esta funcao.';

-- ---------------------------------------------------------------------------
-- 2) Os dois consumidores existentes, com a regra trocada e nada mais
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
$function$;

CREATE OR REPLACE FUNCTION public.fila_equipe_v1()
 RETURNS TABLE(corretor_id uuid, nome text, carteira_ativa integer, vencidos integer, sem_proximo_passo integer, fundo_parado integer, em_jogo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT _ve_tudo AND cardinality(_equipe) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
        OR p.id = _caller
      )
  ),
  vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.proximo_followup,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END AS valor
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND (
        (l.corretor_id IS NULL AND _ve_tudo)
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR (_ve_tudo AND l.corretor_id IS NOT NULL)
      )
  ),
  marcados AS (
    SELECT
      v.corretor_id,
      v.valor,
      (v.proximo_followup IS NOT NULL AND v.proximo_followup < now()) AS vencido,
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      public.lead_sem_proximo_passo(v.id) AS sem_passo,
      (
        v.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
        AND v.movimento < now() - interval '5 days'
      ) AS fundo
    FROM vivos AS v
  ),
  agg AS (
    SELECT
      m.corretor_id,
      count(*)::integer AS carteira_ativa,
      count(*) FILTER (WHERE m.vencido)::integer AS vencidos,
      count(*) FILTER (WHERE m.sem_passo)::integer AS sem_proximo_passo,
      count(*) FILTER (WHERE m.fundo)::integer AS fundo_parado,
      COALESCE(sum(m.valor), 0)::numeric AS em_jogo
    FROM marcados AS m
    GROUP BY m.corretor_id
  ),
  linhas AS (
    SELECT
      c.id AS corretor_id,
      c.nome,
      COALESCE(a.carteira_ativa, 0) AS carteira_ativa,
      COALESCE(a.vencidos, 0) AS vencidos,
      COALESCE(a.sem_proximo_passo, 0) AS sem_proximo_passo,
      COALESCE(a.fundo_parado, 0) AS fundo_parado,
      COALESCE(a.em_jogo, 0)::numeric AS em_jogo
    FROM corretores AS c
    LEFT JOIN agg AS a ON a.corretor_id = c.id
    UNION ALL
    -- O estoque sem dono só para quem vê a operação inteira.
    SELECT NULL::uuid, 'Sem corretor'::text, a.carteira_ativa, 0, 0, 0, a.em_jogo
    FROM agg AS a
    WHERE a.corretor_id IS NULL AND _ve_tudo
  )
  SELECT
    li.corretor_id,
    li.nome,
    li.carteira_ativa,
    li.vencidos,
    li.sem_proximo_passo,
    li.fundo_parado,
    li.em_jogo
  FROM linhas AS li
  ORDER BY (li.corretor_id IS NULL), li.fundo_parado DESC, li.vencidos DESC, li.nome;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) A gestão de carteira ganha o número
-- ---------------------------------------------------------------------------
-- `sem_passo_vivo` conta, DENTRO do que está em tratativa, quantos leads não
-- têm nada marcado adiante. Ele NÃO é limitado pelo teto (conta sobre
-- `ativa + acima_do_teto`): o teto governa quantos o corretor deve trabalhar,
-- não quantos estão parados de fato.
DROP FUNCTION IF EXISTS public.carteira_stats_por_corretor_v1();

CREATE OR REPLACE FUNCTION public.carteira_stats_por_corretor_v1()
RETURNS TABLE (
  corretor_id uuid,
  total bigint,
  ativa bigint,
  acima_do_teto bigint,
  sem_passo_vivo bigint,
  prospeccao bigint,
  parada bigint,
  fundo bigint,
  ganhos bigint,
  perdidos bigint,
  teto integer,
  dias_atendimento integer,
  dias_avancado integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
  _teto  int := GREATEST(
    COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 65), 1);
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  -- Escopo igual ao da RPC antiga: fora da gestão devolve 42501, nunca uma
  -- lista vazia. Lista vazia e "não pode ver" levam a decisões opostas.
  IF NOT (_ve_tudo OR _gestor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status::text AS st,
      (l.status IN ('agendado'::public.lead_status,
                    'visita_realizada'::public.lead_status,
                    'proposta_enviada'::public.lead_status,
                    'analise_credito'::public.lead_status)) AS eh_fundo,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS parado_desde
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (
        _ve_tudo
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR l.corretor_id IS NULL
      )
  ),
  classificado AS (
    SELECT
      b.corretor_id,
      b.eh_fundo,
      -- Recente pela régua da própria fase: o fundo do funil tem 30 dias,
      -- o resto tem 7. Mesmos prazos que a devolução aplica.
      (b.parado_desde > now() - make_interval(
         days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)) AS recente,
      (b.st IN ('novo','aguardando_atendimento','aguardando_corretor')) AS eh_prospeccao,
      (b.st IN ('contrato_fechado','pos_venda')) AS eh_ganho,
      (b.st = 'perdido') AS eh_perdido,
      -- CASE curto-circuita: a checagem de próximo passo só roda para quem
      -- está em tratativa, não para a base inteira da casa.
      CASE
        WHEN b.st NOT IN ('novo','aguardando_atendimento','aguardando_corretor',
                          'contrato_fechado','pos_venda','perdido')
         AND b.parado_desde > now() - make_interval(
               days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)
        THEN public.lead_sem_proximo_passo(b.id)
        ELSE false
      END AS sem_passo
    FROM base AS b
  ),
  agregado AS (
    SELECT
      c.corretor_id AS dono,
      count(*)::bigint AS total,
      -- Em tratativa, SEM teto: é a matéria-prima das duas colunas seguintes.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND c.recente)::bigint AS em_tratativa,
      count(*) FILTER (WHERE c.sem_passo)::bigint AS sem_passo_vivo,
      count(*) FILTER (WHERE c.eh_prospeccao)::bigint AS prospeccao,
      -- PARADA: o que a régua de devolução leva. Fundo parado conta aqui
      -- também — é o grupo que mais custa dinheiro parado.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND NOT c.recente)::bigint AS parada,
      count(*) FILTER (WHERE c.eh_fundo)::bigint AS fundo,
      count(*) FILTER (WHERE c.eh_ganho)::bigint AS ganhos,
      count(*) FILTER (WHERE c.eh_perdido)::bigint AS perdidos
    FROM classificado AS c
    GROUP BY c.corretor_id
  )
  SELECT
    a.dono,
    a.total,
    -- O teto é por corretor; a linha do balcão (sem dono) não é limitada.
    CASE WHEN a.dono IS NULL THEN a.em_tratativa
         ELSE LEAST(a.em_tratativa, _teto::bigint) END,
    CASE WHEN a.dono IS NULL THEN 0::bigint
         ELSE GREATEST(a.em_tratativa - _teto::bigint, 0::bigint) END,
    a.sem_passo_vivo,
    a.prospeccao,
    a.parada,
    a.fundo,
    a.ganhos,
    a.perdidos,
    _teto,
    _d_ini,
    _d_av
  FROM agregado AS a;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_stats_por_corretor_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_stats_por_corretor_v1()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_stats_por_corretor_v1() IS
  'Carteira por corretor: ativa (limitada ao teto), acima_do_teto, sem_passo_vivo, '
  'prospeccao e parada, mais o teto e os prazos da regua de posse. O teto vem de '
  'gestao_config, a mesma fonte da Fila Unica.';

-- ---------------------------------------------------------------------------
-- 4) Guardas
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _classif text := pg_get_functiondef('public._carteira_classificar(uuid)'::regprocedure);
  _equipe  text := pg_get_functiondef('public.fila_equipe_v1()'::regprocedure);
  _stats   text := pg_get_functiondef('public.carteira_stats_por_corretor_v1()'::regprocedure);
BEGIN
  -- O relógio da entrega na faixa SLA (20260913180000) não pode ter sumido na
  -- reescrita: este arquivo só troca a regra do próximo passo.
  IF position('entregue_em' IN _classif) = 0
     OR position('data_distribuicao' IN _classif) = 0 THEN
    RAISE EXCEPTION '_carteira_classificar perdeu o relogio da entrega na faixa SLA';
  END IF;
  -- A regra mora num lugar só.
  -- A CHAMADA, não a menção: um comentário citando o nome satisfazia a versão
  -- anterior desta guarda sem que a função fosse chamada (pego por mutação).
  IF position('lead_sem_proximo_passo(' IN _classif) = 0
     OR position('lead_sem_proximo_passo(' IN _equipe) = 0
     OR position('lead_sem_proximo_passo(' IN _stats) = 0 THEN
    RAISE EXCEPTION 'A regra do proximo passo precisa vir de lead_sem_proximo_passo';
  END IF;
  -- E ninguém voltou a perguntar "existe tarefa pendente" sem olhar a data:
  -- é literalmente o defeito que este arquivo conserta.
  IF _classif LIKE '%status IN (''pendente'', ''em_andamento'')%'
     OR _equipe LIKE '%status IN (''pendente'', ''em_andamento'')%' THEN
    RAISE EXCEPTION 'Tarefa pendente sem filtro de vencimento voltou ao classificador';
  END IF;
  -- O teto continua vindo da config (guarda de 20260914180000).
  IF position('capacidade_leads_ativos_por_corretor' IN _stats) = 0 THEN
    RAISE EXCEPTION 'O teto da gestao precisa vir de gestao_config, nao do codigo';
  END IF;
END;
$guard$;
