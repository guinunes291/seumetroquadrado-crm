-- ============================================================================
-- Regra dos 65 em "Em atendimento" — Fatia 2: as telas e a troca
-- ============================================================================
-- Desenho: docs/ops/em-atendimento-teto-65.md. Decisões do dono para esta
-- fatia (03/10/2026):
--
--   * A TROCA "ENTRA UM, SAI UM" JÁ É OBRIGATÓRIA, mesmo com a regra em
--     sombra. O corretor com `teto` (65) leads em Em atendimento só põe mais
--     um liberando outro no mesmo passo. O banco trava (transicionar_lead,
--     código EA065) porque são mais de nove telas que mudam status, mais a
--     API: uma trava só na tela vazaria pela primeira que esquecesse. A troca
--     não tem passe-livre: o desfecho de quem sai roda antes e libera a vaga,
--     e a entrada passa pela mesma trava de sempre — quem sai sem liberar
--     vaga (lixeira) não abre espaço.
--   * A ESCOLHA DOS 65 põe o lead na frente da disputa, mas NÃO protege do
--     relógio de 5 dias. Escolhido sem ligação ou WhatsApp desce do mesmo
--     jeito — os 7 dias de sombra servem para o corretor resgatar quem quer.
--   * Saída de Em atendimento só pelos desfechos: Agendou, Pediu retorno,
--     Esfriou, Perdido e Mandou doc. A tela oferece só esses; o banco trava
--     na Fatia 3, junto com as portas de entrada.
--   * Retorno combinado para mais de 30 dias vira a perda nova
--     `retorno_futuro`, que a reativação recicla. Lead próprio não perde:
--     fica com o corretor, com a data que o cliente pediu.
--
-- Nada aqui move lead por robô. Tudo é ação do corretor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Perda "retorno futuro"
-- ---------------------------------------------------------------------------
-- Reciclável: NÃO entra em motivo_perda_sem_retrabalho — é exatamente o lead
-- que a reativação deve procurar perto da data.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_motivo_perda_categoria_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_motivo_perda_categoria_check CHECK (
  motivo_perda_categoria IS NULL OR motivo_perda_categoria = ANY (ARRAY[
    'sem_contato', 'sumiu_pos_proposta', 'credito_score', 'credito_renda',
    'estourou_teto', 'ja_possui_imovel', 'preco_parcela', 'comprou_concorrente',
    'timing_adiou', 'sem_perfil', 'outro',
    'sem_retorno_cadencia', 'numero_invalido', 'opt_out',
    'seguiu_outro_corretor', 'retorno_futuro'
  ]::text[])
) NOT VALID;
ALTER TABLE public.leads VALIDATE CONSTRAINT leads_motivo_perda_categoria_check;

-- ---------------------------------------------------------------------------
-- 2) Ocupação de Em atendimento: uma fonte só
-- ---------------------------------------------------------------------------
-- O mesmo recorte de "vivo" do classificador (sem lixeira, arquivado nem venda
-- viva). Usada pela trava da troca e pelo contador X/65 — se cada um contasse
-- de um jeito, a tela diria 64 e o banco recusaria por 65.
CREATE OR REPLACE FUNCTION public.em_atendimento_ocupacao(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::int
    FROM public.leads AS l
   WHERE l.corretor_id = _corretor
     AND l.status = 'em_atendimento'::public.lead_status
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false)
     AND l.arquivado_em IS NULL
     AND NOT public._lead_venda_viva(l.id)
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_ocupacao(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) A escolha dos 65
-- ---------------------------------------------------------------------------
-- Uma linha por lead escolhido. Vale só enquanto o lead está em Em atendimento
-- com o mesmo dono: quem sai ou troca de dono deixa a escolha sem efeito (as
-- leituras filtram; a RPC limpa as do corretor a cada uso).
CREATE TABLE IF NOT EXISTS public.em_atendimento_escolhas (
  lead_id      uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  escolhido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS em_atendimento_escolhas_corretor_idx
  ON public.em_atendimento_escolhas (corretor_id);

-- Só pelas RPCs: sem política, ninguém de fora lê ou escreve direto.
ALTER TABLE public.em_atendimento_escolhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.em_atendimento_escolhas FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.em_atendimento_escolhas IS
  'Regra dos 65, Fatia 2: os leads que o corretor escolheu manter em Em '
  'atendimento. Põe o lead na frente da disputa das vagas; não protege do '
  'relógio de 5 dias (decisão do dono, 03/10/2026).';

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
          AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false));

  IF NOT _escolher THEN
    DELETE FROM public.em_atendimento_escolhas WHERE lead_id = _lead_id;
  ELSE
    IF _lead.status IS DISTINCT FROM 'em_atendimento'::public.lead_status
       OR _lead.deleted_at IS NOT NULL OR COALESCE(_lead.na_lixeira, false) THEN
      RAISE EXCEPTION 'só lead em Em atendimento pode ser escolhido' USING ERRCODE = '22023';
    END IF;
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

