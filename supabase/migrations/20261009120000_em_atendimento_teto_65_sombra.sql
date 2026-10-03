-- ============================================================================
-- Regra dos 65 em "Em atendimento" — Fatia 1, modo sombra
-- ============================================================================
-- Desenho e decisões do dono (03/10/2026): docs/ops/em-atendimento-teto-65.md.
--
-- O QUE MUDA DE SENTIDO. O teto de 65 existia como "carteira ativa", uma
-- classificação paralela ao status (fundo + conversa + resgate), e por isso a
-- tela de Leads mostrava 248 em "Em atendimento" para quem a Fila dizia estar
-- dentro do teto. Dois números para a mesma pergunta. A partir desta regra, o
-- 65 é o STATUS: no máximo 65 leads em `em_atendimento` por corretor. O fundo
-- do funil (agendado em diante) fica fora do teto, com escada de cobrança.
--
-- ESTA FATIA NÃO MOVE NENHUM LEAD. Ela calcula, para cada corretor, o que a
-- regra faria hoje — quem fica nos 65, quem sai e para onde, se a roleta
-- travaria — para a gestão ver os números reais antes de ligar qualquer coisa.
-- É a mesma disciplina da cadência e da régua de devolução: sombra primeiro.
--
-- UMA REGRA SÓ. `_em_atendimento_classificar` é a única fonte; o resumo do
-- gestor e o detalhe por corretor são leituras dela. A Fatia 3 (ligar) vai
-- reusar a mesma função para decidir o que mover — se o ensaio e a execução
-- saíssem de consultas diferentes, divergiriam no primeiro ajuste.
--
-- O RELÓGIO DESTA REGRA NÃO É O DA CASA, de propósito. Decisão do dono:
-- toque = ligação ou WhatsApp registrado, mesmo sem resposta. O relógio da
-- casa (GREATEST(ultima_interacao, ultimo_contato)) conta como toque QUALQUER
-- interação, porque `atualizar_ultima_interacao_lead` move `ultima_interacao`
-- até em `mudanca_status` e `nota` sem autor. Medido em produção (03/10/2026):
-- o motor gravou 4.805 mudanças de status automáticas num só dia (08/09), e
-- 75 dos 306 leads "em atendimento" que pareciam tocados nos últimos 5 dias
-- só tinham registro automático. Aqui o toque é o contato real — o mesmo
-- recorte de eventos de `conversas_aguardando_resposta` (entrada do cliente,
-- saída humana, chamada feita) mais `ultimo_contato` (que a cadência grava a
-- cada tentativa). As outras telas seguem com o relógio da casa; mudá-lo
-- mudaria higiene, fila e carteira em silêncio.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Configuração
-- ---------------------------------------------------------------------------
-- O TETO não mora aqui: continua em `capacidade_leads_ativos_por_corretor`,
-- lido por carteira_ativa_config(). Uma chave só para o mesmo número.
-- Chave nova, então ON CONFLICT DO NOTHING é o certo (não há valor anterior
-- para atualizar; um admin que já tenha ajustado a chave não é sobrescrito).
INSERT INTO public.gestao_config (chave, valor, descricao) VALUES (
  'em_atendimento',
  '{"modo": "sombra",
    "trava_roleta": 60,
    "teto_base": 150,
    "dias_sem_toque": 5,
    "tolerancia_retorno_dias": 2,
    "retorno_max_dias": 30,
    "qualificacao_prazo_horas": 24,
    "escreveu_dias": 7,
    "fundo_topo_dias": 3,
    "fundo_gestor_dias": 5,
    "fundo_desfecho_dias": 10}'::jsonb,
  'Regra dos 65 em Em atendimento (docs/ops/em-atendimento-teto-65.md). '
  'modo=sombra so calcula; trava_roleta e teto_base param a entrada de lead '
  'novo; dias_sem_toque e o relogio de todas as etapas; o teto de 65 fica em '
  'capacidade_leads_ativos_por_corretor.'
)
ON CONFLICT (chave) DO NOTHING;

-- Defaults no SQL iguais aos da chave: apagar a linha de config não pode
-- mudar a regra em silêncio (lição do teto 40 -> 65).
CREATE OR REPLACE FUNCTION public.em_atendimento_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT '{"modo": "sombra", "trava_roleta": 60, "teto_base": 150,
           "dias_sem_toque": 5, "tolerancia_retorno_dias": 2,
           "retorno_max_dias": 30, "qualificacao_prazo_horas": 24,
           "escreveu_dias": 7, "fundo_topo_dias": 3, "fundo_gestor_dias": 5,
           "fundo_desfecho_dias": 10}'::jsonb
      || COALESCE(public.gestao_config_valor('em_atendimento'), '{}'::jsonb)
      || jsonb_build_object(
           'teto', COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65));
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_config() TO authenticated, service_role;

