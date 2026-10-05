-- ============================================================================
-- Regra dos 65 em "Em atendimento" — Fatia 6: a tentativa sem resposta
-- ============================================================================
-- Desenho: docs/ops/em-atendimento-teto-65.md (§2 decisão 14, §8.11).
-- Decisão do dono (05/10/2026): "o lead que não atendeu deve ir para o status
-- de Aguardando retorno, e não continuar em Aguardando atendimento, pois já
-- foi feito algo com aquele lead".
--
-- A ETAPA DIZ DE QUEM É A VEZ. Aguardando atendimento passa a significar
-- "ninguém tentou ainda"; Aguardando retorno, "o corretor tentou e espera o
-- cliente". Pela mesma porta de sempre (registrar_contato_lead): a tentativa
-- do corretor DONO que não foi atendida, em lead Novo ou Aguardando
-- atendimento, move para Aguardando retorno. Qualificação Corretor fica (o
-- relógio de 1 dia da decisão 3 não se escapa com um clique); gestão, SDR e
-- serviço só gravam o contato; nenhum lead muda na publicação (só daqui
-- para frente). "Sem interesse" não é tentativa sem resposta: o cliente
-- falou — fica como estava, e o desfecho honesto é Perdido com motivo.
--
-- Quatro peças, numa transação só:
--  1) transicionar_lead aceita a origem 'tentativa' (como 'resposta' e
--     'troca'): o corretor dono entra em Aguardando retorno sem abrir a
--     matriz (a ficha continua sem esse destino: a etapa não se escolhe,
--     decisão 13) e sem exigir follow-up futuro — o passo é a tarefa que a
--     própria RPC cria fora da cadência, ou a régua dentro dela. A origem
--     fica no payload do lead_eventos, que o classificador lê.
--  2) registrar_contato_lead: a consequência da tentativa.
--  3) A cadência D0–D3 CONTINUA: Aguardando retorno passa a contar como
--     prospecção para tg_cadencia_sai_por_status (o único uso da função), e
--     cadencia_marcar_respondeu leva Aguardando retorno a Em atendimento.
--     Sem isto a primeira tentativa de um lead em D0 encerraria a cadência
--     de 10 toques, ou o "Cliente respondeu" deixaria o lead parado.
--  4) O classificador trata a entrada por tentativa com o relógio de 5 dias
--     sem toque (decisão do dono), não com o do retorno combinado (data +
--     tolerância): o follow-up da tentativa é lembrete do corretor, não
--     promessa ao cliente.
--
-- Idempotente. Migration anterior da regra: 20261011120300.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A cadência continua em Aguardando retorno
-- ---------------------------------------------------------------------------
-- tg_cadencia_sai_por_status encerra a cadência quando o status sai da
-- prospecção ("avanço ou perda"). Aguardando retorno por tentativa não é
-- nenhum dos dois: o lead continua na régua até o cliente responder.
CREATE OR REPLACE FUNCTION public._cadencia_status_prospeccao(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _status IN ('novo', 'aguardando_atendimento', 'aguardando_corretor', 'aguardando_retorno');
$$;

COMMENT ON FUNCTION public._cadencia_status_prospeccao(text) IS
  'Status em que a cadencia D0-D3 segue rodando. Regra dos 65, Fatia 6: '
  'aguardando_retorno entra na lista (tentativa sem resposta move para la '
  'sem encerrar a cadencia).';

-- ---------------------------------------------------------------------------
-- 2) transicionar_lead: a origem 'tentativa'
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
  _tentativa boolean := false;
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
  -- Regra dos 65, Fatia 6 (20261011120500): a TENTATIVA sem resposta do
  -- corretor dono leva Novo/Aguardando atendimento a Aguardando retorno. A
  -- matriz continua fechada para a ficha (decisão 13: a etapa não se
  -- escolhe); só registrar_contato_lead põe a origem 'tentativa'.
  _tentativa := _origem = 'tentativa'
    AND p_novo_status = 'aguardando_retorno'::public.lead_status
    AND _dono_corretor
    AND _lead.status IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status);
  IF NOT _tentativa AND NOT public.transicao_lead_permitida(
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

  -- A tentativa não combina data com o cliente: o passo é a tarefa que
  -- registrar_contato_lead cria logo depois (fora da cadência) ou a régua
  -- (dentro dela — uma data escrita aqui encerraria a cadência).
  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND NOT _tentativa
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
      'alterado_por', _uid,
      -- Fatia 6: a origem fica no rastro ('tentativa', 'resposta', 'troca';
      -- a transição comum não grava nada). O classificador lê daqui.
      'origem', NULLIF(_origem, 'transicao')
    ))
  );

  RETURN _resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) registrar_contato_lead: a consequência da tentativa
