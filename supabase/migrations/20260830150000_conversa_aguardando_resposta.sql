-- ============================================================================
-- CONVERSA "AGUARDANDO RESPOSTA" — fonte única + estado tratada
-- (Lote 3 da auditoria das abas laterais, 2026-08-27)
--
-- O problema: "aguardando resposta" era DERIVADO em dois lugares que não
-- conversam — a Central de Mensagens contava entradas no fim da thread de
-- `mensagens`, e a fila "Responder" do /atendimento olhava a última linha de
-- `interacoes` (o ECO best-effort do webhook). Sem estado no banco, não
-- existia jeito de dar uma conversa por tratada sem responder: a luz nascia
-- sem botão de apagar ("a luz que não zera"), e eco perdido = fila cega.
--
-- A solução em três camadas:
--   1. `conversas_tratadas` — marcador por LEAD ("dei esta conversa por
--      tratada em T"). Uma linha por lead, upsert; uma entrada NOVA depois de
--      T reabre a pendência sozinha (nada de flag que gruda).
--   2. `conversa_aguardando_resposta(lead)` — O predicado, fonte única:
--      pendente ⇔ última ENTRADA > última SAÍDA e > tratada_em. Os marcos de
--      entrada/saída espelham a régua de follow-up (20260827130000): entrada
--      em interacoes (sem nota/mudança de status) OU em mensagens — o eco
--      pode falhar e a resposta real não pode sumir; saída em interacoes
--      (com autor), mensagens (sem falha) OU chamadas (sem falha) — qualquer
--      retorno registrado apaga a luz, inclusive os botões wa.me existentes.
--   3. Consumidores na MESMA fonte: nav_pendencias v5 (chave nova
--      `mensagens_aguardando`, dona única: Comunicações) e a fila
--      "responder" do atendimento_inbox_v4 (deixa de ler só o eco).
--
-- Disjunção (princípio da auditoria: um badge acende em UM hub): leads em
-- 'novo'/'aguardando_atendimento' ficam FORA do contador — são da fila de
-- entrada da Prospecção (badge `atendimento`), mesma precedência do CASE do
-- inbox. Etapas terminais (perdido/pós-venda) CONTAM: cliente que escreve
-- depois do fim da jornada precisa acender em algum lugar, e esse lugar é a
-- Central — a fila do /atendimento segue recortada à carteira ativa.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Marcador "conversa tratada" (por lead)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversas_tratadas (
  lead_id uuid PRIMARY KEY REFERENCES public.leads (id) ON DELETE CASCADE,
  tratada_em timestamptz NOT NULL DEFAULT now(),
  tratada_por uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.conversas_tratadas ENABLE ROW LEVEL SECURITY;

-- Leitura recortada como `mensagens`; escrita SÓ pela RPC (SECURITY DEFINER
-- com guarda) — nenhuma policy de INSERT/UPDATE/DELETE de propósito.
DROP POLICY IF EXISTS conversas_tratadas_select ON public.conversas_tratadas;
CREATE POLICY conversas_tratadas_select ON public.conversas_tratadas
  FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

REVOKE ALL ON public.conversas_tratadas FROM PUBLIC, anon;
GRANT SELECT ON public.conversas_tratadas TO authenticated;
GRANT ALL ON public.conversas_tratadas TO service_role;

-- Realtime: marcar tratada numa sessão apaga o badge nas outras.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas_tratadas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) O predicado — fonte única de "aguardando resposta"
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER e SEM grant para authenticated: quem chama são as funções
-- DEFINER abaixo (nav_pendencias, inbox, conversa_estado) — o recorte de
-- acesso é responsabilidade delas, e o predicado nunca vira superfície PostgREST.
CREATE OR REPLACE FUNCTION public.conversa_aguardando_resposta(_lead_id uuid)
RETURNS TABLE (aguardando boolean, ultima_entrada timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH marcos AS (
    SELECT
      (SELECT max(e.q) FROM (
         SELECT i.ocorreu_em AS q FROM public.interacoes i
         WHERE i.lead_id = _lead_id AND i.direcao = 'entrada'
           AND i.tipo NOT IN ('nota','mudanca_status') AND i.deleted_at IS NULL
         UNION ALL
         SELECT m.criado_em FROM public.mensagens m
         WHERE m.lead_id = _lead_id AND m.direcao = 'entrada'
       ) e) AS ult_entrada,
      (SELECT max(s.q) FROM (
         SELECT i.ocorreu_em AS q FROM public.interacoes i
         WHERE i.lead_id = _lead_id AND i.direcao = 'saida' AND i.autor_id IS NOT NULL
           AND i.tipo NOT IN ('nota','mudanca_status') AND i.deleted_at IS NULL
         UNION ALL
         SELECT m.criado_em FROM public.mensagens m
         WHERE m.lead_id = _lead_id AND m.direcao = 'saida'
           AND m.corretor_id IS NOT NULL AND m.status <> 'falha'
         UNION ALL
         SELECT c.criado_em FROM public.chamadas c
         WHERE c.lead_id = _lead_id AND c.direcao = 'saida' AND c.status <> 'falha'
       ) s) AS ult_saida,
      (SELECT ct.tratada_em FROM public.conversas_tratadas ct
        WHERE ct.lead_id = _lead_id) AS tratada_em
  )
  SELECT
    (m.ult_entrada IS NOT NULL
       AND m.ult_entrada > COALESCE(m.ult_saida, '-infinity'::timestamptz)
       AND m.ult_entrada > COALESCE(m.tratada_em, '-infinity'::timestamptz)),
    m.ult_entrada
  FROM marcos m
$$;

REVOKE ALL ON FUNCTION public.conversa_aguardando_resposta(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.conversa_aguardando_resposta(uuid)
  IS 'Fonte unica de "aguardando resposta": ultima entrada (interacoes sem nota/mudanca_status OU mensagens) mais recente que a ultima saida (interacoes com autor, mensagens sem falha, chamadas sem falha) e que o marcador conversas_tratadas.';

-- ---------------------------------------------------------------------------
-- 3) RPCs do cliente: estado da conversa e marcar como tratada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversa_estado(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _aguardando boolean;
  _ultima timestamptz;
  _tratada timestamptz;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid)
     OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT ca.aguardando, ca.ultima_entrada INTO _aguardando, _ultima
  FROM public.conversa_aguardando_resposta(_lead_id) ca;

  SELECT ct.tratada_em INTO _tratada
  FROM public.conversas_tratadas ct
  WHERE ct.lead_id = _lead_id;

  RETURN jsonb_build_object(
    'aguardando', COALESCE(_aguardando, false),
    'ultima_entrada', _ultima,
    'tratada_em', _tratada
  );
END;
$$;

-- Marca a conversa como tratada AGORA ("li, não precisa de resposta").
-- Idempotente por construção; uma entrada nova depois da marca reabre a
-- pendência sozinha. Devolve o estado novo para a UI atualizar sem refetch.
CREATE OR REPLACE FUNCTION public.marcar_conversa_tratada(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid)
     OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.conversas_tratadas (lead_id, tratada_em, tratada_por)
  VALUES (_lead_id, now(), _uid)
  ON CONFLICT (lead_id)
  DO UPDATE SET tratada_em = now(), tratada_por = excluded.tratada_por;

  RETURN public.conversa_estado(_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.conversa_estado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversa_estado(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.marcar_conversa_tratada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_conversa_tratada(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) nav_pendencias v5 — a chave `mensagens_aguardando` (dona: Comunicações)
-- ---------------------------------------------------------------------------
-- v4 inalterada no resto: contadores disjuntos (20260827210000). A chave nova
-- conta LEADS com conversa aguardando resposta pela fonte única, excluindo a
-- fila de entrada da Prospecção — mesma precedência do CASE do inbox.
CREATE OR REPLACE FUNCTION public.nav_pendencias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tudo boolean := false;
  _escopo uuid[];
  _atendimento int := 0;
  _tarefas int := 0;
  _agenda int := 0;
  _aprov int := 0;
  _followups int := 0;
  _mensagens int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RETURN jsonb_build_object('atendimento',0,'tarefas_vencidas',0,'agenda_hoje',0,'aprovacoes',0,'followups',0,'mensagens_aguardando',0);
  END IF;

  _tudo := public.ve_carteira_completa(_uid);
  IF NOT _tudo THEN
    SELECT array_agg(DISTINCT c) INTO _escopo
    FROM (
      SELECT _uid AS c
      UNION
      SELECT public.corretores_do_gestor(_uid)
    ) s
    WHERE c IS NOT NULL;
    _escopo := COALESCE(_escopo, ARRAY[_uid]);
  END IF;

  SELECT count(*) INTO _atendimento
  FROM public.leads l
  WHERE l.status = 'aguardando_atendimento'
    AND l.na_lixeira = false
    AND (_tudo OR l.corretor_id = ANY(_escopo));

  -- v4: SÓ tarefas que não são de contato — as de contato são o domínio do
  -- contador `followups` (a régua), e um esforço não acende dois badges.
  SELECT count(*) INTO _tarefas
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo NOT IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _agenda
  FROM public.agendamentos a
  WHERE a.status = 'agendado'
    AND a.deleted_at IS NULL
    AND (a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
        = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR a.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _aprov
  FROM public.vendas v
  WHERE v.status_venda = 'pendente'
    AND (_tudo OR v.corretor_id = ANY(_escopo));

  -- Follow-ups do DIA: LEADS com tarefa de contato aberta vencendo até hoje
  -- (BRT) — vencidas inclusas (inalterado da v3).
  SELECT count(DISTINCT COALESCE(t.lead_id, t.id)) INTO _followups
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
        <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  -- v5: conversas aguardando resposta pela FONTE ÚNICA. Leads da fila de
  -- entrada ficam fora (o badge `atendimento` da Prospecção é o dono deles);
  -- etapas terminais contam — cliente que escreve depois do fim da jornada
  -- acende aqui, e o botão de apagar (responder/marcar tratada) vive na Central.
  SELECT count(*) INTO _mensagens
  FROM public.leads l
  WHERE l.na_lixeira = false
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('novo', 'aguardando_atendimento')
    AND (_tudo OR l.corretor_id = ANY(_escopo))
    AND (SELECT ca.aguardando FROM public.conversa_aguardando_resposta(l.id) ca);

  RETURN jsonb_build_object(
    'atendimento', _atendimento,
    'tarefas_vencidas', _tarefas,
    'agenda_hoje', _agenda,
    'aprovacoes', _aprov,
    'followups', _followups,
    'mensagens_aguardando', _mensagens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nav_pendencias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nav_pendencias() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) atendimento_inbox_v4 — a fila "responder" lê a fonte única
-- ---------------------------------------------------------------------------
-- Mesma assinatura e mesmas filas da v4 (20260809121000); muda SÓ a origem do
-- "responder": antes `última interação = entrada` (o eco), agora o predicado
-- conversa_aguardando_resposta — eco perdido não cega a fila, e "marcar
-- tratada" na Central tira o lead daqui também (fonte única de verdade).
-- O motivo e o desempate passam a usar a última entrada REAL do cliente.
CREATE OR REPLACE FUNCTION public.atendimento_inbox_v4(
  _corretor_id uuid DEFAULT NULL,
  _limit_per_queue integer DEFAULT 15
)
RETURNS TABLE(
  fila text,
  total_count bigint,
  items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _target uuid := COALESCE(_corretor_id, auth.uid());
  _take integer := LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30);
  _now timestamptz := statement_timestamp();
BEGIN
  IF NOT public.is_active_member(_caller)
     OR NOT public.pode_acessar_corretor(_caller, _target) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH queue_defs(fila, ordem) AS (
    VALUES
      ('novos'::text, 1),
      ('responder'::text, 2),
      ('followups'::text, 3),
      ('esfriando'::text, 4),
      ('confirmar_visita'::text, 5),
      ('docs'::text, 6)
  ), base AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.email,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      l.created_at,
      l.corretor_id,
      l.origem,
      l.renda_informada,
      l.entrada_disponivel,
      l.usa_fgts,
      COALESCE(conversa.aguardando, false) AS aguardando_resposta,
      conversa.ultima_entrada AS ultima_entrada_cliente,
      COALESCE(docs.quantidade, 0::bigint) AS docs_pendentes,
      visita.agendamento_id AS visita_agendamento_id,
      visita.data_inicio AS visita_em,
      -- Régua única de contato (nunca NULL): interação registrada, senão o
      -- ultimo_contato importado/manual, senão a chegada do lead.
      GREATEST(
        0,
        floor(extract(epoch FROM (
          _now - COALESCE(l.ultima_interacao, l.ultimo_contato, l.created_at)
        )) / 86400)::integer
      ) AS dias_sem_contato,
      CASE
        WHEN conversa.ultima_entrada IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - conversa.ultima_entrada)) / 60)::bigint
        )
      END AS minutos_desde_resposta,
      CASE
        WHEN l.proximo_followup IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - l.proximo_followup)) / 60)::bigint
        )
      END AS minutos_followup_vencido,
      GREATEST(
        0,
        floor(extract(epoch FROM (_now - l.created_at)) / 60)::bigint
      ) AS minutos_desde_chegada
    FROM public.leads AS l
    LEFT JOIN LATERAL (
      -- Fonte única de "aguardando resposta" (mensagens + interacoes +
      -- marcador tratada) — substitui o "última interação = entrada" do eco.
      SELECT ca.aguardando, ca.ultima_entrada
      FROM public.conversa_aguardando_resposta(l.id) AS ca
    ) AS conversa ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS quantidade
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS docs ON true
    LEFT JOIN LATERAL (
      -- Próxima visita das 48h ainda sem confirmação (mesmo critério da
      -- exceção visita_sem_confirmacao do painel do gestor).
      SELECT a.id AS agendamento_id, a.data_inicio
      FROM public.agendamentos AS a
      WHERE a.lead_id = l.id
        AND a.deleted_at IS NULL
        AND a.tipo = 'visita'
        AND a.auto_gerado = false
        AND a.status = 'agendado'
        AND a.data_inicio BETWEEN _now AND _now + interval '48 hours'
      ORDER BY a.data_inicio ASC
      LIMIT 1
    ) AS visita ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id = _target
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND public.pode_acessar_lead(_caller, l.id)
  ), classified AS (
    SELECT
      b.*,
      CASE
        WHEN b.status IN (
          'novo'::public.lead_status,
          'aguardando_atendimento'::public.lead_status
        )
          THEN 'novos'
        WHEN b.aguardando_resposta
          THEN 'responder'
        WHEN b.proximo_followup IS NOT NULL AND b.proximo_followup <= _now
          THEN 'followups'
        WHEN b.temperatura IN (
          'quente'::public.lead_temperatura,
          'morno'::public.lead_temperatura
        ) AND b.dias_sem_contato >= 3
          THEN 'esfriando'
        WHEN b.visita_agendamento_id IS NOT NULL
          THEN 'confirmar_visita'
        WHEN b.docs_pendentes > 0
          THEN 'docs'
        ELSE NULL
      END::text AS fila,
      LEAST(
        100,
        GREATEST(
          0,
          CASE b.temperatura::text
            WHEN 'quente' THEN 35
            WHEN 'morno' THEN 15
            ELSE 0
          END
          + CASE b.status::text
            WHEN 'analise_credito' THEN 25
            WHEN 'visita_realizada' THEN 22
            WHEN 'agendado' THEN 16
            WHEN 'em_atendimento' THEN 12
            WHEN 'aguardando_retorno' THEN 10
            WHEN 'qualificado' THEN 10
            WHEN 'aguardando_atendimento' THEN 6
            WHEN 'novo' THEN 6
            ELSE 0
          END
          + CASE
            WHEN b.ultima_interacao IS NULL THEN 12
            WHEN b.dias_sem_contato >= 1 THEN LEAST(20, b.dias_sem_contato * 4)
            ELSE 0
          END
        )
      )::integer AS score
    FROM base AS b
  ), with_reason AS (
    SELECT
      c.*,
      CASE
        WHEN c.score >= 60 THEN 'alta'
        WHEN c.score >= 35 THEN 'media'
        ELSE 'baixa'
      END::text AS tier,
      CASE c.fila
        WHEN 'novos' THEN
          'chegou ' || CASE
            WHEN c.minutos_desde_chegada < 60
              THEN 'há ' || c.minutos_desde_chegada || 'min'
            WHEN c.minutos_desde_chegada < 1440
              THEN 'há ' || floor(c.minutos_desde_chegada / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_desde_chegada / 1440.0)::bigint || 'd'
          END || ' e aguarda o primeiro contato'
        WHEN 'responder' THEN
          'respondeu ' || CASE
            WHEN c.minutos_desde_resposta < 60
              THEN 'há ' || c.minutos_desde_resposta || 'min'
            WHEN c.minutos_desde_resposta < 1440
              THEN 'há ' || floor(c.minutos_desde_resposta / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_desde_resposta / 1440.0)::bigint || 'd'
          END || ' e aguarda retorno'
        WHEN 'followups' THEN
          'follow-up combinado venceu ' || CASE
            WHEN c.minutos_followup_vencido < 60
              THEN 'há ' || c.minutos_followup_vencido || 'min'
            WHEN c.minutos_followup_vencido < 1440
              THEN 'há ' || floor(c.minutos_followup_vencido / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_followup_vencido / 1440.0)::bigint || 'd'
          END
        WHEN 'esfriando' THEN
          c.temperatura::text || ' sem contato há ' || c.dias_sem_contato || ' dia(s)'
        WHEN 'confirmar_visita' THEN
          'visita ' || to_char(c.visita_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
            || ' ainda sem confirmação'
        WHEN 'docs' THEN
          c.docs_pendentes || ' documento(s) pendente(s) travando a pasta'
        ELSE NULL
      END::text AS motivo
    FROM classified AS c
    WHERE c.fila IS NOT NULL
  ), ranked AS (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.fila
        ORDER BY
          r.score DESC,
          CASE r.fila
            WHEN 'novos' THEN r.created_at
            WHEN 'responder' THEN r.ultima_entrada_cliente
            WHEN 'followups' THEN r.proximo_followup
            WHEN 'confirmar_visita' THEN r.visita_em
            ELSE COALESCE(r.ultima_interacao, r.created_at)
          END ASC NULLS LAST,
          r.id
      ) AS row_number
    FROM with_reason AS r
  ), aggregated AS (
    SELECT
      r.fila,
      count(*)::bigint AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'lead', jsonb_build_object(
              'id', r.id,
              'nome', r.nome,
              'telefone', r.telefone,
              'email', r.email,
              'status', r.status,
              'temperatura', r.temperatura,
              'ultima_interacao', r.ultima_interacao,
              'proximo_followup', r.proximo_followup,
              'projeto_nome', r.projeto_nome,
              'created_at', r.created_at,
              'corretor_id', r.corretor_id,
              'origem', r.origem,
              'renda_informada', r.renda_informada,
              'entrada_disponivel', r.entrada_disponivel,
              'usa_fgts', r.usa_fgts
            ),
            'score', r.score,
            'tier', r.tier,
            'motivo', r.motivo,
            'docsPendentes', r.docs_pendentes,
            'agendamentoId', r.visita_agendamento_id,
            'visitaEm', r.visita_em
          )
          ORDER BY r.row_number
        ) FILTER (WHERE r.row_number <= _take),
        '[]'::jsonb
      ) AS items
    FROM ranked AS r
    GROUP BY r.fila
  )
  SELECT
    q.fila,
    COALESCE(a.total_count, 0::bigint),
    COALESCE(a.items, '[]'::jsonb)
  FROM queue_defs AS q
  LEFT JOIN aggregated AS a ON a.fila = q.fila
  ORDER BY q.ordem;
