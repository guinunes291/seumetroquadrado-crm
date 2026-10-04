-- ============================================================================
-- Regra dos 65, Fatia 3a — as portas de Em atendimento fechadas no banco
-- ============================================================================
-- Desenho em docs/ops/em-atendimento-teto-65.md (§2, decisões 2, 7, 8, 10; §9).
-- A Fatia 2 trouxe o teto (EA065) e a troca; esta fatia fecha o que ainda
-- entrava e saía por fora:
--
--   1. ENTRADA em Em atendimento, pelo próprio corretor dono (papel corretor):
--      (a) lead na cadência D0–D3 só entra pela Fila do Dia ("Cliente
--          respondeu", cadencia_marcar_respondeu) — EA067;
--      (b) exige contato registrado nas últimas 24 h (ligação, WhatsApp,
--          chamada ou mensagem — o mesmo recorte de toque do classificador;
--          mudança de status e nota não contam) — EA066;
--      (c) exige próximo passo com DATA futura (follow-up, tarefa ou
--          agendamento), não só texto — EA068;
--      (d) o teto, como antes — EA065.
--      Gestão, serviço e quem age na carteira de outro (SDR) seguem livres,
--      como na Fatia 2. É a porta que o §3 do doc descreve: 55 leads D0 movidos
--      pela ficha sem nenhuma ligação ou mensagem registrada.
--   2. SAÍDA de Em atendimento só por desfecho também no banco: Agendou,
--      Pediu retorno/Esfriou (aguardando_retorno), Mandou doc
--      (analise_credito) e Perdido. Gestão mantém as saídas antigas para
--      correção de dado (qualificacao_corretor, qualificado, visita_realizada).
--   3. LEAD SEM CORRETOR NÃO ESTÁ EM ATENDIMENTO: gatilho que leva para
--      Aguardando atendimento o lead em_atendimento que perde o dono (Bolsão,
--      régua, devolução do lote) ou que ganha dono por posse (lote da
--      Prospecção, discador, roleta) — "cadência e lote ficam em Aguardando
--      atendimento até responder" (decisão 2). Lead do SDR (sdr_id) fica fora:
--      é a carteira do SDR. Os 5.383 do Bolsão nesse estado são movidos aqui.
--   4. TRAVA DA ROLETA (decisão 10): com a regra LIGADA (modo = 'ligado'), o
--      corretor com 60 em Em atendimento ou 150 na Minha base não recebe lead
--      novo pela roleta (v3, campanha ponderada, repasse, estoque). Em sombra a
--      trava devolve true — a virada liga tudo de uma vez (decisão 2 do §6).
--   5. "Iniciar atendimento" vira uma RPC (iniciar_atendimento_lead): registra
--      o contato e entra em Em atendimento na mesma transação — se o teto
--      recusar, nada fica gravado (lição da revisão da Fatia 2).
--   6. Portal entra em lead_origem_paga (decisão 4 do §6): lead de portal
--      parado volta à roleta, e sai do lote da Prospecção.
--
-- Códigos: EA065 lotado · EA066 sem contato · EA067 na cadência · EA068 sem
-- passo com data. DETAIL sempre em JSON.
--
-- Idempotente. Migration anterior: 20261010120600.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Contas comuns: Minha base e "recebe lead novo?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_minha_base(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::int
    FROM public.leads AS l
   WHERE l.corretor_id = _corretor
     AND l.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status,
                      'aguardando_retorno'::public.lead_status,
                      'qualificacao_corretor'::public.lead_status,
                      'qualificado'::public.lead_status)
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false)
     AND l.arquivado_em IS NULL
$$;

REVOKE ALL ON FUNCTION public.em_atendimento_minha_base(uuid) FROM PUBLIC, anon, authenticated;