COMMENT ON FUNCTION public.em_atendimento_config() IS
  'Config vigente da regra dos 65 (chave em_atendimento + teto de '
  'capacidade_leads_ativos_por_corretor). Aberta a membro ativo: a regra '
  'governa a tela do corretor e a RLS de gestao_config e gestao-only.';

-- Sanidade: a trava da roleta tem de ficar ABAIXO do teto, senão o corretor
-- recebe lead novo até lotar e a resposta do próprio cliente não tem vaga —
-- exatamente o que a folga de 5 existe para evitar.
DO $$
DECLARE
  _c jsonb := public.em_atendimento_config();
BEGIN
  IF (_c ->> 'trava_roleta')::int > (_c ->> 'teto')::int THEN
    RAISE EXCEPTION 'em_atendimento: trava_roleta (%) acima do teto (%)',
      _c ->> 'trava_roleta', _c ->> 'teto';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) A regra única
-- ---------------------------------------------------------------------------
-- Set-based (recebe vários corretores): o resumo do gestor classifica a casa
-- inteira numa passada só, em vez de uma classificação por corretor.
--
-- Camadas:
--   em_atendimento  status `em_atendimento` — disputa as 65 vagas
--   fundo           agendado, visita_realizada, proposta_enviada,
--                   analise_credito — fora do teto, nunca sai por robô
--   base            o resto do que o corretor tem ("Minha base")
--
-- Grupos de origem (decidem o destino de quem sai, regra da Fatia 4 do
-- Bolsão): proprio (lead_origem_conquistada — nunca sai do corretor),
-- pago (lead_origem_paga — volta para a roleta), estoque (vai para o Bolsão).
--
-- PORTAL É PAGO NESTA REGRA (decisão do dono, 03/10/2026), mas ainda não em
-- `lead_origem_paga`: aquela função também decide quem o lote da Prospecção
-- pode puxar, e mudá-la agora tiraria os leads de Portal do lote em produção
-- no mesmo dia — efeito vivo que uma fatia em sombra não pode ter. A Fatia 3
-- move o Portal para lá, junto com a regra ligada. Comparação por texto para
-- não depender do valor do enum na criação da função.
--
-- Fora de tudo: venda viva (regra nº 1 da diretoria), perdido, contrato
-- fechado, pós-venda, lixeira e arquivados.
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
      l.created_at
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
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
  -- Ordem decidida pelo dono: passo com data futura > cliente escreveu nos
  -- últimos 7 dias > quente > toque mais recente > origem paga.
  disputa AS (
    SELECT
      m.id,
      row_number() OVER (
        PARTITION BY m.corretor_id
        ORDER BY
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
      WHEN 'fica'           THEN 'nos ' || a.teto || ' (posição ' || a.posicao || ')'
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
  'para cada lead vivo dos corretores, a camada, a posicao na disputa das 65 '
  'vagas, a acao que a regra tomaria agora e o destino. Nao altera nada. '
  'Sem grant: quem chama sao as funcoes DEFINER, que fazem o recorte de acesso.';

-- ---------------------------------------------------------------------------
-- 3) Recorte de acesso, uma vez
-- ---------------------------------------------------------------------------
-- Mesmo critério de carteira_sombra_v1: quem vê a casa inteira enxerga todos
-- os corretores (papel `corretor`, ativo); o gestor, a própria equipe. Contas
-- que não são de corretor (SDR, admin, robôs) ficam fora porque não têm o
-- papel — decisão do dono, sem lista manual.
CREATE OR REPLACE FUNCTION public._em_atendimento_corretores_visiveis(_caller uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
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
  RETURN ARRAY(
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.ativo
      AND public.has_role(p.id, 'corretor'::public.app_role)
      AND (_ve_tudo OR p.id = ANY(_equipe))
  );
END;
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_corretores_visiveis(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) A linha do gestor: o que a regra faria hoje, por corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_sombra_v1()
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  teto integer,
  trava_roleta integer,
  teto_base integer,
  em_atendimento integer,
  ficam integer,
  excedente integer,
  perde_vaga integer,
  porta_cadencia integer,
  base integer,
  base_cadencia integer,
  retorno_protegido integer,
  qualificacao_vencida integer,
  sai_roleta integer,
  sai_bolsao integer,
  sai_reativacao integer,
  alerta_proprio integer,
  base_depois integer,
  fundo integer,
  fundo_gestor integer,
  fundo_desfecho integer,
  recebe_lead boolean,
  trava text
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
  _teto int := (_cfg ->> 'teto')::int;
  _trava int := (_cfg ->> 'trava_roleta')::int;
  _teto_base int := (_cfg ->> 'teto_base')::int;
BEGIN
  RETURN QUERY
  WITH cl AS (
    SELECT * FROM public._em_atendimento_classificar(_corretores)
  ),
  agg AS (
    SELECT
      c.corretor_id AS dono,
      count(*) FILTER (WHERE c.camada = 'em_atendimento')::int        AS em_atendimento,
      count(*) FILTER (WHERE c.acao = 'fica')::int                    AS ficam,
      count(*) FILTER (WHERE c.acao = 'excedente')::int               AS excedente,
      count(*) FILTER (WHERE c.acao = 'perde_vaga')::int              AS perde_vaga,
      count(*) FILTER (WHERE c.acao = 'porta_cadencia')::int          AS porta_cadencia,
      count(*) FILTER (WHERE c.camada = 'base')::int                  AS base,
      count(*) FILTER (WHERE c.acao = 'cadencia')::int                AS base_cadencia,
      count(*) FILTER (WHERE c.acao = 'retorno_protegido')::int       AS retorno_protegido,
      count(*) FILTER (WHERE c.acao = 'qualificacao_vencida')::int    AS qualificacao_vencida,
      count(*) FILTER (WHERE c.camada = 'base' AND c.destino = 'roleta')::int     AS sai_roleta,
      count(*) FILTER (WHERE c.camada = 'base' AND c.destino = 'bolsao')::int     AS sai_bolsao,
      count(*) FILTER (WHERE c.camada = 'base' AND c.destino = 'reativacao')::int AS sai_reativacao,
      count(*) FILTER (WHERE c.camada = 'base'
                         AND c.destino = 'fica_alerta_gestor')::int   AS alerta_proprio,
      -- A Minha base DEPOIS da regra: o que fica nela + o que desce dos 65.
      (count(*) FILTER (WHERE c.camada = 'base'
                          AND (c.destino IS NULL OR c.destino = 'fica_alerta_gestor'))
       + count(*) FILTER (WHERE c.acao IN ('excedente', 'perde_vaga', 'porta_cadencia'))
      )::int                                                          AS base_depois,
      count(*) FILTER (WHERE c.camada = 'fundo')::int                 AS fundo,
      count(*) FILTER (WHERE c.acao = 'fundo_gestor')::int            AS fundo_gestor,
      count(*) FILTER (WHERE c.acao = 'fundo_desfecho')::int          AS fundo_desfecho
    FROM cl AS c
    GROUP BY c.corretor_id
  )
  SELECT
    p.id,
    p.nome,
    _teto,
    _trava,
    _teto_base,
    COALESCE(a.em_atendimento, 0),
    COALESCE(a.ficam, 0),
    COALESCE(a.excedente, 0),
    COALESCE(a.perde_vaga, 0),
    COALESCE(a.porta_cadencia, 0),
    COALESCE(a.base, 0),
    COALESCE(a.base_cadencia, 0),
    COALESCE(a.retorno_protegido, 0),
    COALESCE(a.qualificacao_vencida, 0),
    COALESCE(a.sai_roleta, 0),
    COALESCE(a.sai_bolsao, 0),
    COALESCE(a.sai_reativacao, 0),
    COALESCE(a.alerta_proprio, 0),
    COALESCE(a.base_depois, 0),
    COALESCE(a.fundo, 0),
    COALESCE(a.fundo_gestor, 0),
    COALESCE(a.fundo_desfecho, 0),
    (COALESCE(a.ficam, 0) < _trava AND COALESCE(a.base_depois, 0) < _teto_base),
    CASE
      WHEN COALESCE(a.ficam, 0) >= _trava
        THEN 'em atendimento em ' || a.ficam || ' (trava em ' || _trava || ')'
      WHEN COALESCE(a.base_depois, 0) >= _teto_base
        THEN 'minha base com ' || a.base_depois || ' (teto ' || _teto_base || ')'
    END
  FROM public.profiles AS p
  LEFT JOIN agg AS a ON a.dono = p.id
  WHERE p.id = ANY(_corretores)
  ORDER BY COALESCE(a.em_atendimento, 0) DESC, p.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_sombra_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_sombra_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.em_atendimento_sombra_v1() IS
  'Modo sombra da regra dos 65: por corretor, quantos ficam nos 65, quantos '
  'sairiam (acima do teto, 5 dias sem toque, cadencia sem resposta), como fica '
  'a Minha base e se a roleta travaria. Nao altera nada.';

-- ---------------------------------------------------------------------------
-- 5) O detalhe por lead (drill do gestor; tela de escolha da Fatia 2)
-- ---------------------------------------------------------------------------
-- _corretor NULL = o próprio chamador. Corretor vê só a si; gestão, quem o
-- recorte permite.
CREATE OR REPLACE FUNCTION public.em_atendimento_sombra_leads_v1(
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
    c.proximo_followup, c.escreveu_em, c.posicao, c.acao, c.destino, c.motivo
  FROM public._em_atendimento_classificar(ARRAY[_alvo]) AS c
  WHERE _camada IS NULL OR c.camada = _camada
  ORDER BY
    CASE c.camada WHEN 'em_atendimento' THEN 1 WHEN 'fundo' THEN 2 ELSE 3 END,
    c.posicao ASC NULLS LAST,
    c.movimento DESC,
    c.lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_sombra_leads_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_sombra_leads_v1(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.em_atendimento_sombra_leads_v1(uuid, text) IS
  'Detalhe por lead da regra dos 65 para um corretor (NULL = o chamador): '
  'posicao na disputa, acao e destino. Nao altera nada.';

-- ---------------------------------------------------------------------------
-- 6) O que a regra encontra FORA das carteiras
-- ---------------------------------------------------------------------------
-- Duas coisas que nenhuma linha de corretor mostra:
--
--   * As PORTAS. Lead em `em_atendimento` sem dono (ou com dono inativo) não
--     é conversa de ninguém — é o estoque de onde o lote da Prospecção puxa
--     leads que chegam ao corretor já "em atendimento". Na Fatia 3 eles
--     voltam para Aguardando atendimento.
--
--   * O CLIENTE DUPLICADO. O dedup é por projeto, então o mesmo telefone vive
--     em vários leads. Regra do dono: o primeiro corretor a levar o cliente a
--     Visita realizada (ou além) fica com ele; os registros dos outros são
--     encerrados como perda "cliente seguiu com outro corretor", que não conta
--     como perda do corretor, sem aviso. `conflito` = outro registro também
--     avançado — o desempate pela data de chegada fica para a Fatia 3.
CREATE OR REPLACE FUNCTION public.em_atendimento_portas_v1()
RETURNS TABLE (
  em_atendimento_sem_dono integer,
  em_atendimento_dono_inativo integer,
  em_atendimento_em_cadencia integer,
  clientes_duplicados integer,
  registros_encerrariam integer,
  registros_em_conflito integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '30s'
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  -- Número da casa inteira: só para quem vê a casa inteira.
  IF NOT public.ve_carteira_completa(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH vivos AS (
    SELECT l.id, l.corretor_id, l.status, l.telefone_e164, l.cadencia_etapa
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.arquivado_em IS NULL
      AND l.status <> 'perdido'
  ),
  ea AS (
    SELECT
      count(*) FILTER (WHERE v.corretor_id IS NULL)::int AS sem_dono,
      count(*) FILTER (WHERE v.corretor_id IS NOT NULL AND NOT p.ativo)::int AS dono_inativo,
      count(*) FILTER (WHERE v.corretor_id IS NOT NULL AND p.ativo
                         AND v.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'))::int AS em_cadencia
    FROM vivos AS v
    LEFT JOIN public.profiles AS p ON p.id = v.corretor_id
    WHERE v.status = 'em_atendimento'
  ),
  vencedores AS (
    SELECT DISTINCT v.telefone_e164, v.corretor_id
    FROM vivos AS v
    WHERE v.telefone_e164 IS NOT NULL
      AND v.corretor_id IS NOT NULL
      AND v.status IN ('visita_realizada', 'proposta_enviada', 'analise_credito',
                       'contrato_fechado', 'pos_venda')
  ),
  outros AS (
    SELECT DISTINCT o.id, o.telefone_e164,
           o.status IN ('visita_realizada', 'proposta_enviada', 'analise_credito',
                        'contrato_fechado', 'pos_venda') AS avancado
    FROM vencedores AS w
    JOIN vivos AS o
      ON o.telefone_e164 = w.telefone_e164
     AND o.corretor_id IS DISTINCT FROM w.corretor_id
  ),
  dup AS (
    SELECT
      count(DISTINCT o.telefone_e164)::int                              AS clientes,
      count(*) FILTER (WHERE NOT o.avancado
                         AND NOT public._lead_venda_viva(o.id))::int   AS encerrariam,
      count(*) FILTER (WHERE o.avancado)::int                           AS conflito
    FROM outros AS o
  )
  SELECT ea.sem_dono, ea.dono_inativo, ea.em_cadencia,
         dup.clientes, dup.encerrariam, dup.conflito
  FROM ea, dup;
END;
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_portas_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_portas_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.em_atendimento_portas_v1() IS
  'Modo sombra da regra dos 65, fora das carteiras: leads em Em atendimento '
  'sem dono, com dono inativo ou em cadencia sem resposta, e os registros que '
  'a regra do cliente duplicado encerraria. Nao altera nada.';
