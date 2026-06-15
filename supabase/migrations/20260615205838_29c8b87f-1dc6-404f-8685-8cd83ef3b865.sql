
-- Novo: atribui um lead específico a um corretor específico (sem girar a roleta)
CREATE OR REPLACE FUNCTION public.atribuir_lead_a_corretor(_lead_id uuid, _corretor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET corretor_id = _corretor_id,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = 'aguardando_atendimento',
      corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _corretor_id)
  WHERE id = _lead_id;

  UPDATE public.fila_distribuicao
  SET leads_recebidos_hoje = leads_recebidos_hoje + 1,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
  VALUES (_lead_id, _corretor_id, 'automatica', 'Lote automático (20/rodada)');
END;
$$;

-- Substitui o orquestrador: em cada execução, entrega até 20 leads para CADA corretor elegível
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lote_max constant int := 20;
  _corretor record;
  _lead_id uuid;
  _entregues_corretor int;
  _capacidade int;
  _max_pos int;
  _total_dist int := 0;
  _redist int := 0;
BEGIN
  -- 1) Redistribuir leads parados (devolve para a fila como "novo")
  _redist := public.redistribuir_leads_parados();

  -- 2) Para cada corretor elegível (na ordem da fila), entregar lote de até 20
  FOR _corretor IN
    SELECT fd.corretor_id, fd.max_leads_dia, fd.leads_recebidos_hoje
    FROM public.fila_distribuicao fd
    WHERE fd.ativo = true
      AND fd.leads_recebidos_hoje < fd.max_leads_dia
      AND public.corretor_elegivel(fd.corretor_id) = true
    ORDER BY fd.posicao ASC
  LOOP
    _capacidade := LEAST(_lote_max, _corretor.max_leads_dia - _corretor.leads_recebidos_hoje);
    _entregues_corretor := 0;

    WHILE _entregues_corretor < _capacidade LOOP
      SELECT id INTO _lead_id
      FROM public.leads
      WHERE corretor_id IS NULL
        AND status = 'novo'
        AND deleted_at IS NULL
        AND na_lixeira = false
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      EXIT WHEN _lead_id IS NULL;

      PERFORM public.atribuir_lead_a_corretor(_lead_id, _corretor.corretor_id);
      _entregues_corretor := _entregues_corretor + 1;
      _total_dist := _total_dist + 1;
      _lead_id := NULL;
    END LOOP;

    -- Se recebeu pelo menos 1, move para o final da fila (passa a bola)
    IF _entregues_corretor > 0 THEN
      SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;
      UPDATE public.fila_distribuicao
      SET posicao = _max_pos + 1
      WHERE corretor_id = _corretor.corretor_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'distribuidos', _total_dist,
    'redistribuidos', _redist,
    'lote_por_corretor', _lote_max,
    'em', now()
  );
END;
$$;
