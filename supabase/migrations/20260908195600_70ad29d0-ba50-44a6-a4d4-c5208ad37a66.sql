CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(_roleta text DEFAULT 'plantao'::text, _limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  -- Modelo SDR ligado: o pré-atendimento recebe um lote POR RODADA, limitado
  -- pelo teto de base ativa (sdr_teto_leads_ativos; 0 = sem teto). O que
  -- sobra do estoque segue para os corretores aptos na mesma rodada — os
  -- dois caminhos recebem (decisão 2026-09-08).
  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _corretores := _corretores + 1;
    _entregues := 0;

    FOR _lead IN
      SELECT l.id
        FROM public.leads l
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
       ORDER BY l.created_at ASC
       LIMIT _por_corretor
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _por_corretor), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    EXIT WHEN _entregues = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor')
  );
END;
$function$;