-- true = a roleta pode entregar lead novo a este corretor. Em sombra, sempre
-- true (a decisão 10 liga junto com o resto, na virada).
CREATE OR REPLACE FUNCTION public._em_atendimento_recebe_lead(_corretor uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg jsonb := public.em_atendimento_config();
BEGIN
  IF _corretor IS NULL OR COALESCE(_cfg ->> 'modo', 'sombra') <> 'ligado' THEN
    RETURN true;
  END IF;
  RETURN public.em_atendimento_ocupacao(_corretor) < (_cfg ->> 'trava_roleta')::int
     AND public.em_atendimento_minha_base(_corretor) < (_cfg ->> 'teto_base')::int;
END;
$$;

-- As roletas de campanha são SECURITY DEFINER; a conta é só leitura, e a
-- Central de distribuição (authenticated) lê a elegibilidade por elas.
REVOKE ALL ON FUNCTION public._em_atendimento_recebe_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._em_atendimento_recebe_lead(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Contato registrado nas últimas N horas (o recorte de toque do classificador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._em_atendimento_contato_recente(_lead_id uuid, _horas integer)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.leads AS l
            WHERE l.id = _lead_id
              AND l.ultimo_contato >= now() - make_interval(hours => _horas))
      OR EXISTS (
           SELECT 1 FROM public.interacoes AS i
            WHERE i.lead_id = _lead_id
              AND i.deleted_at IS NULL
              AND i.tipo NOT IN ('nota', 'mudanca_status')
              AND (i.direcao = 'entrada' OR i.autor_id IS NOT NULL)
              AND i.ocorreu_em >= now() - make_interval(hours => _horas))
      OR EXISTS (
           SELECT 1 FROM public.mensagens AS m
            WHERE m.lead_id = _lead_id
              AND (m.direcao = 'entrada'
                   OR (m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha'))
              AND m.recebida_em >= now() - make_interval(hours => _horas))
      OR EXISTS (
           SELECT 1 FROM public.chamadas AS ch
            WHERE ch.lead_id = _lead_id
              AND ch.direcao = 'saida' AND ch.status <> 'falha'
              AND ch.criado_em >= now() - make_interval(hours => _horas));
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_contato_recente(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) A porta, uma função só (assinatura nova: a antiga sai)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public._em_atendimento_travar(
  _lead_id uuid,
  _status_atual public.lead_status,
  _corretor_id uuid,
  _uid uuid,
  _gestao boolean,
  _followup timestamptz,
  _cadencia_etapa text,
  _origem text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg jsonb := public.em_atendimento_config();
  _horas integer := COALESCE((_cfg ->> 'entrada_contato_horas')::int, 24);
  _ocupacao integer;
  _teto integer;
BEGIN
  IF _status_atual IS NOT DISTINCT FROM 'em_atendimento'::public.lead_status THEN
    RETURN;
  END IF;
  -- Vale para o PRÓPRIO corretor dono, com papel de corretor. Gestão, serviço
  -- e quem age na carteira de outro seguem livres (Fatia 2).
  IF _gestao OR _corretor_id IS NULL OR _corretor_id IS DISTINCT FROM _uid THEN
    RETURN;
  END IF;
  IF NOT public.has_role(_corretor_id, 'corretor'::public.app_role) THEN
    RETURN;
  END IF;
  IF _origem NOT IN ('transicao', 'cadencia', 'troca') THEN
    RAISE EXCEPTION 'origem da entrada inválida: %', _origem USING ERRCODE = '22023';
  END IF;

  -- (a) Lead na cadência só entra pela Fila do Dia: é lá que "Cliente
  -- respondeu" registra a resposta e tira o lead da cadência. Pela ficha, a
  -- mudança de status era lida como resposta (via = status) sem nenhum toque.
  IF _origem = 'transicao' AND _cadencia_etapa IN ('D0', 'D1', 'D2', 'D3') THEN
    RAISE EXCEPTION 'Este lead está na cadência (%). Registre a resposta do cliente pela Fila do Dia.',
      _cadencia_etapa
      USING ERRCODE = 'EA067',
            DETAIL = jsonb_build_object('lead_id', _lead_id, 'cadencia_etapa', _cadencia_etapa)::text;
  END IF;

  -- (b) Contato registrado. A cadência registra cada tentativa; a troca
  -- registra o contato de quem entra (ou já o tem, vindo da Fila Única).
  IF _origem = 'transicao' AND NOT public._em_atendimento_contato_recente(_lead_id, _horas) THEN
    RAISE EXCEPTION 'Para pôr em atendimento, registre o contato com o cliente (ligação ou WhatsApp): nenhum nas últimas % horas.',
      _horas
      USING ERRCODE = 'EA066',
            DETAIL = jsonb_build_object('lead_id', _lead_id, 'horas', _horas)::text;
  END IF;

  -- (c) Passo com data: follow-up futuro no pedido, ou tarefa/agendamento
  -- futuro já existente.
  IF (_followup IS NULL OR _followup <= now()) AND public.lead_sem_proximo_passo(_lead_id) THEN
    RAISE EXCEPTION 'Em atendimento exige um próximo passo com data futura.'
      USING ERRCODE = 'EA068',
            DETAIL = jsonb_build_object('lead_id', _lead_id)::text;
  END IF;

  -- (d) O teto. Duas entradas do mesmo corretor ao mesmo tempo contam uma de cada vez.
  PERFORM pg_advisory_xact_lock(hashtext('em_atendimento:' || _corretor_id::text));
  _ocupacao := public.em_atendimento_ocupacao(_corretor_id);
  _teto := (_cfg ->> 'teto')::int;
  IF _ocupacao >= _teto THEN
    RAISE EXCEPTION 'Em atendimento lotado: % de %. Para pôr este lead, libere uma vaga (entra um, sai um).',
      _ocupacao, _teto
      USING ERRCODE = 'EA065',
            DETAIL = jsonb_build_object('em_atendimento', _ocupacao, 'teto', _teto,
                                        'lead_id', _lead_id)::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Saída de Em atendimento só por desfecho (gestão mantém as correções)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(p_de lead_status, p_para lead_status, p_gestao boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','qualificacao_corretor','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificacao_corretor','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificacao_corretor','qualificado','perdido'])
    -- Regra dos 65, Fatia 3a (decisão 7): de Em atendimento o corretor sai por
    -- desfecho — Agendou, Pediu retorno/Esfriou, Mandou doc, Perdido. Gestão
    -- mantém as saídas antigas para corrigir dado.
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','analise_credito','perdido'])
        OR (p_gestao AND p_para::text = ANY (ARRAY['qualificacao_corretor','qualificado','visita_realizada']))
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificacao_corretor','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificacao_corretor'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','visita_realizada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','agendado','proposta_enviada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','visita_realizada','proposta_enviada','contrato_fechado','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = ANY (ARRAY['pos_venda','analise_credito'])
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor'])
    ELSE false
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) transicionar_lead e cadencia_marcar_respondeu com a porta nova
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
  _dono_corretor boolean;
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

  -- Regra dos 65, Fatia 3a (decisão 7): a saída de Em atendimento só por
  -- desfecho vale para o PRÓPRIO corretor dono (papel corretor). SDR, serviço e
  -- quem age na carteira de outro mantêm as saídas antigas (entrega ao
  -- corretor, correção de dado) — a matriz recebe gestao=true só nesse caso.
  _dono_corretor := NOT _gestao
    AND COALESCE(_lead.corretor_id = _uid, false)
    AND public.has_role(_uid, 'corretor'::public.app_role);
  IF NOT public.transicao_lead_permitida(
           _lead.status, p_novo_status,
           _gestao OR (_lead.status = 'em_atendimento'::public.lead_status AND NOT _dono_corretor)) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
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

  -- Regra dos 65, Fatia 3a (20261010120700): a porta de Em atendimento é uma
  -- função só, _em_atendimento_travar, a mesma da cadência e da troca — lead
  -- em cadência só entra pela Fila do Dia, contato registrado, passo com data
  -- e o teto (EA065). A troca marca app.em_atendimento_troca para a entrada
  -- de quem entra não repetir a exigência de contato (ela mesma o registra).
  IF p_novo_status = 'em_atendimento'::public.lead_status THEN
    PERFORM public._em_atendimento_travar(
      p_lead_id, _lead.status, _lead.corretor_id, _uid, _gestao,
      _followup_final, _lead.cadencia_etapa,
      CASE WHEN current_setting('app.em_atendimento_troca', true) = 'on'
           THEN 'troca' ELSE 'transicao' END);
  END IF;

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

  -- Regra dos 65 (20261010120600 e 20261010120700): a resposta do cliente é a
  -- entrada mais legítima em Em atendimento — esta RPC É o "respondeu" da
  -- cadência, por isso passa pela porta com origem 'cadencia' (sem repetir a
  -- exigência de contato: a cadência registra cada tentativa). Em 65/65 vale
  -- a troca "entra um, sai um" (EA065 abre a janela na tela).
  IF _l.status IN ('novo'::public.lead_status,
                   'aguardando_atendimento'::public.lead_status,
                   'aguardando_corretor'::public.lead_status) THEN
    PERFORM public._em_atendimento_travar(
      _lead_id, _l.status, _l.corretor_id, _uid,
      public.has_role(_uid, 'admin'::public.app_role)
        OR public.has_role(_uid, 'gestor'::public.app_role)
        OR public.has_role(_uid, 'superintendente'::public.app_role),
      _proximo_followup, _l.cadencia_etapa, 'cadencia');
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

-- ---------------------------------------------------------------------------
-- 6) A troca registra o contato de quem entra (assinatura nova: a antiga sai)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.trocar_vaga_em_atendimento(
  _entra uuid,
  _sai uuid,
  _desfecho text,
  _data timestamptz DEFAULT NULL,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL,
  _proximo_followup timestamptz DEFAULT NULL,
  _contato_tipo text DEFAULT NULL
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

  -- Fatia 3a: a entrada exige contato registrado. Quando a janela abriu a
  -- partir de "Iniciar atendimento" (ligação/WhatsApp), o contato que o EA065
  -- desfez é registrado aqui, na mesma transação; a entrada de quem entra leva
  -- a marca da troca e não repete a exigência (a troca é ação explícita, com
  -- desfecho em outro lead).
  IF _contato_tipo IS NOT NULL THEN
    IF _contato_tipo NOT IN ('ligacao', 'whatsapp') THEN
      RAISE EXCEPTION 'contato da troca inválido: % (use ligacao ou whatsapp)', _contato_tipo
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (_entra, _uid, _contato_tipo::public.interacao_tipo, 'saida'::public.interacao_direcao,
            CASE _contato_tipo WHEN 'whatsapp' THEN 'Contato inicial via WhatsApp'
                               ELSE 'Contato inicial por ligação' END,
            'Atendimento iniciado pelo corretor (' || _contato_tipo || ') numa troca de vaga.',
            jsonb_build_object('origem', 'troca_em_atendimento', 'outro_lead', _sai));
  END IF;
  PERFORM set_config('app.em_atendimento_troca', 'on', true);
  PERFORM public.transicionar_lead(
    _entra, 'em_atendimento'::public.lead_status,
    'Entrou em atendimento no lugar de ' || COALESCE(_s.nome, 'outro lead'),
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento'),
    _followup);
  PERFORM set_config('app.em_atendimento_troca', 'off', true);
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

REVOKE ALL ON FUNCTION public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) "Iniciar atendimento": contato + entrada numa transação só
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_atendimento_lead(
  _lead_id uuid,
  _tipo text,
  _proxima_acao text DEFAULT NULL,
  _proximo_followup timestamptz DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _r public.leads%ROWTYPE;
  _acao text;
  _followup timestamptz;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _tipo NOT IN ('ligacao', 'whatsapp') THEN
    RAISE EXCEPTION 'tipo de contato inválido: % (use ligacao ou whatsapp)', _tipo USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  -- O contato primeiro: é ele que abre a porta. Se o teto recusar (EA065),
  -- a transação desfaz o contato — o lead recusado não ganha "toque".
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, _uid, _tipo::public.interacao_tipo, 'saida'::public.interacao_direcao,
          CASE _tipo WHEN 'whatsapp' THEN 'Contato inicial via WhatsApp'
                     ELSE 'Contato inicial por ligação' END,
          'Atendimento iniciado pelo corretor (' || _tipo || ').',
          jsonb_build_object('origem', 'iniciar_atendimento'));

  _acao := COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento');
  _followup := COALESCE(_proximo_followup, now() + interval '1 day');
  _r := public.transicionar_lead(_lead_id, 'em_atendimento'::public.lead_status, NULL, _acao, _followup);

  -- O passo vira TAREFA (leads.proximo_followup é espelho das tarefas; ver
  -- 20261010120600): sem ela, a próxima mexida em tarefas apagaria a data.
  INSERT INTO public.tarefas
    (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
     criado_por, data_vencimento, origem_automatica)
  VALUES
    (_acao, 'Atendimento iniciado pelo corretor (' || _tipo || ').',
     'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
     'alta'::public.tarefa_prioridade, _lead_id, COALESCE(_lead.corretor_id, _uid),
     _uid, _followup, true);

  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_atendimento_lead(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_atendimento_lead(uuid, text, text, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Lead sem corretor não está em atendimento (gatilho + os 5.383 do Bolsão)
-- ---------------------------------------------------------------------------
-- BEFORE, com nome que roda depois de trg_validar_status_lead_via_rpc (ordem
-- alfabética): o guarda vê o UPDATE como veio (status igual), e a conversão
-- aqui não pede a marca da RPC. Lead do SDR (sdr_id) é carteira do SDR: fora.
CREATE OR REPLACE FUNCTION public.tg_leads_em_atendimento_posse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'em_atendimento'::public.lead_status AND NEW.sdr_id IS NULL THEN
    IF NEW.corretor_id IS NULL THEN
      -- Perdeu o dono (Bolsão, régua, devolução do lote) ou nasceu sem dono.
      -- Serviço (telefonia: tcplus-webhook) passa por em_atendimento a caminho
      -- de agendado em lead do Bolsão — fronteira interna, fica como está; se
      -- parar aí, a posse (abaixo) corrige na entrega.
      IF COALESCE(auth.role(), '') <> 'service_role' THEN
        NEW.status := 'aguardando_atendimento'::public.lead_status;
      END IF;
    ELSIF TG_OP = 'UPDATE'
          AND OLD.corretor_id IS NULL
          AND OLD.status = 'em_atendimento'::public.lead_status THEN
      -- Ganhou dono por posse (lote, discador, roleta) de um lead que estava
      -- "em atendimento" sem ninguém: entra na Minha base e responde para subir.
      NEW.status := 'aguardando_atendimento'::public.lead_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_em_atendimento_posse ON public.leads;
CREATE TRIGGER trg_zz_em_atendimento_posse
  BEFORE INSERT OR UPDATE OF status, corretor_id, sdr_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_leads_em_atendimento_posse();

-- Os leads do Bolsão que estão "em atendimento" sem dono (5.383 em produção
-- em 04/10/2026: importação, planilha e "outro"; nenhum tocado em 5 dias).
WITH movidos AS (
  UPDATE public.leads
     SET status = 'aguardando_atendimento'::public.lead_status
   WHERE status = 'em_atendimento'::public.lead_status
     AND corretor_id IS NULL
     AND sdr_id IS NULL
     AND deleted_at IS NULL
  RETURNING id
)
INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
SELECT m.id, 'transicao_lead',
       'Lead movido de em_atendimento para aguardando_atendimento.',
       'em_atendimento_fatia3a',
       jsonb_build_object('de_status', 'em_atendimento', 'para_status', 'aguardando_atendimento',
                          'motivo', 'Regra dos 65, Fatia 3a: lead sem corretor não está em atendimento.')
  FROM movidos AS m;

-- ---------------------------------------------------------------------------
-- 9) A trava da roleta (decisão 10) — v3/estoque pela elegibilidade; campanha
--    ponderada e repasse pelo filtro inline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._elegibilidade_roleta(_slug text, _corretor_id uuid DEFAULT NULL)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric AS pct_min,
           (public.get_dist_setting('limite_diario_default') #>> '{}')::int            AS lim_default,
           (public.get_dist_setting('cota_conta_redistribuicao') #>> '{}')::boolean    AS conta_redist,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_aguardando'))) AS st_aguardando,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_encerrados'))) AS st_encerrados,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt
  ),
  r AS (
    SELECT * FROM public.roletas WHERE slug = _slug
  ),
  base AS (
    SELECT rp.corretor_id,
           p.nome,
           rp.ativo AS participante_ativo,
           (rp.pausado_ate IS NOT NULL AND rp.pausado_ate > now()) AS pausado,
           rp.motivo_pausa,
           rp.ultimo_lead_em,
           rp.incluido_por,
           rp.incluido_em,
           COALESCE(rp.limite_diario, cfg.lim_default) AS limite,
           p.ativo AS perfil_ativo,
           (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
           (p.presente AND p.presente_em IS NOT NULL
             AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje_brt) AS presente_hoje,
           EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role
           ) AS eh_corretor,
           -- Regra dos 65, Fatia 3a: com a regra ligada, 60 em Em atendimento
           -- ou 150 na Minha base param a entrada de lead novo (decisão 10).
           public._em_atendimento_recebe_lead(rp.corretor_id) AS recebe_65,
           r.exigir_presenca,
           r.criterio_participacao,
           cfg.pct_min,
           cfg.st_aguardando,
           cfg.st_encerrados,
           cfg.conta_redist,
           cfg.hoje_brt
    FROM public.roleta_participantes rp
    JOIN r ON r.id = rp.roleta_id
    JOIN public.profiles p ON p.id = rp.corretor_id
    CROSS JOIN cfg
    WHERE lower(coalesce(p.nome, '')) <> 'docs-bot'
      AND (_corretor_id IS NULL OR rp.corretor_id = _corretor_id)
  ),
  carteira AS (
    SELECT b.corretor_id,
           count(l.id)::int AS total,
           (count(l.id) FILTER (WHERE l.status::text = ANY(b.st_aguardando)))::int AS aguardando
    FROM base b
    LEFT JOIN public.leads l
      ON l.corretor_id = b.corretor_id
     AND l.deleted_at IS NULL
     AND l.na_lixeira = false
     AND NOT (l.status::text = ANY(b.st_encerrados))
    GROUP BY b.corretor_id
  ),
  recebidos AS (
    -- Contadores derivados do LOG (fonte auditável) em dia/mês BRT — nada de
    -- contador mutável com cron de reset. Linhas legadas (roleta_slug NULL,
    -- anteriores ao cutover) contam em TODAS as roletas: conservador — impede
    -- cota dupla no dia da virada; param de crescer após o cutover.
    SELECT b.corretor_id,
           (count(dl.id) FILTER (
              WHERE (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = b.hoje_brt))::int AS hoje_n,
           count(dl.id)::int AS mes_n
    FROM base b
    LEFT JOIN public.distribution_log dl
      ON dl.corretor_id = b.corretor_id
     AND dl.resultado = 'sucesso'
     AND (dl.roleta_slug = _slug OR dl.roleta_slug IS NULL)
     AND (dl.tipo IN ('automatica','inicial')
          OR (b.conta_redist AND dl.tipo = 'redistribuicao'))
     AND dl.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY b.corretor_id
  )
  SELECT
    b.corretor_id,
    b.nome,
    -- apto = passa em TODOS os critérios da roleta
    ( b.participante_ativo
      AND NOT b.pausado
      AND b.perfil_ativo
      AND b.eh_corretor
      AND b.tem_telefone
      AND b.recebe_65
      AND (NOT b.exigir_presenca OR b.presente_hoje)
      AND rec.hoje_n < b.limite
      AND (b.criterio_participacao <> 'automatica_presenca'
           OR c.total = 0
           OR round(100.0 * (c.total - c.aguardando) / c.total, 1) >= b.pct_min)
    ) AS apto,
    array_remove(ARRAY[
      CASE WHEN NOT b.participante_ativo THEN 'participacao_inativa' END,
      CASE WHEN b.pausado THEN 'pausado' END,
      CASE WHEN NOT b.perfil_ativo THEN 'perfil_inativo' END,
      CASE WHEN NOT b.eh_corretor THEN 'sem_role_corretor' END,
      CASE WHEN NOT b.tem_telefone THEN 'sem_telefone' END,
      CASE WHEN NOT b.recebe_65 THEN 'regra_65_sem_vaga' END,
      CASE WHEN b.exigir_presenca AND NOT b.presente_hoje THEN 'ausente_hoje' END,
      CASE WHEN rec.hoje_n >= b.limite THEN 'cota_diaria_atingida' END,
      CASE WHEN b.criterio_participacao = 'automatica_presenca'
                AND c.total > 0
                AND round(100.0 * (c.total - c.aguardando) / c.total, 1) < b.pct_min
           THEN 'pct_trabalhado_abaixo_minimo' END
    ], NULL) AS motivos,
    CASE WHEN c.total = 0 THEN 100
         ELSE round(100.0 * (c.total - c.aguardando) / c.total, 1) END AS pct_trabalhado,
    c.total AS carteira_total,
    c.aguardando,
    rec.hoje_n AS recebidos_hoje,
    rec.mes_n AS recebidos_mes,
    b.limite AS limite_diario,
    b.presente_hoje AS presente,
    b.pausado,
    b.motivo_pausa,
    b.participante_ativo,
    b.ultimo_lead_em,
    b.incluido_por,
    b.incluido_em
  FROM base b
  JOIN carteira c ON c.corretor_id = b.corretor_id
  JOIN recebidos rec ON rec.corretor_id = b.corretor_id;
$$;

CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int; _zslug text;
  _estrita boolean := public._zona_estrita();
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  SELECT id, corretor_id, status, corretores_que_tentaram INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  _zona := public.zona_do_lead(_lead_id);

  IF _estrita AND _zona IS NOT NULL THEN
    -- [ZONA] Campanha comum: a distribuição é do time da zona; a campanha
    -- vira rótulo no contexto.
    IF NOT _roleta.equipe_fixa THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  ELSIF NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): zona primeiro só se a
    -- roleta da zona estiver pronta.
    _zslug := public.roleta_da_zona(_zona);
    IF _zslug IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _dlp_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _dlp_elegiveis;

  INSERT INTO _dlp_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    -- Registro mãe (20261010120400): quem já tem um registro ativo da pessoa
    -- não recebe outro — o filho da campanha vai para outro corretor.
    AND NOT (rp.corretor_id = ANY (COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  IF _estrita THEN
    -- [ZONA] Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _dlp_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior: filtro por profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _dlp_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _dlp_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _dlp_elegiveis;
  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    IF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da equipe fixa apto na zona do lead: time da zona.
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_equipe_fixa_sem_zona',
        jsonb_build_object('campanha', _roleta_slug, 'equipe_fixa', true,
                           'equipe_sem_apto_na_zona', true), true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_disponivel');
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'aguardando_atendimento'::public.lead_status
           ELSE status
         END,
         data_distribuicao = COALESCE(data_distribuicao, now())
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;

  INSERT INTO public.distribution_log(
    lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado
  )
  VALUES (
    _lead_id, _picked, 'automatica', 'roleta_ponderada',
    _roleta.slug, 'roleta:'||_roleta.slug||':tier'||_tier_picked, 'sucesso'
  );

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked,
    'tier', _tier_picked, 'roleta_slug', _roleta.slug,
    'zona', _zona
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._repassar_lead_campanha(
  _lead_id uuid,
  _roleta_slug text,
  _gatilho text,
  _contexto_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record;
  _lead record;
  _zona text;
  _estrita boolean := public._zona_estrita();
  _tentaram uuid[];
  _picked uuid;
  _picked_nome text;
  _tier_picked text;
  _sum_pesos int;
  _n_zona int;
  _ctx jsonb;
  _log_id uuid;
  _excecao_id uuid;
  _motivo_log text;
BEGIN
  SELECT l.id, l.corretor_id, l.corretores_que_tentaram, l.deleted_at, l.na_lixeira
    INTO _lead
    FROM public.leads l WHERE l.id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  _zona := public.zona_do_lead(_lead_id);
  -- Quem já teve o lead não recebe de volta — o dono atual incluído, mesmo
  -- que o chamador não o tenha posto na lista.
  _tentaram := array_append(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]),
                            _lead.corretor_id);
  _ctx := jsonb_build_object('campanha', _roleta_slug, 'repasse', true)
          || COALESCE(_contexto_extra, '{}'::jsonb);

  SELECT * INTO _roleta FROM public.roletas
   WHERE slug = _roleta_slug AND tipo = 'campanha' AND ativo;

  -- Campanha desligada (ou não é campanha): a triagem normal decide — zona
  -- estrita, pino de zona e origem, como o motor faz com qualquer repasse.
  IF NOT FOUND THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
      _ctx || jsonb_build_object('campanha_inativa', true));
  END IF;

  -- Zona estrita: campanha comum com lead de zona é do time da zona.
  IF _estrita AND _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho, _ctx);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _rlc_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _rlc_elegiveis;

  -- Mesma elegibilidade da roleta ponderada (20261009120100), menos quem já
  -- teve o lead.
  INSERT INTO _rlc_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    AND NOT (rp.corretor_id = ANY(_tentaram))
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  IF _estrita THEN
    -- Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _rlc_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _rlc_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _rlc_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _rlc_elegiveis;

  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    -- Equipe fixa com lead de zona e ninguém da equipe na zona: time da zona.
    IF _estrita AND _zona IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
        _ctx || jsonb_build_object('equipe_fixa', true, 'equipe_sem_apto_na_zona', true));
    END IF;

    -- Ninguém mais na equipe: o lead fica com o dono atual e a exceção abre
    -- (alerta à gestão + backoff do cron). Antes, o cron de parados o
    -- re-tentava a cada minuto, sem fim.
    _motivo_log := 'Repasse na campanha ' || _roleta.slug
                   || ' sem outro corretor apto — lead segue com o dono atual';
    _ctx := _ctx || jsonb_build_object('roleta', _roleta.slug, 'gatilho', _gatilho,
                                       'zona', _zona, 'excluidos_por_tentativa', to_jsonb(_tentaram));
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'sem_corretor_elegivel', _motivo_log, _roleta.slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, 'redistribuicao', _motivo_log, _roleta.slug,
       'repasse_campanha', 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_elegivel',
                              'excecao_id', _excecao_id, 'roleta', _roleta.slug);
  END IF;

  -- [V2] O estouro do dono que perdeu o lead conta para a pausa automática,
  -- como no repasse do motor.
  IF public._modelo_v2_ativo() AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _roleta.slug);
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _rlc_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _rlc_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  -- Repasse = entrega nova: relógio do SLA reinicia, dono anterior registrado,
  -- pino da campanha mantido.
  UPDATE public.leads
     SET corretor_anterior_id = corretor_id,
         corretor_id = _picked,
         roleta_slug = _roleta.slug,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         corretores_que_tentaram = CASE
           WHEN _picked = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _picked) END
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;
  SELECT p.nome INTO _picked_nome FROM public.profiles p WHERE p.id = _picked;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _picked, 'redistribuicao',
     'Repasse na campanha ' || _roleta.slug || ' (' || _gatilho || ') — tier ' || COALESCE(_tier_picked, 'B'),
     _roleta.slug, 'repasse_campanha:' || _roleta.slug || ':tier' || COALESCE(_tier_picked, 'B'),
     'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object(
    'roleta', _roleta.slug, 'gatilho', _gatilho, 'zona', _zona,
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'vencedor', jsonb_build_object('corretor_id', _picked, 'nome', _picked_nome)));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolucao = 'Repassado na campanha para ' || COALESCE(_picked_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked, 'corretor_nome', _picked_nome,
    'tier', _tier_picked, 'roleta', _roleta.slug, 'zona', _zona);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9a) A entrega do SDR ao corretor continua passando por Qualificação Corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entregar_lead_sdr(_lead_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _res jsonb;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._sdr_gate_lead(_uid, _lead);

  IF char_length(COALESCE(btrim(_motivo), '')) < 5 THEN
    RAISE EXCEPTION 'motivo da entrega é obrigatório (mínimo 5 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN
    RAISE EXCEPTION 'lead já entregue ao corretor' USING ERRCODE = '22023';
  END IF;
  IF _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status, 'perdido'::public.lead_status,
                      'contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status) THEN
    RAISE EXCEPTION 'entregue só depois do primeiro contato (lead em %)', _lead.status USING ERRCODE = '22023';
  END IF;

  _res := public._distribuir_lead_sdr(_lead_id, 'Entrega manual do SDR: ' || btrim(_motivo), NULL, NULL, 'entrega_manual_sdr');
  IF NOT COALESCE((_res ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'nenhum corretor apto para receber o lead (%). A gestão foi avisada.', _res ->> 'motivo'
      USING ERRCODE = '22023';
  END IF;

  IF _lead.status NOT IN ('agendado'::public.lead_status, 'visita_realizada'::public.lead_status,
                          'analise_credito'::public.lead_status, 'proposta_enviada'::public.lead_status)
     -- Regra dos 65, Fatia 3a: a saída só por desfecho é do corretor dono; a
     -- entrega do SDR ao corretor usa a matriz ampla (como _sdr_set_status).
     AND public.transicao_lead_permitida(_lead.status, 'qualificacao_corretor'::public.lead_status, true) THEN
    PERFORM public.transicionar_lead(_lead_id, 'qualificacao_corretor'::public.lead_status,
      'Entrega manual do SDR: ' || btrim(_motivo),
      'Assumir o atendimento do lead entregue pelo SDR');
  END IF;

  PERFORM public._sdr_notificar_corretor(_lead_id, (_res ->> 'corretor_id')::uuid, 'entrega_manual_sdr');

  RETURN _res;
END; $$;

-- ---------------------------------------------------------------------------
-- 9b) O contador X/65 conta a Minha base pela função comum e diz se recebe lead
-- ---------------------------------------------------------------------------
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
  -- "Minha base": a mesma conta da trava da roleta (Fatia 3a).
  _base := public.em_atendimento_minha_base(_alvo);

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
    'dias_sem_toque', (_cfg ->> 'dias_sem_toque')::int,
    'entrada_contato_horas', COALESCE((_cfg ->> 'entrada_contato_horas')::int, 24),
    'recebe_lead', public._em_atendimento_recebe_lead(_alvo));
END;
$$;

-- ---------------------------------------------------------------------------
-- 10) Portal é origem paga (decisão 4 do §6)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_origem_paga(
  _origem public.lead_origem,
  _sdr_entregue_em timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _sdr_entregue_em IS NOT NULL
      OR _origem IN ('facebook'::public.lead_origem,
                     'chatbot'::public.lead_origem,
                     'impulso_smq'::public.lead_origem,
                     'portal'::public.lead_origem);
$$;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regprocedure('public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'fatia3a: a trava antiga ainda existe';
  END IF;
  IF to_regprocedure('public.trocar_vaga_em_atendimento(uuid, uuid, text, timestamptz, text, text, text, timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'fatia3a: a troca antiga ainda existe';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads
              WHERE status = 'em_atendimento'::public.lead_status
                AND corretor_id IS NULL AND sdr_id IS NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'fatia3a: ainda há lead em atendimento sem dono';
  END IF;
  IF NOT public.lead_origem_paga('portal'::public.lead_origem) THEN
    RAISE EXCEPTION 'fatia3a: portal não é origem paga';
  END IF;
  IF public.transicao_lead_permitida('em_atendimento', 'qualificado', false)
     OR NOT public.transicao_lead_permitida('em_atendimento', 'qualificado', true)
     OR NOT public.transicao_lead_permitida('em_atendimento', 'agendado', false) THEN
    RAISE EXCEPTION 'fatia3a: matriz de saída de em_atendimento errada';
  END IF;
  IF has_function_privilege('authenticated',
       'public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean, timestamptz, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fatia3a: a porta continua executável por authenticated';
  END IF;
END
$guard$;
