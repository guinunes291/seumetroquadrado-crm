CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _nome text := NULLIF(btrim(_payload->>'nome'), '');
  _telefone text := NULLIF(btrim(_payload->>'telefone'), '');
  _email text := NULLIF(lower(btrim(_payload->>'email')), '');
  _origem public.lead_origem;
  _projeto_id uuid := NULLIF(_payload->>'projeto_id', '')::uuid;
  _projeto_nome text := NULLIF(btrim(_payload->>'projeto_nome'), '');
  _observacoes text := NULLIF(btrim(_payload->>'observacoes'), '');
  _corretor_id uuid := NULLIF(_payload->>'corretor_id', '')::uuid;
  _status public.lead_status := COALESCE(
    NULLIF(_payload->>'status', '')::public.lead_status,
    'novo'::public.lead_status
  );
  _digits text;
  _dup record;
  _novo_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR _telefone IS NULL THEN
    RAISE EXCEPTION 'nome e telefone são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  _digits := right(public.telefone_digits(_telefone), 10);
  IF length(_digits) >= 8 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _digits));

    SELECT l.id, l.nome, l.corretor_id INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND right(public.telefone_digits(l.telefone), 10) = _digits
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
        'nome', CASE WHEN public.pode_acessar_lead(_uid, _dup.id) THEN _dup.nome ELSE NULL END,
        'na_carteira', public.pode_acessar_lead(_uid, _dup.id)
      );
    END IF;
  END IF;

  INSERT INTO public.leads (
    nome, telefone, email, origem, projeto_id, projeto_nome, observacoes,
    corretor_id, status
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _status
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_lead_dedup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lead_dedup(jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';