ALTER TABLE public.proposta_avisos
  ADD COLUMN IF NOT EXISTS canal text CHECK (canal IS NULL OR canal IN ('sami_texto','sami_template','push')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','falhou'));

-- Validade máxima: dia 4 do mês seguinte (23:59:59, Brasília) ou envio + 15 dias, o que vencer primeiro.
CREATE OR REPLACE FUNCTION public.proposta_validade_maxima(_modelo text, _agora timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN _modelo = 'apresentacao' THEN _agora + interval '30 days'
  ELSE least(
    ((date_trunc('month', _agora AT TIME ZONE 'America/Sao_Paulo') + interval '1 month 4 days' - interval '1 second')
      AT TIME ZONE 'America/Sao_Paulo'),
    _agora + interval '15 days')
  END
$$;
GRANT EXECUTE ON FUNCTION public.proposta_validade_maxima(text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.criar_proposta_link(_ator_id uuid, _lead_id uuid, _modelo text, _projeto_id uuid, _token_hash text, _expira_em timestamptz, _snapshot jsonb, _snapshot_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _id uuid; _corretor uuid; _status public.lead_status;
BEGIN
  IF _ator_id IS NULL OR NOT public.is_active_member(_ator_id) OR NOT public.pode_acessar_lead(_ator_id, _lead_id) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _modelo NOT IN ('apresentacao','proposta') OR lower(_token_hash) !~ '^[0-9a-f]{64}$'
     OR lower(_snapshot_hash) !~ '^[0-9a-f]{64}$' OR jsonb_typeof(_snapshot) <> 'object'
     OR _expira_em IS NULL OR _expira_em <= now()
     OR _expira_em > public.proposta_validade_maxima(_modelo, now()) + interval '1 minute' THEN
    RAISE EXCEPTION 'proposta_invalida' USING ERRCODE = '22023';
  END IF;
  SELECT corretor_id, status INTO _corretor, _status FROM public.leads WHERE id = _lead_id FOR UPDATE;
  INSERT INTO public.propostas (lead_id, corretor_id, projeto_id, modelo, token_hash, expira_em, validade, status, versao_atual, criado_por)
  VALUES (_lead_id, coalesce(_corretor, _ator_id), _projeto_id, _modelo, lower(_token_hash), _expira_em, _expira_em, 'enviada', 1, _ator_id)
  RETURNING id INTO _id;
  INSERT INTO public.proposta_versoes (proposta_id, numero, snapshot, snapshot_hash, criado_por)
  VALUES (_id, 1, _snapshot, lower(_snapshot_hash), _ator_id);
  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'proposta_enviada',
          CASE WHEN _modelo = 'proposta' THEN 'Link de proposta gerado' ELSE 'Link de apresentação gerado' END,
          'link_proposta', jsonb_build_object('proposta_id', _id, 'modelo', _modelo));
  -- Só a Proposta avança o funil, e só para frente.
  IF _modelo = 'proposta' AND _status IN ('novo','aguardando_corretor','aguardando_atendimento','aguardando_retorno',
       'qualificacao_corretor','em_atendimento','qualificado','agendado','visita_realizada') THEN
    UPDATE public.leads SET status = 'proposta_enviada', updated_at = now() WHERE id = _lead_id;
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.aceitar_proposta(_token_hash text, _opcao smallint, _nome text, _cpf_hash text, _cpf_final text, _ip text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _v public.proposta_versoes%ROWTYPE; _n_opcoes integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'not_found'); END IF;
  SELECT * INTO _p FROM public.propostas WHERE token_hash = lower(_token_hash) AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR _p.revogado_em IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'not_found'); END IF;
  IF _p.modelo <> 'proposta' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_permitido'); END IF;
  IF _p.aceita_em IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aceita'); END IF;
  IF _p.expira_em <= now() THEN RETURN jsonb_build_object('ok', false, 'motivo', 'expirada'); END IF;
  IF _nome IS NULL OR length(btrim(_nome)) < 5 OR lower(coalesce(_cpf_hash,'')) !~ '^[0-9a-f]{64}$' OR coalesce(_cpf_final,'') !~ '^[0-9]{3}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input');
  END IF;
  SELECT * INTO _v FROM public.proposta_versoes WHERE proposta_id = _p.id AND numero = _p.versao_atual;
  _n_opcoes := coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(_v.snapshot->'fluxos') = 'array' THEN _v.snapshot->'fluxos' END), 0);
  IF _opcao IS NULL OR _opcao < 1 OR _opcao > _n_opcoes THEN RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input'); END IF;
  INSERT INTO public.proposta_aceites (proposta_id, versao, opcao_fluxo, nome_completo, cpf_hash, cpf_final, ip, user_agent, snapshot_hash)
  VALUES (_p.id, _v.numero, _opcao, btrim(_nome), lower(_cpf_hash), _cpf_final, left(_ip, 64), left(_user_agent, 300), _v.snapshot_hash);
  UPDATE public.propostas SET aceita_em = now(), status = 'aceita', updated_at = now() WHERE id = _p.id;
  INSERT INTO public.proposta_eventos (proposta_id, tipo, idempotency_key) VALUES (_p.id, 'aceite', 'aceite-' || _p.id::text) ON CONFLICT DO NOTHING;
  IF _p.lead_id IS NOT NULL THEN
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_p.lead_id, 'proposta_aceita', 'Cliente aceitou a proposta (opção ' || _opcao || ')', 'link_proposta',
            jsonb_build_object('proposta_id', _p.id, 'versao', _v.numero, 'opcao', _opcao));
    -- Aceite não muda a fase: cria tarefa urgente para o corretor.
    INSERT INTO public.tarefas (titulo, descricao, tipo, prioridade, lead_id, corretor_id, data_vencimento, origem_automatica)
    VALUES ('Cliente aceitou a proposta: seguir com documentação/contrato',
            'Aceite digital pelo link (opção ' || _opcao || ').', 'documentacao', 'urgente',
            _p.lead_id, _p.corretor_id, now() + interval '2 hours', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'aceito_em', now(), 'snapshot_hash', _v.snapshot_hash, 'corretor_id', _p.corretor_id, 'proposta_id', _p.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.criar_proposta_link(uuid,uuid,text,uuid,text,timestamptz,jsonb,text), public.aceitar_proposta(text,smallint,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_proposta_link(uuid,uuid,text,uuid,text,timestamptz,jsonb,text), public.aceitar_proposta(text,smallint,text,text,text,text,text) TO service_role;