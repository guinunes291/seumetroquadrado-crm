-- ===========================================================================
-- Pré-venda (SDR): a passagem do discador para o CRM
-- ===========================================================================
-- Decisões do Guilherme em 10/10/2026, depois de descrever o dia real do SDR:
-- "o SDR fica praticamente o dia inteiro dentro do discador fazendo as bases;
-- no CRM só cria/puxa o lead quando há agendamento ou recolha de
-- documentação". O CRM deixa de ser o lugar onde o SDR trabalha a base e
-- passa a ser o lugar onde ele PASSA o cliente adiante — então tem de ser
-- bom nesse momento e no que acontece depois dele.
--
-- 1. PASSAGEM EM UMA CHAMADA (`sdr_passar_cliente`). Cadastro com dedup
--    (cria na base do SDR ou puxa o existente), a qualificação que vai no
--    WhatsApp do corretor e o agendamento, numa transação só. Campos
--    obrigatórios (decisão "a"): renda, tipo de renda, FGTS, quem decide e
--    restrição no CPF; na visita, também zona, endereço e data. Antes disto
--    o agendamento só exigia data, endereço e zona: a trava de qualidade da
--    política (o "qualificado") ficava num passo que o SDR pula, e nenhuma
--    tela gravava tipo de renda nem quem decide — o corretor recebia
--    "renda: —". Sem corretor apto, nada é gravado (nem o cadastro).
--    Modo "documentação": o mesmo cadastro sem visita; o lead fica na base
--    do SDR e a gestão acompanha com ele até o agendamento (resposta 2).
--
-- 2. RESTRIÇÃO NO CPF (`leads.restricao_cpf`: sim | nao | nao_sabe). Nome
--    negativado barra o financiamento na Caixa; a pergunta é obrigatória na
--    passagem mas NÃO bloqueia o agendamento (o cliente pode limpar o nome).
--
-- 3. CORRETOR DE ORIGEM (decisão "b"): o SDR nunca é bloqueado ao puxar um
--    lead de corretor; mas se o corretor dono teve interação com o cliente
--    nos últimos `sdr_origem_recente_dias` (padrão 7), ele fica gravado em
--    `leads.sdr_corretor_origem_id` e a visita VOLTA para ele quando o SDR
--    agendar — as mesmas guardas da prioridade do corretor original (conta
--    ativa, papel corretor, região do cliente, agenda livre no horário);
--    falhando uma delas, roleta. Vale também para a entrega manual com
--    motivo, que passa pelo mesmo motor. A marca é usada uma vez: numa
--    devolução posterior (no-show, 7 dias parado) o lead segue a régua
--    normal. O SDR não escreve a coluna (guarda de posse).
--
-- 4. CONFIRMAÇÃO COM RESULTADO (`sdr_registrar_confirmacao`): Confirmou (a
--    visita fica "confirmado" e o corretor vê), Pediu para remarcar (novo
--    horário na hora, no nome do mesmo corretor, com D-1/D-0 novos para o
--    SDR e aviso ao corretor) e Não atendeu (o corretor é avisado de que a
--    visita ainda não está confirmada). Antes, o botão "Confirmado" só
--    fechava a tarefa, qualquer que fosse a resposta do cliente.
--
-- 5. PAINEL DO SDR (`sdr_painel`): o que acontece DEPOIS da passagem, que é
--    o que paga (docs/relatorio-semanal-sdr.md): A confirmar → Confirmada →
--    Realizada → Pasta → Venda, na semana da folha (sábado a sexta), mais
--    "Reagendar" (no-show) e "Sem visita marcada". E a roleta só com a
--    CONTAGEM de aptos: o nome de quem está na fila nunca sai do banco para
--    o SDR (roleta_sdr_placar já recorta assim para todo não-admin).
--
-- Rollback: dropar as três funções novas, reaplicar criar_lead_dedup
-- (20260923220000), _distribuir_lead_sdr (20261011120100) e
-- sdr_guarda_posse (20260904101000), e dropar as duas colunas e a chave.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas e chave
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS restricao_cpf text,
  ADD COLUMN IF NOT EXISTS sdr_corretor_origem_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_restricao_cpf_check') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_restricao_cpf_check
      CHECK (restricao_cpf IS NULL OR restricao_cpf IN ('sim', 'nao', 'nao_sabe'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.restricao_cpf IS
  'Restrição no CPF informada pelo cliente na passagem do SDR: sim | nao | nao_sabe. Não bloqueia o agendamento.';
COMMENT ON COLUMN public.leads.sdr_corretor_origem_id IS
  'Corretor que falou com o cliente nos últimos sdr_origem_recente_dias quando o SDR puxou o lead: recebe a visita de volta na entrega (uma vez).';

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('sdr_origem_recente_dias', '7'::jsonb,
   'Dias de interação do corretor com o cliente para o lead que o SDR puxou voltar a esse corretor quando houver agendamento (0 = só interação de hoje).')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Guarda de posse: o SDR também não escreve o corretor de origem
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_guarda_posse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR current_setting('app.sdr_motor', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(_uid, 'sdr'::public.app_role)
     OR public.has_role(_uid, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.sdr_id := _uid;
    NEW.corretor_id := NULL;
    NEW.classe_lead := 'base';
    NEW.sdr_entregue_em := NULL;
    -- Quem recebe a visita é o motor que decide, nunca o SDR.
    NEW.sdr_corretor_origem_id := NULL;
    IF NEW.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
      NEW.status := 'aguardando_atendimento'::public.lead_status;
    END IF;
    NEW.data_distribuicao := COALESCE(NEW.data_distribuicao, now());
    NEW.timestamp_recebimento := COALESCE(NEW.timestamp_recebimento, now());
    RETURN NEW;
  END IF;

  IF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
     OR NEW.sdr_id IS DISTINCT FROM OLD.sdr_id
     OR NEW.sdr_entregue_em IS DISTINCT FROM OLD.sdr_entregue_em
     OR NEW.sdr_corretor_origem_id IS DISTINCT FROM OLD.sdr_corretor_origem_id THEN
    RAISE EXCEPTION 'SDR não altera a posse do lead diretamente — use Agendar visita, Entregar ou Pegar para reaquecer'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

-- ---------------------------------------------------------------------------
-- 3) Cadastro com dedup: marca o corretor de origem ao puxar
--    (cópia de 20260923220000 + o bloco [ORIGEM])
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _nome text := NULLIF(btrim(_payload->>'nome'), '');
  _telefone text := NULLIF(btrim(_payload->>'telefone'), '');
  _email text := NULLIF(lower(btrim(_payload->>'email')), '');
  _origem public.lead_origem;
  _projeto_id uuid := NULLIF(_payload->>'projeto_id', '')::uuid;
  _projeto_nome text := NULLIF(btrim(_payload->>'projeto_nome'), '');
  _observacoes text := NULLIF(btrim(_payload->>'observacoes'), '');
  _corretor_id uuid := NULLIF(_payload->>'corretor_id', '')::uuid;
  _zona text := NULLIF(btrim(_payload->>'zona'), '');
  _bairro text := NULLIF(btrim(_payload->>'bairro'), '');
  _status public.lead_status := COALESCE(NULLIF(_payload->>'status', '')::public.lead_status, 'novo'::public.lead_status);
  _eh_sdr boolean;
  _suf text;
  _dup public.leads%ROWTYPE;
  _novo_id uuid;
  _sdr_pegou boolean := false;
  _bloqueado boolean := false;
  _sdr_id uuid := NULL;
  _corretor_origem uuid := NULL;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR _telefone IS NULL THEN
    RAISE EXCEPTION 'nome e telefone são obrigatórios' USING ERRCODE = '22023';
  END IF;
  _eh_sdr := public.has_role(_uid, 'sdr'::public.app_role)
             AND NOT public.has_role(_uid, 'admin'::public.app_role)
             AND NOT public.has_role(_uid, 'gestor'::public.app_role)
             AND NOT public.has_role(_uid, 'superintendente'::public.app_role);
  IF _eh_sdr THEN
    _corretor_id := NULL;
    _sdr_id := _uid;
    _status := 'aguardando_atendimento'::public.lead_status;
  END IF;
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  _suf := right(public.telefone_digits(COALESCE(public.normalize_phone_smq(_telefone), _telefone)), 9);
  IF length(_suf) >= 8 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _suf));

    SELECT l.* INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND right(public.telefone_digits(COALESCE(l.telefone_e164, l.telefone)), 9) = _suf
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.na_lixeira, l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF _eh_sdr AND _dup.sdr_id IS DISTINCT FROM _uid THEN
        IF _dup.na_lixeira
           OR _dup.status IN ('agendado','visita_realizada','proposta_enviada','analise_credito',
                              'contrato_fechado','pos_venda','perdido')
           OR public._lead_venda_viva(_dup.id) THEN
          _bloqueado := true;
        ELSE
          -- [ORIGEM] (decisão de 10/10/2026) Nunca bloqueia: o SDR puxa. Mas
          -- se o corretor dono falou com o cliente nos últimos
          -- sdr_origem_recente_dias (padrão 7), ele fica marcado como corretor
          -- de origem e recebe a visita de volta quando o SDR agendar
          -- (_distribuir_lead_sdr). Conta contato de verdade (ligação,
          -- WhatsApp, e-mail, SMS, visita, reunião) feito por ele neste lead.
          IF _dup.corretor_id IS NOT NULL
             AND public.has_role(_dup.corretor_id, 'corretor'::public.app_role)
             AND EXISTS (
               SELECT 1 FROM public.interacoes i
               WHERE i.lead_id = _dup.id
                 AND i.autor_id = _dup.corretor_id
                 AND i.deleted_at IS NULL
                 AND i.tipo IN ('ligacao'::public.interacao_tipo, 'whatsapp'::public.interacao_tipo,
                                'email'::public.interacao_tipo, 'sms'::public.interacao_tipo,
                                'visita'::public.interacao_tipo, 'reuniao'::public.interacao_tipo)
                 AND i.ocorreu_em >= now() - make_interval(
                       days => GREATEST(public._sdr_setting_int('sdr_origem_recente_dias', 7), 0))
             ) THEN
            _corretor_origem := _dup.corretor_id;
          END IF;
          PERFORM set_config('app.sdr_motor', 'on', true);
          UPDATE public.leads
             SET sdr_id = _uid,
                 -- Puxado de outro SDR (sem corretor): a origem que já havia segue valendo.
                 sdr_corretor_origem_id = COALESCE(_corretor_origem,
                   CASE WHEN _dup.corretor_id IS NULL THEN sdr_corretor_origem_id END),
                 corretor_anterior_id = COALESCE(_dup.corretor_id, corretor_anterior_id),
                 corretor_id = NULL,
                 sdr_entregue_em = NULL,
                 sdr_devolvido_em = NULL,
                 sdr_interesse_confirmado = false
           WHERE id = _dup.id;
          IF _dup.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status)
             AND public.transicao_lead_permitida(_dup.status, 'aguardando_atendimento'::public.lead_status, false) THEN
            BEGIN
              PERFORM public.transicionar_lead(_dup.id, 'aguardando_atendimento'::public.lead_status,
                'Cadastro pelo SDR: lead já existia no CRM', 'Fazer o primeiro contato');
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          PERFORM public._sdr_log_base(_dup.id, _uid,
            'SDR puxou lead existente pelo cadastro (' || _dup.status::text || ')',
            'sdr_puxou', 'criacao_manual',
            jsonb_build_object('corretor_anterior', _dup.corretor_id, 'sdr_anterior', _dup.sdr_id,
                               'corretor_origem', _corretor_origem));
          _sdr_pegou := true;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
        'nome', CASE WHEN _sdr_pegou OR _bloqueado OR public.pode_acessar_lead(_uid, _dup.id) THEN _dup.nome ELSE NULL END,
        'na_carteira', _sdr_pegou OR (_eh_sdr AND _dup.sdr_id = _uid) OR public.pode_acessar_lead(_uid, _dup.id),
        'sdr_pegou', _sdr_pegou,
        'bloqueado_etapa', _bloqueado,
        'status', CASE WHEN _bloqueado THEN _dup.status::text ELSE NULL END,
        'corretor_origem_id', _corretor_origem
      );
    END IF;
  END IF;

  IF _sdr_id IS NOT NULL THEN
    PERFORM set_config('app.sdr_motor', 'on', true);
  END IF;
  INSERT INTO public.leads (
    nome, telefone, email, origem, projeto_id, projeto_nome, observacoes,
    corretor_id, sdr_id, status, zona, bairro
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _sdr_id, _status, _zona, _bairro
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Motor de entrega: o corretor de origem tem prioridade na entrega
--    (cópia de 20261011120100 + o bloco [ORIGEM])
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_sdr(_lead_id uuid, _motivo text, _inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, _fim timestamp with time zone DEFAULT NULL::timestamp with time zone, _gatilho text DEFAULT 'sdr'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _slug text := 'agendados-sdr';
  _roleta public.roletas%ROWTYPE;
  _vencedor uuid;
  _vencedor_nome text;
  _regra text;
  _tipo public.distribuicao_tipo := 'automatica'::public.distribuicao_tipo;
  _aptos jsonb;
  _inaptos jsonb;
  _aptos_ids uuid[];
  _n_ativos int := 0;
  _log_id uuid;
  _ctx jsonb;
  _sdr_nome text;
  _prioridade_recusa text;
  _motivo_excecao text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zona text;
  _zslug text;
  _zroleta public.roletas%ROWTYPE;
  _slug_usado text;
  -- [PESO]
  _ponderado boolean := false;
  -- [ORIGEM]
  _origem uuid;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  END IF;
  IF _lead.sdr_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_sdr');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _lead.sdr_id;
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _slug;
  _slug_usado := _slug;

  IF _estrita THEN
    _zona := public.zona_do_lead(_lead_id);
    IF _zona IS NOT NULL THEN
      SELECT zr.roleta_slug INTO _zslug FROM public.zonas_roletas zr WHERE zr.zona = _zona;
    END IF;
  END IF;

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  --    Só vale para quem HOJE tem o papel corretor: quem virou SDR vindo de
  --    corretor continua sendo corretor_id da carteira antiga e, sem esta
  --    guarda, o motor "entregaria" o lead de volta para o próprio SDR.
  --    [ORIGEM] (10/10/2026) Lead que o SDR PUXOU de um corretor que tinha
  --    falado com o cliente nos últimos dias (sdr_corretor_origem_id, gravado
  --    por criar_lead_dedup) volta para esse corretor na entrega, com as
  --    mesmas guardas — conta ativa, papel corretor, região e agenda livre.
  _origem := COALESCE(_lead.corretor_id, _lead.sdr_corretor_origem_id);
  IF _origem IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _origem AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_origem, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF _estrita AND NOT public.corretor_atende_zona(_origem, _zona) THEN
      -- [ZONA] O dono antigo é de outra região: a visita vai para a zona.
      _prioridade_recusa := 'fora_da_regiao';
    ELSIF public._sdr_agenda_conflita(_origem, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _origem;
      _regra := CASE WHEN _lead.corretor_id IS NOT NULL THEN 'sdr_prioridade_corretor_original'
                     ELSE 'sdr_retorno_corretor_origem' END;
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  IF _vencedor IS NULL THEN
    IF _roleta.id IS NULL OR NOT _roleta.ativo THEN
      _motivo_excecao := 'sem_corretor_ativo';
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('roleta_sdr:' || _slug));

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome)) FILTER (WHERE e.apto), '[]'::jsonb),
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome, 'motivos', e.motivos)) FILTER (WHERE NOT e.apto), '[]'::jsonb),
        array_agg(e.corretor_id) FILTER (WHERE e.apto),
        count(*)::int
      INTO _aptos, _inaptos, _aptos_ids, _n_ativos
      FROM public._elegibilidade_roleta_sdr(_slug, _inicio, _fim) e;

      -- [ZONA] Só quem atende a zona do lead.
      IF _estrita AND _zona IS NOT NULL THEN
        _aptos_ids := ARRAY(SELECT x FROM unnest(COALESCE(_aptos_ids, ARRAY[]::uuid[])) x
                             WHERE public.corretor_atende_zona(x, _zona));
      END IF;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      -- [PESO] Regra semanal valendo: rodízio PONDERADO (meta = peso cheio;
      -- exceção por 1 venda e complemento = peso menor). Fora dela, o rodízio
      -- de sempre: quem está há mais tempo sem receber.
      _ponderado := public._roleta_sdr_ponderado();
      IF _ponderado THEN
        _vencedor := public._roleta_sdr_escolher_ponderado(
          _roleta.id, COALESCE(_aptos_ids, ARRAY[]::uuid[]));
      ELSE
        SELECT rp.corretor_id INTO _vencedor
        FROM public.roleta_participantes rp
        WHERE rp.roleta_id = _roleta.id
          AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
        ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
        LIMIT 1
        FOR UPDATE OF rp SKIP LOCKED;
      END IF;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
    END IF;
  END IF;

  -- 3) [ZONA] Ninguém dos agendados atende a zona: time da zona, mesma régua
  --    de agenda (presença, teto do SDR, conflito no horário da visita).
  IF _vencedor IS NULL AND _estrita AND _zslug IS NOT NULL THEN
    SELECT * INTO _zroleta FROM public.roletas WHERE slug = _zslug AND ativo;
    IF FOUND THEN
      SELECT array_agg(e.corretor_id) FILTER (WHERE e.apto)
        INTO _aptos_ids
      FROM public._elegibilidade_roleta_sdr(_zslug, _inicio, _fim) e;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      SELECT rp.corretor_id INTO _vencedor
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _zroleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      IF _vencedor IS NOT NULL THEN
        _regra := 'roleta_sdr_zona';
        _slug_usado := _zslug;
        _roleta := _zroleta;
        _motivo_excecao := NULL;
      END IF;
    END IF;
    IF _vencedor IS NULL THEN
      _motivo_excecao := 'sem_corretor_na_zona';
    END IF;
  END IF;

  _ctx := jsonb_strip_nulls(jsonb_build_object(
    'modelo', 'sdr',
    'gatilho', _gatilho,
    'sdr_id', _lead.sdr_id,
    'sdr_nome', _sdr_nome,
    'regra', _regra,
    'aptos', COALESCE(_aptos, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos, '[]'::jsonb),
    'prioridade_recusa', _prioridade_recusa,
    'corretor_origem', _lead.sdr_corretor_origem_id,
    'inicio', _inicio,
    'fim', _fim,
    'zona', _zona,
    'zona_estrita', _estrita,
    'roleta_usada', _slug_usado,
    'rodizio_ponderado', _ponderado
  ));

  IF _vencedor IS NULL THEN
    PERFORM public._registrar_excecao_distribuicao(
      _lead_id, _motivo_excecao,
      CASE WHEN _motivo_excecao = 'sem_corretor_na_zona'
           THEN 'Visita do SDR sem corretor da ' || public._rotulo_zona(_zona) || ' livre ('
                || COALESCE(_motivo, _gatilho) || ') — o lead espera o time da zona'
           ELSE 'Roleta de agendados do SDR sem corretor apto (' || COALESCE(_motivo, _gatilho) || ')' END,
      _slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
    VALUES
      (_lead_id, NULL, 'automatica'::public.distribuicao_tipo, _motivo, _slug, 'roleta_sdr', 'sem_corretor', _uid)
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', _motivo_excecao,
                              'aptos', COALESCE(_aptos, '[]'::jsonb),
                              'inaptos', COALESCE(_inaptos, '[]'::jsonb));
  END IF;

  SELECT p.nome INTO _vencedor_nome FROM public.profiles p WHERE p.id = _vencedor;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = CASE WHEN corretor_id IS DISTINCT FROM _vencedor THEN corretor_id ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         sdr_entregue_em = now(),
         sdr_devolvido_em = NULL,
         -- [ORIGEM] Usada uma vez: numa devolução (no-show, 7 dias parado) o
         -- próximo agendamento segue a régua normal.
         sdr_corretor_origem_id = NULL,
         roleta_slug = CASE WHEN _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN _slug_usado ELSE roleta_slug END,
         via_webhook = false,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor)
         END
   WHERE id = _lead_id;

  IF _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN
    UPDATE public.roleta_participantes
       SET ultimo_lead_em = now(), updated_at = now()
     WHERE roleta_id = _roleta.id AND corretor_id = _vencedor;
  END IF;
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _vencedor, _tipo, _motivo, _slug_usado, _regra, 'sucesso', _uid)
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object('vencedor', _vencedor, 'vencedor_nome', _vencedor_nome));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(), resolvida_por = _uid,
         resolucao = 'Entregue pelo SDR a ' || COALESCE(_vencedor_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente', 'em_analise');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_entrega',
    'Entregue pelo SDR ' || COALESCE(_sdr_nome, '') || ' ao corretor ' || COALESCE(_vencedor_nome, '') || ' (' || COALESCE(_motivo, _gatilho) || ').',
    'sdr_motor',
    jsonb_build_object('sdr_id', _lead.sdr_id, 'corretor_id', _vencedor, 'regra', _regra,
                       'motivo', _motivo, 'gatilho', _gatilho)
  );

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
    'Lead entregue pelo SDR',
    'SDR ' || COALESCE(_sdr_nome, '') || ' → corretor ' || COALESCE(_vencedor_nome, '') || ': ' || COALESCE(_motivo, _gatilho),
    jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_entrega', 'regra', _regra,
                       'sdr_id', _lead.sdr_id, 'corretor_id', _vencedor)
  );

  -- Push: o trigger de leads só dispara quando corretor_id MUDA; no caminho de
  -- prioridade (mesmo dono) avisamos explicitamente.
  IF _lead.corretor_id IS NOT DISTINCT FROM _vencedor THEN
    PERFORM public.enqueue_push(
      _vencedor, 'Lead do SDR para você',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_motivo, _gatilho),
      '/leads/' || _lead_id::text, 'sdr-' || _lead_id::text);
  END IF;

  -- Marcão (n8n copiloto/handoff) NÃO roda na entrega do SDR: o aviso é o
  -- WhatsApp do SDR (_sdr_notificar_corretor), disparado depois que a visita
  -- existe — um único WhatsApp por entrega.

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _vencedor, 'corretor_nome', _vencedor_nome,
    'regra', _regra, 'roleta', _slug_usado);
