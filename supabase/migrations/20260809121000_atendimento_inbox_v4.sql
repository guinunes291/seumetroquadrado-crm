-- Atendimento inbox v4: a fila "confirmar_visita" (ux-ia-2026-08, item 2.5).
--
-- A tarefa #5b ("confirmar a visita de amanhã") não tinha caminho para o
-- corretor: a exceção visita_sem_confirmacao existia SÓ no painel do gestor —
-- o sistema sabia que a visita não estava confirmada e não oferecia a quem
-- pode agir. A v4 acrescenta a 6ª fila, entre "esfriando" e "docs" (ordem da
-- auditoria): visita marcada nas próximas 48h com agendamento ainda em
-- 'agendado' (confirmado/remarcado saem; auto_gerado — agendamento sintético
-- de visita já realizada — nunca entra). Mesmo critério do painel do gestor.
--
-- O payload do item ganha "agendamentoId" e "visitaEm" para o botão
-- [Confirmar] agir in-line no card, sem abrir formulário.
--
-- Como no v3→v2, o CASE de classificação É o dedup (cada lead numa fila só):
-- a fila nova entra como ramo do MESMO CASE — nunca UNION (o parse do
-- cliente é fail-closed para lead duplicado). A v3 permanece intacta como
-- degrau do rpcWithFallback (v4 → v3 → v2).

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
      ultima.direcao AS ultima_direcao,
      ultima.ocorreu_em AS ultima_ocorreu_em,
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
        WHEN ultima.ocorreu_em IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - ultima.ocorreu_em)) / 60)::bigint
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
      SELECT i.direcao, i.ocorreu_em
      FROM public.interacoes AS i
      WHERE i.lead_id = l.id
        AND i.deleted_at IS NULL
      ORDER BY i.ocorreu_em DESC, i.id DESC
      LIMIT 1
    ) AS ultima ON true
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
        WHEN b.ultima_direcao = 'entrada'::public.interacao_direcao
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
            WHEN 'responder' THEN r.ultima_ocorreu_em
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
  IS 'Inbox v4: fila confirmar_visita (visita das 48h em status agendado, com agendamentoId para confirmar in-line) entre esfriando e docs; demais regras identicas a v3.';

NOTIFY pgrst, 'reload schema';
