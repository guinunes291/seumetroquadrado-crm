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
--   2. `conversas_aguardando_resposta(lead_ids)` — O predicado, fonte única,
--      SET-BASED (um passe agrupado; a versão escalar por lead custava caro
--      demais dentro do inbox e do nav — revisão adversarial do lote):
--      pendente ⇔ última ENTRADA > última SAÍDA e > tratada_em, onde
--        entrada = interacoes de máquina (autor_id IS NULL: eco de webhook,
--                  ligação perdida — uma ligação ATENDIDA ou um contato
--                  registrado à mão tem autor e NÃO deixa ninguém esperando;
--                  nota/mudança de status nunca são conversa)
--                  OU mensagens (marco = recebida_em, o instante de chegada
--                  ao CRM — o criado_em do provedor pode chegar atrasado num
--                  retry de webhook e nascer atrás da saída, sumindo a luz);
--        saída   = interacoes com autor OU mensagens de corretor sem falha
--                  OU chamadas de saída sem falha — qualquer retorno HUMANO
--                  registrado apaga a luz, inclusive os botões wa.me.
--      A versão escalar `conversa_aguardando_resposta(lead)` é um wrapper da
--      set-based — uma regra só, deriva impossível.
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
-- 0) mensagens.recebida_em — o marco de pendência é a CHEGADA ao CRM
-- ---------------------------------------------------------------------------
-- O webhook grava criado_em = timestamp do provedor (ordem verdadeira da
-- thread e da régua de toques — não muda). Para a pendência vale o instante
-- em que o CRM ficou sabendo: entrega atrasada nunca nasce "já respondida".
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS recebida_em timestamptz;
UPDATE public.mensagens SET recebida_em = criado_em WHERE recebida_em IS NULL;
ALTER TABLE public.mensagens ALTER COLUMN recebida_em SET DEFAULT now();
ALTER TABLE public.mensagens ALTER COLUMN recebida_em SET NOT NULL;

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
-- 2) O predicado — fonte única de "aguardando resposta" (set-based)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER e SEM grant para authenticated: quem chama são as funções
-- DEFINER abaixo (nav_pendencias, inbox, conversa_estado) — o recorte de
-- acesso é responsabilidade delas, e o predicado nunca vira superfície
-- PostgREST. Devolve uma linha por lead COM eventos (lead mudo não aparece;
-- os wrappers tratam a ausência como não-aguardando).
CREATE OR REPLACE FUNCTION public.conversas_aguardando_resposta(_lead_ids uuid[])
RETURNS TABLE (lead_id uuid, aguardando boolean, ultima_entrada timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH alvo AS (
    SELECT DISTINCT a.id FROM unnest(_lead_ids) AS a(id) WHERE a.id IS NOT NULL
  ),
  eventos AS (
    SELECT i.lead_id, i.direcao::text AS dir, i.ocorreu_em AS em
    FROM public.interacoes i
    JOIN alvo ON alvo.id = i.lead_id
    WHERE i.deleted_at IS NULL
      AND i.tipo NOT IN ('nota','mudanca_status')
      AND ((i.direcao = 'entrada' AND i.autor_id IS NULL)
        OR (i.direcao = 'saida' AND i.autor_id IS NOT NULL))
    UNION ALL
    SELECT m.lead_id, m.direcao, m.recebida_em
    FROM public.mensagens m
    JOIN alvo ON alvo.id = m.lead_id
    WHERE m.direcao = 'entrada'
       OR (m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha')
    UNION ALL
    SELECT c.lead_id, 'saida', c.criado_em
    FROM public.chamadas c
    JOIN alvo ON alvo.id = c.lead_id
    WHERE c.direcao = 'saida' AND c.status <> 'falha'
  ),
  marcos AS (
    SELECT e.lead_id,
           max(e.em) FILTER (WHERE e.dir = 'entrada') AS ult_entrada,
           max(e.em) FILTER (WHERE e.dir = 'saida') AS ult_saida
    FROM eventos e
    GROUP BY e.lead_id
  )
  SELECT
    m.lead_id,
    (m.ult_entrada IS NOT NULL
       AND m.ult_entrada > COALESCE(m.ult_saida, '-infinity'::timestamptz)
       AND m.ult_entrada > COALESCE(ct.tratada_em, '-infinity'::timestamptz)),
    m.ult_entrada
  FROM marcos m
  LEFT JOIN public.conversas_tratadas ct ON ct.lead_id = m.lead_id
$$;

REVOKE ALL ON FUNCTION public.conversas_aguardando_resposta(uuid[])
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.conversas_aguardando_resposta(uuid[])
  IS 'Fonte unica set-based de "aguardando resposta": ultima entrada de maquina (interacoes com autor NULL sem nota/mudanca_status; mensagens por recebida_em) mais recente que a ultima saida humana (interacoes com autor, mensagens de corretor sem falha, chamadas sem falha) e que o marcador conversas_tratadas.';

-- Versão escalar: wrapper da set-based (uma regra só). Lead sem eventos ou
-- inexistente → (false, NULL).
CREATE OR REPLACE FUNCTION public.conversa_aguardando_resposta(_lead_id uuid)
RETURNS TABLE (aguardando boolean, ultima_entrada timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(c.aguardando, false), c.ultima_entrada
  FROM (SELECT 1) AS um
  LEFT JOIN public.conversas_aguardando_resposta(ARRAY[_lead_id]) AS c ON true
$$;

REVOKE ALL ON FUNCTION public.conversa_aguardando_resposta(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.conversa_aguardando_resposta(uuid)
  IS 'Wrapper escalar de conversas_aguardando_resposta(uuid[]) — mesma regra, um lead.';

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

  -- v5: conversas aguardando resposta pela FONTE ÚNICA, num passe set-based
  -- (a base inteira de um admin não aguenta função por lead). Leads da fila
  -- de entrada ficam fora (o badge `atendimento` da Prospecção é o dono);
  -- etapas terminais contam — cliente que escreve depois do fim da jornada
  -- acende aqui, e o botão de apagar (responder/marcar tratada) vive na
  -- Central.
  SELECT count(*) INTO _mensagens
  FROM public.conversas_aguardando_resposta(ARRAY(
    SELECT l.id
    FROM public.leads l
    WHERE l.na_lixeira = false
      AND l.deleted_at IS NULL
      AND l.status NOT IN ('novo', 'aguardando_atendimento')
      AND (_tudo OR l.corretor_id = ANY(_escopo))
  )) ca
  WHERE ca.aguardando;

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
-- "responder": antes `última interação = entrada` (o eco), agora a fonte
-- única — eco perdido não cega a fila, ligação atendida não acende luz falsa,
-- e "marcar tratada" na Central tira o lead daqui também. O motivo e o
-- desempate usam a última entrada REAL do cliente. A pendência chega num
-- passe set-based (CTE `pendentes`), nunca função por lead.
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
  ), pendentes AS (
    -- Fonte única de "aguardando resposta" para os leads ativos do corretor.
    SELECT p.lead_id, p.ultima_entrada
    FROM public.conversas_aguardando_resposta(ARRAY(
      SELECT l.id
      FROM public.leads l
      WHERE l.deleted_at IS NULL
        AND l.na_lixeira = false
        AND l.corretor_id = _target
        AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
    )) AS p
    WHERE p.aguardando
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
      (pendentes.lead_id IS NOT NULL) AS aguardando_resposta,
      pendentes.ultima_entrada AS ultima_entrada_cliente,
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
        WHEN pendentes.ultima_entrada IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - pendentes.ultima_entrada)) / 60)::bigint
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
    LEFT JOIN pendentes ON pendentes.lead_id = l.id
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
  IS 'Inbox v4.1: a fila responder le a fonte unica conversas_aguardando_resposta (mensagens + interacoes de maquina + marcador tratada, set-based) em vez do eco de interacoes; motivo e desempate pela ultima entrada real do cliente. Demais filas identicas a v4.';

-- ---------------------------------------------------------------------------
-- 6) Sanidade: falha o replay se a fonte única não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _fonte text := pg_get_functiondef('public.conversas_aguardando_resposta(uuid[])'::regprocedure);
  _nav text := pg_get_functiondef('public.nav_pendencias()'::regprocedure);
  _inbox text := pg_get_functiondef('public.atendimento_inbox_v4(uuid, integer)'::regprocedure);
