-- ============================================================================
-- Regra dos 65, Fatia 3a.2 — Em atendimento é consequência, não escolha
-- ============================================================================
-- Decisão do dono (05/10/2026): "o corretor não deve mais poder selecionar
-- para levar o cliente ao status de Em Atendimento; isso deve ser uma
-- consequência de uma sequência de ações que ele realizar com o lead."
--
--   1. A matriz (transicao_lead_permitida) não oferece em_atendimento ao
--      corretor a partir de NENHUM status. A gestão mantém (correção de dado).
--   2. transicionar_lead abre a entrada só com origem 'resposta' (a RPC
--      abaixo), 'troca' (trocar_vaga_em_atendimento) ou pela cadência
--      (cadencia_marcar_respondeu, que grava por dentro). A origem viaja em
--      app.em_atendimento_origem (transação), e substitui a marca da troca.
--   3. registrar_contato_lead: o contato é a ação. Registra a interação, o
--      próximo passo (tarefa) e, se o cliente RESPONDEU (atendeu, interessado,
--      pediu retorno) e o lead está antes de Em atendimento, o lead entra —
--      pela cadência quando está em D0–D3, pela origem 'resposta' quando não.
--      Teto cheio (EA065) não é erro: o contato fica gravado e a RPC devolve
--      `lotado` para a tela abrir a troca.
--   4. iniciar_atendimento_lead (20261010120700, nunca publicada) sai: o
--      "Iniciar atendimento" deixa de existir como ação de status.
--
-- Idempotente. Migration anterior: 20261010120700.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A matriz: Em atendimento não é destino do corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(p_de lead_status, p_para lead_status, p_gestao boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN p_de = p_para THEN true
    -- Regra dos 65, Fatia 3a.2: em_atendimento é consequência (registrar
    -- contato → cliente respondeu → passo com data). Só a gestão o escolhe.
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','qualificacao_corretor','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','qualificacao_corretor','qualificado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['qualificacao_corretor','qualificado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    -- Fatia 3a (decisão 7): de Em atendimento o corretor sai por desfecho.
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','analise_credito','perdido'])
        OR (p_gestao AND p_para::text = ANY (ARRAY['qualificacao_corretor','qualificado','visita_realizada']))
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['qualificacao_corretor','qualificado','agendado','visita_realizada','analise_credito','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'qualificacao_corretor'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','visita_realizada','analise_credito','contrato_fechado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','agendado','proposta_enviada','analise_credito','contrato_fechado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','analise_credito','contrato_fechado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','visita_realizada','proposta_enviada','contrato_fechado','perdido'])
        OR (p_gestao AND p_para::text = 'em_atendimento')
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = ANY (ARRAY['pos_venda','analise_credito'])
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor'])
    ELSE false
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) A porta aceita a origem 'resposta'
-- ---------------------------------------------------------------------------
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
  IF _gestao OR _corretor_id IS NULL OR _corretor_id IS DISTINCT FROM _uid THEN
    RETURN;
  END IF;
  IF NOT public.has_role(_corretor_id, 'corretor'::public.app_role) THEN
    RETURN;
  END IF;
  IF _origem NOT IN ('transicao', 'cadencia', 'troca', 'resposta') THEN
    RAISE EXCEPTION 'origem da entrada inválida: %', _origem USING ERRCODE = '22023';
  END IF;

  -- (a) Lead na cadência só entra pela Fila do Dia ("Cliente respondeu"); a
  -- resposta registrada pela ficha chega aqui já pela cadência (registrar_contato_lead).
  IF _origem = 'transicao' AND _cadencia_etapa IN ('D0', 'D1', 'D2', 'D3') THEN
    RAISE EXCEPTION 'Este lead está na cadência (%). Registre a resposta do cliente pela Fila do Dia.',
      _cadencia_etapa
      USING ERRCODE = 'EA067',
            DETAIL = jsonb_build_object('lead_id', _lead_id, 'cadencia_etapa', _cadencia_etapa)::text;
  END IF;

  -- (b) Contato registrado (a resposta registra o seu na mesma transação).
  IF _origem IN ('transicao', 'resposta')
     AND NOT public._em_atendimento_contato_recente(_lead_id, _horas) THEN
    RAISE EXCEPTION 'Para pôr em atendimento, registre o contato com o cliente (ligação ou WhatsApp): nenhum nas últimas % horas.',
      _horas
      USING ERRCODE = 'EA066',
            DETAIL = jsonb_build_object('lead_id', _lead_id, 'horas', _horas)::text;
  END IF;

  -- (c) Passo com data.
  IF (_followup IS NULL OR _followup <= now()) AND public.lead_sem_proximo_passo(_lead_id) THEN
    RAISE EXCEPTION 'Em atendimento exige um próximo passo com data futura.'
      USING ERRCODE = 'EA068',
            DETAIL = jsonb_build_object('lead_id', _lead_id)::text;
  END IF;

  -- (d) O teto.
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
-- 3) transicionar_lead e a troca com a origem
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
  _origem text;
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
  -- Regra dos 65, Fatia 3a.2 (20261010120800): Em atendimento é CONSEQUÊNCIA.
  -- O corretor dono não escolhe o status; o lead entra pela resposta do
  -- cliente (registrar_contato_lead → origem 'resposta'), pela cadência
  -- (cadencia_marcar_respondeu) ou pela troca "entra um, sai um". Gestão e
  -- quem não é o dono (SDR, serviço) seguem com a matriz ampla.
  _origem := COALESCE(NULLIF(current_setting('app.em_atendimento_origem', true), ''), 'transicao');
  IF NOT public.transicao_lead_permitida(
           _lead.status, p_novo_status,
           _gestao
           OR (_lead.status = 'em_atendimento'::public.lead_status AND NOT _dono_corretor)
           OR (p_novo_status = 'em_atendimento'::public.lead_status
               AND (NOT _dono_corretor OR _origem IN ('resposta', 'troca')))) THEN
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
      _followup_final, _lead.cadencia_etapa, _origem);
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
  PERFORM set_config('app.em_atendimento_origem', 'troca', true);
  PERFORM public.transicionar_lead(
    _entra, 'em_atendimento'::public.lead_status,
    'Entrou em atendimento no lugar de ' || COALESCE(_s.nome, 'outro lead'),
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Dar sequência ao atendimento'),
    _followup);
  PERFORM set_config('app.em_atendimento_origem', '', true);
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

