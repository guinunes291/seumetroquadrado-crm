-- ============================================================================
-- REGISTRO MÃE — FATIA B: o cliente que volta por campanha paga
-- ============================================================================
-- Decisão do dono (03/10/2026), "Sempre filho novo pela roleta": toda volta
-- por campanha gera um registro novo para o corretor que a roleta sortear,
-- mesmo que outro esteja atendendo. Desenho: docs/ops/registro-mae.md.
--
-- O defeito que isto fecha: a regra do lead repetido (01/10) chamava duas
-- funções que nunca existiram — buscar_lead_por_telefone_global_incl_perdido
-- e redistribuir_duplicado_campanha. O webhook seguia para o INSERT, batia no
-- índice único de telefone (que vale também para perdidos) e só se recuperava
-- quando o anúncio era do MESMO empreendimento. Cliente que voltava por outro
-- anúncio virava erro 500 no n8n e não entrava no CRM.
--
-- registrar_volta_campanha decide, sob o mesmo cadeado do gatilho de vínculo
-- ('cliente:' || chave), o que fazer com a entrada de uma pessoa:
--
--   cliente_novo         ninguém com esse telefone (fora lixeira/excluídos):
--                        o webhook faz o INSERT de sempre;
--   reenvio              um registro dela entrou pelo webhook há menos de 10
--                        minutos: é a mesma entrada (formulário enviado duas
--                        vezes, retry do Zap) — devolve esse registro;
--   negociacao_avancada  um registro dela está em Visita realizada ou além, ou
--                        com venda viva: não nasce outro (mesma regra do
--                        Buscar oportunidade) — o dono desse registro é avisado;
--   registro_filho       o resto: cria o filho da campanha, já vinculado à mãe,
--                        com os dados dela, e SEM os corretores que já têm um
--                        registro ativo dela — o filho vai para outra pessoa.
--
-- Do que o formulário não trouxe, o filho herda os dados da mãe (decisão 1 da
-- Fatia A), MENOS zona, bairro, empreendimento e construtora: dizem onde o
-- cliente quer comprar, e na volta quem diz isso é o anúncio novo. Herdar a
-- zona antiga faria a roleta seguir o interesse de antes (zona_do_lead olha a
-- zona e o bairro do lead antes do empreendimento) — o contrário do que a
-- regra de 01/10 já queria ("o repetido entra na roleta com o projeto NOVO").
--
-- A roleta ponderada passa a excluir corretores_que_tentaram, como o motor v3
-- e o repasse por SLA já fazem. Só o webhook a chama, sempre com lead recém-
-- criado: para todo lead que não é filho de campanha a lista é vazia e nada
-- muda.
--
-- "Negociação avançada" passa a ter uma fonte só (_cliente_lead_avancado),
-- usada aqui, no Buscar oportunidade e na criação do filho pelo corretor.
--
-- Conserto da Fatia A: a busca por telefone do Buscar oportunidade calculava a
-- chave sobre o texto digitado; o vínculo usa o telefone normalizado (com o 9
-- do celular). Uma fonte só para os dois: cliente_chave_do_telefone.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) A chave da pessoa a partir do telefone DIGITADO
-- ---------------------------------------------------------------------------
-- O gatilho de vínculo e o índice único usam o telefone normalizado
-- (telefone_e164 = normalize_phone_smq(telefone)), que põe o 9 no celular
-- antigo. Sobre o texto cru, "11 8765-4321" dá 187654321 e não acha a pessoa
-- de 987654321. Defeito da Fatia A no Buscar oportunidade (_cliente_achar):
-- o corretor que digitava sem o 9 não achava o cliente.
CREATE OR REPLACE FUNCTION public.cliente_chave_do_telefone(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.cliente_chave_telefone(
    COALESCE(public.normalize_phone_smq(_telefone), _telefone))
$$;

-- Busca da Fatia A (20261010120300), com a chave do telefone normalizado.
CREATE OR REPLACE FUNCTION public._cliente_achar(_telefone text, _email text, _cpf text)
RETURNS TABLE (cliente_id uuid, match_por text)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _chave text := public.cliente_chave_do_telefone(_telefone);
  _mail text := NULLIF(lower(btrim(COALESCE(_email, ''))), '');
  _doc text := NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '');
  _cid uuid;
