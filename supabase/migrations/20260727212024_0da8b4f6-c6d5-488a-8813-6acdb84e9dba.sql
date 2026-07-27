CREATE OR REPLACE FUNCTION public.atribuir_oferta_ativa_lote(
  _oferta_id uuid,
  _corretor_ids uuid[],
  _batch_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _oferta record;
  _n integer;
  _ids uuid[];
  _total integer := 0;
  _processed integer := 0;
  _batch_count integer := 0;
  _remaining integer := 0;
  _limit integer := greatest(1, least(coalesce(_batch_size, 50), 100));
  _new_id uuid;
  _created uuid[] := ARRAY[]::uuid[];
  _i integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  IF NOT (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin ou gestor podem atribuir listas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _oferta
  FROM public.ofertas_ativas
  WHERE id = _oferta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(c ORDER BY primeira_ordem), ARRAY[]::uuid[])
    INTO _ids
  FROM (
    SELECT c, min(ordem) AS primeira_ordem
    FROM unnest(_corretor_ids) WITH ORDINALITY AS u(c, ordem)
    WHERE c IS NOT NULL
    GROUP BY c
  ) dedup;

  _n := COALESCE(array_length(_ids, 1), 0);
  IF _n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um corretor' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _total
  FROM public.oferta_ativa_leads
  WHERE oferta_id = _oferta_id;

  IF _total = 0 THEN
    RAISE EXCEPTION 'A lista não tem leads para dividir' USING ERRCODE = '22023';
  END IF;

  -- Entrega de lista é uma fronteira autorizada de mudança de etapa
  -- (admin/gestor já validados acima): libera a trava de status_via_rpc
  -- apenas dentro desta transação.
  PERFORM set_config('app.transicionar_lead', 'on', true);

  IF _n = 1 THEN
    UPDATE public.ofertas_ativas
       SET corretor_id = _ids[1], updated_at = now()
     WHERE id = _oferta_id;

    WITH pending AS (
      SELECT oal.lead_id
      FROM public.oferta_ativa_leads oal
      JOIN public.leads l ON l.id = oal.lead_id
      WHERE oal.oferta_id = _oferta_id
        AND (
          l.corretor_id IS DISTINCT FROM _ids[1]
          OR l.status IS DISTINCT FROM 'aguardando_atendimento'::public.lead_status
          OR l.via_webhook IS DISTINCT FROM false
        )
      ORDER BY oal.created_at, oal.id
      LIMIT _limit
    ), locked AS (
      SELECT p.lead_id
      FROM pending p
      JOIN public.leads l ON l.id = p.lead_id
      ORDER BY l.id
      FOR UPDATE OF l
    ), updated AS (
      UPDATE public.leads l
         SET corretor_id = _ids[1],
             status = 'aguardando_atendimento'::public.lead_status,
             via_webhook = false,
             data_distribuicao = now(),
             updated_at = now()
        FROM locked
       WHERE l.id = locked.lead_id
       RETURNING l.id
    )
    SELECT count(*) INTO _batch_count FROM updated;

    UPDATE public.oferta_ativa_leads oal
       SET avancado = false
     WHERE oal.oferta_id = _oferta_id
       AND EXISTS (
         SELECT 1
         FROM public.leads l
         WHERE l.id = oal.lead_id
           AND l.corretor_id = _ids[1]
           AND l.status = 'aguardando_atendimento'::public.lead_status
           AND l.via_webhook IS false
       );

    SELECT count(*) INTO _processed
    FROM public.oferta_ativa_leads oal
    JOIN public.leads l ON l.id = oal.lead_id
    WHERE oal.oferta_id = _oferta_id
      AND l.corretor_id = _ids[1]
      AND l.status = 'aguardando_atendimento'::public.lead_status
      AND l.via_webhook IS false;

    _remaining := greatest(_total - _processed, 0);

    PERFORM set_config('app.transicionar_lead', 'off', true);

    RETURN jsonb_build_object(
      'modo', 'single',
      'oferta_id', _oferta_id,
      'total_leads', _total,
      'processados', _processed,
      'lote_processado', _batch_count,
      'restantes', _remaining,
      'concluido', _remaining = 0
    );
  END IF;

  FOR _i IN 1.._n LOOP
    SELECT id INTO _new_id
    FROM public.ofertas_ativas
    WHERE filtros->>'__split_parent' = _oferta_id::text
      AND filtros->>'__split_index' = _i::text
      AND corretor_id = _ids[_i]
    ORDER BY created_at
    LIMIT 1;

    IF _new_id IS NULL THEN
      INSERT INTO public.ofertas_ativas (nome, descricao, status, criado_por, corretor_id, filtros)
      VALUES (
        left(_oferta.nome || ' — parte ' || _i::text || '/' || _n::text, 200),
        _oferta.descricao,
        'ativa',
        _uid,
        _ids[_i],
        coalesce(_oferta.filtros, '{}'::jsonb) || jsonb_build_object(
          '__split_parent', _oferta_id::text,
          '__split_index', _i::text,
          '__split_total', _n
        )
      )
      RETURNING id INTO _new_id;
    END IF;

    _created := _created || _new_id;
  END LOOP;

  WITH numbered AS (
    SELECT
      oal.lead_id,
      (((row_number() OVER (ORDER BY oal.created_at, oal.id) - 1) % _n) + 1)::integer AS idx
    FROM public.oferta_ativa_leads oal
    WHERE oal.oferta_id = _oferta_id
  ), pending AS (
    SELECT
      n.lead_id,
      n.idx,
      _ids[n.idx] AS corretor_id,
      _created[n.idx] AS child_id
    FROM numbered n
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.oferta_ativa_leads done
      WHERE done.lead_id = n.lead_id
        AND done.oferta_id = ANY(_created)
    )
    ORDER BY n.idx, n.lead_id
    LIMIT _limit
  ), locked AS (
    SELECT p.*
    FROM pending p
    JOIN public.leads l ON l.id = p.lead_id
    ORDER BY l.id
    FOR UPDATE OF l
  ), inserted AS (
    INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
    SELECT child_id, lead_id, false
    FROM locked
    ON CONFLICT (oferta_id, lead_id) DO NOTHING
    RETURNING lead_id
  ), updated AS (
    UPDATE public.leads l
       SET corretor_id = locked.corretor_id,
           status = 'aguardando_atendimento'::public.lead_status,
           via_webhook = false,
           data_distribuicao = now(),
           updated_at = now()
      FROM locked
     WHERE l.id = locked.lead_id
     RETURNING l.id
  )
  SELECT count(*) INTO _batch_count FROM updated;

  SELECT count(DISTINCT oal.lead_id) INTO _processed
  FROM public.oferta_ativa_leads oal
  WHERE oal.oferta_id = ANY(_created);

  _remaining := greatest(_total - _processed, 0);

  IF _remaining = 0 THEN
    UPDATE public.ofertas_ativas
       SET status = 'arquivada', updated_at = now()
     WHERE id = _oferta_id;
  END IF;

  PERFORM set_config('app.transicionar_lead', 'off', true);

  RETURN jsonb_build_object(
    'modo', 'split',
    'original_id', _oferta_id,
    'criadas', to_jsonb(_created),
    'total_leads', _total,
    'processados', _processed,
    'lote_processado', _batch_count,
    'restantes', _remaining,
    'concluido', _remaining = 0
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.atribuir_oferta_ativa_lote(uuid, uuid[], integer) TO authenticated;