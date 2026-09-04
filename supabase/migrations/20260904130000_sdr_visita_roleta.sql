-- SDR (pré-venda) — toda visita marcada em lead de SDR passa pela roleta,
-- por qualquer caminho; cadastro que bate em lead existente entra na base.
--
-- Caso real (04/09/2026): a Vanessa (SDR) cadastrou um cliente que já existia
-- na carteira antiga dela (a deduplicação por telefone devolveu o lead de
-- março) e marcou a visita pelo modal comum da ficha. Nada passou pela RPC
-- agendar_visita_sdr: a visita ficou no nome dela, o lead não foi a corretor
-- nenhum e nem entrou na base de pré-venda (sdr_id nulo).
--
-- Fechos (todos atrás da flag sdr_ativo):
-- 1) Trigger BEFORE INSERT em agendamentos: visita futura em lead de SDR não
--    entregue (sdr_id preenchido) OU visita no nome de um SDR (carteira
--    antiga) roda a roleta agendados-sdr e nasce no nome do corretor
--    vencedor; tarefas D-1/D-0 ficam com o SDR. Sem corretor apto a visita
--    não é criada (erro claro na tela), igual à RPC.
-- 2) criar_lead_dedup: cadastro pelo SDR que bate em lead existente sem SDR,
--    em etapa viva e (sem corretor | do próprio SDR | parado) puxa o lead
--    para a base de pré-venda.
-- 3) sdr_pegar_lead: o SDR traz lead da própria carteira antiga para a base
--    mesmo sem estar parado.
-- 4) sdr_reentregar_visitas_pendentes(): reparo das visitas que já ficaram
--    no nome de um SDR (caso da Vanessa).

