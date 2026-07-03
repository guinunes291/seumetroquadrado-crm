
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

  -- Deduplica e remove nulos
  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::uuid[])
    INTO _ids
  FROM unnest(_corretor_ids) c
  WHERE c IS NOT NULL;

  _n := COALESCE(array_length(_ids, 1), 0);
  IF _n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um corretor' USING ERRCODE = '22023';
  END IF;

  -- Caso simples: 1 corretor → só atualiza o dono da lista
  IF _n = 1 THEN
    UPDATE public.ofertas_ativas
       SET corretor_id = _ids[1], updated_at = now()
     WHERE id = _oferta_id;
    RETURN jsonb_build_object('modo', 'single', 'oferta_id', _oferta_id);
  END IF;

  -- Split: coleta e embaralha os vínculos da lista original
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
    SELECT _new_id, lid, public.isleadavancado_status(l.status)
      FROM unnest(_lead_ids[_slice_from:_slice_to]) AS lid
      LEFT JOIN public.leads l ON l.id = lid;

    _created := _created || _new_id;
    _slice_from := _slice_to + 1;
  END LOOP;

  -- Arquiva a original para evitar dupla contagem
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

-- Helper: computa "avançado" a partir do status, espelhando AVANCADO_STATUSES do TS.
-- Idempotente — se já existir com outra assinatura, recria.
CREATE OR REPLACE FUNCTION public.isleadavancado_status(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_status, '') IN (
    'agendado','qualificado','visita_realizada','proposta_enviada',
    'analise_credito','contrato_fechado','pos_venda'
  );
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_oferta_ativa(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.isleadavancado_status(text) TO authenticated;
