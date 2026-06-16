CREATE POLICY "Corretor pode inserir seus leads" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (corretor_id = auth.uid());