CREATE OR REPLACE FUNCTION public.aplicar_desconto_comissao(
  _comissao_id uuid,
  _percentual_desconto numeric,
  _valor_liquido numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_row public.comissoes;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')) THEN
    RAISE EXCEPTION 'sem permissão para aplicar desconto' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.comissoes WHERE id = _comissao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comissão não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF _percentual_desconto IS NULL OR _percentual_desconto < 0 OR _percentual_desconto > 100 THEN
    RAISE EXCEPTION 'percentual de desconto inválido' USING ERRCODE = '22023';
  END IF;
  IF _valor_liquido IS NULL OR _valor_liquido < 0 OR _valor_liquido > v_row.valor_comissao THEN
    RAISE EXCEPTION 'valor líquido inválido' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.commercial_effects', 'on', true);

  UPDATE public.comissoes
     SET percentual_desconto = _percentual_desconto,
         valor_liquido = _valor_liquido
   WHERE id = _comissao_id;

  INSERT INTO public.comissao_ledger (
    comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
    idempotency_key, criado_por, metadata
  ) VALUES (
    v_row.id, v_row.venda_id, v_row.beneficiario_id, v_row.tipo, 'desconto_ajustado',
    _valor_liquido,
    'desconto:' || v_row.id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
    auth.uid(),
    jsonb_build_object(
      'percentual_desconto_anterior', v_row.percentual_desconto,
      'valor_liquido_anterior', v_row.valor_liquido,
      'percentual_desconto', _percentual_desconto,
      'valor_liquido', _valor_liquido
    )
  );

  PERFORM set_config('app.commercial_effects', 'off', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_desconto_comissao(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_desconto_comissao(uuid, numeric, numeric) TO authenticated;