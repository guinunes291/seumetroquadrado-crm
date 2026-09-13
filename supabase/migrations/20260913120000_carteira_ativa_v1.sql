-- ============================================================================
-- Carteira ativa de 40 — Fatia 3, MODO SOMBRA (leitura)
-- ============================================================================
-- Desenho e medições: docs/ops/carteira-ativa-40-fatia3.md.
--
-- O teto de 40 da Fila Única é visual desde a Fatia 1: a tela mostra os 40
-- primeiros dos candidatos recebidos. Esta migration dá ao banco a regra que
-- a tela finge ter — QUEM são os 40 e por que cada um dos outros ficou de
-- fora — sem devolver lead nenhum. Nada aqui escreve em `leads`; a devolução
-- automática é a fatia seguinte.
--
-- Por que modo sombra primeiro: medido em 13/09/2026, a casa inteira tocou
-- 762 leads em 7 dias (~16 por corretor) e cinco corretores têm mais de mil
-- leads no nome. Ligar devolução antes de ver o que ela tiraria é operar no
-- escuro numa base onde 65% da camada trabalhável está parada há 30+ dias.
--
-- As faixas (§2.2 do documento), em ordem de precedência:
--   A fundo    — agendado / visita_realizada / proposta_enviada /
--                analise_credito. Sem cap de faixa: são 240 leads na casa
--                inteira (mediana 4 por corretor) e converte 39%.
--   B resgate  — o corretor escolheu puxar da Reserva (carteira_resgates).
--                Existe para o teto não virar gaiola — e é o antídoto contra
--                o corretor esconder cliente do CRM.
--   C conversa — o cliente respondeu por último, ou há follow-up combinado
--                com data futura.
--   D sla      — chegou há menos de `sla_horas` e ainda é primeiro contato.
-- Quem não cabe em nenhuma faixa não é candidato a vaga: é Reserva, com o
-- motivo dito em texto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config
-- ---------------------------------------------------------------------------
-- O TETO continua sendo `capacidade_leads_ativos_por_corretor` (default 40),
-- que já existe desde 20260727100000 e é lido por
-- gestao_performance_corretores_janela. Criar uma segunda chave para o mesmo
-- número seria a divergência que este repo documenta contra — a chave nova
-- carrega só o que ainda não tinha dono: os caps de faixa e os gatilhos.
INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('carteira_ativa',
   '{"cap_conversa": 14, "cap_sla": 12, "cap_resgate": 8,
     "conversa_dias": 7, "sla_horas": 72,
     "devolver_sem_movimento_dias": 30, "devolver_sem_proximo_passo_dias": 2}',
   'Carteira ativa (Fila Unica, Fatia 3): caps por faixa e gatilhos de devolucao. O TETO fica em capacidade_leads_ativos_por_corretor — uma chave so para o mesmo numero.')
ON CONFLICT (chave) DO NOTHING;

-- Config vigente para QUALQUER membro ativo. Mesma razão da
-- `regua_followup_atual`: a RLS de gestao_config é gestão-only, mas esta
-- regra governa a tela do CORRETOR — sem a RPC o teto configurado pelo admin
-- seria invisível para quem vive debaixo dele.
CREATE OR REPLACE FUNCTION public.carteira_ativa_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.gestao_config_valor('carteira_ativa'), '{}'::jsonb)
      || jsonb_build_object(
           'teto',
           GREATEST(
             COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 40),
             1));
$$;

REVOKE ALL ON FUNCTION public.carteira_ativa_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_ativa_config() TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_ativa_config() IS
  'Config vigente da carteira ativa: os caps de faixa e gatilhos de gestao_config.carteira_ativa, com o teto vindo de capacidade_leads_ativos_por_corretor (fonte unica do 40).';

-- ---------------------------------------------------------------------------
-- 2) Resgates — a faixa B, escolhida a dedo pelo corretor
-- ---------------------------------------------------------------------------
-- Sem isto a sombra mentiria: um lead que o corretor marcou como "meu"
-- ocupa vaga de verdade, e a contagem tem de refletir isso desde o primeiro
-- dia. Escrita só pelas RPCs abaixo (nenhuma policy de INSERT/DELETE de
-- propósito) — o corretor resgata para a própria carteira, nunca para a de
-- outro.
CREATE TABLE IF NOT EXISTS public.carteira_resgates (
  corretor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretor_id, lead_id)
);

CREATE INDEX IF NOT EXISTS carteira_resgates_lead_idx
  ON public.carteira_resgates (lead_id);

