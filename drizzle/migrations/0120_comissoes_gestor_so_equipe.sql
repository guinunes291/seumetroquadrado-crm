CREATE OR REPLACE FUNCTION public.gestor_ve_beneficiario(_gestor uuid, _benef uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _benef = _gestor OR EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.equipes e ON e.id = p.equipe_id
    WHERE p.id = _benef AND e.gestor_id = _gestor
  )
$$;
GRANT EXECUTE ON FUNCTION public.gestor_ve_beneficiario(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS comissao_ledger_select_beneficiario ON public.comissao_ledger;
CREATE POLICY comissao_ledger_select_beneficiario ON public.comissao_ledger FOR SELECT TO authenticated
USING (is_active_member(auth.uid()) AND (
  beneficiario_id = auth.uid()
  OR has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'superintendente'::app_role) AND EXISTS (SELECT 1 FROM vendas v WHERE v.id = comissao_ledger.venda_id AND v.lead_id IS NOT NULL AND pode_acessar_lead(auth.uid(), v.lead_id)))
  OR (has_role(auth.uid(),'gestor'::app_role) AND public.gestor_ve_beneficiario(auth.uid(), beneficiario_id))
));

DROP POLICY IF EXISTS comissoes_select_beneficiario ON public.comissoes;
CREATE POLICY comissoes_select_beneficiario ON public.comissoes FOR SELECT TO authenticated
USING (is_active_member(auth.uid()) AND (
  beneficiario_id = auth.uid()
  OR has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'superintendente'::app_role) AND EXISTS (SELECT 1 FROM vendas v WHERE v.id = comissoes.venda_id AND v.lead_id IS NOT NULL AND pode_acessar_lead(auth.uid(), v.lead_id)))
  OR (has_role(auth.uid(),'gestor'::app_role) AND public.gestor_ve_beneficiario(auth.uid(), beneficiario_id))
));