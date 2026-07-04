CREATE OR REPLACE FUNCTION public.atribuir_oferta_ativa(
  _oferta_id uuid,
  _corretor_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _oferta record;
  _n int;
  _ids uuid[];
  _lead_ids uuid[];
  _total int;
  _base int;
  _resto int;
  _new_id uuid;
  _slice_from int;
  _slice_to int;
  _size int;
  _i int;
  _cid uuid;
  _slice uuid[];
  _created uuid[] := ARRAY[]::uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin ou gestor podem atribuir listas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _oferta FROM public.ofertas_ativas WHERE id = _oferta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::uuid[])
    INTO _ids
  FROM unnest(_corretor_ids) c
  WHERE c IS NOT NULL;

  _n := COALESCE(array_length(_ids, 1), 0);
  IF _n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um corretor' USING ERRCODE = '22023';
  END IF;

  -- Caso simples: 1 corretor → atualiza dono da lista e reseta leads
  IF _n = 1 THEN
    UPDATE public.ofertas_ativas
       SET corretor_id = _ids[1], updated_at = now()
     WHERE id = _oferta_id;

    UPDATE public.leads l
       SET corretor_id = _ids[1],
           status = 'aguardando_atendimento'::public.lead_status,
           updated_at = now()
      FROM public.oferta_ativa_leads oal
     WHERE oal.oferta_id = _oferta_id
       AND l.id = oal.lead_id;

    UPDATE public.oferta_ativa_leads
       SET avancado = false
     WHERE oferta_id = _oferta_id;

    RETURN jsonb_build_object('modo', 'single', 'oferta_id', _oferta_id);
  END IF;

  -- Split: embaralha os vínculos
  SELECT COALESCE(array_agg(lead_id ORDER BY random()), ARRAY[]::uuid[])
    INTO _lead_ids
  FROM public.oferta_ativa_leads
  WHERE oferta_id = _oferta_id;

  _total := COALESCE(array_length(_lead_ids, 1), 0);
  IF _total = 0 THEN
    RAISE EXCEPTION 'A lista não tem leads para dividir' USING ERRCODE = '22023';
  END IF;

  _base := _total / _n;
  _resto := _total % _n;
  _slice_from := 1;

  FOR _i IN 1.._n LOOP
    _cid := _ids[_i];
    _size := _base + CASE WHEN _i <= _resto THEN 1 ELSE 0 END;
    IF _size = 0 THEN
      CONTINUE;
    END IF;
    _slice_to := _slice_from + _size - 1;
    _slice := _lead_ids[_slice_from:_slice_to];

    INSERT INTO public.ofertas_ativas (nome, descricao, status, criado_por, corretor_id, filtros)
    VALUES (
      left(_oferta.nome || ' — parte ' || _i::text || '/' || _n::text, 200),
      _oferta.descricao,
      'ativa',
      _uid,
      _cid,
      _oferta.filtros
    )
    RETURNING id INTO _new_id;

    INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
    SELECT _new_id, lid, false
      FROM unnest(_slice) AS lid;

    -- Reseta status e responsável dos leads desta fatia
    UPDATE public.leads
       SET corretor_id = _cid,
           status = 'aguardando_atendimento'::public.lead_status,
           updated_at = now()
     WHERE id = ANY(_slice);

    _created := _created || _new_id;
    _slice_from := _slice_to + 1;
  END LOOP;

  UPDATE public.ofertas_ativas
     SET status = 'arquivada', updated_at = now()
   WHERE id = _oferta_id;

  RETURN jsonb_build_object(
    'modo', 'split',
    'original_id', _oferta_id,
    'criadas', to_jsonb(_created),
    'total_leads', _total
  );
END;
$$;