ALTER TABLE public.carteira_resgates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carteira_resgates_select ON public.carteira_resgates;
CREATE POLICY carteira_resgates_select ON public.carteira_resgates
  FOR SELECT TO authenticated
  USING (public.pode_acessar_corretor(auth.uid(), corretor_id));

REVOKE ALL ON public.carteira_resgates FROM PUBLIC, anon;
GRANT SELECT ON public.carteira_resgates TO authenticated;
GRANT ALL ON public.carteira_resgates TO service_role;

COMMENT ON TABLE public.carteira_resgates IS
  'Faixa B da carteira ativa: leads que o corretor puxou da Reserva a dedo. Escrita so por carteira_resgatar/carteira_soltar.';

-- ---------------------------------------------------------------------------
-- 3) O classificador — regra ÚNICA, usada pelas duas RPCs públicas
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER e sem grant para authenticated, como
-- conversas_aguardando_resposta: quem chama são as DEFINER abaixo, que fazem
-- o recorte de acesso. Duplicar esta classificação nas duas RPCs seria a
-- divergência garantida — a Reserva é, por definição, o complemento exato da
-- carteira ativa.
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
      COALESCE((c.v ->> 'teto')::int, 40)                            AS teto,
      COALESCE((c.v ->> 'cap_conversa')::int, 14)                    AS cap_conversa,
      COALESCE((c.v ->> 'cap_sla')::int, 12)                         AS cap_sla,
      COALESCE((c.v ->> 'cap_resgate')::int, 8)                      AS cap_resgate,
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
         AND m.created_at >= now() - make_interval(hours => cfg.sla_horas)
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
            WHEN 'sla'      THEN EXTRACT(EPOCH FROM c.created_at)
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
    CASE
      WHEN f.faixa = 'fundo'
        OR (f.posicao IS NOT NULL AND f.posicao <= f.teto) THEN NULL
      -- Motivo em ordem de honestidade: o mais forte primeiro. Quem está
      -- parado há 30+ dias não ficou de fora "por falta de vaga" — ficou de
      -- fora porque ninguém o trabalha.
      WHEN f.dias_parado >= f.sem_movimento_dias
        THEN 'sem movimento há ' || f.dias_parado || ' dias'
      WHEN f.sem_proximo_passo AND f.dias_parado >= f.sem_passo_dias
        THEN 'sem próximo passo definido'
      WHEN f.faixa = 'reserva' AND f.status IN ('novo', 'aguardando_atendimento')
        THEN 'nunca respondeu ao primeiro contato'
      WHEN f.faixa = 'reserva'
        THEN 'sem conversa viva'
      WHEN NOT f.cabe_na_faixa
        THEN 'faixa cheia (' || f.faixa || ')'
      ELSE 'acima do teto de ' || f.teto
    END AS motivo
  FROM final AS f;
$$;

REVOKE ALL ON FUNCTION public._carteira_classificar(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._carteira_classificar(uuid) IS
  'Regra unica da carteira ativa: classifica TODO lead vivo do corretor em faixa (fundo/resgate/conversa/sla/reserva), ordena, aplica caps de faixa e o teto, e diz o motivo de quem ficou fora. Chamada pelas RPCs DEFINER — a Reserva e o complemento exato da carteira ativa.';

-- ---------------------------------------------------------------------------
-- 4) As RPCs públicas
-- ---------------------------------------------------------------------------
-- Guard de escopo idêntico ao de fila_equipe_v1 / atendimento_inbox_v4: sem
-- `_corretor` é a própria carteira; com `_corretor`, só quem alcança aquele
-- corretor. Corretor pedindo a carteira de outro recebe 42501, nunca lista
-- vazia (lista vazia é indistinguível de "não tem nada" e mente ao gestor).
CREATE OR REPLACE FUNCTION public.carteira_ativa_v1(_corretor uuid DEFAULT NULL)
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
  posicao integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.lead_id, c.nome, c.telefone, c.status, c.temperatura, c.projeto_nome,
         c.created_at, c.movimento, c.dias_parado, c.proximo_followup, c.valor,
         c.faixa, c.posicao
  FROM public._carteira_classificar(_alvo) AS c
  WHERE c.ativa
  ORDER BY c.posicao ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_ativa_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_ativa_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_ativa_v1(uuid) IS
  'Os leads que ocupam vaga na carteira ativa do corretor, na ordem de precedencia das faixas. Sem _corretor e a propria carteira; com _corretor, so quem alcanca aquele corretor (42501 caso contrario).';

