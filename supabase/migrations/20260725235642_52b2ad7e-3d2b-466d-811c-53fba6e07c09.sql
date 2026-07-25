ALTER TYPE public.api_cliente_escopo ADD VALUE IF NOT EXISTS 'commissions:write';

CREATE TABLE IF NOT EXISTS public.api_alteracao_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  api_cliente_id uuid,
  api_cliente_nome text
);

GRANT ALL ON public.api_alteracao_auditoria TO service_role;
GRANT SELECT ON public.api_alteracao_auditoria TO authenticated;

ALTER TABLE public.api_alteracao_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem auditoria de alteracoes da API"
  ON public.api_alteracao_auditoria FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_api_alteracao_auditoria_entidade
  ON public.api_alteracao_auditoria (entidade, entidade_id, criado_em DESC);