-- ---------------------------------------------------------------------------
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
  _dono_corretor boolean;
  _entrou boolean := false;
  _moveu boolean := false;
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
  -- O mesmo "dono" de transicionar_lead: papel corretor, na própria carteira,
  -- sem papel de gestão (a gestão corrige dado; não "tenta").
  _dono_corretor := COALESCE(_lead.corretor_id = _uid, false)
    AND public.has_role(_uid, 'corretor'::public.app_role)
    AND NOT (public.has_role(_uid, 'admin'::public.app_role)
             OR public.has_role(_uid, 'gestor'::public.app_role)
             OR public.has_role(_uid, 'superintendente'::public.app_role));
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

  -- 2b) Fatia 6 (decisão 14): a tentativa do corretor dono NÃO atendida, em
  --     lead que ninguém tinha tentado (Novo, Aguardando atendimento), passa
  --     o lead a Aguardando retorno — já foi feito algo, agora é a vez do
  --     cliente. Qualificação Corretor fica no seu relógio de 1 dia;
  --     "sem interesse" é resposta (negativa), não tentativa; gestão, SDR e
  --     serviço só gravam o contato. Na cadência a etapa continua (a régua
  --     segue marcando os toques); fora dela o passo é a tarefa do item 3.
  ELSIF _resultado = 'nao_atendeu'
        AND _dono_corretor
        AND _lead.status IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    BEGIN
      PERFORM set_config('app.em_atendimento_origem', 'tentativa', true);
      PERFORM public.transicionar_lead(
        _lead_id, 'aguardando_retorno'::public.lead_status, _titulo_final, _acao, NULL);
      PERFORM set_config('app.em_atendimento_origem', '', true);
      _moveu := true;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.em_atendimento_origem', '', true);
      RAISE;
    END;
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
    'moveu', _moveu,
    'via', _via,
    'status', _status_final,
    'lotado', _lotado);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean) IS
  'Regra dos 65: o contato (interacao) e o proximo passo (tarefa) numa '
  'transacao. Cliente respondeu antes de Em atendimento: entra, com o passo '
  'com data (Fatia 3a.2). Tentativa do corretor dono nao atendida em '
  'Novo/Aguardando atendimento: vai para Aguardando retorno (Fatia 6). '
  'Teto cheio: contato e passo ficam e `lotado` volta para a janela de troca.';