-- A Reserva: o complemento exato, com o motivo de cada um e paginação — a
-- carteira nominal medida chega a 1.500 leads num corretor só.
CREATE OR REPLACE FUNCTION public.carteira_reserva_v1(
  _corretor uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
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
  valor numeric,
  motivo text,
  total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  _skip integer := GREATEST(COALESCE(_offset, 0), 0);
  _q text := NULLIF(btrim(COALESCE(_busca, '')), '');
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH fora AS (
    SELECT c.*
    FROM public._carteira_classificar(_alvo) AS c
    WHERE NOT c.ativa
      AND (
        _q IS NULL
        OR c.nome ILIKE '%' || _q || '%'
        -- O corretor busca pelo telefone como o cliente o mandou; a base tem
        -- o mesmo número em várias formatações ("(11) 94844-2250",
        -- "5511948442250", "+5511940136716" — medido). Comparar só dígitos é
        -- o que faz a busca achar. O guard `<> ''` existe porque uma busca
        -- sem dígitos viraria LIKE '%%' e casaria com a base inteira.
        OR (
          regexp_replace(_q, '\D', '', 'g') <> ''
          AND regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g')
                LIKE '%' || regexp_replace(_q, '\D', '', 'g') || '%'
        )
      )
  )
  SELECT f.lead_id, f.nome, f.telefone, f.status, f.temperatura, f.projeto_nome,
         f.created_at, f.movimento, f.dias_parado, f.valor, f.motivo,
         count(*) OVER () AS total
  FROM fora AS f
  ORDER BY f.movimento DESC, f.lead_id ASC
  LIMIT _take OFFSET _skip;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer) IS
  'A Reserva: o complemento exato da carteira ativa, com o motivo de cada lead ter ficado fora, busca por nome/telefone (so digitos) e paginacao. `total` e a contagem da janela inteira, repetida em cada linha.';

-- Vagas livres — o que a distribuição por vaga e o placar da fila consultam.
CREATE OR REPLACE FUNCTION public.carteira_vagas_v1(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT GREATEST(
    0,
    COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 40)
      - (SELECT count(*)::int FROM public._carteira_classificar(_corretor) AS c WHERE c.ativa)
  );
$$;

REVOKE ALL ON FUNCTION public.carteira_vagas_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_vagas_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_vagas_v1(uuid) IS
  'Vagas livres na carteira ativa do corretor (teto menos ocupadas), nunca negativo. Sem guard de escopo de proposito: so devolve um inteiro e e lida por telas que ja recortaram o escopo.';

