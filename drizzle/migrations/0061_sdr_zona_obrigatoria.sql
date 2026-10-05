-- ============================================================================
-- SDR: ZONA DE INTERESSE OBRIGATÓRIA NO REGISTRO (agendar visita / entregar)
-- ============================================================================
-- Decisão do dono (05/10/2026): "o lead que vem agendado ou com análise do
-- SDR, quando eles vão fazer o registro, é necessário que selecionem a zona
-- em que o cliente tem interesse para que o lead seja direcionado para
-- corretores que atendem aquela zona."
--
-- A zona estrita (20261009120000/120100) já faz a entrega do SDR respeitar a
-- região: _distribuir_lead_sdr filtra a roleta de agendados por
-- corretor_atende_zona e, sem ninguém, vai ao time da zona. O furo era antes:
-- lead SEM zona resolvível (sem zona, sem bairro mapeado, sem projeto com
-- zona) "segue o fluxo por origem" e cai com qualquer corretor. Em produção
-- (05/10, somente leitura): das 27 entregas do SDR nos últimos 60 dias, 11
-- saíram com lead sem zona resolvível.
--
-- O que muda:
--   * _sdr_exigir_zona(lead, zona): canoniza a zona escolhida (zona_canonica:
--     "Zona Leste" → Leste, "ABC" → Sul, "Guarulhos" → Grande SP; inválida →
--     22023), grava em leads.zona e exige zona_do_lead(lead) não nula —
--     senão SMQZ2 com mensagem legível. Vale com a zona estrita ligada ou
--     desligada: a zona é dado que só o SDR tem.
--   * agendar_visita_sdr e entregar_lead_sdr ganham _zona (DEFAULT NULL para
--     quem só tem bairro/projeto) e chamam a exigência ANTES da roleta.
--     As assinaturas antigas caem (sem sobrecarga ambígua).
--   * trg_sdr_visita_roleta_fn: a visita pelo modal comum num lead da base do
--     SDR exige a zona da ficha (mesmo ponto em que já exige o endereço).
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) A exigência, uma função só
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sdr_exigir_zona(_lead_id uuid, _zona text)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _canon text;
  _zona_final text;
BEGIN
  IF NULLIF(btrim(_zona), '') IS NOT NULL THEN
    _canon := public.zona_canonica(_zona);
    IF _canon IS NULL THEN
      RAISE EXCEPTION 'zona de interesse inválida: "%". Use Norte, Sul, Leste, Oeste, Centro ou Grande SP.', _zona
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.leads
       SET zona = _canon
     WHERE id = _lead_id
       AND zona IS DISTINCT FROM _canon;
  END IF;
  _zona_final := public.zona_do_lead(_lead_id);
  IF _zona_final IS NULL THEN
    RAISE EXCEPTION 'Informe a zona em que o cliente tem interesse (Norte, Sul, Leste, Oeste, Centro ou Grande SP): o lead é entregue a quem atende a zona.'
      USING ERRCODE = 'SMQZ2',
            DETAIL = jsonb_build_object('lead_id', _lead_id, 'campo', 'zona')::text;
  END IF;
  RETURN _zona_final;
END;
$$;

REVOKE ALL ON FUNCTION public._sdr_exigir_zona(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) agendar_visita_sdr(…, _zona)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text);

CREATE OR REPLACE FUNCTION public.agendar_visita_sdr(
  _lead_id uuid,
  _data_inicio timestamptz,
  _data_fim timestamptz DEFAULT NULL,
  _titulo text DEFAULT NULL,
  _local text DEFAULT NULL,
  _descricao text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL
,
  _zona text DEFAULT NULL
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

  -- Zona de interesse (decisão do dono, 05/10/2026): o SDR a escolhe no
  -- registro e a roleta entrega só a quem atende a zona. Sem zona
  -- resolvível nada é gravado (SMQZ2).
  PERFORM public._sdr_exigir_zona(_lead_id, _zona);
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

REVOKE ALL ON FUNCTION public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) entregar_lead_sdr(…, _zona)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.entregar_lead_sdr(uuid, text);

CREATE OR REPLACE FUNCTION public.entregar_lead_sdr(_lead_id uuid, _motivo text, _zona text DEFAULT NULL)
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

  -- Zona de interesse (decisão do dono, 05/10/2026): o SDR a escolhe no
  -- registro e a roleta entrega só a quem atende a zona. Sem zona
  -- resolvível nada é gravado (SMQZ2).
  PERFORM public._sdr_exigir_zona(_lead_id, _zona);
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

REVOKE ALL ON FUNCTION public.entregar_lead_sdr(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_lead_sdr(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Visita pelo modal comum num lead da base do SDR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sdr_visita_roleta_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _v uuid;
  _prev text := COALESCE(current_setting('app.sdr_motor', true), '');
  _uid uuid := auth.uid();
BEGIN
  -- Visita marcada pelo próprio corretor não é entrega do SDR:
  -- não passa pela roleta do SDR nem dispara o aviso "Lead do SDR".
  IF _uid IS NOT NULL AND public.has_role(_uid, 'corretor'::public.app_role) THEN
    RETURN NEW;
  END IF;

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
      -- Zona de interesse (05/10/2026): toda entrega do SDR exige a zona do
      -- lead; pelo modal comum ela vem da ficha (zona, bairro ou projeto).
      PERFORM public._sdr_exigir_zona(NEW.lead_id, NULL);
      NEW.corretor_id := _v;
      NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
      PERFORM set_config('app.sdr_visita_lead', NEW.lead_id::text, true);
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- ---------------------------------------------------------------------------
-- 5) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text)') IS NOT NULL
     OR to_regprocedure('public.entregar_lead_sdr(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'sdr zona: assinatura antiga ainda existe';
  END IF;
  IF to_regprocedure('public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text, text)') IS NULL
     OR to_regprocedure('public.entregar_lead_sdr(uuid, text, text)') IS NULL
     OR to_regprocedure('public._sdr_exigir_zona(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'sdr zona: função nova ausente';
  END IF;
  IF has_function_privilege('anon', 'public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.entregar_lead_sdr(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._sdr_exigir_zona(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'sdr zona: EXECUTE indevido';
  END IF;
  IF public.zona_canonica('Zona Leste') IS DISTINCT FROM 'Leste' THEN
    RAISE EXCEPTION 'sdr zona: zona_canonica não canoniza "Zona Leste"';
  END IF;
END $$;
