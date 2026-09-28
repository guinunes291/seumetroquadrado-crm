ALTER TABLE public.cadencia_config ADD COLUMN IF NOT EXISTS portas_legadas_bolsao boolean NOT NULL DEFAULT false;

CREATE TABLE public.prospeccao_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES public.profiles(id),
  zona text NOT NULL,
  solicitados integer NOT NULL DEFAULT 30,
  entregues integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prospeccao_lotes TO authenticated;
GRANT ALL ON public.prospeccao_lotes TO service_role;
ALTER TABLE public.prospeccao_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lotes: dono ou gestao le" ON public.prospeccao_lotes FOR SELECT TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
         OR public.has_role(auth.uid(),'superintendente'));
CREATE INDEX prospeccao_lotes_corretor_idx ON public.prospeccao_lotes(corretor_id, created_at DESC);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS prospeccao_lote_id uuid REFERENCES public.prospeccao_lotes(id);
CREATE INDEX IF NOT EXISTS leads_prospeccao_lote_idx ON public.leads(prospeccao_lote_id) WHERE prospeccao_lote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prospeccao_lote_status_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE
  _me uuid := auth.uid();
  _lote public.prospeccao_lotes%ROWTYPE;
  _teto int := COALESCE((public.carteira_ativa_config()->>'teto')::int, 65);
  _vagas int;
  _em int := 0; _ficaram int := 0; _sairam int := 0;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _vagas := public.carteira_vagas_v1(_me);
  SELECT * INTO _lote FROM public.prospeccao_lotes WHERE corretor_id = _me ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT count(*) FILTER (WHERE l.corretor_id = _me AND l.cadencia_etapa IN ('D0','D1','D2','D3')),
           count(*) FILTER (WHERE l.corretor_id = _me AND (l.cadencia_etapa IS NULL OR l.cadencia_etapa NOT IN ('D0','D1','D2','D3'))),
           count(*) FILTER (WHERE l.corretor_id IS DISTINCT FROM _me)
      INTO _em, _ficaram, _sairam
    FROM public.leads l WHERE l.prospeccao_lote_id = _lote.id AND l.deleted_at IS NULL;
  END IF;
  RETURN jsonb_build_object(
    'lote_id', _lote.id, 'zona', _lote.zona, 'criado_em', _lote.created_at,
    'entregues', COALESCE(_lote.entregues,0),
    'em_cadencia', _em, 'ficaram', _ficaram, 'sairam', _sairam,
    'vagas', _vagas, 'teto', _teto,
    'pode_pedir', public.has_role(_me,'corretor') AND _em = 0 AND _vagas > 0,
    'motivo', CASE WHEN NOT public.has_role(_me,'corretor') THEN 'so_corretor'
                   WHEN _em > 0 THEN 'lote_em_andamento'
                   WHEN _vagas <= 0 THEN 'carteira_cheia' END);
END $$;
GRANT EXECUTE ON FUNCTION public.prospeccao_lote_status_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.prospeccao_pedir_lote(_zona text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE
  _me uuid := auth.uid();
  _st jsonb;
  _lote uuid;
  _n int := 0;
  _l record;
  _limite int;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.is_active_member(_me) OR NOT public.has_role(_me,'corretor') THEN
    RAISE EXCEPTION 'apenas corretor ativo pede lote' USING ERRCODE='42501';
  END IF;
  IF _zona NOT IN ('Leste','Oeste','Norte','Sul','Centro') THEN
    RAISE EXCEPTION 'zona invalida' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('prospeccao_lote:'||_me::text));
  _st := public.prospeccao_lote_status_v1();
  IF NOT (_st->>'pode_pedir')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _st->>'motivo');
  END IF;
  _limite := LEAST(30, (_st->>'vagas')::int);

  INSERT INTO public.prospeccao_lotes(corretor_id, zona, solicitados) VALUES (_me, _zona, 30) RETURNING id INTO _lote;

  FOR _l IN
    SELECT l.id, l.status FROM public.leads l
    LEFT JOIN public.projetos p ON p.id = l.projeto_id
    WHERE public._bolsao_elegivel(l)
      AND l.sdr_id IS NULL
      AND COALESCE(l.cadencia_etapa::text,'') NOT IN ('D0','D1','D2','D3','descanso')
      AND l.status NOT IN ('agendado','visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda','perdido')
      AND COALESCE(l.zona, p.zona_smq::text) = _zona
    ORDER BY COALESCE(l.ultima_interacao, l.created_at) ASC NULLS FIRST, l.id
    LIMIT _limite
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE public.leads SET corretor_id = _me, data_distribuicao = now(), timestamp_recebimento = now(),
           tentativas_redistribuicao = 0, prospeccao_lote_id = _lote,
           corretores_que_tentaram = CASE WHEN _me = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN corretores_que_tentaram ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _me) END
     WHERE id = _l.id;
    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
    VALUES (_l.id, _me, 'manual', 'Lote de prospecção ('||_zona||')', 'lote_prospeccao', 'sucesso');
    IF _l.status IN ('novo','aguardando_corretor') THEN
      PERFORM public.transicionar_lead(_l.id, 'aguardando_atendimento'::public.lead_status, 'Lote de prospecção');
    END IF;
    PERFORM public.cadencia_iniciar(_l.id);
    _n := _n + 1;
  END LOOP;

  UPDATE public.prospeccao_lotes SET entregues = _n WHERE id = _lote;
  IF _n = 0 THEN
    DELETE FROM public.prospeccao_lotes WHERE id = _lote;
    RETURN jsonb_build_object('ok', false, 'motivo', 'zona_vazia');
  END IF;
  RETURN jsonb_build_object('ok', true, 'lote_id', _lote, 'entregues', _n, 'zona', _zona);
