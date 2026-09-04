-- SDR (pré-venda) — aviso ao corretor sai do banco, por qualquer caminho.
--
-- Antes, o WhatsApp completo da entrega (data e hora da visita, endereço,
-- renda, FGTS, resumo do cliente, nome do SDR) só saía quando o SDR agendava
-- pelo card do hub: o front chamava a Edge Function notify-lead-transfer. A
-- visita marcada pelo modal comum (trigger) e o reparo não avisavam, e o
-- corretor ainda recebia o dossiê do Marcão (n8n) sem horário nem endereço.
--
-- Agora (aprovado em 04/09/2026, "todos os itens"):
-- 1) `_sdr_notificar_corretor` chama a Edge Function via pg_net com a chave
--    service_role guardada no Vault (nome `service_role_key`) e a URL em
--    `distribuicao_settings.sdr_aviso_corretor_url`. Sem chave/URL, registra
--    o motivo em lead_eventos e segue — a entrega nunca falha por causa do
--    aviso.
-- 2) O aviso dispara depois que a visita existe: fim de agendar_visita_sdr,
--    fim de entregar_lead_sdr, AFTER INSERT em agendamentos (caminho do modal
--    comum) e no reparo.
-- 3) O Marcão (webhook copiloto/handoff) não roda na entrega do SDR: um
--    único WhatsApp por entrega.
-- 4) Endereço (local) obrigatório em toda visita entregue pelo SDR.

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('sdr_aviso_corretor_url',
   to_jsonb('https://rldnprwjlomjmjvinxuh.supabase.co/functions/v1/notify-lead-transfer'::text),
   'URL da Edge Function que manda o WhatsApp de entrega do SDR ao corretor (contexto sdr). Vazio = não avisa. Exige o segredo service_role_key no Vault.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1) Aviso ao corretor (pg_net → Edge Function, chave no Vault)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sdr_notificar_corretor(_lead_id uuid, _corretor_id uuid, _gatilho text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _url text;
  _key text;
  _req bigint;
  _motivo text;
BEGIN
  _url := NULLIF(btrim(COALESCE(public.get_dist_setting('sdr_aviso_corretor_url') #>> '{}', '')), '');
  BEGIN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
      INTO _key USING 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    _key := NULL;
  END;
  _key := NULLIF(btrim(COALESCE(_key, '')), '');

  IF _url IS NULL THEN
    _motivo := 'sem_url';
  ELSIF _key IS NULL THEN
    _motivo := 'sem_chave_vault';
  ELSE
    BEGIN
      SELECT net.http_post(
        url := _url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _key,
          'apikey', _key),
        body := jsonb_build_object('lead_id', _lead_id, 'corretor_id', _corretor_id, 'contexto', 'sdr')
      ) INTO _req;
    EXCEPTION WHEN OTHERS THEN
      _motivo := 'http_post_falhou: ' || SQLERRM;
    END;
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_aviso_corretor',
    CASE WHEN _motivo IS NULL THEN 'WhatsApp de entrega enfileirado para o corretor'
         ELSE 'WhatsApp de entrega NÃO enviado (' || _motivo || ')' END,
    'sdr_motor',
    jsonb_strip_nulls(jsonb_build_object('corretor_id', _corretor_id, 'gatilho', _gatilho,
                                         'enviado', _motivo IS NULL, 'motivo', _motivo, 'request_id', _req))
  );
  IF _motivo IS NOT NULL THEN
    RAISE WARNING 'sdr_notificar_corretor lead=% corretor=%: %', _lead_id, _corretor_id, _motivo;
  END IF;
  RETURN _motivo IS NULL;
END; $$;

REVOKE ALL ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Motor sem o Marcão; RPCs avisam depois que a visita existe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_sdr(
  _lead_id uuid,
  _motivo text,
  _inicio timestamptz DEFAULT NULL,
  _fim timestamptz DEFAULT NULL,
  _gatilho text DEFAULT 'sdr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  --    Só vale para quem HOJE tem o papel corretor: quem virou SDR vindo de
  --    corretor continua sendo corretor_id da carteira antiga e, sem esta
  --    guarda, o motor "entregaria" o lead de volta para o próprio SDR.
  IF _lead.corretor_id IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _lead.corretor_id AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_lead.corretor_id, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF public._sdr_agenda_conflita(_lead.corretor_id, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _lead.corretor_id;
      _regra := 'sdr_prioridade_corretor_original';
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
      WHERE rp.roleta_id = _roleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
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
    'inicio', _inicio,
    'fim', _fim
  ));

  IF _vencedor IS NULL THEN
    PERFORM public._registrar_excecao_distribuicao(
      _lead_id, _motivo_excecao,
      'Roleta de agendados do SDR sem corretor apto (' || COALESCE(_motivo, _gatilho) || ')',
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
         roleta_slug = CASE WHEN _regra = 'roleta_sdr' THEN _slug ELSE roleta_slug END,
         via_webhook = false,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor)
         END
   WHERE id = _lead_id;

  IF _regra = 'roleta_sdr' THEN
    UPDATE public.roleta_participantes
       SET ultimo_lead_em = now(), updated_at = now()
     WHERE roleta_id = _roleta.id AND corretor_id = _vencedor;
  END IF;
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _vencedor, _tipo, _motivo, _slug, _regra, 'sucesso', _uid)
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
    'regra', _regra, 'roleta', _slug);
