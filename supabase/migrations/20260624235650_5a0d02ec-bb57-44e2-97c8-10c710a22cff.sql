DROP POLICY IF EXISTS "Admins/gestores veem leads landing" ON public.leads_landing;
CREATE POLICY "Autenticados veem leads landing"
  ON public.leads_landing FOR SELECT
  TO authenticated
  USING (true);