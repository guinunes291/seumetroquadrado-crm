
CREATE TABLE public.projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  webhook_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  construtora text,
  cidade text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem projetos" ON public.projetos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor criam projetos" ON public.projetos FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admin/gestor atualizam projetos" ON public.projetos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admin/gestor deletam projetos" ON public.projetos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_projetos_updated_at BEFORE UPDATE ON public.projetos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_projetos_token ON public.projetos(webhook_token) WHERE ativo = true;

-- Vínculo de leads ao projeto
ALTER TABLE public.leads
  ADD COLUMN projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_projeto ON public.leads(projeto_id);
