-- lovable-cron-fallback-reviewed: reagenda a varredura de cadência de */5 (288/dia) para de hora em hora (24/dia) — redução de custo já informada ao usuário.
CREATE OR REPLACE FUNCTION public.cadencia_avancar_lead(
  _lead   uuid,
  _modo   text DEFAULT NULL,
  _lote   uuid DEFAULT NULL,
  _origem text DEFAULT 'motor'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _l record;
  _proxima text;
  _concluida_em timestamptz;
  _prazo timestamptz;
  _ok boolean := false;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_ciclo
    INTO _l
  FROM public.leads l
  WHERE l.id = _lead
    AND l.cadencia_etapa IN ('D1','D2')
    AND l.deleted_at IS NULL
    AND NOT COALESCE(l.na_lixeira, false);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.cadencia_etapa_completa(_l.id, _l.cadencia_etapa) THEN
    RETURN NULL;
  END IF;

  _proxima := CASE _l.cadencia_etapa WHEN 'D1' THEN 'D2' ELSE 'D3' END;

  SELECT max(t.ts) INTO _concluida_em
  FROM public.cadencia_tentativas t
  WHERE t.lead_id = _l.id
    AND t.etapa = _l.cadencia_etapa
    AND t.ciclo = _l.cadencia_ciclo;

  _prazo := public.cadencia_fim_do_dia(COALESCE(_concluida_em, now()), 1);

  IF _m = 'ativo' THEN
    UPDATE public.leads
       SET cadencia_etapa = _proxima,
           cadencia_prazo_ts = _prazo
     WHERE id = _l.id AND cadencia_etapa = _l.cadencia_etapa;
    _ok := FOUND;

    IF _ok THEN
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_l.id, 'cadencia_etapa',
              'Cadência avançou de ' || _l.cadencia_etapa || ' para ' || _proxima || '.',
              'cadencia',
              jsonb_build_object('de_estado', _l.cadencia_etapa,
                                 'para_estado', _proxima,
                                 'origem', _origem));
    END IF;
  END IF;

  INSERT INTO public.cadencia_execucao_log
    (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
  VALUES
    (COALESCE(_lote, gen_random_uuid()), 'avancar', _l.id, _l.corretor_id,
     _l.cadencia_etapa, _proxima, 'etapa_completa', _m, _ok,
     jsonb_build_object('origem', _origem, 'concluida_em', _concluida_em));

  RETURN CASE WHEN _ok THEN _proxima ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_avancar_lead(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cadencia_avancar_lead(uuid, text, uuid, text) IS
  'Avança UM lead de D1 para D2 ou de D2 para D3 quando a etapa fechou. Regra única, chamada pela RPC dos botões (origem=escrita) e pela varredura (origem=motor).';

CREATE OR REPLACE FUNCTION public.cadencia_avancar(_modo text DEFAULT NULL, _limite integer DEFAULT 1000)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts NULLS FIRST
    LIMIT GREATEST(COALESCE(_limite, 1000), 1)
  LOOP
    PERFORM public.cadencia_avancar_lead(_l.id, _m, _lote, 'motor');
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_avancar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_avancar(text, integer) TO service_role;

COMMENT ON FUNCTION public.cadencia_avancar(text, integer) IS
  'Rede de segurança de hora em hora: avança quem fechou etapa fora da tela (discador, importação) ou ficou para trás.';

CREATE OR REPLACE FUNCTION public.cadencia_registrar_tentativa(
  _lead_id     uuid,
  _canal       text,
  _resultado   text,
  _template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
  _tentativa_id uuid;
  _completa boolean;
  _etapa_nova text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  IF _l.cadencia_etapa IS NULL OR _l.cadencia_etapa NOT IN ('D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa (etapa: %)',
      COALESCE(_l.cadencia_etapa, 'nenhuma') USING ERRCODE = '22023';
  END IF;

  IF _canal NOT IN ('ligacao','whatsapp') THEN
    RAISE EXCEPTION 'canal inválido: %', _canal USING ERRCODE = '22023';
  END IF;

  IF _canal = 'whatsapp' AND _resultado NOT IN ('enviada','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para WhatsApp', _resultado USING ERRCODE = '22023';
  END IF;
  IF _canal = 'ligacao' AND _resultado NOT IN
     ('nao_atendeu','caixa_postal','ocupado','atendeu','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para ligação', _resultado USING ERRCODE = '22023';
  END IF;

  IF public.telefone_suspeito(_l.telefone) THEN
    RAISE EXCEPTION 'telefone suspeito: contate por e-mail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cadencia_tentativas
    (lead_id, corretor_id, etapa, canal, resultado, template_id, origem, ciclo)
  VALUES
    (_lead_id, _uid, _l.cadencia_etapa, _canal, _resultado, _template_id,
     'crm', _l.cadencia_ciclo)
  RETURNING id INTO _tentativa_id;

  UPDATE public.leads
     SET ultimo_contato = now(),
         ultima_interacao = now()
   WHERE id = _lead_id;

  IF _resultado = 'numero_invalido' THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status                 = 'perdido'::public.lead_status,
           motivo_perda_categoria = 'numero_invalido',
           motivo_perdido         = 'Número inválido registrado na cadência.',
           cadencia_etapa         = 'encerrado',
           cadencia_prazo_ts      = NULL
     WHERE id = _lead_id;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'cadencia_etapa', 'Encerrado por número inválido.', 'cadencia',
            jsonb_build_object('de_estado', _l.cadencia_etapa,
                               'para_estado', 'encerrado',
                               'motivo', 'numero_invalido'));

    RETURN jsonb_build_object(
      'tentativa_id', _tentativa_id, 'etapa', _l.cadencia_etapa,
      'etapa_completa', false, 'etapa_nova', NULL, 'encerrado', true);
  END IF;

  _completa := public.cadencia_etapa_completa(_lead_id, _l.cadencia_etapa);

  IF _completa THEN
    _etapa_nova := public.cadencia_avancar_lead(_lead_id, NULL, NULL, 'escrita');
  END IF;

  RETURN jsonb_build_object(
    'tentativa_id', _tentativa_id,
    'etapa', _l.cadencia_etapa,
    'etapa_completa', _completa,
    'etapa_nova', _etapa_nova,
    'encerrado', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) IS
  'Botões Liguei / Mandar WhatsApp da Fila do Dia. Avança a etapa na hora pela mesma função da varredura. Respeita o modo sombra.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'cadencia-avancar';
    PERFORM cron.schedule('cadencia-avancar', '23 * * * *',
      $cron$SELECT public.cadencia_avancar();$cron$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';