END; $$;

CREATE OR REPLACE FUNCTION public.agendar_visita_sdr(
  _lead_id uuid,
  _data_inicio timestamptz,
  _data_fim timestamptz DEFAULT NULL,
  _titulo text DEFAULT NULL,
  _local text DEFAULT NULL,
  _descricao text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _fim timestamptz := COALESCE(_data_fim, _data_inicio + interval '1 hour');
  _res jsonb;
  _corretor uuid;
  _ag_id uuid;
  _titulo_final text;
  _d1 timestamptz;
  _d0 timestamptz;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._sdr_gate_lead(_uid, _lead);

  IF _data_inicio IS NULL OR _data_inicio <= now() THEN
    RAISE EXCEPTION 'a visita precisa estar no futuro' USING ERRCODE = '22023';
  END IF;
  IF _fim <= _data_inicio THEN
    RAISE EXCEPTION 'fim da visita precisa ser depois do início' USING ERRCODE = '22023';
  END IF;
  IF _lead.status IN ('perdido'::public.lead_status, 'contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status) THEN
    RAISE EXCEPTION 'lead encerrado não pode ser agendado pelo SDR' USING ERRCODE = '22023';
  END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN
    RAISE EXCEPTION 'lead já entregue ao corretor — a remarcação é feita pela agenda' USING ERRCODE = '22023';
  END IF;
  -- O corretor recebe a mensagem com endereço e horário: sem endereço não há visita.
  IF NULLIF(btrim(_local), '') IS NULL THEN
    RAISE EXCEPTION 'informe o endereço da visita (campo Local)' USING ERRCODE = '22023';
  END IF;

  _res := public._distribuir_lead_sdr(_lead_id, 'Visita agendada pelo SDR', _data_inicio, _fim, 'agendamento_sdr');
  IF NOT COALESCE((_res ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'nenhum corretor apto para receber a visita (%). A gestão foi avisada.', _res ->> 'motivo'
      USING ERRCODE = '22023';
  END IF;
  _corretor := (_res ->> 'corretor_id')::uuid;

  _titulo_final := COALESCE(NULLIF(btrim(_titulo), ''), 'Visita - ' || _lead.nome);

  INSERT INTO public.agendamentos
    (lead_id, corretor_id, titulo, descricao, tipo, status, data_inicio, data_fim, local, criado_por_id)
  VALUES
    (_lead_id, _corretor, _titulo_final,
     COALESCE(NULLIF(btrim(_descricao), ''), 'Agendada pelo SDR'),
     'visita'::public.agendamento_tipo, 'agendado'::public.agendamento_status,
     _data_inicio, _fim, NULLIF(btrim(_local), ''), _uid)
  RETURNING id INTO _ag_id;

  -- Etapa: caixa de entrada não vai direto a agendado na matriz — passa por
  -- em_atendimento (o contato aconteceu, afinal).
  IF _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status) THEN
    PERFORM public.transicionar_lead(_lead_id, 'em_atendimento'::public.lead_status,
      'Contato feito pelo SDR', 'Confirmar a visita com o cliente');
  END IF;
  PERFORM public.transicionar_lead(_lead_id, 'agendado'::public.lead_status,
    'Visita agendada pelo SDR',
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Confirmar a visita com o cliente (D-1 e no dia)'));

  -- Tarefas de confirmação ficam com o SDR.
  _d1 := GREATEST(_data_inicio - interval '1 day', now() + interval '1 hour');
  _d0 := GREATEST(_data_inicio - interval '3 hours', now() + interval '30 minutes');
  IF _d1 < _data_inicio THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_uid, _lead_id, 'Confirmar visita de ' || _lead.nome || ' (D-1)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d1, true, _uid);
  END IF;
  IF _d0 < _data_inicio AND _d0 > _d1 THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_uid, _lead_id, 'Confirmar visita de ' || _lead.nome || ' hoje (D-0)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d0, true, _uid);
  END IF;

  -- WhatsApp ao corretor com endereço, horário e resumo (a visita já existe).
  PERFORM public._sdr_notificar_corretor(_lead_id, _corretor, 'agendamento_sdr');

  RETURN _res || jsonb_build_object('agendamento_id', _ag_id, 'data_inicio', _data_inicio, 'data_fim', _fim);
END; $$;

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
     AND public.transicao_lead_permitida(_lead.status, 'qualificacao_corretor'::public.lead_status, false) THEN
    PERFORM public.transicionar_lead(_lead_id, 'qualificacao_corretor'::public.lead_status,
      'Entrega manual do SDR: ' || btrim(_motivo),
      'Assumir o atendimento do lead entregue pelo SDR');
  END IF;

  PERFORM public._sdr_notificar_corretor(_lead_id, (_res ->> 'corretor_id')::uuid, 'entrega_manual_sdr');

  RETURN _res;
END; $$;

-- ---------------------------------------------------------------------------
-- 3) Caminho do modal comum: BEFORE exige endereço e marca; AFTER avisa
-- ---------------------------------------------------------------------------
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
      IF NULLIF(btrim(NEW.local), '') IS NULL THEN
        RAISE EXCEPTION 'informe o endereço da visita (campo Local): o corretor recebe a mensagem com endereço e horário'
          USING ERRCODE = '22023';
      END IF;
      NEW.corretor_id := _v;
      NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
      -- O aviso sai no AFTER INSERT, quando a visita já existe para a mensagem.
      PERFORM set_config('app.sdr_visita_lead', NEW.lead_id::text, true);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_sdr_visita_aviso_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(current_setting('app.sdr_visita_lead', true), '') = NEW.lead_id::text
     AND NEW.corretor_id IS NOT NULL THEN
    PERFORM set_config('app.sdr_visita_lead', '', true);
    PERFORM public._sdr_notificar_corretor(NEW.lead_id, NEW.corretor_id, 'agendamento_visita');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sdr_visita_aviso ON public.agendamentos;
CREATE TRIGGER trg_sdr_visita_aviso
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_sdr_visita_aviso_fn();

-- ---------------------------------------------------------------------------
-- 4) Reparo também avisa
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
      PERFORM public._sdr_notificar_corretor(_a.lead_id, _v, 'reparo_visita_sdr');
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sdr_visita_aviso') THEN
    RAISE EXCEPTION 'sdr_aviso_corretor: trigger trg_sdr_visita_aviso ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_distribuir_lead_sdr'
      AND p.prosrc LIKE '%_notificar_handoff_novo_dono%'
  ) THEN
    RAISE EXCEPTION 'sdr_aviso_corretor: _distribuir_lead_sdr ainda chama o Marcão';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.distribuicao_settings WHERE chave = 'sdr_aviso_corretor_url') THEN
    RAISE EXCEPTION 'sdr_aviso_corretor: chave sdr_aviso_corretor_url ausente';
  END IF;
END $$;