-- ---------------------------------------------------------------------------
-- 1) Núcleo: roleta para uma visita fora da RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sdr_visita_roleta(
  _lead_id uuid, _corretor_agenda uuid, _inicio timestamptz, _fim timestamptz, _gatilho text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _sdr uuid;
  _fim_ok timestamptz := COALESCE(_fim, _inicio + interval '1 hour');
  _res jsonb;
  _vencedor uuid;
  _d1 timestamptz;
  _d0 timestamptz;
BEGIN
  IF NOT public._sdr_ativo() THEN RETURN NULL; END IF;
  -- Dentro do motor (agendar_visita_sdr) a roleta já rodou antes do INSERT.
  IF COALESCE(current_setting('app.sdr_motor', true), '') = 'on' THEN RETURN NULL; END IF;
  IF _inicio IS NULL OR _inicio <= now() THEN RETURN NULL; END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN RETURN NULL; END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN RETURN NULL; END IF;
  IF _lead.status IN ('perdido'::public.lead_status, 'contrato_fechado'::public.lead_status,
                      'pos_venda'::public.lead_status) THEN
    RETURN NULL;
  END IF;

  IF _lead.sdr_id IS NOT NULL THEN
    _sdr := _lead.sdr_id;
  ELSIF _corretor_agenda IS NOT NULL
        AND public.has_role(_corretor_agenda, 'sdr'::public.app_role)
        AND NOT public.has_role(_corretor_agenda, 'corretor'::public.app_role) THEN
    -- Visita no nome de um SDR (carteira antiga): o lead entra na base dele.
    _sdr := _corretor_agenda;
    PERFORM set_config('app.sdr_motor', 'on', true);
    UPDATE public.leads
       SET sdr_id = _sdr, sdr_devolvido_em = NULL, sdr_interesse_confirmado = false
     WHERE id = _lead_id;
    PERFORM public._sdr_log_base(_lead_id, _sdr,
      'Visita marcada pelo SDR em lead da própria carteira antiga', 'sdr_carteira_antiga', _gatilho,
      jsonb_build_object('corretor_id', _lead.corretor_id));
  ELSE
    RETURN NULL;
  END IF;

  _res := public._distribuir_lead_sdr(_lead_id, 'Visita agendada pelo SDR', _inicio, _fim_ok, _gatilho);
  IF NOT COALESCE((_res ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'nenhum corretor apto para receber a visita (%). Avise a gestão.', _res ->> 'motivo'
      USING ERRCODE = '22023';
  END IF;
  _vencedor := (_res ->> 'corretor_id')::uuid;

  -- Confirmações D-1 / D-0 ficam com o SDR (sem duplicar).
  _d1 := GREATEST(_inicio - interval '1 day', now() + interval '1 hour');
  _d0 := GREATEST(_inicio - interval '3 hours', now() + interval '30 minutes');
  IF _d1 < _inicio AND NOT EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.lead_id = _lead_id AND t.corretor_id = _sdr AND t.deleted_at IS NULL
      AND t.status = 'pendente'::public.tarefa_status AND t.titulo LIKE 'Confirmar visita de %(D-1)'
  ) THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_sdr, _lead_id, 'Confirmar visita de ' || _lead.nome || ' (D-1)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d1, true, _sdr);
  END IF;
  IF _d0 < _inicio AND _d0 > _d1 AND NOT EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.lead_id = _lead_id AND t.corretor_id = _sdr AND t.deleted_at IS NULL
      AND t.status = 'pendente'::public.tarefa_status AND t.titulo LIKE 'Confirmar visita de %(D-0)'
  ) THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_sdr, _lead_id, 'Confirmar visita de ' || _lead.nome || ' hoje (D-0)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d0, true, _sdr);
  END IF;

  RETURN _vencedor;
END; $$;

REVOKE ALL ON FUNCTION public._sdr_visita_roleta(uuid, uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sdr_visita_roleta(uuid, uuid, timestamptz, timestamptz, text) TO service_role;

-- Trigger: a visita nasce no nome do corretor vencedor. Restaura a flag
-- app.sdr_motor ao estado anterior para não silenciar a próxima visita da
-- mesma transação.
CREATE OR REPLACE FUNCTION public.trg_sdr_visita_roleta_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _v uuid;
  _prev text := COALESCE(current_setting('app.sdr_motor', true), '');
BEGIN
  IF NEW.tipo = 'visita'::public.agendamento_tipo
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                        'remarcado'::public.agendamento_status)
     AND NEW.data_inicio > now() THEN
    _v := public._sdr_visita_roleta(NEW.lead_id, NEW.corretor_id, NEW.data_inicio, NEW.data_fim, 'agendamento_visita');
    PERFORM set_config('app.sdr_motor', _prev, true);
    IF _v IS NOT NULL THEN
      NEW.corretor_id := _v;
      NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sdr_visita_roleta ON public.agendamentos;
CREATE TRIGGER trg_sdr_visita_roleta
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_sdr_visita_roleta_fn();

-- ---------------------------------------------------------------------------
-- 2) Cadastro pelo SDR que bate em lead existente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
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
  _status public.lead_status := COALESCE(
    NULLIF(_payload->>'status', '')::public.lead_status,
    'novo'::public.lead_status
  );
  _digits text;
  _dup public.leads%ROWTYPE;
  _novo_id uuid;
  _sdr_pegou boolean := false;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR _telefone IS NULL THEN
    RAISE EXCEPTION 'nome e telefone são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  _digits := right(public.telefone_digits(_telefone), 10);
  IF length(_digits) >= 8 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _digits));

    SELECT l.* INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND right(public.telefone_digits(l.telefone), 10) = _digits
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- SDR (2026-09-04): cadastro que bate em lead existente SEM SDR, em
      -- etapa viva e (sem corretor | do próprio SDR | parado há N dias) puxa o
      -- lead para a base de pré-venda em vez de só avisar "duplicado".
      -- Política: "SDR pode ter lead de corretor na base, a menos que esteja
      -- atualizado nos registros ou em fase avançada".
      IF public.has_role(_uid, 'sdr'::public.app_role)
         AND NOT public.has_role(_uid, 'admin'::public.app_role)
         AND public._sdr_ativo()
         AND _dup.sdr_id IS NULL
         AND _dup.sdr_entregue_em IS NULL
         AND NOT _dup.na_lixeira
         AND _dup.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                             'aguardando_atendimento'::public.lead_status, 'aguardando_retorno'::public.lead_status,
                             'qualificacao_corretor'::public.lead_status, 'em_atendimento'::public.lead_status,
                             'qualificado'::public.lead_status)
         AND (_dup.corretor_id IS NULL
              OR _dup.corretor_id = _uid
              OR COALESCE(_dup.ultima_atividade_em, _dup.updated_at, _dup.created_at)
                 < now() - make_interval(days => public._sdr_setting_int('sdr_reaquecer_dias', 7))) THEN
        PERFORM set_config('app.sdr_motor', 'on', true);
        UPDATE public.leads
           SET sdr_id = _uid, sdr_devolvido_em = NULL, sdr_interesse_confirmado = false
         WHERE id = _dup.id;
        IF _dup.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status)
           AND public.transicao_lead_permitida(_dup.status, 'aguardando_atendimento'::public.lead_status, false) THEN
          BEGIN
            PERFORM public.transicionar_lead(_dup.id, 'aguardando_atendimento'::public.lead_status,
              'Cadastro pelo SDR: lead já existia no CRM', 'Fazer o primeiro contato');
          EXCEPTION WHEN OTHERS THEN
            NULL; -- etapa é cosmética aqui; a posse de pré-venda já está garantida
          END;
        END IF;
        PERFORM public._sdr_log_base(_dup.id, _uid,
          'Cadastro pelo SDR bateu em lead existente (' || _dup.status::text || ')',
          'sdr_dedup', 'criacao_manual', jsonb_build_object('corretor_id', _dup.corretor_id));
        _sdr_pegou := true;
      END IF;

      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
        'nome', CASE WHEN _sdr_pegou OR public.pode_acessar_lead(_uid, _dup.id) THEN _dup.nome ELSE NULL END,
        'na_carteira', _sdr_pegou OR public.pode_acessar_lead(_uid, _dup.id),
        'sdr_pegou', _sdr_pegou
      );
    END IF;
  END IF;

  INSERT INTO public.leads (
    nome, telefone, email, origem, projeto_id, projeto_nome, observacoes,
    corretor_id, status, zona, bairro
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _status, _zona, _bairro
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Pegar: também a própria carteira antiga
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_pegar_lead(_lead_id uuid)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _sdr_nome text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT public.has_role(_uid, 'sdr'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public._sdr_ativo() THEN
    RAISE EXCEPTION 'modelo SDR desligado (distribuicao_settings.sdr_ativo)' USING ERRCODE = '42501';
  END IF;
  -- Reaquecível (lead parado de corretor) OU lead da PRÓPRIA carteira antiga
  -- do SDR (quem virou SDR vindo de corretor traz o que ainda atende).
  IF NOT public.lead_reaquecivel_sdr(_lead_id) AND NOT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id AND l.corretor_id = _uid AND l.sdr_id IS NULL
      AND l.sdr_entregue_em IS NULL AND l.deleted_at IS NULL AND NOT l.na_lixeira
      AND l.status NOT IN ('perdido'::public.lead_status, 'contrato_fechado'::public.lead_status,
                           'pos_venda'::public.lead_status)
  ) THEN
    RAISE EXCEPTION 'lead não está disponível para reaquecimento' USING ERRCODE = '22023';
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _uid;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET sdr_id = _uid,
         sdr_entregue_em = NULL,
         sdr_devolvido_em = NULL,
         sdr_interesse_confirmado = false
   WHERE id = _lead_id AND sdr_id IS NULL
  RETURNING * INTO _lead;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outro SDR pegou este lead antes' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'sdr_reaquecer',
          CASE WHEN _lead.corretor_id = _uid
               THEN 'SDR ' || COALESCE(_sdr_nome, '') || ' trouxe o lead da própria carteira antiga para a base de pré-venda.'
               ELSE 'SDR ' || COALESCE(_sdr_nome, '') || ' assumiu o reaquecimento (corretor mantém a posse).' END,
          'sdr_motor', jsonb_build_object('sdr_id', _uid, 'corretor_id', _lead.corretor_id));

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'SDR reaquecendo o lead',
          CASE WHEN _lead.corretor_id = _uid
               THEN 'SDR ' || COALESCE(_sdr_nome, '') || ' trouxe o lead da própria carteira antiga. A visita vai para um corretor pela roleta de agendados.'
               ELSE 'SDR ' || COALESCE(_sdr_nome, '') || ' pegou o lead parado para reaquecer. O corretor continua dono e tem prioridade na visita.' END,
          jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_reaquecer', 'sdr_id', _uid));

  IF _lead.corretor_id IS NOT NULL AND _lead.corretor_id <> _uid THEN
    PERFORM public.enqueue_push(
      _lead.corretor_id, 'SDR reaquecendo seu lead',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_sdr_nome, 'SDR') || ' está reaquecendo',
      '/leads/' || _lead_id::text, 'sdr-reaq-' || _lead_id::text);
  END IF;

  RETURN _lead;
