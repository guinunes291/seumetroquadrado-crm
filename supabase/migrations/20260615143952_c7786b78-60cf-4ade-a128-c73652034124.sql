
-- Fase 7: Empreendimentos avançado — unidades, histórico de preços, projeto em foco

CREATE TYPE public.unidade_status AS ENUM ('disponivel','reservada','vendida','bloqueada');

CREATE TABLE public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  identificador text NOT NULL,
  bloco text,
  andar text,
  tipologia text,
  dormitorios int,
  suites int,
  vagas int,
  area_privativa numeric(10,2),
  valor numeric(14,2),
  status public.unidade_status NOT NULL DEFAULT 'disponivel',
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, identificador)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem unidades" ON public.unidades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores e admins gerenciam unidades" ON public.unidades
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER unidades_set_updated_at
  BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Histórico de preços
CREATE TABLE public.historico_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  valor_anterior numeric(14,2),
  valor_novo numeric(14,2) NOT NULL,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.historico_precos TO authenticated;
GRANT ALL ON public.historico_precos TO service_role;

ALTER TABLE public.historico_precos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem histórico" ON public.historico_precos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sistema/gestores inserem histórico" ON public.historico_precos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- Trigger: registra mudança de valor automaticamente
CREATE OR REPLACE FUNCTION public.registrar_historico_preco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.valor IS DISTINCT FROM NEW.valor) THEN
    INSERT INTO public.historico_precos (unidade_id, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, OLD.valor, NEW.valor, auth.uid());
  ELSIF (TG_OP = 'INSERT') AND (NEW.valor IS NOT NULL) THEN
    INSERT INTO public.historico_precos (unidade_id, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, NULL, NEW.valor, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_historico_preco() FROM PUBLIC;

CREATE TRIGGER trg_historico_preco
  AFTER INSERT OR UPDATE OF valor ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_preco();

-- Projeto em foco (destaque rotativo)
CREATE TABLE public.projeto_foco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz,
  motivo text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_foco TO authenticated;
GRANT ALL ON public.projeto_foco TO service_role;

ALTER TABLE public.projeto_foco ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem projeto em foco" ON public.projeto_foco
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores gerenciam projeto em foco" ON public.projeto_foco
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER projeto_foco_set_updated_at
  BEFORE UPDATE ON public.projeto_foco
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_unidades_projeto ON public.unidades(projeto_id);
CREATE INDEX idx_unidades_status ON public.unidades(status);
CREATE INDEX idx_historico_unidade ON public.historico_precos(unidade_id);
CREATE INDEX idx_projeto_foco_ativo ON public.projeto_foco(ativo) WHERE ativo = true;