END; $function$;

-- ---------------------------------------------------------------------------
-- 5) Passagem do discador: cadastro + qualificação + visita numa transação
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_passar_cliente(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _modo text := COALESCE(NULLIF(btrim(_payload->>'modo'), ''), 'visita');
  _nome text := NULLIF(btrim(_payload->>'nome'), '');
  _telefone text := NULLIF(btrim(_payload->>'telefone'), '');
  _renda text := NULLIF(btrim(_payload->>'renda'), '');
  _tipo_renda text := NULLIF(btrim(_payload->>'tipo_renda'), '');
  _fgts text := NULLIF(btrim(_payload->>'fgts'), '');
  _decisor text := NULLIF(btrim(_payload->>'decisor'), '');
  _restricao text := NULLIF(btrim(_payload->>'restricao_cpf'), '');
  _resumo text := NULLIF(btrim(_payload->>'resumo'), '');
  _zona text := NULLIF(btrim(_payload->>'zona'), '');
  _local text := NULLIF(btrim(_payload->>'local'), '');
  _inicio timestamptz;
  _faltam text[] := ARRAY[]::text[];
  _dedup jsonb;
  _lead_id uuid;
  _lead public.leads%ROWTYPE;
  _origem uuid;
  _renda_num numeric;
  _res jsonb := '{}'::jsonb;
BEGIN
  IF NOT public._sdr_ativo() THEN
    RAISE EXCEPTION 'modelo SDR desligado (distribuicao_settings.sdr_ativo)' USING ERRCODE = '42501';
  END IF;
  IF _uid IS NULL OR NOT public.is_active_member(_uid)
     OR NOT public.has_role(_uid, 'sdr'::public.app_role)
     OR public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'gestor'::public.app_role)
     OR public.has_role(_uid, 'superintendente'::public.app_role) THEN
    RAISE EXCEPTION 'só o SDR passa cliente do discador' USING ERRCODE = '42501';
  END IF;
  IF _modo NOT IN ('visita', 'documentacao') THEN
    RAISE EXCEPTION 'modo inválido: use visita ou documentacao' USING ERRCODE = '22023';
  END IF;
  BEGIN
    _inicio := NULLIF(btrim(_payload->>'inicio'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'data e hora da visita inválidas' USING ERRCODE = '22023';
  END;

  -- O mínimo que o corretor precisa para atender (decisão "a", 10/10/2026).
  IF _nome IS NULL THEN _faltam := _faltam || 'nome'::text; END IF;
  IF _telefone IS NULL THEN _faltam := _faltam || 'telefone'::text; END IF;
  IF _renda IS NULL THEN _faltam := _faltam || 'renda'::text; END IF;
  IF _tipo_renda IS NULL THEN _faltam := _faltam || 'tipo de renda'::text; END IF;
  IF _fgts IS NULL THEN _faltam := _faltam || 'FGTS'::text; END IF;
  IF _decisor IS NULL THEN _faltam := _faltam || 'quem decide'::text; END IF;
  IF _restricao IS NULL THEN _faltam := _faltam || 'restrição no CPF'::text; END IF;
  IF _modo = 'visita' THEN
    IF _zona IS NULL THEN _faltam := _faltam || 'zona'::text; END IF;
    IF _local IS NULL THEN _faltam := _faltam || 'endereço da visita'::text; END IF;
    IF _inicio IS NULL THEN _faltam := _faltam || 'data e hora'::text; END IF;
  END IF;
  IF cardinality(_faltam) > 0 THEN
    RAISE EXCEPTION 'Para passar o cliente falta: %.', array_to_string(_faltam, ', ')
      USING ERRCODE = 'SMQP1',
            DETAIL = jsonb_build_object('campos', to_jsonb(_faltam))::text;
  END IF;
  IF _fgts NOT IN ('sim', 'nao') THEN
    RAISE EXCEPTION 'FGTS: responda sim ou não' USING ERRCODE = '22023';
  END IF;
  IF _restricao NOT IN ('sim', 'nao', 'nao_sabe') THEN
    RAISE EXCEPTION 'restrição no CPF: responda sim, não ou não sabe' USING ERRCODE = '22023';
  END IF;

  -- 1) Cliente que já está na base (aberto da ficha ou do painel): o próprio
  --    registro, sem procurar pelo telefone. Senão, o cadastro de sempre: cria
  --    na base do SDR ou puxa o existente (e marca o corretor de origem quando
  --    ele falou com o cliente há pouco).
  BEGIN
    _lead_id := NULLIF(btrim(_payload->>'lead_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'cliente inválido' USING ERRCODE = '22023';
  END;
  IF _lead_id IS NOT NULL THEN
    _dedup := jsonb_build_object('duplicado', true, 'sdr_pegou', false, 'lead_id', _lead_id);
  ELSE
    _dedup := public.criar_lead_dedup(jsonb_build_object(
      'nome', _nome, 'telefone', _telefone,
      'origem', COALESCE(NULLIF(btrim(_payload->>'origem'), ''), 'outro')));
    IF COALESCE((_dedup->>'bloqueado_etapa')::boolean, false) THEN
      RAISE EXCEPTION 'Este cliente já está com um corretor em %: quem move é a gestão.',
        replace(COALESCE(_dedup->>'status', 'andamento'), '_', ' ')
        USING ERRCODE = 'SMQP2';
    END IF;
    _lead_id := (_dedup->>'lead_id')::uuid;
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _lead.sdr_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'cliente fora da sua base' USING ERRCODE = '42501';
  END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este cliente já foi passado a um corretor: a remarcação é feita pela visita no seu painel.'
      USING ERRCODE = 'SMQP3';
  END IF;
  _origem := _lead.sdr_corretor_origem_id;

  -- 2) Qualificação: o que vai no WhatsApp do corretor e no briefing da visita.
  BEGIN
    _renda_num := NULLIF(replace(regexp_replace(_renda, '[^0-9,]', '', 'g'), ',', '.'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    _renda_num := NULL;
  END;
  UPDATE public.leads
     SET renda_informada = _renda,
         renda_estimada = CASE WHEN _renda_num >= 100 THEN _renda_num ELSE renda_estimada END,
         tipo_renda = _tipo_renda,
         tem_fgts = (_fgts = 'sim'),
         usa_fgts = (_fgts = 'sim'),
         decisor = _decisor,
         restricao_cpf = _restricao,
         resumo_qualificacao = COALESCE(_resumo, resumo_qualificacao),
         sdr_interesse_confirmado = true
   WHERE id = _lead_id;

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, _uid, 'ligacao'::public.interacao_tipo, 'saida'::public.interacao_direcao,
    CASE WHEN _modo = 'visita' THEN 'Passagem do discador: visita' ELSE 'Passagem do discador: documentação' END,
    COALESCE(_resumo, 'Cliente passado pelo SDR a partir do discador.'),
    jsonb_build_object('fonte', 'discador', 'evento', 'sdr_passagem', 'modo', _modo,
                       'restricao_cpf', _restricao, 'puxado', COALESCE((_dedup->>'sdr_pegou')::boolean, false))
  );

  -- 3) Visita: o agendamento de sempre (roleta antes; corretor de origem com
  --    prioridade; D-1/D-0 com o SDR; WhatsApp ao corretor). Sem corretor
  --    apto ele levanta erro e NADA desta passagem fica gravado.
  IF _modo = 'visita' THEN
    _res := public.agendar_visita_sdr(_lead_id, _inicio, NULL, NULL, _local, _resumo, NULL, _zona);
  ELSE
    -- Documentação: fica na base do SDR; a gestão acompanha até o agendamento.
    IF _zona IS NOT NULL AND public.zona_canonica(_zona) IS NOT NULL THEN
      UPDATE public.leads SET zona = public.zona_canonica(_zona)
       WHERE id = _lead_id AND zona IS DISTINCT FROM public.zona_canonica(_zona);
    END IF;
    IF _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                        'aguardando_atendimento'::public.lead_status) THEN
      PERFORM public.transicionar_lead(_lead_id, 'em_atendimento'::public.lead_status,
        'Cliente passado pelo SDR para documentação', 'Recolher a documentação e agendar a visita');
    END IF;
  END IF;

  RETURN _res || jsonb_build_object(
    'ok', true,
    'modo', _modo,
    'lead_id', _lead_id,
    'novo', NOT COALESCE((_dedup->>'duplicado')::boolean, false),
    'puxado', COALESCE((_dedup->>'sdr_pegou')::boolean, false),
    'corretor_origem_id', _origem);
END; $function$;

COMMENT ON FUNCTION public.sdr_passar_cliente(jsonb) IS
  'Passagem do discador (SDR): cadastro com dedup + qualificação obrigatória + visita (ou documentação), numa transação. Decisões de 10/10/2026.';
REVOKE ALL ON FUNCTION public.sdr_passar_cliente(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_passar_cliente(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Confirmação D-1/D-0 com resultado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_registrar_confirmacao(
  _agendamento_id uuid,
  _resultado text,
  _novo_inicio timestamptz DEFAULT NULL,
  _nota text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ag public.agendamentos%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _fim_hoje timestamptz :=
    (((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _nota_limpa text := NULLIF(btrim(_nota), '');
  _rotulo text;
  _quando text;
  _quando_novo text;
  _dur interval;
  _novo_fim timestamptz;
  _novo_id uuid;
  _fechadas int := 0;
  _d1 timestamptz;
  _d0 timestamptz;
  _alerta_titulo text;
  _alerta_msg text;
BEGIN
  IF NOT public._sdr_ativo() THEN
    RAISE EXCEPTION 'modelo SDR desligado (distribuicao_settings.sdr_ativo)' USING ERRCODE = '42501';
  END IF;
  IF _resultado IS NULL OR _resultado NOT IN ('confirmou', 'remarcar', 'nao_atendeu') THEN
    RAISE EXCEPTION 'resultado inválido: confirmou, remarcar ou nao_atendeu' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _ag FROM public.agendamentos WHERE id = _agendamento_id FOR UPDATE;
  IF NOT FOUND OR _ag.deleted_at IS NOT NULL OR _ag.tipo <> 'visita'::public.agendamento_tipo
     OR _ag.lead_id IS NULL THEN
    RAISE EXCEPTION 'visita não encontrada' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO _lead FROM public.leads WHERE id = _ag.lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'visita não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _uid IS NULL OR NOT public.is_active_member(_uid)
     OR (_lead.sdr_id IS DISTINCT FROM _uid AND NOT public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'só o SDR do cliente registra a confirmação' USING ERRCODE = '42501';
  END IF;
  IF _ag.status NOT IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status) THEN
    RAISE EXCEPTION 'esta visita está %: não há o que confirmar', _ag.status USING ERRCODE = '22023';
  END IF;
  IF _ag.data_inicio <= now() THEN
    RAISE EXCEPTION 'a visita já começou: o desfecho é do corretor' USING ERRCODE = '22023';
  END IF;

  _quando := to_char(_ag.data_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  _rotulo := CASE _resultado
    WHEN 'confirmou' THEN 'Confirmou'
    WHEN 'remarcar' THEN 'Pediu para remarcar'
    ELSE 'Não atendeu' END;

  IF _resultado = 'remarcar' THEN
    IF _novo_inicio IS NULL OR _novo_inicio <= now() THEN
      RAISE EXCEPTION 'escolha o novo dia e horário (no futuro)' USING ERRCODE = '22023';
    END IF;
    _dur := GREATEST(_ag.data_fim - _ag.data_inicio, interval '30 minutes');
    _novo_fim := _novo_inicio + _dur;
    -- Mesma régua de agenda da roleta, sem contar a própria visita.
    IF EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.corretor_id = _ag.corretor_id
        AND a.id <> _ag.id
        AND a.deleted_at IS NULL
        AND a.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                         'remarcado'::public.agendamento_status)
        AND a.data_inicio < _novo_fim
        AND a.data_fim > _novo_inicio
    ) THEN
      RAISE EXCEPTION 'o corretor já tem compromisso nesse horário: escolha outro' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Tarefas de confirmação do SDR. Remarcar fecha todas (nascem novas para o
  -- horário novo); nos outros casos, as que vencem até hoje — e, se o SDR
  -- confirmou adiantado, a mais próxima.
  UPDATE public.tarefas t
     SET status = 'concluida'::public.tarefa_status,
         data_conclusao = now(),
         resultado = _rotulo || COALESCE(' · ' || _nota_limpa, '')
   WHERE t.lead_id = _ag.lead_id
     AND t.corretor_id = _lead.sdr_id
     AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
     AND t.deleted_at IS NULL
     AND t.titulo LIKE 'Confirmar visita de %'
     AND (_resultado = 'remarcar' OR t.data_vencimento IS NULL OR t.data_vencimento < _fim_hoje);
  GET DIAGNOSTICS _fechadas = ROW_COUNT;
  IF _fechadas = 0 AND _resultado <> 'remarcar' THEN
    UPDATE public.tarefas
       SET status = 'concluida'::public.tarefa_status,
           data_conclusao = now(),
           resultado = _rotulo || COALESCE(' · ' || _nota_limpa, '')
     WHERE id = (
       SELECT t.id FROM public.tarefas t
       WHERE t.lead_id = _ag.lead_id
         AND t.corretor_id = _lead.sdr_id
         AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
         AND t.deleted_at IS NULL
         AND t.titulo LIKE 'Confirmar visita de %'
       ORDER BY t.data_vencimento NULLS LAST
       LIMIT 1);
  END IF;

  IF _resultado = 'confirmou' THEN
    UPDATE public.agendamentos SET status = 'confirmado'::public.agendamento_status
     WHERE id = _ag.id AND status = 'agendado'::public.agendamento_status;

  ELSIF _resultado = 'remarcar' THEN
    INSERT INTO public.agendamentos
      (lead_id, corretor_id, criado_por_id, tipo, status, titulo, descricao, local,
       data_inicio, data_fim, timezone, lembrete_minutos)
    VALUES
      (_ag.lead_id, _ag.corretor_id, _uid, _ag.tipo, 'agendado'::public.agendamento_status,
       _ag.titulo, _ag.descricao, _ag.local, _novo_inicio, _novo_fim, _ag.timezone, _ag.lembrete_minutos)
    RETURNING id INTO _novo_id;
    UPDATE public.agendamentos SET status = 'remarcado'::public.agendamento_status WHERE id = _ag.id;

    -- Confirmações do horário novo, com o SDR (a mesma régua do agendamento).
    _d1 := GREATEST(_novo_inicio - interval '1 day', now() + interval '1 hour');
    _d0 := GREATEST(_novo_inicio - interval '3 hours', now() + interval '30 minutes');
    IF _d1 < _novo_inicio THEN
      INSERT INTO public.tarefas
        (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
      VALUES
        (_lead.sdr_id, _ag.lead_id, 'Confirmar visita de ' || _lead.nome || ' (D-1)',
         'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
         _d1, true, _uid);
    END IF;
    IF _d0 < _novo_inicio AND _d0 > _d1 THEN
      INSERT INTO public.tarefas
        (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
      VALUES
        (_lead.sdr_id, _ag.lead_id, 'Confirmar visita de ' || _lead.nome || ' hoje (D-0)',
         'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
         _d0, true, _uid);
    END IF;
    _quando_novo := to_char(_novo_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  END IF;

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _ag.lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
    CASE _resultado
      WHEN 'confirmou' THEN 'Visita confirmada pelo SDR'
      WHEN 'remarcar' THEN 'Visita remarcada pelo SDR'
      ELSE 'Confirmação da visita: cliente não atendeu' END,
    CASE _resultado
      WHEN 'remarcar' THEN 'De ' || _quando || ' para ' || _quando_novo || '.'
      ELSE 'Visita de ' || _quando || '.' END || COALESCE(' ' || _nota_limpa, ''),
    jsonb_strip_nulls(jsonb_build_object(
      'fonte', 'sdr', 'evento', 'sdr_confirmacao', 'resultado', _resultado,
      'agendamento_id', _ag.id, 'novo_agendamento_id', _novo_id))
  );

  -- O corretor fica sabendo do que muda o dia dele (o "confirmou" ele vê no
  -- status da visita).
  IF _resultado <> 'confirmou' THEN
    _alerta_titulo := CASE _resultado WHEN 'remarcar' THEN 'Visita remarcada' ELSE 'Visita ainda não confirmada' END;
    _alerta_msg := CASE _resultado
      WHEN 'remarcar' THEN COALESCE(_lead.nome, 'Cliente') || ': visita de ' || _quando || ' remarcada pelo SDR para ' || _quando_novo || '.'
      ELSE COALESCE(_lead.nome, 'Cliente') || ' não atendeu a confirmação do SDR (visita de ' || _quando || ').' END;
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (_ag.corretor_id, 'agendamento_proximo'::public.alerta_tipo, _alerta_titulo, _alerta_msg,
            '/leads/' || _ag.lead_id::text, COALESCE(_novo_id, _ag.id));
    PERFORM public.enqueue_push(_ag.corretor_id, _alerta_titulo, _alerta_msg,
                                '/leads/' || _ag.lead_id::text, 'sdr-confirmacao-' || _ag.id::text);
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true, 'resultado', _resultado, 'agendamento_id', COALESCE(_novo_id, _ag.id),
    'data_inicio', COALESCE(_novo_inicio, _ag.data_inicio), 'tarefas_fechadas', _fechadas));
END; $function$;

COMMENT ON FUNCTION public.sdr_registrar_confirmacao(uuid, text, timestamptz, text) IS
  'Confirmação D-1/D-0 do SDR com resultado: confirmou | remarcar (com o novo horário) | nao_atendeu. Avisa o corretor do que muda o dia dele.';
REVOKE ALL ON FUNCTION public.sdr_registrar_confirmacao(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_registrar_confirmacao(uuid, text, timestamptz, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Painel do SDR: o que acontece depois da passagem + a roleta em número
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_painel(_sdr uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _alvo uuid := COALESCE(_sdr, auth.uid());
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _sab date;
  _ini timestamptz;
  _fim timestamptz;
  _out jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(_uid, 'sdr'::public.app_role) OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'painel da pré-venda: só SDR e admin' USING ERRCODE = '42501';
  END IF;
  IF _alvo <> _uid AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'só o admin vê o painel de outro SDR' USING ERRCODE = '42501';
  END IF;

  -- A semana da folha do SDR: sábado 00:00 a sexta 23:59 (São Paulo).
  _sab := public._roleta_sdr_semana_de(_hoje);
  _ini := (_sab::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim := ((_sab + 7)::timestamp) AT TIME ZONE 'America/Sao_Paulo';

  WITH v AS (
    SELECT a.id AS agendamento_id, a.lead_id, l.nome, l.telefone, a.data_inicio, a.local,
           a.status::text AS status, p.nome AS corretor_nome, l.status::text AS lead_status
      FROM public.agendamentos a
      JOIN public.leads l ON l.id = a.lead_id
      LEFT JOIN public.profiles p ON p.id = a.corretor_id
     WHERE l.sdr_id = _alvo
       AND l.deleted_at IS NULL
       AND NOT l.na_lixeira
       AND a.tipo = 'visita'::public.agendamento_tipo
       AND a.deleted_at IS NULL
       AND NOT a.auto_gerado
  ),
  futura AS (
    SELECT DISTINCT lead_id FROM v
     WHERE status IN ('agendado', 'confirmado') AND data_inicio > now()
  )
  SELECT jsonb_build_object(
    'semana', jsonb_build_object('de', _sab, 'ate', _sab + 6),
    'a_confirmar', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'lead_status' ORDER BY x.data_inicio)
        FROM (SELECT * FROM v WHERE status = 'agendado' AND data_inicio > now()
              ORDER BY data_inicio LIMIT 100) x), '[]'::jsonb),
    'confirmada', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'lead_status' ORDER BY x.data_inicio)
        FROM (SELECT * FROM v WHERE status = 'confirmado' AND data_inicio > now()
              ORDER BY data_inicio LIMIT 100) x), '[]'::jsonb),
    'realizada', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'lead_status' ORDER BY x.data_inicio DESC)
        FROM (SELECT DISTINCT ON (lead_id) * FROM v
               WHERE status = 'realizado' AND data_inicio >= _ini AND data_inicio < _fim
               ORDER BY lead_id, data_inicio DESC) x), '[]'::jsonb),
    'pasta', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.em DESC)
        FROM (SELECT DISTINCT ON (t.lead_id) t.lead_id, l.nome, t.created_at AS em, p.nome AS corretor_nome
                FROM public.lead_status_transitions t
                JOIN public.leads l ON l.id = t.lead_id
                LEFT JOIN public.profiles p ON p.id = l.corretor_id
               WHERE l.sdr_id = _alvo AND l.deleted_at IS NULL
                 AND t.para_status = 'analise_credito'::public.lead_status
                 AND t.created_at >= _ini AND t.created_at < _fim
               ORDER BY t.lead_id, t.created_at DESC) x), '[]'::jsonb),
    'venda', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.em DESC)
        FROM (SELECT vd.lead_id, l.nome, vd.data_assinatura AS em, p.nome AS corretor_nome
                FROM public.vendas vd
                JOIN public.leads l ON l.id = vd.lead_id
                LEFT JOIN public.profiles p ON p.id = l.corretor_id
               WHERE l.sdr_id = _alvo
                 AND vd.status_venda IN ('pendente', 'aprovada')
                 AND NOT COALESCE(vd.distrato, false)
                 AND vd.data_assinatura >= _sab AND vd.data_assinatura <= _sab + 6) x), '[]'::jsonb),
    'reagendar', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'lead_status' ORDER BY x.data_inicio DESC)
        FROM (SELECT DISTINCT ON (v.lead_id) v.* FROM v
               WHERE v.status = 'nao_compareceu'
                 AND v.data_inicio >= now() - interval '14 days'
                 AND v.lead_status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
                 AND v.lead_id NOT IN (SELECT lead_id FROM futura)
               ORDER BY v.lead_id, v.data_inicio DESC) x), '[]'::jsonb),
    'sem_visita', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ordem, x.ultima_atividade_em DESC NULLS LAST)
        FROM (SELECT l.id AS lead_id, l.nome, l.telefone, l.status::text AS status, l.ultima_atividade_em,
                     CASE WHEN l.status = 'analise_credito'::public.lead_status THEN 0 ELSE 1 END AS ordem
                FROM public.leads l
               WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NULL
                 AND l.deleted_at IS NULL AND NOT l.na_lixeira
                 AND l.status IN ('em_atendimento', 'aguardando_retorno', 'qualificado',
                                  'analise_credito', 'proposta_enviada')
                 AND l.id NOT IN (SELECT lead_id FROM futura)
               ORDER BY ordem, l.ultima_atividade_em DESC NULLS LAST
               LIMIT 50) x), '[]'::jsonb),
    -- O último cliente passado: o cartão "lead entregue" (o corretor recebe o
    -- lead pronto — renda, tipo de renda, FGTS, CPF e a visita).
    'ultima_entrega', (
      SELECT to_jsonb(x)
        FROM (SELECT l.id AS lead_id, l.nome, p.nome AS corretor_nome, l.renda_informada, l.tipo_renda,
                     l.usa_fgts, l.restricao_cpf, l.sdr_entregue_em,
                     (SELECT min(a.data_inicio) FROM public.agendamentos a
                       WHERE a.lead_id = l.id AND a.tipo = 'visita'::public.agendamento_tipo
                         AND a.deleted_at IS NULL AND a.data_inicio > now()
                         AND a.status IN ('agendado'::public.agendamento_status,
                                          'confirmado'::public.agendamento_status)) AS proxima_visita,
                     (SELECT dl.regra_aplicada FROM public.distribution_log dl
                       WHERE dl.lead_id = l.id AND dl.resultado = 'sucesso'
                         AND dl.regra_aplicada IN ('roleta_sdr', 'roleta_sdr_zona',
                                                   'sdr_prioridade_corretor_original',
                                                   'sdr_retorno_corretor_origem')
                       ORDER BY dl.created_at DESC LIMIT 1) AS regra
                FROM public.leads l
                LEFT JOIN public.profiles p ON p.id = l.corretor_id
               WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NOT NULL
                 AND l.deleted_at IS NULL AND NOT l.na_lixeira
               ORDER BY l.sdr_entregue_em DESC
               LIMIT 1) x),
    'base_total', (SELECT count(*) FROM public.leads l
                    WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NULL
                      AND l.deleted_at IS NULL AND NOT l.na_lixeira
                      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')),
    -- Só a CONTAGEM: quem está na fila e quem é o próximo não saem do banco
    -- para o SDR (a vez depende da agenda no horário e de quem já tentou).
    'roleta', jsonb_build_object(
      'aptos', (SELECT count(*) FILTER (WHERE e.apto)
                  FROM public._elegibilidade_roleta_sdr('agendados-sdr', NULL, NULL) e),
      'regra_semanal', COALESCE((public.get_dist_setting('roleta_sdr_regra_ativa') #>> '{}')::boolean, false),
      'sombra', COALESCE((public.get_dist_setting('roleta_sdr_modo_sombra') #>> '{}')::boolean, true),
      'zona_estrita', public._zona_estrita())
  ) INTO _out;

  RETURN _out;
END; $function$;

COMMENT ON FUNCTION public.sdr_painel(uuid) IS
  'Painel da pré-venda: visitas a confirmar/confirmadas, realizadas, pastas e vendas da semana da folha (sáb a sex), no-shows para reagendar, clientes sem visita, a última entrega e a contagem de aptos da roleta do SDR (sem nomes).';
REVOKE ALL ON FUNCTION public.sdr_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_painel(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Conferência: as peças existem como o resto do sistema espera
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'leads'
                    AND column_name = 'sdr_corretor_origem_id') THEN
    RAISE EXCEPTION 'sdr passagem: coluna sdr_corretor_origem_id ausente';
  END IF;
  IF to_regprocedure('public.sdr_passar_cliente(jsonb)') IS NULL
     OR to_regprocedure('public.sdr_registrar_confirmacao(uuid, text, timestamptz, text)') IS NULL
     OR to_regprocedure('public.sdr_painel(uuid)') IS NULL THEN
    RAISE EXCEPTION 'sdr passagem: função nova ausente';
  END IF;
END $$;