END; $$;

-- ---------------------------------------------------------------------------
-- 4) Reparo: visitas futuras que ficaram no nome de um SDR (ou em lead de SDR
--    não entregue) passam pela roleta agora. Admin ou SDR.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_reentregar_visitas_pendentes()
RETURNS TABLE (
  agendamento_id uuid, lead_id uuid, lead_nome text, data_inicio timestamptz,
  corretor_id uuid, corretor_nome text, regra text, erro text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _v uuid;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'sdr'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _a IN
    SELECT a.id, a.lead_id, l.nome, a.corretor_id, a.data_inicio, a.data_fim
    FROM public.agendamentos a
    JOIN public.leads l ON l.id = a.lead_id
    WHERE a.tipo = 'visita'::public.agendamento_tipo
      AND a.deleted_at IS NULL
      AND a.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                       'remarcado'::public.agendamento_status)
      AND a.data_inicio > now()
      AND l.deleted_at IS NULL AND NOT l.na_lixeira
      AND l.sdr_entregue_em IS NULL
      AND (l.sdr_id IS NOT NULL
           OR (a.corretor_id IS NOT NULL
               AND public.has_role(a.corretor_id, 'sdr'::public.app_role)
               AND NOT public.has_role(a.corretor_id, 'corretor'::public.app_role)))
    ORDER BY a.data_inicio
  LOOP
    BEGIN
      PERFORM set_config('app.sdr_motor', '', true);
      _v := public._sdr_visita_roleta(_a.lead_id, _a.corretor_id, _a.data_inicio, _a.data_fim, 'reparo_visita_sdr');
      IF _v IS NULL THEN CONTINUE; END IF;
      UPDATE public.agendamentos SET corretor_id = _v WHERE id = _a.id;
      agendamento_id := _a.id; lead_id := _a.lead_id; lead_nome := _a.nome; data_inicio := _a.data_inicio;
      corretor_id := _v; erro := NULL;
      SELECT p.nome INTO corretor_nome FROM public.profiles p WHERE p.id = _v;
      SELECT dl.regra_aplicada INTO regra FROM public.distribution_log dl
       WHERE dl.lead_id = _a.lead_id AND dl.resultado = 'sucesso' ORDER BY dl.created_at DESC LIMIT 1;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      agendamento_id := _a.id; lead_id := _a.lead_id; lead_nome := _a.nome; data_inicio := _a.data_inicio;
      corretor_id := NULL; corretor_nome := NULL; regra := NULL; erro := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  PERFORM set_config('app.sdr_motor', '', true);
END; $$;

REVOKE ALL ON FUNCTION public.sdr_reentregar_visitas_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_reentregar_visitas_pendentes() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sdr_visita_roleta') THEN
    RAISE EXCEPTION 'sdr_visita_roleta: trigger ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_lead_dedup' AND p.prosrc LIKE '%sdr_pegou%'
  ) THEN
    RAISE EXCEPTION 'sdr_visita_roleta: criar_lead_dedup sem o ramo do SDR';
  END IF;
END $$;
