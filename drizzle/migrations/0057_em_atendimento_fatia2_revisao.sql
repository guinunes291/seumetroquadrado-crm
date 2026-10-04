-- ============================================================================
-- Regra dos 65, Fatia 2 — correções da revisão adversarial (04/10/2026)
-- ============================================================================
-- A Fatia 2 (20261010120500) passou por uma revisão independente: quatro
-- revisores por lente (SQL, telas, regressão, deploy) e três céticos por
-- achado. O que sobreviveu à refutação e contraria o desenho entra aqui. A
-- migration anterior ainda não rodou em produção; esta vem logo depois dela.
--
--   1. "Pediu retorno"/"Esfriou" gravavam a data direto em proximo_followup,
--      sem tarefa. Esse campo é ESPELHO de min(data_vencimento) das tarefas
--      abertas (sync_proximo_followup): a próxima mexida em tarefas apagava a
--      data combinada. Agora o desfecho cria a tarefa, como a cadência faz.
--   2. Quem entrava pela troca ficava sem próximo passo (a entrada normal
--      ganha follow-up em 1 dia pelo hook de etapa). A troca cria a tarefa.
--   3. A troca aceitava dois leads SEM dono como "mesma carteira".
--   4. A escolha dos 65 do dono anterior engolia a escolha do dono novo
--      (PK em lead_id); escolha de lead que saía de Em atendimento revivia
--      sozinha quando ele voltava; lead arquivado contava como escolhido.
--      Agora: escolha é do dono atual, um gatilho apaga a escolha quando o
--      lead sai de Em atendimento ou troca de dono, e o recorte de "vivo" é
--      o mesmo de em_atendimento_ocupacao.
--   5. cadencia_marcar_respondeu gravava em_atendimento por fora da trava: o
--      corretor lotado entrava pela Fila do Dia. A trava virou uma função só
--      (_em_atendimento_travar), usada por transicionar_lead e pela cadência.
--
-- Fora daqui, por decisão de escopo (ver docs/ops/em-atendimento-teto-65.md
-- §7.5): entrada por POSSE (lote da Prospecção, discador, oferta ativa) de
-- lead que já está em em_atendimento sem dono — é a porta que a Fatia 3
-- fecha ao devolver esses leads para Aguardando atendimento.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A trava, uma função só
-- ---------------------------------------------------------------------------
-- Mesma regra de 20261010120500: vale para o PRÓPRIO corretor dono do lead,
-- com papel de corretor, numa TRANSIÇÃO para em_atendimento. Gestão, serviço
-- e quem age na carteira de outro seguem livres. Cadeado por corretor.
CREATE OR REPLACE FUNCTION public._em_atendimento_travar(
  _lead_id uuid,
  _status_atual public.lead_status,
  _corretor_id uuid,
  _uid uuid,
  _gestao boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ocupacao integer;
  _teto integer;
BEGIN
  IF _status_atual IS NOT DISTINCT FROM 'em_atendimento'::public.lead_status THEN
    RETURN;
  END IF;
  IF _gestao OR _corretor_id IS NULL OR _corretor_id IS DISTINCT FROM _uid THEN
    RETURN;
  END IF;
  IF NOT public.has_role(_corretor_id, 'corretor'::public.app_role) THEN
    RETURN;
  END IF;
  -- Duas entradas do mesmo corretor ao mesmo tempo contam uma de cada vez.
  PERFORM pg_advisory_xact_lock(hashtext('em_atendimento:' || _corretor_id::text));
  _ocupacao := public.em_atendimento_ocupacao(_corretor_id);
  _teto := (public.em_atendimento_config() ->> 'teto')::int;
  IF _ocupacao >= _teto THEN
    RAISE EXCEPTION 'Em atendimento lotado: % de %. Para pôr este lead, libere uma vaga (entra um, sai um).',
      _ocupacao, _teto
      USING ERRCODE = 'EA065',
            DETAIL = jsonb_build_object('em_atendimento', _ocupacao, 'teto', _teto,
                                        'lead_id', _lead_id)::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) A escolha dos 65: do dono atual, só enquanto o lead está em atendimento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_escolhidos(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::int
    FROM public.em_atendimento_escolhas AS e
    JOIN public.leads AS l ON l.id = e.lead_id
   WHERE e.corretor_id = _corretor
     AND l.corretor_id = _corretor
     AND l.status = 'em_atendimento'::public.lead_status
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false)
     AND l.arquivado_em IS NULL
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_escolhidos(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.escolher_em_atendimento(
  _lead_id uuid,
  _escolher boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _teto integer := (public.em_atendimento_config() ->> 'teto')::int;
  _n integer;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- A escolha é do dono: "o corretor escolhe os seus 65".
  IF _lead.corretor_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'só o corretor do lead escolhe os seus 65' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('em_atendimento_escolha:' || _uid::text));

  -- Limpa escolhas que perderam o efeito (lead saiu ou mudou de dono).
  DELETE FROM public.em_atendimento_escolhas AS e
   WHERE e.corretor_id = _uid
     AND NOT EXISTS (
       SELECT 1 FROM public.leads AS l
        WHERE l.id = e.lead_id AND l.corretor_id = _uid
          AND l.status = 'em_atendimento'::public.lead_status
          AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
          AND l.arquivado_em IS NULL);

  IF NOT _escolher THEN
    DELETE FROM public.em_atendimento_escolhas WHERE lead_id = _lead_id;
  ELSE
    IF _lead.status IS DISTINCT FROM 'em_atendimento'::public.lead_status
       OR _lead.deleted_at IS NOT NULL OR COALESCE(_lead.na_lixeira, false)
       OR _lead.arquivado_em IS NOT NULL THEN
      RAISE EXCEPTION 'só lead em Em atendimento pode ser escolhido' USING ERRCODE = '22023';
    END IF;
    -- A escolha do dono anterior não vale para o dono novo (revisão: a linha
    -- antiga, com a PK em lead_id, engolia o INSERT e a RPC dizia ok).
    DELETE FROM public.em_atendimento_escolhas WHERE lead_id = _lead_id AND corretor_id <> _uid;
    IF NOT EXISTS (SELECT 1 FROM public.em_atendimento_escolhas WHERE lead_id = _lead_id) THEN
      _n := public.em_atendimento_escolhidos(_uid);
      IF _n >= _teto THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'limite', 'escolhidos', _n, 'teto', _teto);
      END IF;
      INSERT INTO public.em_atendimento_escolhas (lead_id, corretor_id) VALUES (_lead_id, _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'escolhido', _escolher,
    'escolhidos', public.em_atendimento_escolhidos(_uid),
    'teto', _teto);
