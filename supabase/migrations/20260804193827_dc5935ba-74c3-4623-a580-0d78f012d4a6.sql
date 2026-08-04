-- 1) RLS: avaliar auth.uid() uma vez por query (initplan) em vez de por linha.
DROP POLICY IF EXISTS "User vê seus alertas" ON public.alertas;
CREATE POLICY "User vê seus alertas" ON public.alertas FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "User atualiza seus alertas" ON public.alertas;
CREATE POLICY "User atualiza seus alertas" ON public.alertas FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "User deleta seus alertas" ON public.alertas;
CREATE POLICY "User deleta seus alertas" ON public.alertas FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admin/gestor criam alertas" ON public.alertas;
CREATE POLICY "Admin/gestor criam alertas" ON public.alertas FOR INSERT TO authenticated
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role));

DROP POLICY IF EXISTS docs_select_carteira ON public.documentacoes;
CREATE POLICY docs_select_carteira ON public.documentacoes FOR SELECT TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS docs_update_carteira ON public.documentacoes;
CREATE POLICY docs_update_carteira ON public.documentacoes FOR UPDATE TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id))
  WITH CHECK (pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS docs_insert_carteira ON public.documentacoes;
CREATE POLICY docs_insert_carteira ON public.documentacoes FOR INSERT TO authenticated
  WITH CHECK (pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS docs_delete_carteira ON public.documentacoes;
CREATE POLICY docs_delete_carteira ON public.documentacoes FOR DELETE TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS docs_bot_select_all ON public.documentacoes;
CREATE POLICY docs_bot_select_all ON public.documentacoes FOR SELECT TO authenticated
  USING (is_service_bot((SELECT auth.uid())));
DROP POLICY IF EXISTS docs_delete ON public.documentacoes;
CREATE POLICY docs_delete ON public.documentacoes FOR DELETE TO authenticated
  USING (corretor_id = (SELECT auth.uid())
     OR has_role((SELECT auth.uid()), 'admin'::app_role)
     OR has_role((SELECT auth.uid()), 'gestor'::app_role)
     OR has_role((SELECT auth.uid()), 'superintendente'::app_role));

DROP POLICY IF EXISTS interacoes_select_carteira ON public.interacoes;
CREATE POLICY interacoes_select_carteira ON public.interacoes FOR SELECT TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS interacoes_insert_carteira ON public.interacoes;
CREATE POLICY interacoes_insert_carteira ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (autor_id = (SELECT auth.uid()) AND pode_acessar_lead((SELECT auth.uid()), lead_id));
DROP POLICY IF EXISTS interacoes_update_carteira ON public.interacoes;
CREATE POLICY interacoes_update_carteira ON public.interacoes FOR UPDATE TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id) AND (autor_id = (SELECT auth.uid())
     OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'superintendente'::app_role)))
  WITH CHECK (pode_acessar_lead((SELECT auth.uid()), lead_id) AND (autor_id = (SELECT auth.uid())
     OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'superintendente'::app_role)));
DROP POLICY IF EXISTS interacoes_delete_carteira ON public.interacoes;
CREATE POLICY interacoes_delete_carteira ON public.interacoes FOR DELETE TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id) AND (autor_id = (SELECT auth.uid())
     OR has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'superintendente'::app_role)));

DROP POLICY IF EXISTS lead_status_transitions_select_carteira ON public.lead_status_transitions;
CREATE POLICY lead_status_transitions_select_carteira ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (pode_acessar_lead((SELECT auth.uid()), lead_id));

-- 2) Busca textual em leads sem varredura completa.
CREATE INDEX IF NOT EXISTS idx_leads_nome_trgm ON public.leads USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm ON public.leads USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_telefone_trgm ON public.leads USING gin (telefone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_telefone_e164_trgm ON public.leads USING gin (telefone_e164 gin_trgm_ops);

-- 3) Enxugar notificações antigas já lidas.
DELETE FROM public.alertas WHERE lida = true AND created_at < now() - interval '60 days';

ANALYZE public.alertas;
ANALYZE public.leads;