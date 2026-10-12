-- =============================================================================
-- Cliente que volta nunca é devolvido a corretor inativo ou bloqueado
-- =============================================================================
-- Caso (12/10/2026): a Lucimar, lead de agosto em "análise de crédito" na
-- carteira da Amanda Dias, foi reativada pelo Marquinhos e, no handoff, o
-- webhook de lead respondeu "negociacao_avancada" com a Amanda como corretora.
-- O Marcão mandou o dossiê para o WhatsApp dela. A Amanda está com a conta
-- BLOQUEADA desde 08/10: o cliente quente ficaria sem atendimento.
--
-- A regra de 03/10 (registro mãe, Fatia B: "negociação em Visita realizada ou
-- além fica com o dono") nunca olhou se o dono ainda está ativo. Na data desta
-- migration, 66 leads abertos estavam em carteiras de 5 contas bloqueadas.
--
-- O que muda:
--   - _dono_ativo(corretor): perfil ativo E conta 'ativa'.
--   - _reatribuir_se_dono_inativo(lead): dono ativo, nada muda. Dono inativo:
--     a roleta da região (redistribuição, sem o dono antigo); sem ninguém
--     apto, o fallback por velocidade (ativo no CRM nos últimos 30 min, o
--     mais rápido); sem ninguém ativo, o lead fica onde está e a resposta
--     sai SEM corretor: o Marquinhos segue com o cliente (decisão do dono de
--     12/10: "sempre que faltarem corretores, os leads vão para o Marquinhos").
--   - registrar_volta_campanha: "reenvio" e "negociacao_avancada" passam pela
--     reatribuição e nunca devolvem dono inativo.
--   - _fallback_velocidade aceita lead com dono inativo (antes, só sem dono).
-- =============================================================================

CREATE OR REPLACE FUNCTION public._dono_ativo(_corretor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _corretor AND p.ativo AND p.status_conta::text = 'ativa');
$function$;

CREATE OR REPLACE FUNCTION public._reatribuir_se_dono_inativo(_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _dono uuid;
  _res jsonb;
BEGIN
  SELECT l.corretor_id INTO _dono FROM public.leads l WHERE l.id = _lead_id;
  IF _dono IS NULL OR public._dono_ativo(_dono) THEN
    RETURN jsonb_build_object('ok', true, 'mudou', false, 'corretor_id', _dono);
  END IF;

  -- 1) A roleta da região, como redistribuição (nunca devolve ao mesmo).
  _res := public._distribuir_lead_v3(
    _lead_id, 'redistribuicao'::public.distribuicao_tipo, NULL, NULL, NULL, 'dono_inativo',
    jsonb_build_object('dono_inativo', _dono), false);
  IF COALESCE((_res->>'ok')::boolean, false) THEN
    RETURN _res || jsonb_build_object('mudou', true, 'via', 'roleta', 'dono_anterior', _dono);
  END IF;

  -- 2) Ninguém apto: o mais rápido ativo no CRM.
  _res := public._fallback_velocidade(_lead_id);
  IF COALESCE((_res->>'ok')::boolean, false) THEN
    RETURN _res || jsonb_build_object('mudou', true, 'via', 'fallback_velocidade', 'dono_anterior', _dono);
  END IF;

  -- 3) Ninguém: fica com o Marquinhos (quem chama não devolve o dono inativo).
  RETURN jsonb_build_object('ok', false, 'mudou', false, 'motivo', 'sem_corretor_ativo',
                            'dono_anterior', _dono);
END;
$function$;