-- Vaga de ENTRADA — quantos leads NOVOS a roleta pode entregar agora.
--
-- Não é a mesma conta de carteira_vagas_v1, e confundir as duas fabricaria
-- Reserva: um lead recém-distribuído entra em `aguardando_atendimento`, ou
-- seja, na faixa SLA, que tem cap próprio (12). Um corretor com a carteira
-- vazia tem 40 vagas globais, mas se a roleta despejar 40 leads novos, 28
-- deles caem na Reserva no mesmo instante com "faixa cheia (sla)" — o CRM
-- teria criado o problema que a regra existe para resolver. O limite certo é
-- o MENOR entre a vaga global e a vaga da faixa de entrada.
CREATE OR REPLACE FUNCTION public.carteira_vagas_entrada_v1(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (SELECT public.carteira_ativa_config() AS v),
  atual AS (SELECT c.ativa, c.faixa FROM public._carteira_classificar(_corretor) AS c)
  SELECT GREATEST(0, LEAST(
    COALESCE((SELECT (cfg.v ->> 'teto')::int FROM cfg), 40)
      - (SELECT count(*)::int FROM atual WHERE atual.ativa),
    COALESCE((SELECT (cfg.v ->> 'cap_sla')::int FROM cfg), 12)
      - (SELECT count(*)::int FROM atual WHERE atual.ativa AND atual.faixa = 'sla')
  ));
$$;

REVOKE ALL ON FUNCTION public.carteira_vagas_entrada_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_vagas_entrada_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_vagas_entrada_v1(uuid) IS
  'Quantos leads NOVOS a roleta pode entregar ao corretor agora: o menor entre a vaga global (teto) e a vaga da faixa SLA (cap_sla). Usar carteira_vagas_v1 aqui faria a distribuicao despejar leads que caem na Reserva no mesmo instante. Sem guard de escopo: e chamada de dentro da distribuicao, que roda sem auth.uid().';

-- ---------------------------------------------------------------------------
-- 5) Resgatar e soltar — a faixa B na mão do corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carteira_resgatar(_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _dono uuid;
  _vagas integer;
  _cap integer;
  _usados integer;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT l.corretor_id INTO _dono
  FROM public.leads AS l
  WHERE l.id = _lead AND l.deleted_at IS NULL AND l.na_lixeira = false;

  IF _dono IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_dono_ou_inexistente');
  END IF;
  -- O resgate é para a PRÓPRIA carteira. Gestor puxando lead para a carteira
  -- de um corretor seria reatribuição, que tem caminho próprio e registro.
  IF _dono <> _caller THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _cap := COALESCE((public.carteira_ativa_config() ->> 'cap_resgate')::int, 8);
  SELECT count(*)::int INTO _usados
  FROM public.carteira_resgates AS r WHERE r.corretor_id = _caller;

  IF _usados >= _cap AND NOT EXISTS (
    SELECT 1 FROM public.carteira_resgates AS r
    WHERE r.corretor_id = _caller AND r.lead_id = _lead
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cap_resgate_atingido', 'cap', _cap);
  END IF;

  _vagas := public.carteira_vagas_v1(_caller);

  INSERT INTO public.carteira_resgates (corretor_id, lead_id)
  VALUES (_caller, _lead)
  ON CONFLICT (corretor_id, lead_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', _lead,
    'vagas_antes', _vagas,
    'vagas_agora', public.carteira_vagas_v1(_caller));
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_resgatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_resgatar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_resgatar(uuid) IS
  'Puxa um lead da Reserva para a carteira ativa (faixa B). So para a propria carteira e so ate cap_resgate. Idempotente.';

CREATE OR REPLACE FUNCTION public.carteira_soltar(_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.carteira_resgates AS r
  WHERE r.corretor_id = _caller AND r.lead_id = _lead;

  RETURN jsonb_build_object('ok', true, 'lead_id', _lead,
                            'vagas_agora', public.carteira_vagas_v1(_caller));
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_soltar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_soltar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_soltar(uuid) IS
  'Desfaz um resgate: o lead volta a concorrer pelas faixas normais (e cai na Reserva se nao couber). Idempotente.';

-- ---------------------------------------------------------------------------
-- 6) A sombra do gestor
-- ---------------------------------------------------------------------------
-- O passo 4 da implantação: mostrar quem estouraria e o que sairia, SEM tirar
-- nada. Uma linha por corretor do escopo.
CREATE OR REPLACE FUNCTION public.carteira_sombra_v1()
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  teto integer,
  ativa integer,
  fundo integer,
  reserva integer,
  sem_movimento integer,
  sem_proximo_passo integer,
  em_jogo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '20s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _teto integer;
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

  _teto := COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 40);

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
      )
  ),
  -- Colunas explícitas: `cl.*` traria `nome` (do lead) colidindo com o `nome`
  -- do corretor, e a referência ficaria ambígua no GROUP BY.
  linhas AS (
    SELECT
      co.id      AS dono,
      cl.ativa   AS ativa,
      cl.faixa   AS faixa,
      cl.motivo  AS motivo,
      cl.valor   AS valor
    FROM corretores AS co
    CROSS JOIN LATERAL public._carteira_classificar(co.id) AS cl
  )
  SELECT
    co.id,
    co.nome,
    _teto,
    count(*) FILTER (WHERE l.ativa)::int,
    count(*) FILTER (WHERE l.faixa = 'fundo')::int,
    count(*) FILTER (WHERE NOT l.ativa)::int,
    count(*) FILTER (WHERE NOT l.ativa AND l.motivo LIKE 'sem movimento%')::int,
    count(*) FILTER (WHERE NOT l.ativa AND l.motivo = 'sem próximo passo definido')::int,
    COALESCE(sum(l.valor) FILTER (WHERE l.ativa), 0)
  FROM corretores AS co
  LEFT JOIN linhas AS l ON l.dono = co.id
  GROUP BY co.id, co.nome
  ORDER BY count(*) FILTER (WHERE NOT l.ativa) DESC, co.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_sombra_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_sombra_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_sombra_v1() IS
  'Modo sombra do teto de 40: por corretor do escopo, quantos ocupam vaga, quantos ficariam na Reserva e por qual gatilho — sem devolver nada. So gestao (corretor recebe 42501).';