-- ---------------------------------------------------------------------------
-- 4) cadencia_marcar_respondeu: de Aguardando retorno também entra
-- ---------------------------------------------------------------------------
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
  -- Fatia 6 (20261011120500): a tentativa sem resposta deixa o lead em
  -- Aguardando retorno sem sair da cadência — de lá o "Cliente respondeu"
  -- também entra.
  IF _l.status IN ('novo'::public.lead_status,
                   'aguardando_atendimento'::public.lead_status,
                   'aguardando_corretor'::public.lead_status,
                   'aguardando_retorno'::public.lead_status) THEN
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
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_retorno'::public.lead_status)
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
-- 5) O classificador: a entrada por tentativa segue o relógio de 5 dias
-- ---------------------------------------------------------------------------
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
  -- Fatia 6 (decisão 14): quem está em Aguardando retorno porque o corretor
  -- TENTOU e não foi atendido. Vale a entrada MAIS RECENTE nessa etapa: o
  -- rastro de lead_status_transitions cobre todo caminho (inclusive o robô
  -- da 3b, que escreve o status direto), e a entrada por tentativa é a que
  -- transicionar_lead gravou em lead_eventos com origem 'tentativa' na mesma
  -- transação (mesmo now()). Entrada posterior por outro caminho (retorno
  -- combinado, robô) vence. Para a tentativa o follow-up é lembrete do
  -- corretor, não retorno combinado: vale o relógio de 5 dias sem toque.
  tentativa AS (
    SELECT m.id
    FROM marcados AS m
    JOIN LATERAL (
      SELECT t.created_at
      FROM public.lead_status_transitions AS t
      WHERE t.lead_id = m.id
        AND t.para_status = 'aguardando_retorno'::public.lead_status
      ORDER BY t.created_at DESC
      LIMIT 1
    ) AS ult ON true
    JOIN LATERAL (
      SELECT e.created_at, e.payload ->> 'origem' AS origem
      FROM public.lead_eventos AS e
      WHERE e.lead_id = m.id
        AND e.tipo = 'transicao_lead'
        AND e.payload ->> 'para_status' = 'aguardando_retorno'
      ORDER BY e.created_at DESC
      LIMIT 1
    ) AS ev ON true
    WHERE m.status = 'aguardando_retorno'
      AND ev.origem = 'tentativa'
      AND ev.created_at >= ult.created_at
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
        -- As regras do retorno combinado valem para quem combinou retorno com
        -- o cliente — não para quem só tentou (Fatia 6: tt.id IS NULL).
        WHEN m.status = 'aguardando_retorno' AND tt.id IS NULL
             AND m.proximo_followup > now() + make_interval(days => cfg.retorno_max)
          THEN 'retorno_acima_maximo'
        -- Retorno combinado: protegido até a data + tolerância. Depois disso,
        -- se ninguém tocou desde a data, a promessa ao cliente não foi
        -- cumprida e o lead sai — sem esperar mais 5 dias (decisão do dono:
        -- "dia 25 combinado, ninguém ligou até o 27, sai").
        WHEN m.status = 'aguardando_retorno' AND tt.id IS NULL
             AND m.proximo_followup IS NOT NULL
             AND now() < m.proximo_followup + make_interval(days => cfg.tolerancia)
          THEN 'retorno_protegido'
        WHEN m.status = 'aguardando_retorno' AND tt.id IS NULL
             AND m.proximo_followup IS NOT NULL
             AND m.movimento < m.proximo_followup
          THEN 'retorno_vencido'
        WHEN m.dias >= cfg.dias_sem_toque THEN 'sem_toque'
        ELSE 'base_ok'
      END AS acao
    FROM marcados AS m
    CROSS JOIN cfg
    LEFT JOIN escreveu  AS es ON es.lead_id = m.id
    LEFT JOIN disputa   AS d  ON d.id = m.id
    LEFT JOIN qualif    AS q  ON q.id = m.id
    LEFT JOIN tentativa AS tt ON tt.id = m.id
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
-- Sanidade: as quatro peças estão no lugar e a ficha continua fechada.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT public._cadencia_status_prospeccao('aguardando_retorno') THEN
    RAISE EXCEPTION 'fatia6: aguardando_retorno fora da prospecção da cadência';
  END IF;
  -- A matriz não abriu: a ficha do corretor segue sem Aguardando retorno
  -- como destino de Novo/Aguardando atendimento (só a tentativa entra).
  IF public.transicao_lead_permitida('aguardando_atendimento'::public.lead_status,
                                     'aguardando_retorno'::public.lead_status, false)
     OR public.transicao_lead_permitida('novo'::public.lead_status,
                                        'aguardando_retorno'::public.lead_status, false) THEN
    RAISE EXCEPTION 'fatia6: a matriz abriu Aguardando retorno para a ficha';
  END IF;
  IF pg_get_functiondef('public.transicionar_lead(uuid, public.lead_status, text, text, timestamptz, text)'::regprocedure)
     NOT LIKE '%''tentativa''%' THEN
    RAISE EXCEPTION 'fatia6: transicionar_lead sem a origem tentativa';
  END IF;
  IF pg_get_functiondef('public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)'::regprocedure)
     NOT LIKE '%''tentativa''%' THEN
    RAISE EXCEPTION 'fatia6: registrar_contato_lead sem a consequência da tentativa';
  END IF;
  IF pg_get_functiondef('public.cadencia_marcar_respondeu(uuid, text, timestamptz)'::regprocedure)
     NOT LIKE '%aguardando_retorno%' THEN
    RAISE EXCEPTION 'fatia6: cadencia_marcar_respondeu não entra de Aguardando retorno';
  END IF;
  IF pg_get_functiondef('public._em_atendimento_classificar(uuid[])'::regprocedure)
     NOT LIKE '%tentativa AS (%' THEN
    RAISE EXCEPTION 'fatia6: classificador sem o relógio da tentativa';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.registrar_contato_lead(uuid, text, text, text, text, timestamptz, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fatia6: registrar_contato_lead sem EXECUTE para authenticated';
  END IF;
  IF has_function_privilege('authenticated', 'public._em_atendimento_classificar(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'fatia6: EXECUTE indevido no classificador';
  END IF;
END $$;