BEGIN
  IF _chave IS NOT NULL THEN
    SELECT c.id INTO _cid FROM public.clientes AS c WHERE c.chave_telefone = _chave;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'telefone'::text;
      RETURN;
    END IF;
  END IF;
  IF _doc IS NOT NULL AND length(_doc) = 11 THEN
    SELECT l.cliente_id INTO _cid FROM public.leads AS l
     WHERE l.deleted_at IS NULL
       AND regexp_replace(COALESCE(l.cpf, ''), '\D', '', 'g') = _doc
     ORDER BY l.updated_at DESC LIMIT 1;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'cpf'::text;
      RETURN;
    END IF;
  END IF;
  IF _mail IS NOT NULL AND _mail LIKE '%@%' THEN
    SELECT l.cliente_id INTO _cid FROM public.leads AS l
     WHERE l.deleted_at IS NULL AND lower(btrim(l.email)) = _mail
     ORDER BY l.updated_at DESC LIMIT 1;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'email'::text;
      RETURN;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._cliente_achar(text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Negociação avançada: uma fonte só
-- ---------------------------------------------------------------------------
-- O registro da pessoa que está em Visita realizada ou além, ou com venda
-- viva — o que segura a pessoa com um corretor. Com _exceto_corretor, ignora
-- os registros desse corretor (o Buscar oportunidade não bloqueia o próprio
-- dono). Havendo mais de um (conflito), o mais adiantado.
CREATE OR REPLACE FUNCTION public._cliente_lead_avancado(
  _cliente_id uuid,
  _exceto_corretor uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT l.id
    FROM public.leads AS l
   WHERE l.cliente_id = _cliente_id
     AND (_exceto_corretor IS NULL OR l.corretor_id IS DISTINCT FROM _exceto_corretor)
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND (l.status::text IN ('visita_realizada', 'proposta_enviada', 'analise_credito',
                             'contrato_fechado', 'pos_venda')
          OR public._lead_venda_viva(l.id))
   ORDER BY public._lead_venda_viva(l.id) DESC,
            array_position(ARRAY['pos_venda', 'contrato_fechado', 'analise_credito',
                                 'proposta_enviada', 'visita_realizada'],
                           l.status::text) NULLS LAST,
            l.updated_at DESC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public._cliente_lead_avancado(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Buscar oportunidade (20261010120300), com o bloqueio pela fonte única.
CREATE OR REPLACE FUNCTION public.buscar_oportunidade(
  _telefone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _cpf text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  _match text;
  _c public.clientes%ROWTYPE;
  _meu uuid;
  _bloqueado boolean;
  _outra boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_uid, 'corretor'::public.app_role) THEN
    RAISE EXCEPTION 'buscar oportunidade é do corretor' USING ERRCODE = '42501';
  END IF;

  SELECT a.cliente_id, a.match_por INTO _cid, _match
  FROM public._cliente_achar(_telefone, _email, _cpf) AS a;
  IF _cid IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;
  SELECT * INTO _c FROM public.clientes WHERE id = _cid;

  SELECT l.id INTO _meu FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.corretor_id = _uid
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido'
   ORDER BY l.updated_at DESC LIMIT 1;

  _bloqueado := public._cliente_lead_avancado(_cid, _uid) IS NOT NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cid AND l.corretor_id IS NOT NULL AND l.corretor_id <> _uid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND l.status::text <> 'perdido'
  ) INTO _outra;

  RETURN jsonb_build_object(
    'encontrado', true,
    'cliente_id', _cid,
    'match_por', _match,
    'nome', _c.nome,
    'ja_na_carteira', _meu IS NOT NULL,
    'meu_lead_id', _meu,
    'bloqueado', _bloqueado AND _meu IS NULL,
    'motivo_bloqueio', CASE WHEN _bloqueado AND _meu IS NULL THEN 'negociacao_avancada' END,
    'em_outra_carteira', _outra,
    'campos_herdados', COALESCE((
      SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_c.dados) AS k
       WHERE k <> ALL (ARRAY['nome', 'email', 'cpf'])
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_oportunidade(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_oportunidade(text, text, text) TO authenticated, service_role;

-- Criação do filho pelo corretor (20261010120300), com o bloqueio pela fonte
-- única.
CREATE OR REPLACE FUNCTION public.criar_registro_filho(
  _cliente_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.clientes%ROWTYPE;
  _vals jsonb;
  _r public.leads;
  _meu uuid;
  _adicional boolean;
  _origem public.lead_origem;
  _novo uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_uid, 'corretor'::public.app_role) THEN
    RAISE EXCEPTION 'registro filho é do corretor' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _c FROM public.clientes WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente não encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Dois cliques, duas abas: um registro só.
  PERFORM pg_advisory_xact_lock(hashtext('cliente_filho:' || _cliente_id::text));

  SELECT l.id INTO _meu FROM public.leads AS l
   WHERE l.cliente_id = _cliente_id AND l.corretor_id = _uid
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido'
   ORDER BY l.updated_at DESC LIMIT 1;
  IF _meu IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lead_id', _meu, 'ja_existia', true);
  END IF;

  IF public._cliente_lead_avancado(_cliente_id, _uid) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'negociacao_avancada');
  END IF;

  _adicional := EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cliente_id
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
  );

  SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _vals
  FROM jsonb_each(_c.dados) AS e
  WHERE e.key = ANY (public._cliente_campos());
  _r := jsonb_populate_record(NULL::public.leads, _vals);

  _origem := COALESCE(NULLIF(_payload ->> 'origem', '')::public.lead_origem,
                      'captacao_corretor'::public.lead_origem);

  INSERT INTO public.leads (
    cliente_id, registro_adicional, corretor_id, status, origem,
    nome, telefone, email, cpf,
    projeto_id, projeto_nome, observacoes,
    renda_informada, renda_estimada, tipo_renda, faixa_mcmv,
    usa_fgts, tem_fgts, fgts_valor, entrada_disponivel, decisor,
    zona, bairro, dorms_desejados, precisa_vaga, prioridades,
    objecoes, resumo_qualificacao, construtora, consentimento_lgpd,
    opt_out
  ) VALUES (
    _cliente_id, _adicional, _uid, 'aguardando_atendimento'::public.lead_status, _origem,
    COALESCE(_r.nome, _c.nome, 'Cliente'), COALESCE(_c.telefone, _c.telefone_e164, ''),
    COALESCE(_r.email, _c.email), COALESCE(_r.cpf, _c.cpf),
    NULLIF(_payload ->> 'projeto_id', '')::uuid,
    COALESCE(NULLIF(btrim(_payload ->> 'projeto_nome'), ''), _r.projeto_nome),
    NULLIF(btrim(_payload ->> 'observacoes'), ''),
    _r.renda_informada, _r.renda_estimada, _r.tipo_renda, _r.faixa_mcmv,
    COALESCE(_r.usa_fgts, false), _r.tem_fgts, _r.fgts_valor, _r.entrada_disponivel, _r.decisor,
    _r.zona, _r.bairro, _r.dorms_desejados, _r.precisa_vaga, COALESCE(_r.prioridades, '{}'),
    COALESCE(_r.objecoes, '{}'), _r.resumo_qualificacao, _r.construtora, _r.consentimento_lgpd,
    _c.opt_out
  )
  RETURNING id INTO _novo;

  INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, autor_id, campo, valor_novo)
  VALUES (_cliente_id, _novo, _uid, _uid, '_registro_filho',
          jsonb_build_object('adicional', _adicional, 'campos_herdados',
                             (SELECT count(*) FROM jsonb_object_keys(_vals))));

  RETURN jsonb_build_object('ok', true, 'lead_id', _novo, 'ja_existia', false,
                            'adicional', _adicional);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_registro_filho(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_registro_filho(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Roleta ponderada: quem já tem a pessoa não é sorteado
-- ---------------------------------------------------------------------------
-- Corpo de 20261009120100 (zona estrita), com duas linhas a mais:
-- corretores_que_tentaram no SELECT do lead e o NOT ANY na elegibilidade. Os
-- caminhos de zona delegam ao motor v3, que já exclui a lista.
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int; _zslug text;
  _estrita boolean := public._zona_estrita();
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  SELECT id, corretor_id, status, corretores_que_tentaram INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  _zona := public.zona_do_lead(_lead_id);

  IF _estrita AND _zona IS NOT NULL THEN
    -- [ZONA] Campanha comum: a distribuição é do time da zona; a campanha
    -- vira rótulo no contexto.
    IF NOT _roleta.equipe_fixa THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  ELSIF NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): zona primeiro só se a
    -- roleta da zona estiver pronta.
    _zslug := public.roleta_da_zona(_zona);
    IF _zslug IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _dlp_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _dlp_elegiveis;

  INSERT INTO _dlp_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    -- Registro mãe (20261010120400): quem já tem um registro ativo da pessoa
    -- não recebe outro — o filho da campanha vai para outro corretor.
    AND NOT (rp.corretor_id = ANY (COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  IF _estrita THEN
    -- [ZONA] Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _dlp_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior: filtro por profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _dlp_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _dlp_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _dlp_elegiveis;
  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    IF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da equipe fixa apto na zona do lead: time da zona.
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_equipe_fixa_sem_zona',
        jsonb_build_object('campanha', _roleta_slug, 'equipe_fixa', true,
                           'equipe_sem_apto_na_zona', true), true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_disponivel');
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'aguardando_atendimento'::public.lead_status
           ELSE status
         END,
         data_distribuicao = COALESCE(data_distribuicao, now())
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;

  INSERT INTO public.distribution_log(
    lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado
  )
  VALUES (
    _lead_id, _picked, 'automatica', 'roleta_ponderada',
    _roleta.slug, 'roleta:'||_roleta.slug||':tier'||_tier_picked, 'sucesso'
  );

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked,
    'tier', _tier_picked, 'roleta_slug', _roleta.slug,
    'zona', _zona
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) A volta pela campanha
-- ---------------------------------------------------------------------------
-- _lead: o mesmo objeto que o webhook insere em leads. Chaves de controle
-- (dono, vínculo, estado, lixeira) são descartadas: quem decide é esta função.
CREATE OR REPLACE FUNCTION public.registrar_volta_campanha(_lead jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
    RETURN jsonb_build_object('acao', 'reenvio', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l WHERE l.id = _id));
  END IF;

  _id := public._cliente_lead_avancado(_cid);
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('acao', 'negociacao_avancada', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l WHERE l.id = _id));
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
$$;

REVOKE ALL ON FUNCTION public.registrar_volta_campanha(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_volta_campanha(jsonb) TO service_role;
