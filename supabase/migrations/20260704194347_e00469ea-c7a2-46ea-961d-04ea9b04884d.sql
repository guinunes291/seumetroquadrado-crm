-- Não contar redistribuições no leads_recebidos_hoje.
-- Adiciona parâmetro _contar_como_novo à distribuir_lead_elegivel;
-- redistribuir_leads_parados passa false para não inflar o contador.

CREATE OR REPLACE FUNCTION public.distribuir_lead_elegivel(_lead_id uuid, _contar_como_novo boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _corretor uuid;
  _max_pos int;
BEGIN
  SELECT fd.corretor_id INTO _corretor
  FROM public.fila_distribuicao fd
  WHERE fd.ativo = true
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND public.corretor_elegivel(fd.corretor_id) = true
  ORDER BY fd.posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _corretor IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;

  UPDATE public.fila_distribuicao
  SET posicao = _max_pos + 1,
      leads_recebidos_hoje = CASE WHEN _contar_como_novo
                                  THEN leads_recebidos_hoje + 1
                                  ELSE leads_recebidos_hoje END,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor;

  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = 'aguardando_atendimento',
      corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
  WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
  VALUES (_lead_id, _corretor, 'automatica',
          CASE WHEN _contar_como_novo
               THEN 'Roleta automática (elegibilidade)'
               ELSE 'Roleta automática (redistribuição de lead parado)' END);

  RETURN _corretor;
END;
$function$;

-- Redistribuição passa a chamar com _contar_como_novo = false.
CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _timeout int;
  _qtd int := 0;
  _novo uuid;
  _ant uuid;
BEGIN
  FOR _lead IN
    SELECT l.id, l.origem, l.corretor_id, l.data_distribuicao
    FROM public.leads l
    WHERE l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
  LOOP
    SELECT COALESCE(dc.timeout_horas, 24) INTO _timeout
    FROM public.distribuicao_config dc WHERE dc.origem = _lead.origem;
    IF _timeout IS NULL THEN _timeout := 24; END IF;

    IF _lead.data_distribuicao < now() - (_timeout || ' hours')::interval THEN
      _ant := _lead.corretor_id;
      INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
      VALUES (_lead.id, _ant, 'redistribuicao',
              'Lead parado em aguardando_atendimento por mais de ' || _timeout || 'h');

      UPDATE public.leads
      SET corretor_anterior_id = _ant,
          corretor_id = NULL,
          status = 'novo',
          data_distribuicao = NULL,
          tentativas_redistribuicao = COALESCE(tentativas_redistribuicao,0) + 1
      WHERE id = _lead.id;

      -- false: redistribuição não conta como "lead novo recebido hoje"
      _novo := public.distribuir_lead_elegivel(_lead.id, false);
      IF _novo IS NOT NULL THEN _qtd := _qtd + 1; END IF;
    END IF;
  END LOOP;

  RETURN _qtd;
END;
$function$;