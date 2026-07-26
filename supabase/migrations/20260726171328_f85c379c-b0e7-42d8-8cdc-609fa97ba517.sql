ALTER TABLE public.api_alteracao_auditoria
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_nome text;

CREATE POLICY "Gestores veem auditoria de alteracoes"
  ON public.api_alteracao_auditoria FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role));