END;
$$;

REVOKE ALL ON FUNCTION public.escolher_em_atendimento(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escolher_em_atendimento(uuid, boolean) TO authenticated, service_role;

-- O gatilho: a escolha perde o efeito no instante em que o lead sai de Em
-- atendimento, troca de dono, vai para a lixeira, é excluído ou arquivado —
-- sem depender de o corretor voltar a usar a RPC. Só dispara para quem ESTAVA
-- em em_atendimento (a escolha só existe para esses).
CREATE OR REPLACE FUNCTION public.tg_leads_em_atendimento_escolha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'em_atendimento'::public.lead_status
     OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
     OR COALESCE(NEW.na_lixeira, false)
     OR NEW.deleted_at IS NOT NULL
     OR NEW.arquivado_em IS NOT NULL THEN
    DELETE FROM public.em_atendimento_escolhas WHERE lead_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_em_atendimento_escolha ON public.leads;
CREATE TRIGGER trg_zz_em_atendimento_escolha
  AFTER UPDATE OF status, corretor_id, na_lixeira, deleted_at, arquivado_em ON public.leads
  FOR EACH ROW
  WHEN (OLD.status = 'em_atendimento'::public.lead_status)
  EXECUTE FUNCTION public.tg_leads_em_atendimento_escolha();

-- Escolhas que já perderam o efeito (a tabela nasceu na migration anterior;
-- em produção está vazia).
DELETE FROM public.em_atendimento_escolhas AS e
 WHERE NOT EXISTS (
   SELECT 1 FROM public.leads AS l
    WHERE l.id = e.lead_id AND l.corretor_id = e.corretor_id
      AND l.status = 'em_atendimento'::public.lead_status
      AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
      AND l.arquivado_em IS NULL);

-- A regra única: `escolhido` só na camada em_atendimento.
CREATE OR REPLACE FUNCTION public._em_atendimento_classificar(_corretores uuid[])
RETURNS TABLE (
  corretor_id uuid,
  lead_id uuid,
  nome text,
  telefone text,
  status text,
  origem text,
  temperatura text,
  projeto_nome text,
  grupo text,
  camada text,
  movimento timestamptz,
  dias_sem_toque integer,
  proximo_followup timestamptz,
  escreveu_em timestamptz,
  escolhido boolean,
  posicao integer,
  acao text,
  destino text,
  motivo text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT
      (c.v ->> 'teto')::int                     AS teto,
      (c.v ->> 'dias_sem_toque')::int           AS dias_sem_toque,
      (c.v ->> 'tolerancia_retorno_dias')::int  AS tolerancia,
      (c.v ->> 'retorno_max_dias')::int         AS retorno_max,
      (c.v ->> 'qualificacao_prazo_horas')::int AS qualif_horas,
      (c.v ->> 'escreveu_dias')::int            AS escreveu_dias,
      (c.v ->> 'fundo_topo_dias')::int          AS fundo_topo,
      (c.v ->> 'fundo_gestor_dias')::int        AS fundo_gestor,
      (c.v ->> 'fundo_desfecho_dias')::int      AS fundo_desfecho
    FROM (SELECT public.em_atendimento_config() AS v) AS c
  ),
  vivos AS (
    SELECT
      l.corretor_id,
      l.id,
      l.nome,
      l.telefone,
      l.status::text                                        AS status,
      l.origem::text                                        AS origem,
      l.temperatura::text                                   AS temperatura,
      COALESCE(NULLIF(l.projeto_nome, ''), pr.nome)         AS projeto_nome,
      CASE
        WHEN public.lead_origem_conquistada(l.origem)                 THEN 'proprio'
        WHEN public.lead_origem_paga(l.origem, l.sdr_entregue_em)
          OR l.origem::text = 'portal'                                THEN 'pago'
        ELSE 'estoque'
      END                                                   AS grupo,
      CASE
        WHEN l.status IN ('agendado', 'visita_realizada',
                          'proposta_enviada', 'analise_credito')      THEN 'fundo'
        WHEN l.status = 'em_atendimento'                              THEN 'em_atendimento'
        ELSE 'base'
      END                                                   AS camada,
      l.ultimo_contato,
      l.proximo_followup,
      COALESCE(l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'), false) AS em_cadencia,
      l.sdr_entregue_em,
      l.created_at,
      -- Escolha do corretor (Fatia 2): vale só enquanto o lead é dele.
      (esc.lead_id IS NOT NULL)                             AS escolhido
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    LEFT JOIN public.em_atendimento_escolhas AS esc
      ON esc.lead_id = l.id AND esc.corretor_id = l.corretor_id
     AND l.status = 'em_atendimento'::public.lead_status
    WHERE l.corretor_id = ANY(_corretores)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.arquivado_em IS NULL
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND NOT public._lead_venda_viva(l.id)
  ),
  -- O último CONTATO real (ver o cabeçalho): mesmo recorte de eventos de
  -- conversas_aguardando_resposta. Mudança de status e nota não contam.
  eventos AS (
    SELECT i.lead_id, max(i.ocorreu_em) AS em
    FROM public.interacoes AS i
    JOIN vivos AS v ON v.id = i.lead_id
    WHERE i.deleted_at IS NULL
      AND i.tipo NOT IN ('nota', 'mudanca_status')
      AND (i.direcao = 'entrada' OR i.autor_id IS NOT NULL)
    GROUP BY i.lead_id
    UNION ALL
    SELECT m.lead_id, max(m.recebida_em)
    FROM public.mensagens AS m
    JOIN vivos AS v ON v.id = m.lead_id
    WHERE m.direcao = 'entrada'
       OR (m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha')
    GROUP BY m.lead_id
    UNION ALL
    SELECT ch.lead_id, max(ch.criado_em)
    FROM public.chamadas AS ch
    JOIN vivos AS v ON v.id = ch.lead_id
    WHERE ch.direcao = 'saida' AND ch.status <> 'falha'
    GROUP BY ch.lead_id
  ),
  toques AS (
    SELECT e.lead_id, max(e.em) AS ultimo
    FROM eventos AS e
    GROUP BY e.lead_id
  ),
  marcados AS (
    SELECT
      v.*,
      t.movimento,
      -- Dias COMPLETOS: "5 dias sem toque" só fecha no 5º dia inteiro.
      GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - t.movimento)) / 86400))::int AS dias,
      -- Passo vivo só importa para quem disputa vaga (e custa uma consulta
      -- por lead). Regra única de "tem próximo passo": lead_sem_proximo_passo.
      CASE
        WHEN v.camada = 'em_atendimento' AND NOT v.em_cadencia
          THEN NOT public.lead_sem_proximo_passo(v.id)
      END AS passo_futuro
    FROM vivos AS v
    LEFT JOIN toques AS tq ON tq.lead_id = v.id
    -- Nunca contatado: o relógio corre desde a chegada.
    CROSS JOIN LATERAL (
      SELECT COALESCE(GREATEST(v.ultimo_contato, tq.ultimo), v.created_at) AS movimento
    ) AS t
  ),
  -- "O cliente escreveu": última entrada de máquina/cliente, pela fonte única
  -- de conversas (interacoes + mensagens). Só para quem está em atendimento.
  escreveu AS (
    SELECT r.lead_id, r.ultima_entrada
    FROM public.conversas_aguardando_resposta(ARRAY(
      SELECT m.id FROM marcados AS m WHERE m.camada = 'em_atendimento'
    )) AS r
  ),
  -- Quando o lead entrou em Qualificação Corretor. A transição é registrada
  -- por transicionar_lead (o banco bloqueia UPDATE de status fora dela); o
  -- lead que JÁ NASCE nessa etapa (entrega do bot/SDR) cai no fallback.
  qualif AS (
    SELECT
      m.id,
      COALESCE(
        (SELECT max(e.created_at)
           FROM public.lead_eventos AS e
          WHERE e.lead_id = m.id
            AND e.tipo = 'transicao_lead'
            AND e.payload ->> 'para_status' IN ('qualificacao_corretor', 'qualificado')),
        m.sdr_entregue_em,
        m.created_at
      ) AS entrou_em
    FROM marcados AS m
    WHERE m.status IN ('qualificacao_corretor', 'qualificado')
  ),
  -- A disputa pelas 65 vagas. Só compete quem está DE FATO em atendimento:
  --   * cadência sem resposta não é conversa (é porta a fechar);
  --   * 5+ dias sem toque perde a vaga pelo relógio, independente da ordem.
  -- Ordem decidida pelo dono: a ESCOLHA do corretor primeiro (Fatia 2: "o
  -- corretor escolhe os seus 65; a quem não escolheu, o critério"); depois
  -- passo com data futura > cliente escreveu nos últimos 7 dias > quente >
  -- toque mais recente > origem paga. A escolha NÃO protege do relógio: o
  -- filtro de 5 dias acima vale para o escolhido também (decisão do dono).
  disputa AS (
    SELECT
      m.id,
      row_number() OVER (
        PARTITION BY m.corretor_id
        ORDER BY
          m.escolhido DESC,
          m.passo_futuro DESC,
          (es.ultima_entrada >= now() - make_interval(days => cfg.escreveu_dias)) IS TRUE DESC,
          (m.temperatura = 'quente') IS TRUE DESC,
          m.movimento DESC,
          (m.grupo = 'pago') DESC,
          m.id
      )::int AS posicao
    FROM marcados AS m
    CROSS JOIN cfg
    LEFT JOIN escreveu AS es ON es.lead_id = m.id
    WHERE m.camada = 'em_atendimento'
      AND NOT m.em_cadencia
      AND m.dias < cfg.dias_sem_toque
  ),
  acoes AS (
    SELECT
      m.*,
      es.ultima_entrada,
      d.posicao,
      q.entrou_em,
      cfg.teto,
      cfg.tolerancia,
      cfg.retorno_max,
      cfg.qualif_horas,
      CASE m.grupo
        WHEN 'pago'    THEN 'roleta'
        WHEN 'estoque' THEN 'bolsao'
        ELSE                'fica_alerta_gestor'
      END AS sai_para,
      CASE
        WHEN m.camada = 'fundo' THEN
          CASE
            WHEN m.dias >= cfg.fundo_desfecho THEN 'fundo_desfecho'
            WHEN m.dias >= cfg.fundo_gestor   THEN 'fundo_gestor'
            WHEN m.dias >= cfg.fundo_topo     THEN 'fundo_topo'
            ELSE                                   'fundo_ok'
          END
        WHEN m.camada = 'em_atendimento' THEN
          CASE
            WHEN m.em_cadencia                  THEN 'porta_cadencia'
            WHEN m.dias >= cfg.dias_sem_toque   THEN 'perde_vaga'
            WHEN d.posicao > cfg.teto           THEN 'excedente'
            ELSE                                     'fica'
          END
        -- Base ("Minha base")
        WHEN m.em_cadencia THEN 'cadencia'
        WHEN m.status IN ('qualificacao_corretor', 'qualificado')
             AND now() - q.entrou_em >= make_interval(hours => cfg.qualif_horas)
          THEN 'qualificacao_vencida'
        WHEN m.status = 'aguardando_retorno'
             AND m.proximo_followup > now() + make_interval(days => cfg.retorno_max)
          THEN 'retorno_acima_maximo'
        -- Retorno combinado: protegido até a data + tolerância. Depois disso,
        -- se ninguém tocou desde a data, a promessa ao cliente não foi
        -- cumprida e o lead sai — sem esperar mais 5 dias (decisão do dono:
        -- "dia 25 combinado, ninguém ligou até o 27, sai").
        WHEN m.status = 'aguardando_retorno' AND m.proximo_followup IS NOT NULL
             AND now() < m.proximo_followup + make_interval(days => cfg.tolerancia)
          THEN 'retorno_protegido'
        WHEN m.status = 'aguardando_retorno' AND m.proximo_followup IS NOT NULL
             AND m.movimento < m.proximo_followup
          THEN 'retorno_vencido'
        WHEN m.dias >= cfg.dias_sem_toque THEN 'sem_toque'
        ELSE 'base_ok'
      END AS acao
    FROM marcados AS m
    CROSS JOIN cfg
    LEFT JOIN escreveu AS es ON es.lead_id = m.id
    LEFT JOIN disputa  AS d  ON d.id = m.id
    LEFT JOIN qualif   AS q  ON q.id = m.id
  )
  SELECT
    a.corretor_id,
    a.id               AS lead_id,
    a.nome,
    a.telefone,
    a.status,
    a.origem,
    a.temperatura,
    a.projeto_nome,
    a.grupo,
    a.camada,
    a.movimento,
    a.dias             AS dias_sem_toque,
    a.proximo_followup,
    a.ultima_entrada   AS escreveu_em,
    a.escolhido,
    a.posicao,
    a.acao,
    CASE a.acao
      WHEN 'excedente'            THEN 'minha_base'
      WHEN 'perde_vaga'           THEN 'minha_base'
      WHEN 'porta_cadencia'       THEN 'aguardando_atendimento'
      WHEN 'qualificacao_vencida' THEN a.sai_para
      WHEN 'retorno_vencido'      THEN a.sai_para
      WHEN 'sem_toque'            THEN a.sai_para
      -- Retorno além do máximo vira perda "retorno futuro" e volta pela
      -- reativação — menos o lead próprio, que nunca sai do corretor.
      WHEN 'retorno_acima_maximo' THEN
        CASE WHEN a.grupo = 'proprio' THEN 'fica_alerta_gestor' ELSE 'reativacao' END
      WHEN 'fundo_gestor'         THEN 'gestor'
      WHEN 'fundo_desfecho'       THEN 'gestor'
      ELSE NULL
    END AS destino,
    CASE a.acao
      WHEN 'fica'           THEN 'nos ' || a.teto || ' (posição ' || a.posicao
                                 || CASE WHEN a.escolhido THEN ', escolhido' ELSE '' END || ')'
      WHEN 'excedente'      THEN 'acima do teto de ' || a.teto || ' (posição ' || a.posicao || ')'
      WHEN 'perde_vaga'     THEN a.dias || ' dias sem toque'
      WHEN 'porta_cadencia' THEN 'em cadência sem resposta do cliente'
      WHEN 'cadencia'       THEN 'na cadência'
      WHEN 'qualificacao_vencida'
        THEN 'qualificado há mais de ' || a.qualif_horas || ' h sem virar atendimento'
      WHEN 'retorno_acima_maximo'
        THEN 'retorno marcado para além de ' || a.retorno_max || ' dias'
      WHEN 'retorno_protegido'
        THEN 'retorno combinado para '
             || to_char(a.proximo_followup AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
      WHEN 'retorno_vencido'
        THEN 'retorno de '
             || to_char(a.proximo_followup AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
             || ' não foi feito'
      WHEN 'sem_toque'      THEN a.dias || ' dias sem toque'
      WHEN 'fundo_topo'     THEN a.dias || ' dias parado no fundo do funil'
      WHEN 'fundo_gestor'   THEN a.dias || ' dias parado no fundo do funil'
      WHEN 'fundo_desfecho' THEN a.dias || ' dias parado no fundo do funil'
      ELSE NULL
    END AS motivo
  FROM acoes AS a;
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_classificar(uuid[])
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Retorno com tarefa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_retorno_lead(
  _lead_id uuid,
  _tipo text,
  _data timestamptz,
  _nota text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _max integer := (public.em_atendimento_config() ->> 'retorno_max_dias')::int;
  _proprio boolean;
  _quando text;
  _texto text;
BEGIN
  IF _tipo NOT IN ('pediu_retorno', 'esfriou') THEN
    RAISE EXCEPTION 'desfecho de retorno inválido: %', _tipo USING ERRCODE = '22023';
  END IF;
  IF _data IS NULL OR _data <= now() THEN
    RAISE EXCEPTION 'a data do retorno precisa ser futura' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  _proprio := public.lead_origem_conquistada(_lead.origem);
  _quando := to_char(_data AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  _texto := CASE _tipo WHEN 'esfriou' THEN 'Esfriou' ELSE 'Pediu retorno' END
            || ' — retorno em ' || _quando
            || COALESCE('. ' || NULLIF(btrim(_nota), ''), '');

  IF _data > now() + make_interval(days => _max) AND NOT _proprio THEN
    PERFORM public.transicionar_lead(
      _lead_id, 'perdido'::public.lead_status,
      'Retorno futuro: ' || _texto, NULL, NULL, 'retorno_futuro');
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'retorno_futuro',
            'Retorno combinado para ' || _quando || ', além de ' || _max || ' dias.',
            'registrar_retorno_lead',
            jsonb_build_object('retorno_em', _data, 'desfecho', _tipo, 'alterado_por', auth.uid()));
    RETURN jsonb_build_object('destino', 'perdido', 'categoria', 'retorno_futuro',
                              'retorno_em', _data, 'proprio', false);
  END IF;

  PERFORM public.transicionar_lead(
    _lead_id, 'aguardando_retorno'::public.lead_status,
    _texto,
    CASE _tipo WHEN 'esfriou' THEN 'Retomar o contato (esfriou)'
               ELSE 'Retornar como combinado' END,
    _data);
  IF _tipo = 'esfriou' THEN
    UPDATE public.leads SET temperatura = 'frio'::public.lead_temperatura WHERE id = _lead_id;
  END IF;

  -- A data vira TAREFA. leads.proximo_followup é espelho de min(data_vencimento)
  -- das tarefas abertas (sync_proximo_followup): escrita direto, a primeira
  -- operação em tarefas a apagaria — a mesma lição de cadencia_marcar_respondeu.
  -- Com a tarefa, o espelho se preenche sozinho e o retorno fica protegido até a
  -- data (retorno_protegido no classificador).
  IF COALESCE(_lead.corretor_id, auth.uid()) IS NOT NULL THEN
    INSERT INTO public.tarefas
      (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
       criado_por, data_vencimento, origem_automatica)
    VALUES
      (CASE _tipo WHEN 'esfriou' THEN 'Retomar o contato (esfriou)' ELSE 'Retornar como combinado' END,
       'Retorno combinado com o cliente para ' || _quando
         || COALESCE(': ' || NULLIF(btrim(_nota), ''), '') || '.',
       'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
       'media'::public.tarefa_prioridade, _lead_id, COALESCE(_lead.corretor_id, auth.uid()),
       auth.uid(), _data, true);
  END IF;

  RETURN jsonb_build_object('destino', 'aguardando_retorno', 'retorno_em', _data,
                            'proprio', _proprio);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_retorno_lead(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lead(uuid, text, timestamptz, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) A troca: só dentro de uma carteira, e quem entra ganha o próximo passo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trocar_vaga_em_atendimento(
  _entra uuid,
  _sai uuid,
  _desfecho text,
  _data timestamptz DEFAULT NULL,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL,
  _proximo_followup timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.leads%ROWTYPE;
  _s public.leads%ROWTYPE;
  _saida jsonb;
  _followup timestamptz;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _entra IS NULL OR _sai IS NULL OR _entra = _sai THEN
    RAISE EXCEPTION 'a troca precisa de um lead que entra e outro que sai' USING ERRCODE = '22023';
  END IF;

  -- Ordem fixa dos cadeados: duas trocas cruzadas não se travam.
  PERFORM 1 FROM public.leads WHERE id IN (_entra, _sai) ORDER BY id FOR UPDATE;
  SELECT * INTO _e FROM public.leads WHERE id = _entra;
  SELECT * INTO _s FROM public.leads WHERE id = _sai;
  IF _e.id IS NULL OR _s.id IS NULL THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Lead sem dono não tem carteira: dois NULLs não são "a mesma" (revisão).
  IF _s.corretor_id IS NULL OR _e.corretor_id IS DISTINCT FROM _s.corretor_id THEN
    RAISE EXCEPTION 'a troca é dentro da carteira de um corretor' USING ERRCODE = '22023';
  END IF;
  IF _s.status IS DISTINCT FROM 'em_atendimento'::public.lead_status THEN
    RAISE EXCEPTION 'quem sai precisa estar em Em atendimento' USING ERRCODE = '22023';
  END IF;
  IF _e.status = 'em_atendimento'::public.lead_status THEN
    RAISE EXCEPTION 'quem entra já está em Em atendimento' USING ERRCODE = '22023';
  END IF;

  IF _desfecho IN ('pediu_retorno', 'esfriou') THEN
    _saida := public.registrar_retorno_lead(_sai, _desfecho, _data, _detalhe);
  ELSIF _desfecho = 'perdido' THEN
    PERFORM public.marcar_lead_perdido_v2(_sai, _categoria, _detalhe);
    _saida := jsonb_build_object('destino', 'perdido', 'categoria', _categoria);
  ELSE
    RAISE EXCEPTION 'desfecho da troca inválido: % (use pediu_retorno, esfriou ou perdido)', _desfecho
      USING ERRCODE = '22023';
  END IF;

  -- A vaga está livre: a entrada passa pela trava de sempre. Quem entra ganha
  -- o próximo passo que a entrada normal ganha (motor anti-perda do hook de
  -- etapa: follow-up em 1 dia) — a troca é a única entrada que não passa por
  -- ele, e sem isso o lead chegava "sem próximo passo" e atrás na disputa.
  _followup := COALESCE(_proximo_followup, now() + interval '1 day');
  PERFORM public.transicionar_lead(
    _entra, 'em_atendimento'::public.lead_status,
    'Entrou em atendimento no lugar de ' || COALESCE(_s.nome, 'outro lead'),
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento'),
    _followup);
  INSERT INTO public.tarefas
    (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
     criado_por, data_vencimento, origem_automatica)
  VALUES
    (COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento'),
     'Entrou em atendimento numa troca de vaga (saiu ' || COALESCE(_s.nome, 'outro lead') || ').',
     'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
     'alta'::public.tarefa_prioridade, _entra, _e.corretor_id, _uid, _followup, true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES
    (_entra, 'troca_em_atendimento', 'Entrou em atendimento numa troca de vaga.',
     'trocar_vaga_em_atendimento',
     jsonb_build_object('papel', 'entra', 'outro_lead', _sai, 'desfecho', _desfecho,
                        'alterado_por', _uid)),
    (_sai, 'troca_em_atendimento', 'Saiu de atendimento numa troca de vaga.',
     'trocar_vaga_em_atendimento',
     jsonb_build_object('papel', 'sai', 'outro_lead', _entra, 'desfecho', _desfecho,
                        'saida', _saida, 'alterado_por', _uid));

  RETURN jsonb_build_object('ok', true, 'entra', _entra, 'sai', _sai,
                            'desfecho', _desfecho, 'saida', _saida);
END;
$$;

REVOKE ALL ON FUNCTION public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) transicionar_lead chama a trava comum
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transicionar_lead(p_lead_id uuid, p_novo_status lead_status, p_motivo text DEFAULT NULL::text, p_proxima_acao text DEFAULT NULL::text, p_proximo_followup timestamp with time zone DEFAULT NULL::timestamp with time zone, p_motivo_categoria text DEFAULT NULL::text)
 RETURNS leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _resultado public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _gestao boolean;
  _acao_final text;
  _followup_final timestamptz;
  _categoria_final text;
BEGIN
  IF NOT _service_role AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF p_novo_status IS NULL THEN
    RAISE EXCEPTION 'novo status é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _service_role AND NOT public.pode_acessar_lead(_uid, p_lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  _gestao := _service_role
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT public.transicao_lead_permitida(_lead.status, p_novo_status, _gestao) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
  END IF;

  -- Regra dos 65, Fatia 2: "entra um, sai um". A trava mora em
  -- _em_atendimento_travar (20261010120600), a mesma de cadencia_marcar_respondeu.
  IF p_novo_status = 'em_atendimento'::public.lead_status THEN
    PERFORM public._em_atendimento_travar(p_lead_id, _lead.status, _lead.corretor_id, _uid, _gestao);
  END IF;

  IF p_novo_status = 'perdido'::public.lead_status
     AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório ao perder um lead' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT EXISTS (
       SELECT 1 FROM public.vendas AS v
       WHERE v.lead_id = p_lead_id AND v.status_venda = 'aprovada'::public.status_venda
     ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda' USING ERRCODE = '23514';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT _gestao THEN
    RAISE EXCEPTION 'fechamento e pós-venda exigem papel de gestão' USING ERRCODE = '42501';
  END IF;

  IF p_proxima_acao IS NOT NULL AND char_length(btrim(p_proxima_acao)) > 500 THEN
    RAISE EXCEPTION 'próxima ação excede 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_proximo_followup IS NOT NULL AND p_proximo_followup <= now()
     AND p_novo_status NOT IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status) THEN
    RAISE EXCEPTION 'follow-up deve estar no futuro' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres' USING ERRCODE = '22023';
  END IF;

  _acao_final := COALESCE(NULLIF(btrim(p_proxima_acao), ''), _lead.proxima_acao);
  _followup_final := COALESCE(p_proximo_followup, _lead.proximo_followup);

  -- Ao mover para 'perdido' garantimos motivo_perda_categoria: usa o passado
  -- explicitamente, senão herda o já registrado no lead; fallback 'outro' evita
  -- que o trigger enforce_motivo_perda_categoria trave a operação.
  IF p_novo_status = 'perdido'::public.lead_status THEN
    _categoria_final := COALESCE(
      NULLIF(btrim(p_motivo_categoria), ''),
      _lead.motivo_perda_categoria,
      'outro'
    );
  ELSE
    _categoria_final := _lead.motivo_perda_categoria;
  END IF;

  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND (_followup_final IS NULL OR _followup_final <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'em_atendimento'::public.lead_status, 'aguardando_retorno'::public.lead_status,
    'qualificacao_corretor'::public.lead_status,
    'qualificado'::public.lead_status, 'agendado'::public.lead_status,
    'visita_realizada'::public.lead_status, 'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status
  ) AND _acao_final IS NULL AND _followup_final IS NULL THEN
    RAISE EXCEPTION 'informe próxima ação ou follow-up' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);

  UPDATE public.leads
  SET status = p_novo_status,
      motivo_perdido = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN btrim(p_motivo)
        WHEN _lead.status = 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perdido
      END,
      motivo_perda_categoria = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN _categoria_final
        WHEN _lead.status = 'perdido'::public.lead_status
             AND p_novo_status <> 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perda_categoria
      END,
      proxima_acao = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _acao_final
      END,
      proximo_followup = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _followup_final
      END,
      ultima_interacao = now()
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    p_lead_id, 'transicao_lead',
    'Lead movido de ' || _lead.status::text || ' para ' || p_novo_status::text || '.',
    'transicionar_lead',
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _lead.status, 'para_status', p_novo_status,
      'motivo', NULLIF(btrim(p_motivo), ''),
      'motivo_categoria', CASE WHEN p_novo_status='perdido' THEN _categoria_final ELSE NULL END,
      'proxima_acao', _resultado.proxima_acao,
      'proximo_followup', _resultado.proximo_followup,
      'alterado_por', _uid
    ))
  );

  RETURN _resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) A cadência passa pela mesma trava
