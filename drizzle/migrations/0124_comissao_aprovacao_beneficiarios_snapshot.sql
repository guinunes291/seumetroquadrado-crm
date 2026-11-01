CREATE OR REPLACE FUNCTION public.aprovar_venda_com_comissao(p_venda_id uuid, p_percentual_total numeric, p_percentual_corretor numeric, p_percentual_gerente numeric, p_gerente_id uuid, p_socio_fabio_id uuid, p_justificativa text DEFAULT NULL) RETURNS public.vendas LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.vendas%ROWTYPE; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_active_member(uid) OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'gestor') OR public.has_role(uid,'superintendente')) THEN RAISE EXCEPTION 'Aprovação exige gestão ativa' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.vendas WHERE id=p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF v.lead_id IS NULL OR NOT public.pode_acessar_lead(uid,v.lead_id) THEN RAISE EXCEPTION 'Venda fora do escopo da gestão' USING ERRCODE='42501'; END IF;
  IF v.status_venda='aprovada' THEN RETURN v; END IF;
  IF v.status_venda NOT IN ('pendente','rascunho') THEN RAISE EXCEPTION 'Venda não está pendente'; END IF;
  IF p_percentual_total IS NULL OR p_percentual_corretor IS NULL OR p_percentual_gerente IS NULL OR p_percentual_total NOT BETWEEN 0 AND 100 OR p_percentual_corretor NOT BETWEEN 0 AND 100 OR p_percentual_gerente NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Percentuais inválidos'; END IF;
  IF p_percentual_corretor + p_percentual_gerente + 0.6 > p_percentual_total THEN RAISE EXCEPTION 'A soma das comissões excede o total'; END IF;
  IF p_percentual_gerente > 0 AND p_gerente_id IS NULL THEN RAISE EXCEPTION 'Selecione o gerente comissionado'; END IF;
  IF p_socio_fabio_id IS NULL OR p_socio_fabio_id <> '5531c08f-e0dc-4289-90f3-b6105eab4c4c'::uuid THEN RAISE EXCEPTION 'Selecione o sócio Fábio autorizado'; END IF;
  UPDATE public.vendas SET percentual_comissao=p_percentual_total, percentual_corretor=p_percentual_corretor, percentual_gerente=p_percentual_gerente, percentual_superintendente=0.6, gerente_beneficiario_id=p_gerente_id, socio_guilherme_id='43866728-4cde-4f74-a5de-bbbecec10198', socio_fabio_id=p_socio_fabio_id, justificativa_comissao_corretor=nullif(btrim(p_justificativa),'') WHERE id=p_venda_id;
  RETURN public.aprovar_venda(p_venda_id,'aprovada',p_justificativa);
END $$;
REVOKE ALL ON FUNCTION public.aprovar_venda_com_comissao(uuid,numeric,numeric,numeric,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_venda_com_comissao(uuid,numeric,numeric,numeric,uuid,uuid,text) TO authenticated;