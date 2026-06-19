
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.links_uteis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  url text NOT NULL,
  categoria text NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.links_uteis TO authenticated;
GRANT ALL ON public.links_uteis TO service_role;

ALTER TABLE public.links_uteis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados leem links ativos"
ON public.links_uteis FOR SELECT TO authenticated
USING (status = 'ativo' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins inserem links"
ON public.links_uteis FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins atualizam links"
ON public.links_uteis FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins excluem links"
ON public.links_uteis FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_links_uteis_updated_at
BEFORE UPDATE ON public.links_uteis
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_links_uteis_categoria ON public.links_uteis(categoria);
CREATE INDEX idx_links_uteis_status ON public.links_uteis(status);

CREATE TABLE public.links_uteis_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.links_uteis(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.links_uteis_acessos TO authenticated;
GRANT ALL ON public.links_uteis_acessos TO service_role;

ALTER TABLE public.links_uteis_acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário insere seu próprio acesso"
ON public.links_uteis_acessos FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Gestores/admins leem todos os acessos"
ON public.links_uteis_acessos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE INDEX idx_links_uteis_acessos_link ON public.links_uteis_acessos(link_id);
CREATE INDEX idx_links_uteis_acessos_user ON public.links_uteis_acessos(user_id);
CREATE INDEX idx_links_uteis_acessos_created ON public.links_uteis_acessos(created_at DESC);