-- ---------------------------------------------------------------------------
-- Corpo vigente de 20261001120000 (igual ao de produção, conferido por hash em
-- 04/10/2026) com a trava antes do UPDATE que leva o lead a em_atendimento.
CREATE OR REPLACE FUNCTION public.cadencia_marcar_respondeu(_lead_id uuid, _proxima_acao text, _proximo_followup timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF _l.cadencia_etapa NOT IN ('D0','D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(_proxima_acao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'próxima ação é obrigatória ao marcar resposta'
      USING ERRCODE = '22023';
  END IF;
  IF _proximo_followup IS NULL OR _proximo_followup <= now() THEN
    RAISE EXCEPTION 'a próxima ação precisa de data no futuro'
      USING ERRCODE = '22023';
  END IF;

  -- Regra dos 65, Fatia 2 (20261010120600): a resposta do cliente é a entrada
  -- mais legítima em Em atendimento, mas em 65/65 vale a troca "entra um, sai
  -- um" (decisão 6) — a tela da cadência abre a janela com o EA065. Antes
  -- (revisão) esta RPC gravava em_atendimento por fora da trava.
  IF _l.status IN ('novo'::public.lead_status,
                   'aguardando_atendimento'::public.lead_status,
                   'aguardando_corretor'::public.lead_status) THEN
    PERFORM public._em_atendimento_travar(
      _lead_id, _l.status, _l.corretor_id, _uid,
      public.has_role(_uid, 'admin'::public.app_role)
        OR public.has_role(_uid, 'gestor'::public.app_role)
        OR public.has_role(_uid, 'superintendente'::public.app_role));
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET cadencia_etapa    = 'respondeu',
         cadencia_prazo_ts = NULL,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status,
                           'aguardando_corretor'::public.lead_status)
             THEN 'em_atendimento'::public.lead_status
           ELSE status
         END,
         proxima_acao     = btrim(_proxima_acao),
         ultima_interacao = now()
   WHERE id = _lead_id;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  -- O prazo vira TAREFA, e não um write direto em `proximo_followup`.
  -- Aquela coluna é espelho de min(data_vencimento) das tarefas pendentes
  -- (sync_proximo_followup, 20260708155905): escrever nela direto criaria um
  -- prazo que a primeira operação em `tarefas` apagaria sem aviso. Criando a
  -- tarefa, o espelho se preenche sozinho, o lead passa a ter "próximo passo
  -- vivo" para a carteira, e é a régua de 13 toques — que rege daqui em
  -- diante — quem agenda os toques seguintes.
  --
  -- `proxima_acao` AQUI é legítima: quem está falando é o corretor,
  -- declarando o passo combinado com o cliente. É o uso para o qual a coluna
  -- existe, e o oposto do preenchimento automático que o motor não faz.
  INSERT INTO public.tarefas
    (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
     criado_por, data_vencimento, origem_automatica)
  VALUES
    (btrim(_proxima_acao),
     'Passo combinado quando o cliente respondeu na cadência (' || _l.cadencia_etapa || ').',
     'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
     'alta'::public.tarefa_prioridade, _lead_id, COALESCE(_l.corretor_id, _uid),
     _uid, _proximo_followup, true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'cadencia_etapa',
          'Cliente respondeu — lead saiu da cadência para a qualificação.',
          'cadencia',
          jsonb_build_object('de_estado', _l.cadencia_etapa,
                             'para_estado', 'respondeu'));

  RETURN jsonb_build_object('etapa_anterior', _l.cadencia_etapa, 'ok', true);
END;
$function$;