REVOKE ALL ON FUNCTION public._dono_ativo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reatribuir_se_dono_inativo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dono_ativo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._reatribuir_se_dono_inativo(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Fallback por velocidade: também para lead com dono inativo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fallback_velocidade(_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _res jsonb;
  _log uuid;
BEGIN
  IF NOT COALESCE((public.get_dist_setting('fallback_velocidade_ativo') #>> '{}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fallback_desligado');
  END IF;

  -- Só lead quente, sem dono ou com dono inativo/bloqueado (12/10/2026).
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id
                    AND (l.corretor_id IS NULL OR NOT public._dono_ativo(l.corretor_id))
                    AND l.sdr_id IS NULL
                    AND l.deleted_at IS NULL AND NOT l.na_lixeira
                    AND COALESCE(l.classe_lead, 'quente') <> 'base') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_do_escopo');
  END IF;

  SELECT * INTO _c FROM public.fallback_velocidade_ranking(_lead_id) LIMIT 1;
  IF _c.corretor_id IS NULL THEN
    -- Ninguém ativo: o lead fica com o Marquinhos.
    RETURN jsonb_build_object('ok', false, 'motivo', 'ninguem_ativo_no_crm');
  END IF;

  _res := public._distribuir_lead_v3(
    _lead_id, 'automatica'::public.distribuicao_tipo, NULL, _c.corretor_id, NULL, 'fallback_velocidade',
    jsonb_build_object(
      'forcar_fora_da_zona', 'true',
      'motivo_fora_da_zona', 'Fallback por velocidade: ninguém apto na roleta',
      'fallback_velocidade', jsonb_build_object(
        'score', _c.score, 'pct_15min', _c.pct_15min,
        'min_desde_ultima_acao', _c.min_desde_ultima_acao, 'roleta_ok', _c.roleta_ok)),
    false);

  IF (_res->>'ok')::boolean THEN
    SELECT id INTO _log FROM public.distribution_log
     WHERE lead_id = _lead_id AND corretor_id = _c.corretor_id AND resultado = 'sucesso'
     ORDER BY created_at DESC LIMIT 1;
    UPDATE public.distribution_log
       SET regra_aplicada = 'fallback_velocidade',
           motivo = 'Fallback por velocidade: ninguém apto na roleta; foi para o mais rápido ativo no CRM ('
                    || _c.nome || ', ' || _c.pct_15min || '% contatados em até 15 min, última ação há '
                    || _c.min_desde_ultima_acao || ' min)'
     WHERE id = _log;
  END IF;
  RETURN _res || jsonb_build_object('fallback', 'velocidade', 'score', _c.score);
END;
$function$;

-- -----------------------------------------------------------------------------
-- Volta pela campanha: dono inativo nunca é devolvido
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_volta_campanha(_lead jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _chave text := public.cliente_chave_do_telefone(_lead ->> 'telefone');
  _cid uuid;
  _id uuid;
  _tem boolean;
  _form jsonb;
  _herdados jsonb;
  _tentaram uuid[];
  _r jsonb;
  _cols text;
  _desconhecidas text;
BEGIN
  IF _lead IS NULL OR jsonb_typeof(_lead) <> 'object' THEN
    RAISE EXCEPTION 'registrar_volta_campanha: _lead precisa ser um objeto' USING ERRCODE = '22023';
  END IF;
  -- Telefone que não identifica ninguém: lead novo, como sempre foi.
  IF _chave IS NULL THEN
    RETURN jsonb_build_object('acao', 'cliente_novo');
  END IF;

  -- O mesmo cadeado do gatilho de vínculo: duas entradas da mesma pessoa ao
  -- mesmo tempo passam uma de cada vez, e a segunda já vê a primeira.
  PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));

  SELECT c.id INTO _cid FROM public.clientes AS c WHERE c.chave_telefone = _chave;
  _tem := _cid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
  );
  IF NOT _tem THEN
    RETURN jsonb_build_object('acao', 'cliente_novo');
  END IF;

  -- Reenvio: a mesma entrada chegando de novo.
  SELECT l.id INTO _id FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.via_webhook
     AND l.created_at >= now() - interval '10 minutes'
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
   ORDER BY l.created_at DESC LIMIT 1;
  IF _id IS NOT NULL THEN
    -- [DONO INATIVO 12/10/2026] Dono bloqueado/inativo nunca é devolvido.
    PERFORM public._reatribuir_se_dono_inativo(_id);
    RETURN jsonb_build_object('acao', 'reenvio', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l
                       WHERE l.id = _id AND public._dono_ativo(l.corretor_id)));
  END IF;

  _id := public._cliente_lead_avancado(_cid);
  IF _id IS NOT NULL THEN
    -- [DONO INATIVO 12/10/2026] "Fica com o dono" só vale para dono ativo.
    PERFORM public._reatribuir_se_dono_inativo(_id);
    RETURN jsonb_build_object('acao', 'negociacao_avancada', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l
                       WHERE l.id = _id AND public._dono_ativo(l.corretor_id)));
  END IF;

  -- O filho da campanha.
  _form := jsonb_strip_nulls(_lead - ARRAY[
    'id', 'cliente_id', 'registro_adicional', 'corretor_id', 'corretores_que_tentaram',
    'status', 'deleted_at', 'na_lixeira', 'created_at', 'updated_at', 'opt_out']);

  SELECT string_agg(k, ', ' ORDER BY k) INTO _desconhecidas
    FROM jsonb_object_keys(_form) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute AS a
      WHERE a.attrelid = 'public.leads'::regclass AND a.attname = k
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '');
  IF _desconhecidas IS NOT NULL THEN
    RAISE EXCEPTION 'registrar_volta_campanha: campos que leads não tem: %', _desconhecidas
      USING ERRCODE = '22023';
  END IF;

  -- Da mãe, o que o formulário não trouxe; o lugar de interesse vem do anúncio.
  SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _herdados
    FROM public.clientes AS c, jsonb_each(c.dados) AS e
   WHERE c.id = _cid
     AND e.key = ANY (public._cliente_campos())
     AND e.key <> ALL (ARRAY['zona', 'bairro', 'projeto_nome', 'construtora'])
     AND NOT (_form ? e.key);

  SELECT COALESCE(array_agg(DISTINCT l.corretor_id), ARRAY[]::uuid[]) INTO _tentaram
    FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.corretor_id IS NOT NULL
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido';

  _r := _herdados || _form || jsonb_build_object(
    'cliente_id', _cid,
    'registro_adicional', true,
    'corretores_que_tentaram', to_jsonb(_tentaram));

  SELECT string_agg(quote_ident(k), ', ' ORDER BY k) INTO _cols FROM jsonb_object_keys(_r) AS k;
  EXECUTE format(
    'INSERT INTO public.leads (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.leads, $1) RETURNING id',
    _cols)
    USING _r INTO _id;

  INSERT INTO public.cliente_eventos (cliente_id, lead_id, campo, valor_novo)
  VALUES (_cid, _id, '_registro_filho', jsonb_build_object(
    'adicional', true, 'porta', 'campanha',
    'campos_herdados', (SELECT count(*) FROM jsonb_object_keys(_herdados)),
    'corretores_excluidos', cardinality(_tentaram)));

  RETURN jsonb_build_object(
    'acao', 'registro_filho', 'lead_id', _id, 'cliente_id', _cid,
    'campos_herdados', COALESCE(
      (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_herdados) AS k), '[]'::jsonb),
    'corretores_excluidos', cardinality(_tentaram));
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_volta_campanha(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_volta_campanha(jsonb) TO service_role;
