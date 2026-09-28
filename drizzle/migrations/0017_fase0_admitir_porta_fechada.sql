CREATE OR REPLACE FUNCTION public.cadencia_fase0_admitir(_modo text DEFAULT NULL::text, _por_corretor integer DEFAULT NULL::integer)
 RETURNS TABLE(lote_id uuid, modo text, corretores integer, admitidos integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text; _teto integer; _cap_est integer;
  _lote uuid := gen_random_uuid();
  _c record; _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  -- Base nova só pelo lote de prospecção (2026-09-28): a entrega automática
  -- do estoque fica desligada enquanto as portas legadas estiverem fechadas.
  IF NOT COALESCE(_cfg.portas_legadas_bolsao, false) THEN
    RETURN;
  END IF;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;
  _teto := GREATEST(COALESCE(_por_corretor, _cfg.lote_estoque_dia, 15), 1);
  _cap_est := GREATEST(COALESCE(
    (public.carteira_ativa_config() ->> 'cap_formacao_estoque')::int,
    COALESCE((public.carteira_ativa_config() ->> 'cap_formacao')::int, 20) / 2), 0);
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin admite estoque na cadência' USING ERRCODE = '42501';
  END IF;
  FOR _c IN
    WITH k AS (
      SELECT x.lead_id, x.corretor_id, x.dias_parado,
             row_number() OVER (PARTITION BY x.corretor_id ORDER BY x.dias_parado ASC, x.lead_id) AS pos
      FROM public.cadencia_fase0_classificar() AS x
      WHERE x.destino = 'cadencia'
    ),
    cota AS (
      SELECT d.corretor_id,
             LEAST(_teto,
               GREATEST(0, _cap_est - (
                 SELECT count(*)::int FROM public.leads AS l
                  WHERE l.corretor_id = d.corretor_id
                    AND l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3')
                    AND l.deleted_at IS NULL AND l.na_lixeira = false)),
               public.carteira_vagas_entrada_v1(d.corretor_id)) AS n
      FROM (SELECT DISTINCT k.corretor_id FROM k) AS d
    )
    SELECT k.lead_id, k.corretor_id, k.dias_parado, cota.n AS cota
    FROM k JOIN cota ON cota.corretor_id = k.corretor_id
    WHERE k.pos <= cota.n
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN _ok := public.cadencia_iniciar(_c.lead_id); END IF;
    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, 'D0', 'admissao_estoque', _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado, 'teto_por_corretor', _teto,
                          'cota_formacao', _c.cota, 'etapa_aplicada', 'D0'));
  END LOOP;
  RETURN QUERY
  SELECT _lote, _m, count(DISTINCT g.corretor_id)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g WHERE g.lote_id = _lote;
END;
$function$;