-- ============================================================================
-- COMISSÕES: o corretor enxerga SÓ as PRÓPRIAS linhas (beneficiario = ele).
--
-- Regra de produto (Guilherme, 2026-08-27): na parte de comissões, o corretor
-- visualiza apenas as comissões DELE, das vendas DELE — nunca o restante da
-- cadeia de comissionados (override do gestor, casa, indicador…).
--
-- O vazamento era na RLS, não na tela: as policies de SELECT de `comissoes` e
-- `comissao_ledger` tinham um OR por acesso ao lead da venda
-- (pode_acessar_lead) — verdadeiro para o DONO do lead. Resultado: na própria
-- venda, o corretor lia a comissão de todos os beneficiários da cadeia.
--
-- O conserto reescreve as duas policies:
--   - beneficiario_id = auth.uid()                     → sempre pode (a SUA linha);
--   - admin                                            → tudo (regra da casa);
--   - gestor/superintendente                           → a cadeia inteira, no
--     escopo de leads que já enxergam (pode_acessar_lead via venda) — o mesmo
--     recorte da policy de UPDATE, que já era gestão-only e fica intacta.
--
-- Nota: linha sem beneficiário ("a atribuir") passa a ser visível só para a
-- gestão — coerente: atribuir beneficiário é ação de gestão. As demais portas
-- de leitura foram auditadas e já estavam certas: dre_renda_pessoas exige
-- admin/gestor, dre_vw_vendas_unidade é security_invoker (esta RLS vale), e
-- nenhuma outra função com GRANT a authenticated devolve linhas de comissão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. comissoes — SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comissoes_select_integridade ON public.comissoes;
DROP POLICY IF EXISTS comissoes_select_beneficiario ON public.comissoes;

CREATE POLICY comissoes_select_beneficiario ON public.comissoes
  FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        (public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role))
        AND EXISTS (
          SELECT 1 FROM public.vendas v
          WHERE v.id = comissoes.venda_id
            AND v.lead_id IS NOT NULL
            AND public.pode_acessar_lead(auth.uid(), v.lead_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. comissao_ledger — SELECT (mesmo vazamento, mesma forma)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comissao_ledger_select_escopo ON public.comissao_ledger;
DROP POLICY IF EXISTS comissao_ledger_select_beneficiario ON public.comissao_ledger;

CREATE POLICY comissao_ledger_select_beneficiario ON public.comissao_ledger
  FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        (public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role))
        AND EXISTS (
          SELECT 1 FROM public.vendas v
          WHERE v.id = comissao_ledger.venda_id
            AND v.lead_id IS NOT NULL
            AND public.pode_acessar_lead(auth.uid(), v.lead_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Sanidade: falha o replay se a regra não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _qual text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO _qual
  FROM pg_policy
  WHERE polrelid = 'public.comissoes'::regclass
    AND polname = 'comissoes_select_beneficiario';
  IF _qual IS NULL THEN
    RAISE EXCEPTION 'comissoes: policy de SELECT por beneficiário ausente';
  END IF;
  -- A antiga porta larga (pode_acessar_lead sem gate de papel) não pode voltar:
  -- a nova só menciona pode_acessar_lead DEPOIS do gate has_role.
  IF _qual NOT LIKE '%has_role%' THEN
    RAISE EXCEPTION 'comissoes: policy sem o gate de papel da gestão';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.comissoes'::regclass
      AND polname = 'comissoes_select_integridade'
  ) THEN
    RAISE EXCEPTION 'comissoes: policy antiga (vazamento da cadeia) ainda existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.comissao_ledger'::regclass
      AND polname = 'comissao_ledger_select_beneficiario'
  ) THEN
    RAISE EXCEPTION 'comissao_ledger: policy de SELECT por beneficiário ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