-- ---------------------------------------------------------------------------
-- 4) A regra única, com a escolha na frente da disputa
-- ---------------------------------------------------------------------------
-- Corpo de 20261009120600 com três mudanças: a coluna `escolhido`, a escolha
-- como primeiro critério da disputa e o "escolhido" no motivo de quem fica.
-- O tipo de retorno muda, então a função é recriada; as leituras da Fatia 1
-- (plpgsql) resolvem o nome na execução e seguem iguais.
DROP FUNCTION IF EXISTS public._em_atendimento_classificar(uuid[]);

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

COMMENT ON FUNCTION public._em_atendimento_classificar(uuid[]) IS
  'Regra unica dos 65 em Em atendimento (docs/ops/em-atendimento-teto-65.md): '
  'para cada lead vivo dos corretores, a camada, a escolha do corretor, a '
  'posicao na disputa das 65 vagas, a acao que a regra tomaria agora e o '
  'destino. Nao altera nada. Sem grant: quem chama sao as funcoes DEFINER.';

-- O detalhe por lead, agora com a escolha (tela "Meus 65" e janela de troca).
CREATE OR REPLACE FUNCTION public.em_atendimento_sombra_leads_v2(
  _corretor uuid DEFAULT NULL,
  _camada text DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '20s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _alvo <> _caller
     AND NOT (_alvo = ANY(public._em_atendimento_corretores_visiveis(_caller))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _camada IS NOT NULL AND _camada NOT IN ('em_atendimento', 'base', 'fundo') THEN
    RAISE EXCEPTION 'camada invalida: %', _camada USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.lead_id, c.nome, c.telefone, c.status, c.origem, c.temperatura,
    c.projeto_nome, c.grupo, c.camada, c.movimento, c.dias_sem_toque,
    c.proximo_followup, c.escreveu_em, c.escolhido, c.posicao, c.acao,
    c.destino, c.motivo
  FROM public._em_atendimento_classificar(ARRAY[_alvo]) AS c
  WHERE _camada IS NULL OR c.camada = _camada
  ORDER BY
    CASE c.camada WHEN 'em_atendimento' THEN 1 WHEN 'fundo' THEN 2 ELSE 3 END,
    c.posicao ASC NULLS LAST,
    c.movimento DESC,
    c.lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_sombra_leads_v2(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_sombra_leads_v2(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) O contador X/65
-- ---------------------------------------------------------------------------
-- Leitura leve (sem o classificador): o chip de Leads, a Fila e o Kanban a
-- chamam a cada tela. _corretor NULL = o próprio chamador.
CREATE OR REPLACE FUNCTION public.em_atendimento_contador_v1(_corretor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
  _cfg jsonb := public.em_atendimento_config();
  _ocupacao integer;
  _base integer;
BEGIN
  IF _caller IS NULL OR NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _alvo <> _caller
     AND NOT (_alvo = ANY(public._em_atendimento_corretores_visiveis(_caller))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _ocupacao := public.em_atendimento_ocupacao(_alvo);
  -- "Minha base": o que o corretor tem antes de Em atendimento.
  SELECT count(*)::int INTO _base
    FROM public.leads AS l
   WHERE l.corretor_id = _alvo
     AND l.status IN ('novo', 'aguardando_corretor', 'aguardando_atendimento',
                      'aguardando_retorno', 'qualificacao_corretor', 'qualificado')
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false)
     AND l.arquivado_em IS NULL;

  RETURN jsonb_build_object(
    'corretor_id', _alvo,
    'corretor', public.has_role(_alvo, 'corretor'::public.app_role),
    'modo', _cfg ->> 'modo',
    'em_atendimento', _ocupacao,
    'teto', (_cfg ->> 'teto')::int,
    'trava_roleta', (_cfg ->> 'trava_roleta')::int,
    'lotado', _ocupacao >= (_cfg ->> 'teto')::int,
    'escolhidos', public.em_atendimento_escolhidos(_alvo),
    'minha_base', _base,
    'teto_base', (_cfg ->> 'teto_base')::int,
    'retorno_max_dias', (_cfg ->> 'retorno_max_dias')::int,
    'dias_sem_toque', (_cfg ->> 'dias_sem_toque')::int);
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_contador_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_contador_v1(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Desfecho "Pediu retorno" e "Esfriou"
-- ---------------------------------------------------------------------------
-- Os dois vão para Aguardando retorno com a data que o cliente pediu, até
-- `retorno_max_dias` (30). Data maior: perda `retorno_futuro`, seca (sem a
-- redistribuição de marcar_lead_perdido) — o lead volta pela reativação. Lead
-- próprio nunca sai do corretor: fica em Aguardando retorno com a data longa.
-- A transição passa por transicionar_lead (acesso, máquina de estados, trava).
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

  RETURN jsonb_build_object('destino', 'aguardando_retorno', 'retorno_em', _data,
                            'proprio', _proprio);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_retorno_lead(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lead(uuid, text, timestamptz, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) A troca "entra um, sai um"
-- ---------------------------------------------------------------------------
-- Numa transação só: quem sai recebe o desfecho (retorno, esfriou ou perdido)
-- e quem entra vai para Em atendimento. Se qualquer parte falhar, nada muda —
-- o corretor nunca fica com uma vaga liberada e o lead novo de fora. A ordem
-- importa: o desfecho vem primeiro, para a entrada passar pela trava de
-- sempre com a vaga já livre. "Perdido" segue o "Marcar como perdido" da casa
-- (marcar_lead_perdido_v2, que redistribui o lead quando há quem o receba).
-- Agendou e Mandou doc pedem os formulários da casa; liberam a vaga do mesmo
-- jeito, fora da troca.
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
  IF _e.corretor_id IS DISTINCT FROM _s.corretor_id THEN
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

  -- A vaga está livre: a entrada passa pela trava de sempre.
  PERFORM public.transicionar_lead(
    _entra, 'em_atendimento'::public.lead_status,
    'Entrou em atendimento no lugar de ' || COALESCE(_s.nome, 'outro lead'),
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento'),
    _proximo_followup);

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
-- 8) A trava, na porta única das transições
-- ---------------------------------------------------------------------------
-- Corpo vigente (igual ao de produção, conferido por hash em 03/10/2026) com
-- a trava da troca antes das demais validações de conteúdo.
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
  _ocupacao integer;
  _teto integer;
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

  -- Regra dos 65, Fatia 2 (20261010120500): "entra um, sai um". O corretor
  -- que já tem `teto` leads em Em atendimento só põe mais um liberando outro
  -- antes (a RPC trocar_vaga_em_atendimento faz os dois num passo). Vale para
  -- o PRÓPRIO corretor dono do lead: gestão, serviço (cadência, webhook) e
  -- quem age na carteira de outro (SDR agendando) seguem como antes. Contas
  -- sem papel de corretor ficam fora.
  IF p_novo_status = 'em_atendimento'::public.lead_status
     AND _lead.status IS DISTINCT FROM 'em_atendimento'::public.lead_status
     AND NOT _gestao
     AND _lead.corretor_id IS NOT NULL
     AND _lead.corretor_id = _uid
     AND public.has_role(_lead.corretor_id, 'corretor'::public.app_role) THEN
    -- Duas entradas do mesmo corretor ao mesmo tempo contam uma de cada vez.
    PERFORM pg_advisory_xact_lock(hashtext('em_atendimento:' || _lead.corretor_id::text));
    _ocupacao := public.em_atendimento_ocupacao(_lead.corretor_id);
    _teto := (public.em_atendimento_config() ->> 'teto')::int;
    IF _ocupacao >= _teto THEN
      RAISE EXCEPTION 'Em atendimento lotado: % de %. Para pôr este lead, libere uma vaga (entra um, sai um).',
        _ocupacao, _teto
        USING ERRCODE = 'EA065',
              DETAIL = jsonb_build_object('em_atendimento', _ocupacao, 'teto', _teto,
                                          'lead_id', p_lead_id)::text;
    END IF;
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
