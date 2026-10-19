CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(_lead_id uuid, _categoria text DEFAULT NULL::text, _detalhe text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _res jsonb;
  _lt text := current_setting('lock_timeout');
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria, 'Sem motivo informado');
BEGIN
  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

  IF _caller IS NOT NULL
     AND _caller <> COALESCE(_atual, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.has_role(_caller,'admin')
     AND NOT public.has_role(_caller,'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _atual IS NOT NULL AND NOT (_atual = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _atual);
    UPDATE public.leads SET corretores_que_tentaram = _tentou WHERE id = _lead_id;
  END IF;

  -- [19/10/2026] A roleta ocupada (rotina automática no meio de uma rodada)
  -- não pode travar o corretor: espera no máximo 3s; passou disso, o lead
  -- segue o caminho "sem corretor disponível" (vai para os perdidos).
  BEGIN
    PERFORM set_config('lock_timeout', '3s', true);
    _res := public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, _caller, 'lead_perdido',
      jsonb_build_object('motivo_perda', _motivo, 'corretor_que_perdeu', _atual),
      _registrar_excecao => false);
    PERFORM set_config('lock_timeout', _lt, true);
  EXCEPTION WHEN lock_not_available THEN
    PERFORM set_config('lock_timeout', _lt, true);
    _res := jsonb_build_object('ok', false, 'motivo', 'roleta_ocupada');
  END;

  IF (_res->>'ok')::boolean THEN
    UPDATE public.oferta_ativa_leads
       SET contatado = true,
           contatado_em = COALESCE(contatado_em, now())
     WHERE lead_id = _lead_id
       AND NOT contatado;

    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id;

    RETURN (_res->>'corretor_id')::uuid;
  ELSE
    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = NULL,
           status = 'perdido',
           na_lixeira = true,
           data_movido_lixeira = now(),
           corretores_que_tentaram = _tentou,
           motivo_perdido = _motivo,
           motivo_perda_categoria = _categoria
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller, 'lead_perdido', 'sucesso');

    RETURN NULL;
  END IF;
END;
$function$;

-- A rodada automática segura a roleta por menos tempo: no máximo 40 leads.
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _fb jsonb;
  _dist int := 0;
  _falhas int := 0;
  _fallback int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.created_at > now() - interval '7 days'
      AND l.import_batch_id IS NULL
      AND l.origem IS DISTINCT FROM 'importacao'
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at DESC
    LIMIT 40
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      IF COALESCE(_res->>'motivo','') IN ('sem_corretor_na_zona','sem_corretor_elegivel','sem_corretor_ativo','zona_sem_time') THEN
        BEGIN
          _fb := public._fallback_velocidade(_lead_id);
          IF (_fb->>'ok')::boolean THEN
            _fallback := _fallback + 1;
          ELSE
            _falhas := _falhas + 1;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          _falhas := _falhas + 1;
        END;
      ELSE
        _falhas := _falhas + 1;
      END IF;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'fallback_velocidade', _fallback,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$function$;