END $$;
GRANT EXECUTE ON FUNCTION public.prospeccao_pedir_lote(text) TO authenticated;

-- Portas legadas: resgate da Reserva fechado para corretor
CREATE OR REPLACE FUNCTION public.carteira_resgatar(_lead uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _dono uuid; _vagas integer; _cap integer; _usados integer;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.is_active_member(_caller) THEN RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501'; END IF;
  IF NOT COALESCE((SELECT portas_legadas_bolsao FROM public.cadencia_config WHERE id=1), false)
     AND NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porta_fechada_use_lote');
  END IF;
  SELECT l.corretor_id INTO _dono FROM public.leads AS l
  WHERE l.id = _lead AND l.deleted_at IS NULL AND l.na_lixeira = false;
  IF _dono IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_dono_ou_inexistente'); END IF;
  IF _dono <> _caller THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  _cap := COALESCE((public.carteira_ativa_config() ->> 'cap_resgate')::int, 13);
  SELECT count(*)::int INTO _usados FROM public.carteira_resgates AS r WHERE r.corretor_id = _caller;
  IF _usados >= _cap AND NOT EXISTS (SELECT 1 FROM public.carteira_resgates AS r WHERE r.corretor_id = _caller AND r.lead_id = _lead) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cap_resgate_atingido', 'cap', _cap);
  END IF;
  _vagas := public.carteira_vagas_v1(_caller);
  INSERT INTO public.carteira_resgates (corretor_id, lead_id) VALUES (_caller, _lead) ON CONFLICT (corretor_id, lead_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'lead_id', _lead, 'vagas_antes', _vagas, 'vagas_agora', public.carteira_vagas_v1(_caller));
END;
$function$;

-- Portas legadas: Discador não passa mais o cliente do Bolsão ao corretor
CREATE OR REPLACE FUNCTION public.discador_bolsao_assumir_v1(_lead uuid, _corretor uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _l record;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((SELECT portas_legadas_bolsao FROM public.cadencia_config WHERE id=1), false)
     AND NOT (public.has_role(_corretor,'admin') OR public.has_role(_corretor,'gestor') OR public.has_role(_corretor,'superintendente')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porta_fechada_use_lote');
  END IF;
  SELECT l.id, l.corretor_id, l.status, l.sdr_id, l.deleted_at, l.na_lixeira, l.corretores_que_tentaram
    INTO _l FROM public.leads AS l WHERE l.id = _lead FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente'); END IF;
  IF _l.deleted_at IS NOT NULL OR _l.na_lixeira THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_da_base'); END IF;
  IF _l.corretor_id = _corretor THEN RETURN jsonb_build_object('ok', true, 'motivo', 'ja_e_seu'); END IF;
  IF _l.corretor_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'tem_dono'); END IF;
  IF _l.sdr_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'em_triagem_sdr'); END IF;
  IF public._lead_venda_viva(_lead) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'venda_viva'); END IF;
  UPDATE public.leads
     SET corretor_id = _corretor, data_distribuicao = now(), timestamp_recebimento = now(),
         tentativas_redistribuicao = 0, via_webhook = false,
         corretores_que_tentaram = CASE
           WHEN _corretor = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[])) THEN _l.corretores_que_tentaram
           ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor) END
   WHERE id = _lead;
  UPDATE public.bolsao_discagem AS d SET assumido_em = now() WHERE d.lead_id = _lead;
  UPDATE public.discador_atendimentos AS a
     SET encerrado_em = now(),
         encerrado_motivo = CASE WHEN a.corretor_id = _corretor THEN 'posse_propria' ELSE 'posse_outro' END
   WHERE a.lead_id = _lead AND a.encerrado_em IS NULL;
  INSERT INTO public.distribution_log (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
  VALUES (_lead, _corretor, 'automatica'::public.distribuicao_tipo,
     COALESCE(NULLIF(btrim(_motivo), ''), 'Discador: avançou de fase'), 'discador_bolsao', 'sucesso');
  IF _l.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
    PERFORM public.transicionar_lead(_lead, 'aguardando_atendimento'::public.lead_status, 'Assumido pelo discador (Bolsão)');
  END IF;
  RETURN jsonb_build_object('ok', true, 'motivo', 'assumido', 'status_anterior', _l.status);
END;
$function$;