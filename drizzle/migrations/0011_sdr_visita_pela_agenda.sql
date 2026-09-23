-- Visita marcada por SDR pela agenda comum (caso LAURIENE, 23/09/2026).
-- POR QUÊ: o gatilho da agenda (_sdr_visita_roleta) creditava o SDR antigo do
-- cliente (não quem marcou), o SDR que marcou perdia a visão (visão do SDR vem
-- de sdr_id) e o cliente não ia para "agendado" (só agendar_visita_sdr movia).
-- O QUE MUDA: SDR que marca vira sdr_id; após a entrega o cliente vai para
-- "agendado". Distribuição, roleta, aviso e tarefas D-1/D-0 iguais.
-- Rollback: reaplicar o corpo anterior de _sdr_visita_roleta (migration sdr_motor).
CREATE OR REPLACE FUNCTION public._sdr_visita_roleta(_lead_id uuid, _corretor_agenda uuid, _inicio timestamptz, _fim timestamptz, _gatilho text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _sdr uuid;
  _uid uuid := auth.uid();
  _uid_sdr boolean := false;
  _fim_ok timestamptz := COALESCE(_fim, _inicio + interval '1 hour');
  _res jsonb;
  _vencedor uuid;
  _d1 timestamptz;
  _d0 timestamptz;
  _status_atual public.lead_status;
BEGIN
  IF NOT public._sdr_ativo() THEN RETURN NULL; END IF;
  IF COALESCE(current_setting('app.sdr_motor', true), '') = 'on' THEN RETURN NULL; END IF;
  IF _inicio IS NULL OR _inicio <= now() THEN RETURN NULL; END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN RETURN NULL; END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN RETURN NULL; END IF;
  IF _lead.status IN ('perdido'::public.lead_status, 'contrato_fechado'::public.lead_status,
                      'pos_venda'::public.lead_status) THEN
    RETURN NULL;
  END IF;

  _uid_sdr := _uid IS NOT NULL
    AND public.has_role(_uid, 'sdr'::public.app_role)
    AND NOT public.has_role(_uid, 'corretor'::public.app_role);

  IF _uid_sdr THEN
    _sdr := _uid;
    IF _lead.sdr_id IS DISTINCT FROM _uid THEN
      PERFORM set_config('app.sdr_motor', 'on', true);
      UPDATE public.leads SET sdr_id = _uid, sdr_devolvido_em = NULL WHERE id = _lead_id;
      PERFORM public._sdr_log_base(_lead_id, _uid,
        'Visita marcada pelo SDR pela agenda', 'sdr_agenda', _gatilho,
        jsonb_build_object('corretor_id', _lead.corretor_id, 'sdr_anterior', _lead.sdr_id));
    END IF;
  ELSIF _lead.sdr_id IS NOT NULL THEN
    _sdr := _lead.sdr_id;
  ELSIF _corretor_agenda IS NOT NULL
        AND public.has_role(_corretor_agenda, 'sdr'::public.app_role)
        AND NOT public.has_role(_corretor_agenda, 'corretor'::public.app_role) THEN
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

  SELECT status INTO _status_atual FROM public.leads WHERE id = _lead_id;
  IF _status_atual IN ('novo','aguardando_corretor','aguardando_atendimento','em_atendimento',
                       'aguardando_retorno','qualificacao_corretor','qualificado') THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status = 'agendado'::public.lead_status,
           proxima_acao = 'Confirmar a visita com o cliente (D-1 e no dia)',
           ultima_interacao = now()
     WHERE id = _lead_id;
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'transicao_lead',
      'Lead movido de ' || _status_atual::text || ' para agendado.',
      'sdr_visita_roleta',
      jsonb_build_object('de_status', _status_atual, 'para_status', 'agendado',
                         'motivo', 'Visita agendada pelo SDR', 'alterado_por', _uid));
  END IF;

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
END;
$$;

-- Correção do caso LAURIENE: crédito para Kauan e status agendado.
DO $$
BEGIN
  PERFORM set_config('app.sdr_motor', 'on', true);
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET sdr_id = '8c811baf-53cf-4d92-b4a4-9df9ba130633',
         status = 'agendado'::public.lead_status,
         proxima_acao = 'Confirmar a visita com o cliente (D-1 e no dia)'
   WHERE id = '8afb67b7-5b2d-482f-99a4-dbf9d79f32fb' AND status = 'em_atendimento';
  UPDATE public.tarefas SET corretor_id = '8c811baf-53cf-4d92-b4a4-9df9ba130633'
   WHERE lead_id = '8afb67b7-5b2d-482f-99a4-dbf9d79f32fb' AND status = 'pendente'
     AND titulo LIKE 'Confirmar visita de %' AND deleted_at IS NULL;
END $$;