-- ---------------------------------------------------------------------------
-- 4) O contato é a ação: registrar_contato_lead
-- ---------------------------------------------------------------------------
-- Substitui a escrita direta do diálogo "Registrar contato" (interação +
-- tarefa) e a RPC iniciar_atendimento_lead. A consequência mora aqui.
DROP FUNCTION IF EXISTS public.iniciar_atendimento_lead(uuid, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.registrar_contato_lead(
  _lead_id uuid,
  _tipo text,
  _resultado text,
  _conteudo text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL,
  _proximo_followup timestamptz DEFAULT NULL,
  _titulo text DEFAULT NULL,
  _criar_tarefa boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _tipo_enum public.interacao_tipo;
  _titulo_final text;
  _interacao_id uuid;
  _tarefa_id uuid;
  _respondeu boolean;
  _prospeccao boolean;
  _entrou boolean := false;
  _via text;
  _lotado jsonb;
  _detalhe text;
  _acao text;
  _followup timestamptz;
  _status_final text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _resultado NOT IN ('atendeu', 'nao_atendeu', 'interessado', 'sem_interesse', 'pediu_retorno') THEN
    RAISE EXCEPTION 'resultado do contato inválido: %', _resultado USING ERRCODE = '22023';
  END IF;
  BEGIN
    _tipo_enum := _tipo::public.interacao_tipo;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'canal de contato inválido: %', _tipo USING ERRCODE = '22023';
  END;
  IF _tipo_enum IN ('nota'::public.interacao_tipo, 'mudanca_status'::public.interacao_tipo) THEN
    RAISE EXCEPTION 'canal % não é um contato com o cliente', _tipo USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  _titulo_final := COALESCE(NULLIF(btrim(_titulo), ''),
    CASE _resultado
      WHEN 'atendeu'       THEN 'Contato — atendeu'
      WHEN 'nao_atendeu'   THEN 'Contato — não atendeu'
      WHEN 'interessado'   THEN 'Contato — interessado'
      WHEN 'sem_interesse' THEN 'Contato — sem interesse'
      ELSE                      'Contato — pediu retorno'
    END);

  -- 1) A interação na timeline (o toque, no recorte do classificador).
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, _uid, _tipo_enum, 'saida'::public.interacao_direcao, _titulo_final,
          COALESCE(NULLIF(btrim(_conteudo), ''), _titulo_final),
          jsonb_build_object('origem', 'registrar_contato', 'resultado', _resultado))
  RETURNING id INTO _interacao_id;

  _respondeu := _resultado IN ('atendeu', 'interessado', 'pediu_retorno');
  _prospeccao := _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                                  'aguardando_atendimento'::public.lead_status,
                                  'aguardando_retorno'::public.lead_status,
                                  'qualificacao_corretor'::public.lead_status,
                                  'qualificado'::public.lead_status);
  _acao := COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Follow-up com ' || COALESCE(_lead.nome, 'o cliente'));
  _followup := _proximo_followup;

  -- Tentativa num lead em cadência D0–D3: a interação fica na timeline, mas a
  -- tarefa não — um follow-up com data encerra a cadência
  -- (trg_cadencia_sai_por_tarefa) e a régua é quem marca o próximo toque.
  IF NOT _respondeu AND _lead.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3') THEN
    _criar_tarefa := false;
  END IF;

  -- 2) A consequência: o cliente respondeu e o lead ainda não estava em
  --    atendimento → entra, com o passo com data (obrigatório na porta).
  IF _respondeu AND _prospeccao THEN
    _followup := COALESCE(_followup, now() + interval '1 day');
    IF _lead.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3') THEN
      _via := 'cadencia';
      BEGIN
        PERFORM public.cadencia_marcar_respondeu(_lead_id, _acao, _followup);
        _entrou := true;
        _criar_tarefa := false;  -- a cadência cria a tarefa do passo
      EXCEPTION WHEN SQLSTATE 'EA065' THEN
        GET STACKED DIAGNOSTICS _detalhe = PG_EXCEPTION_DETAIL;
        _lotado := COALESCE(NULLIF(_detalhe, '')::jsonb, '{}'::jsonb);
      END;
    ELSE
      _via := 'resposta';
      BEGIN
        PERFORM set_config('app.em_atendimento_origem', 'resposta', true);
        PERFORM public.transicionar_lead(
          _lead_id, 'em_atendimento'::public.lead_status, _titulo_final, _acao, _followup);
        PERFORM set_config('app.em_atendimento_origem', '', true);
        _entrou := true;
      EXCEPTION WHEN SQLSTATE 'EA065' THEN
        PERFORM set_config('app.em_atendimento_origem', '', true);
        GET STACKED DIAGNOSTICS _detalhe = PG_EXCEPTION_DETAIL;
        _lotado := COALESCE(NULLIF(_detalhe, '')::jsonb, '{}'::jsonb);
      END;
    END IF;
  END IF;

  -- 3) O próximo passo como tarefa (dedup como garantirFollowUpAberto: follow-up
  --    aberto a ±1 dia é atualizado). leads.proximo_followup é espelho.
  IF _criar_tarefa AND _followup IS NOT NULL THEN
    SELECT t.id INTO _tarefa_id
      FROM public.tarefas AS t
     WHERE t.lead_id = _lead_id
       AND t.tipo = 'follow_up'::public.tarefa_tipo
       AND t.deleted_at IS NULL
       AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
       AND t.data_vencimento BETWEEN _followup - interval '1 day' AND _followup + interval '1 day'
     ORDER BY t.data_vencimento
     LIMIT 1;
    IF _tarefa_id IS NOT NULL THEN
      UPDATE public.tarefas
         SET titulo = _acao,
             data_vencimento = _followup,
             prioridade = CASE WHEN _respondeu THEN 'alta' ELSE 'media' END::public.tarefa_prioridade
       WHERE id = _tarefa_id;
    ELSE
      INSERT INTO public.tarefas
        (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
         criado_por, data_vencimento)
      VALUES
        (_acao, 'Próximo passo registrado no contato (' || _resultado || ').',
         'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
         CASE WHEN _respondeu THEN 'alta' ELSE 'media' END::public.tarefa_prioridade,
         _lead_id, COALESCE(_lead.corretor_id, _uid), _uid, _followup)
      RETURNING id INTO _tarefa_id;
    END IF;
  END IF;

  SELECT status::text INTO _status_final FROM public.leads WHERE id = _lead_id;
  RETURN jsonb_build_object(
    'ok', true,
    'interacao_id', _interacao_id,
    'tarefa_id', _tarefa_id,
    'respondeu', _respondeu,
    'entrou', _entrou,
    'via', _via,
    'status', _status_final,
    'lotado', _lotado);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF public.transicao_lead_permitida('aguardando_atendimento', 'em_atendimento', false)
     OR public.transicao_lead_permitida('novo', 'em_atendimento', false)
     OR public.transicao_lead_permitida('aguardando_retorno', 'em_atendimento', false)
     OR public.transicao_lead_permitida('agendado', 'em_atendimento', false)
     OR NOT public.transicao_lead_permitida('aguardando_atendimento', 'em_atendimento', true)
     OR NOT public.transicao_lead_permitida('aguardando_retorno', 'em_atendimento', true) THEN
    RAISE EXCEPTION 'fatia3a.2: a matriz ainda oferece em_atendimento ao corretor (ou tirou da gestão)';
  END IF;
  IF to_regprocedure('public.iniciar_atendimento_lead(uuid, text, text, timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'fatia3a.2: iniciar_atendimento_lead ainda existe';
  END IF;
  IF to_regprocedure('public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)') IS NULL THEN
    RAISE EXCEPTION 'fatia3a.2: registrar_contato_lead não existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'transicionar_lead' AND prosrc LIKE '%app.em_atendimento_origem%') THEN
    RAISE EXCEPTION 'fatia3a.2: transicionar_lead não lê a origem';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trocar_vaga_em_atendimento' AND prosrc LIKE '%app.em_atendimento_troca%') THEN
    RAISE EXCEPTION 'fatia3a.2: a troca ainda usa a marca antiga';
  END IF;
END
$guard$;