END;
$$;

REVOKE ALL ON FUNCTION public.atendimento_inbox_v4(uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.atendimento_inbox_v4(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.atendimento_inbox_v4(uuid, integer)
  IS 'Inbox v4.1: a fila responder le a fonte unica conversa_aguardando_resposta (mensagens + interacoes + marcador tratada) em vez do eco de interacoes; motivo e desempate pela ultima entrada real do cliente. Demais filas identicas a v4.';

-- ---------------------------------------------------------------------------
-- 6) Sanidade: falha o replay se a fonte única não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _nav text := pg_get_functiondef('public.nav_pendencias()'::regprocedure);
  _inbox text := pg_get_functiondef('public.atendimento_inbox_v4(uuid, integer)'::regprocedure);
BEGIN
  IF to_regclass('public.conversas_tratadas') IS NULL THEN
    RAISE EXCEPTION 'conversa_aguardando_resposta: tabela conversas_tratadas nao existe';
  END IF;
  IF to_regprocedure('public.conversa_aguardando_resposta(uuid)') IS NULL
     OR to_regprocedure('public.conversa_estado(uuid)') IS NULL
     OR to_regprocedure('public.marcar_conversa_tratada(uuid)') IS NULL THEN
    RAISE EXCEPTION 'conversa_aguardando_resposta: funcoes da fonte unica ausentes';
  END IF;

  -- nav v5: chave nova presente (inclusive no objeto zerado) e disjunção com
  -- a Prospecção garantida no texto da função.
  IF (public.nav_pendencias() ? 'mensagens_aguardando') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'nav_pendencias v5: chave mensagens_aguardando ausente do objeto zerado';
  END IF;
  IF _nav NOT LIKE '%conversa_aguardando_resposta%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: contador nao le a fonte unica';
  END IF;
  IF _nav NOT LIKE '%NOT IN (''novo'', ''aguardando_atendimento'')%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: contador de mensagens invade o dominio da Prospeccao';
  END IF;
  -- Disjunções da v4 continuam de pé.
  IF _nav NOT LIKE '%tipo NOT IN (''follow_up''%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: tarefas_vencidas voltou a contar tarefas de contato';
  END IF;

  -- Inbox: a fila responder lê a fonte única e o caminho antigo (eco) sumiu.
  IF _inbox NOT LIKE '%conversa_aguardando_resposta%' THEN
    RAISE EXCEPTION 'atendimento_inbox v4.1: fila responder nao le a fonte unica';
  END IF;
  IF _inbox LIKE '%ultima_direcao%' THEN
    RAISE EXCEPTION 'atendimento_inbox v4.1: caminho antigo (ultima_direcao do eco) ainda presente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
