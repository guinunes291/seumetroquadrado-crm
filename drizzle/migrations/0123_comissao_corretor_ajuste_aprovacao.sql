ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS justificativa_comissao_corretor text, ADD COLUMN IF NOT EXISTS percentual_corretor_regra numeric;
COMMENT ON COLUMN public.vendas.justificativa_comissao_corretor IS 'Justificativa obrigatória quando a comissão aprovada do corretor difere da regra; autoria e data em aprovado_por/aprovado_em.';
CREATE OR REPLACE FUNCTION public.validar_comissao_corretor_aprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s record; esperado numeric;
BEGIN
  IF NEW.status_venda = 'aprovada' AND OLD.status_venda IS DISTINCT FROM NEW.status_venda THEN
    SELECT * INTO s FROM public.comissao_sugerida_corretor(NEW.lead_id, NEW.corretor_id, NEW.data_assinatura);
    IF s.pct_share IS NULL THEN RAISE EXCEPTION 'Regra de comissão do corretor não encontrada'; END IF;
    esperado := round(coalesce(NEW.percentual_comissao,0) * s.pct_share / 100, 4);
    IF NEW.percentual_corretor IS NULL OR NEW.percentual_corretor < 0 OR NEW.percentual_corretor > 100 THEN RAISE EXCEPTION 'Percentual do corretor inválido'; END IF;
    IF NEW.percentual_corretor IS DISTINCT FROM esperado AND nullif(btrim(NEW.justificativa_comissao_corretor),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da alteração da comissão do corretor'; END IF;
    IF length(btrim(NEW.justificativa_comissao_corretor)) > 1000 THEN RAISE EXCEPTION 'Justificativa excede 1000 caracteres'; END IF;
    NEW.percentual_corretor_regra := esperado;
    NEW.justificativa_comissao_corretor := CASE WHEN NEW.percentual_corretor IS DISTINCT FROM esperado THEN btrim(NEW.justificativa_comissao_corretor) ELSE NULL END;
    NEW.tier_comissao := s.tier; NEW.esteira_comissao := s.esteira; NEW.pct_share_corretor := s.pct_share;
  ELSIF OLD.status_venda = 'aprovada' AND (NEW.justificativa_comissao_corretor IS DISTINCT FROM OLD.justificativa_comissao_corretor OR NEW.percentual_corretor_regra IS DISTINCT FROM OLD.percentual_corretor_regra) THEN
    RAISE EXCEPTION 'Justificativa de comissão aprovada é imutável';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_comissao_corretor_aprovacao() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validar_comissao_corretor_aprovacao BEFORE UPDATE ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.validar_comissao_corretor_aprovacao();
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
  IF p_socio_fabio_id IS NULL OR p_socio_fabio_id <> '23c59f18-941b-4323-a169-cd74dbe9889e'::uuid THEN
    RAISE EXCEPTION 'Selecione o sócio Fábio autorizado';
  END IF;
  UPDATE public.vendas SET percentual_comissao=p_percentual_total, percentual_corretor=p_percentual_corretor, percentual_gerente=p_percentual_gerente, percentual_superintendente=0.6, gerente_beneficiario_id=p_gerente_id, socio_fabio_id=p_socio_fabio_id, justificativa_comissao_corretor=nullif(btrim(p_justificativa),'') WHERE id=p_venda_id;
  RETURN public.aprovar_venda(p_venda_id,'aprovada',p_justificativa);
END $$;
REVOKE ALL ON FUNCTION public.aprovar_venda_com_comissao(uuid,numeric,numeric,numeric,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_venda_com_comissao(uuid,numeric,numeric,numeric,uuid,uuid,text) TO authenticated;