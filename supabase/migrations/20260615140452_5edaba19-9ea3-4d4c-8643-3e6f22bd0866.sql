
CREATE TABLE public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  meta_leads_atendidos int NOT NULL DEFAULT 0,
  meta_visitas int NOT NULL DEFAULT 0,
  meta_vendas int NOT NULL DEFAULT 0,
  meta_gmv numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretor_id, equipe_id, ano, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated;
GRANT ALL ON public.metas TO service_role;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem metas" ON public.metas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor criam metas" ON public.metas FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admin/gestor atualizam metas" ON public.metas FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admin/gestor deletam metas" ON public.metas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_metas_updated_at BEFORE UPDATE ON public.metas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_metas_periodo ON public.metas(ano, mes);
CREATE INDEX idx_metas_corretor ON public.metas(corretor_id);
