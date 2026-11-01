DROP POLICY IF EXISTS agendamentos_bot_select_all ON public.agendamentos;
CREATE POLICY agendamentos_bot_select_all ON public.agendamentos FOR SELECT TO authenticated USING (public.is_service_bot((SELECT auth.uid())));

DROP POLICY IF EXISTS vendas_bot_select_all ON public.vendas;
CREATE POLICY vendas_bot_select_all ON public.vendas FOR SELECT TO authenticated USING (public.is_service_bot((SELECT auth.uid())));

DROP POLICY IF EXISTS tarefas_bot_select_all ON public.tarefas;
CREATE POLICY tarefas_bot_select_all ON public.tarefas FOR SELECT TO authenticated USING (public.is_service_bot((SELECT auth.uid())));

DROP POLICY IF EXISTS interacoes_bot_select_all ON public.interacoes;
CREATE POLICY interacoes_bot_select_all ON public.interacoes FOR SELECT TO authenticated USING (public.is_service_bot((SELECT auth.uid())));