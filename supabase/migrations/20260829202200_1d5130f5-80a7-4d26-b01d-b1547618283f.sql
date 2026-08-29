CREATE OR REPLACE FUNCTION public.excluir_venda(p_venda_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _venda public.vendas%ROWTYPE;
  _ledger integer;
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'somente administradores podem excluir vendas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _venda FROM public.vendas WHERE id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF _venda.status_venda = 'aprovada'::public.status_venda THEN
    RAISE EXCEPTION 'venda aprovada não pode ser excluída: registre o distrato/cancelamento primeiro'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _ledger FROM public.comissao_ledger WHERE venda_id = p_venda_id;
  IF _ledger > 0 THEN
    RAISE EXCEPTION 'venda com lançamentos de comissão no ledger não pode ser excluída (histórico imutável)'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _ledger FROM public.venda_metricas_ledger WHERE venda_id = p_venda_id;
  IF _ledger > 0 THEN
    RAISE EXCEPTION 'venda com lançamentos de métricas no ledger não pode ser excluída (histórico imutável)'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _ledger FROM public.conciliacoes WHERE venda_id = p_venda_id;
  IF _ledger > 0 THEN
    RAISE EXCEPTION 'venda conciliada no financeiro não pode ser excluída'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES (
    'vendas', p_venda_id, 'DELETE', _uid, to_jsonb(_venda),
    jsonb_build_object('motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''))
  );

  DELETE FROM public.comissoes WHERE venda_id = p_venda_id;
  DELETE FROM public.vendas WHERE id = p_venda_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_venda(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_venda(uuid, text) TO authenticated;