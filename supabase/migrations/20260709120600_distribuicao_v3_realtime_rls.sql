-- ============================================================================
-- Distribuição v3 — realtime + RLS complementar (achados da revisão).
--
--   • As tabelas da distribuição entram na publication supabase_realtime —
--     sem isso os postgres_changes assinados pela central NUNCA disparam
--     (exceção nova não aparecia para o gestor até um refetch por foco);
--   • superintendente ganha SELECT em distribution_log (a página /distribuicao
--     admite o papel, mas o RLS de 20260615133551 só cobria admin/gestor e o
--     próprio corretor — o Histórico aparecia vazio);
--   • lead movido para a lixeira arquiva automaticamente a exceção aberta
--     (sem isso a fila apontava para leads descartados).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Realtime: REPLICA IDENTITY + publication (padrão de 20260616095924,
--    tolerante a publication inexistente em ambiente local).
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribuicao_excecoes REPLICA IDENTITY FULL;
ALTER TABLE public.distribution_log REPLICA IDENTITY FULL;
ALTER TABLE public.roleta_participantes REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.distribuicao_excecoes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.distribution_log;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.roleta_participantes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Superintendente lê o log de distribuição (leitura; ações continuam
--    exclusivas de admin/gestor).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Superintendente vê log completo" ON public.distribution_log;
CREATE POLICY "Superintendente vê log completo"
  ON public.distribution_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superintendente'));

-- ---------------------------------------------------------------------------
-- 3) Lixeira arquiva exceções abertas do lead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lixeira_arquiva_excecao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.na_lixeira = true AND COALESCE(OLD.na_lixeira, false) = false THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada',
           resolvida_em = now(),
           resolvida_por = auth.uid(),
           resolucao = 'Lead movido para a lixeira'
     WHERE lead_id = NEW.id AND status IN ('pendente','em_analise');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lixeira_arquiva_excecao ON public.leads;
CREATE TRIGGER trg_lixeira_arquiva_excecao
AFTER UPDATE OF na_lixeira ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lixeira_arquiva_excecao();

NOTIFY pgrst, 'reload schema';
