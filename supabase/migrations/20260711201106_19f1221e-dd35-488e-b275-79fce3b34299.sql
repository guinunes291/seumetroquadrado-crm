CREATE OR REPLACE FUNCTION public._dentro_horario_comercial_brt()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int BETWEEN 8 AND 19;
$$;

CREATE OR REPLACE FUNCTION public._telefone_e164_br(_telefone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN regexp_replace(COALESCE(_telefone,''),'\D','','g') = '' THEN NULL
    WHEN regexp_replace(COALESCE(_telefone,''),'\D','','g') LIKE '55%'
      THEN regexp_replace(COALESCE(_telefone,''),'\D','','g')
    ELSE '55' || regexp_replace(COALESCE(_telefone,''),'\D','','g')
  END;
$$;

CREATE OR REPLACE FUNCTION public._auditar_redistribuicao(
  _lead_id uuid, _anterior uuid, _novo uuid, _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ant_nome text; _novo_nome text;
BEGIN
  SELECT nome INTO _ant_nome FROM public.profiles WHERE id = _anterior;
  SELECT nome INTO _novo_nome FROM public.profiles WHERE id = _novo;
  INSERT INTO public.interacoes(lead_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, 'nota', 'interna',
    'Lead redistribuído',
    COALESCE(_motivo, 'Redistribuição automática')
      || ': ' || COALESCE(_ant_nome, '(anterior)')
      || ' → ' || COALESCE(_novo_nome, '(novo)'),
    jsonb_build_object(
      'fonte','sistema','evento','redistribuicao',
      'corretor_anterior_id',_anterior,'corretor_novo_id',_novo,'motivo',_motivo
    )
  );
END; $$;
REVOKE ALL ON FUNCTION public._auditar_redistribuicao(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._notificar_handoff_novo_dono(
  _lead_id uuid, _corretor_id uuid, _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead record; _cor record; _payload jsonb;
BEGIN
  SELECT l.id, l.nome, l.telefone, l.projeto_nome INTO _lead
  FROM public.leads l WHERE l.id = _lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT p.nome, p.telefone INTO _cor
  FROM public.profiles p WHERE p.id = _corretor_id;
  IF NOT FOUND THEN RETURN; END IF;

  _payload := jsonb_build_object(
    'lead_id', _lead.id,
    'nome', _lead.nome,
    'telefone', regexp_replace(COALESCE(_lead.telefone,''), '\D','','g'),
    'empreendimento_nome', _lead.projeto_nome,
    'corretor_nome', _cor.nome,
    'corretor_telefone', public._telefone_e164_br(_cor.telefone),
    'motivo', _motivo,
    'crm_url', 'https://seumetroquadrado-crm.lovable.app/leads/' || _lead.id
  );

  BEGIN
    PERFORM net.http_post(
      url := 'https://guilhermenunessmq.app.n8n.cloud/webhook/copiloto/handoff',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := _payload
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notificar_handoff_novo_dono falhou lead=%: %', _lead_id, SQLERRM;
  END;
END; $$;
REVOKE ALL ON FUNCTION public._notificar_handoff_novo_dono(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._escalar_lead_gestor(_lead_id uuid, _tentativas int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.interacoes
    WHERE lead_id = _lead_id AND titulo = 'Lead escalado ao gestor' AND deleted_at IS NULL
  ) THEN RETURN; END IF;

  INSERT INTO public.interacoes(lead_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, 'nota', 'interna',
    'Lead escalado ao gestor',
    'Lead escalado ao gestor após ' || _tentativas || ' redistribuições sem contato',
    jsonb_build_object('fonte','sistema','evento','escalada','tentativas',_tentativas)
  );
END; $$;
REVOKE ALL ON FUNCTION public._escalar_lead_gestor(uuid,int) FROM PUBLIC, anon, authenticated;

UPDATE public.distribuicao_config
   SET timeout_minutos = 15
 WHERE origem IN ('chatbot','whatsapp','site','agendamento_self_service','outro')
   AND (timeout_minutos IS NULL OR timeout_minutos < 15);

CREATE OR REPLACE FUNCTION public.redistribuir_sla_webhook()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead record; _res jsonb; _qtd int := 0; _anterior uuid; _novo uuid;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  IF NOT public._dentro_horario_comercial_brt() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    SELECT l.id, l.corretor_id, l.tentativas_redistribuicao, dc.timeout_minutos
    FROM public.leads l
    JOIN public.distribuicao_config dc
      ON dc.origem = l.origem AND dc.timeout_minutos IS NOT NULL
    WHERE l.via_webhook = true
      AND l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
      AND l.data_distribuicao < now() - (dc.timeout_minutos || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
    ORDER BY l.data_distribuicao ASC
    LIMIT 50
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
      PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas_redistribuicao);
      CONTINUE;
    END IF;

    _anterior := _lead.corretor_id;

    UPDATE public.leads
       SET corretores_que_tentaram = array_append(
             COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', NULL, NULL, NULL, 'sla_webhook',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id
       RETURNING corretor_id INTO _novo;

      IF _novo IS NOT NULL AND _novo <> _anterior THEN
        PERFORM public._auditar_redistribuicao(
          _lead.id, _anterior, _novo,
          'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
        PERFORM public._notificar_handoff_novo_dono(
          _lead.id, _novo,
          'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
          COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
          ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
      END IF;
      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END; $$;
REVOKE ALL ON FUNCTION public.redistribuir_sla_webhook() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _caller uuid := auth.uid();
  _lead record; _res jsonb; _anterior uuid; _novo uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, dc.timeout_minutos
    INTO _lead
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.id = _lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
    PERFORM public._escalar_lead_gestor(_lead_id, _lead.tentativas_redistribuicao);
    RETURN false;
  END IF;

  _anterior := _lead.corretor_id;

  UPDATE public.leads
     SET corretores_que_tentaram = array_append(
           COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
   WHERE id = _lead_id
     AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  _res := public._distribuir_lead_v3(
    _lead_id, 'redistribuicao', NULL, NULL, _caller, 'sla_webhook_imediato',
    jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                       'corretor_anterior_sla', _anterior));

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id
     RETURNING corretor_id INTO _novo;

    IF _novo IS NOT NULL AND _novo <> _anterior THEN
      PERFORM public._auditar_redistribuicao(
        _lead_id, _anterior, _novo,
        'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
      PERFORM public._notificar_handoff_novo_dono(
        _lead_id, _novo,
        'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
        ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.disparar_repasse_sla_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_repasse_sla_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead record; _res jsonb; _qtd int := 0; _anterior uuid; _novo uuid;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             COALESCE(l.tentativas_redistribuicao, 0) AS tentativas,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL AND l.data_distribuicao IS NOT NULL
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.distribuicao_excecoes e
          WHERE e.lead_id = l.id AND e.status IN ('pendente','em_analise')
            AND e.tentativas >= _max_tent AND e.updated_at > now() - interval '30 minutes'
        )
    )
    SELECT id, corretor_id, data_distribuicao, timeout_horas, tentativas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    IF _lead.tentativas >= 2 THEN
      PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas);
      CONTINUE;
    END IF;

    _anterior := _lead.corretor_id;

    UPDATE public.leads
       SET corretores_que_tentaram = array_append(
             COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', NULL, NULL, NULL, 'lead_parado',
      jsonb_build_object('timeout_horas', _lead.timeout_horas,
                         'corretor_anterior_parado', _anterior));

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id
       RETURNING corretor_id INTO _novo;

      IF _novo IS NOT NULL AND _novo <> _anterior THEN
        PERFORM public._auditar_redistribuicao(
          _lead.id, _anterior, _novo,
          'Lead redistribuído (parado há +' || _lead.timeout_horas || 'h)');
        PERFORM public._notificar_handoff_novo_dono(
          _lead.id, _novo,
          'redistribuido por inatividade (' || _lead.timeout_horas || 'h): ' ||
          COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
          ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
      END IF;
      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END; $$;
REVOKE ALL ON FUNCTION public.redistribuir_leads_parados() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _l record; _n int := 0; _ativo boolean;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatório';
  END IF;
  SELECT p.ativo INTO _ativo FROM public.profiles p WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo';
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads WHERE id = ANY(_ids) FOR UPDATE
  LOOP
    UPDATE public.leads
       SET corretor_anterior_id = _l.corretor_id,
           corretor_id = _corretor,
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = 0,
           corretores_que_tentaram = CASE
             WHEN _corretor = ANY(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
               THEN _l.corretores_que_tentaram
             ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
           END
     WHERE id = _l.id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_l.id, _corretor, 'manual', 'Transferência manual', _caller);

    IF _l.corretor_id IS DISTINCT FROM _corretor THEN
      PERFORM public._auditar_redistribuicao(
        _l.id, _l.corretor_id, _corretor, 'Transferência manual');
      PERFORM public._notificar_handoff_novo_dono(
        _l.id, _corretor,
        'transferência manual: ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _l.corretor_id), '(anterior)') ||
        ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _corretor), '(novo)'));
    END IF;

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buscar_lead_ativo_por_telefone_global(_telefone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status <> 'perdido'
    AND length(public.telefone_digits(l.telefone)) >= 8
    AND public.telefone_digits(l.telefone) = public.telefone_digits(_telefone)
  ORDER BY l.updated_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.buscar_lead_ativo_por_telefone_global(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_lead_ativo_por_telefone_global(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';