BEGIN
  IF to_regclass('public.conversas_tratadas') IS NULL THEN
    RAISE EXCEPTION 'conversa_aguardando_resposta: tabela conversas_tratadas nao existe';
  END IF;
  IF to_regprocedure('public.conversas_aguardando_resposta(uuid[])') IS NULL
     OR to_regprocedure('public.conversa_aguardando_resposta(uuid)') IS NULL
     OR to_regprocedure('public.conversa_estado(uuid)') IS NULL
     OR to_regprocedure('public.marcar_conversa_tratada(uuid)') IS NULL THEN
    RAISE EXCEPTION 'conversa_aguardando_resposta: funcoes da fonte unica ausentes';
  END IF;
  IF (SELECT atttypid FROM pg_attribute
       WHERE attrelid = 'public.mensagens'::regclass AND attname = 'recebida_em') IS NULL THEN
    RAISE EXCEPTION 'mensagens.recebida_em (marco de chegada ao CRM) nao existe';
  END IF;

  -- A regra dos marcos: entrada só de máquina, mensagens pela chegada ao CRM.
  IF _fonte NOT LIKE '%autor_id IS NULL%' OR _fonte NOT LIKE '%recebida_em%' THEN
    RAISE EXCEPTION 'fonte unica: filtros de entrada (autor NULL / recebida_em) sumiram';
  END IF;

  -- nav v5: chave nova presente (inclusive no objeto zerado) e disjunção com
  -- a Prospecção garantida no texto da função.
  IF (public.nav_pendencias() ? 'mensagens_aguardando') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'nav_pendencias v5: chave mensagens_aguardando ausente do objeto zerado';
  END IF;
  IF _nav NOT LIKE '%conversas_aguardando_resposta%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: contador nao le a fonte unica set-based';
  END IF;
  IF _nav NOT LIKE '%NOT IN (''novo'', ''aguardando_atendimento'')%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: contador de mensagens invade o dominio da Prospeccao';
  END IF;
  -- Disjunções da v4 continuam de pé.
  IF _nav NOT LIKE '%tipo NOT IN (''follow_up''%' THEN
    RAISE EXCEPTION 'nav_pendencias v5: tarefas_vencidas voltou a contar tarefas de contato';
  END IF;

  -- Inbox: a fila responder lê a fonte única set-based e o caminho antigo
  -- (eco por última interação) sumiu.
  IF _inbox NOT LIKE '%conversas_aguardando_resposta%' THEN
    RAISE EXCEPTION 'atendimento_inbox v4.1: fila responder nao le a fonte unica';
  END IF;
  IF _inbox LIKE '%ultima_direcao%' THEN
    RAISE EXCEPTION 'atendimento_inbox v4.1: caminho antigo (ultima_direcao do eco) ainda presente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
