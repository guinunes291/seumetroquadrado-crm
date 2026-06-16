-- Replicação Manus — Fase 3: Vendas & documentação.
-- Tabelas: visitas, analises_credito, documentacoes, propostas, propostas_visitantes,
-- templates_comissao, comissoes. Melhoria: a comissão é gerada automaticamente ao
-- registrar uma venda (trigger), usando os percentuais já gravados em vendas.

-- Macro de papéis "gestores" repetida nas policies:
--   has_role(admin) OR has_role(gestor) OR has_role(superintendente)

-- ===================== VISITAS =====================
CREATE TABLE public.visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  data_visita timestamptz NOT NULL DEFAULT now(),
  resultado text,                     -- interesse_alto|interesse_medio|interesse_baixo|sem_interesse|pendente_documentacao|encaminhado_analise
  observacoes text,
  registrado_por_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_visitas_lead ON public.visitas(lead_id);
CREATE INDEX idx_visitas_corretor ON public.visitas(corretor_id, data_visita DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT ALL ON public.visitas TO service_role;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitas_select" ON public.visitas FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "visitas_insert" ON public.visitas FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "visitas_update" ON public.visitas FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_visitas_updated ON public.visitas;
CREATE TRIGGER trg_visitas_updated BEFORE UPDATE ON public.visitas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===================== ANÁLISES DE CRÉDITO =====================
CREATE TABLE public.analises_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'enviada',   -- enviada|aprovada|reprovada|pendente
  instituicao text,
  valor_aprovado numeric(14,2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analises_lead ON public.analises_credito(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analises_credito TO authenticated;
GRANT ALL ON public.analises_credito TO service_role;
ALTER TABLE public.analises_credito ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analises_select" ON public.analises_credito FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "analises_insert" ON public.analises_credito FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "analises_update" ON public.analises_credito FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_analises_updated ON public.analises_credito;
CREATE TRIGGER trg_analises_updated BEFORE UPDATE ON public.analises_credito FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===================== DOCUMENTAÇÕES =====================
CREATE TABLE public.documentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL,                 -- rg|cpf|comprovante_renda|extrato_fgts|certidao|outro
  status text NOT NULL DEFAULT 'pendente',  -- pendente|recebido|aprovado|reprovado
  url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentacoes_lead ON public.documentacoes(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentacoes TO authenticated;
GRANT ALL ON public.documentacoes TO service_role;
ALTER TABLE public.documentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs_select" ON public.documentacoes FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "docs_insert" ON public.documentacoes FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "docs_update" ON public.documentacoes FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_documentacoes_updated ON public.documentacoes;
CREATE TRIGGER trg_documentacoes_updated BEFORE UPDATE ON public.documentacoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===================== PROPOSTAS =====================
CREATE TABLE public.propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  valor numeric(14,2),
  status text NOT NULL DEFAULT 'rascunho',  -- rascunho|enviada|visualizada|aceita|recusada|expirada
  link_token text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  validade timestamptz,
  condicoes jsonb NOT NULL DEFAULT '{}',     -- tabela de pagamento etc.
  observacoes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_propostas_lead ON public.propostas(lead_id);
CREATE INDEX idx_propostas_corretor ON public.propostas(corretor_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas TO authenticated;
GRANT ALL ON public.propostas TO service_role;
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propostas_select" ON public.propostas FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "propostas_insert" ON public.propostas FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "propostas_update" ON public.propostas FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_propostas_updated ON public.propostas;
CREATE TRIGGER trg_propostas_updated BEFORE UPDATE ON public.propostas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Propostas de visitantes (sem lead ainda)
CREATE TABLE public.propostas_visitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valor numeric(14,2),
  observacoes text,
  convertido_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas_visitantes TO authenticated;
GRANT ALL ON public.propostas_visitantes TO service_role;
ALTER TABLE public.propostas_visitantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propvis_select" ON public.propostas_visitantes FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "propvis_insert" ON public.propostas_visitantes FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid() OR corretor_id IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));

-- ===================== COMISSÕES =====================
CREATE TABLE public.templates_comissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  percentual_comissao numeric(5,2) NOT NULL DEFAULT 3.50,
  percentual_corretor numeric(5,2) NOT NULL DEFAULT 1.85,
  percentual_gerente numeric(5,2) NOT NULL DEFAULT 0.50,
  percentual_superintendente numeric(5,2) NOT NULL DEFAULT 0.30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates_comissao TO authenticated;
GRANT ALL ON public.templates_comissao TO service_role;
ALTER TABLE public.templates_comissao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmpl_comissao_select" ON public.templates_comissao FOR SELECT TO authenticated USING (true);
CREATE POLICY "tmpl_comissao_manage" ON public.templates_comissao FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_tmpl_comissao_updated ON public.templates_comissao;
CREATE TRIGGER trg_tmpl_comissao_updated BEFORE UPDATE ON public.templates_comissao FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.templates_comissao (nome) VALUES ('Padrão') ON CONFLICT DO NOTHING;

CREATE TABLE public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valor_venda numeric(14,2) NOT NULL DEFAULT 0,
  percentual_comissao numeric(5,2) NOT NULL DEFAULT 0,
  valor_comissao_total numeric(14,2) NOT NULL DEFAULT 0,
  valor_corretor numeric(14,2) NOT NULL DEFAULT 0,
  valor_gerente numeric(14,2) NOT NULL DEFAULT 0,
  valor_superintendente numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',  -- pendente|recebido|em_disputa
  data_recebimento timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_venda_uk UNIQUE (venda_id)
);
CREATE INDEX idx_comissoes_corretor ON public.comissoes(corretor_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes TO authenticated;
GRANT ALL ON public.comissoes TO service_role;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comissoes_select" ON public.comissoes FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "comissoes_manage" ON public.comissoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_comissoes_updated ON public.comissoes;
CREATE TRIGGER trg_comissoes_updated BEFORE UPDATE ON public.comissoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Gera a comissão automaticamente ao registrar uma venda (usa os % da venda).
CREATE OR REPLACE FUNCTION public.gerar_comissao_da_venda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v numeric := COALESCE(NEW.valor_venda, 0);
BEGIN
  INSERT INTO public.comissoes (
    venda_id, corretor_id, valor_venda, percentual_comissao,
    valor_comissao_total, valor_corretor, valor_gerente, valor_superintendente
  ) VALUES (
    NEW.id, NEW.corretor_id, _v, COALESCE(NEW.percentual_comissao,0),
    round(_v * COALESCE(NEW.percentual_comissao,0) / 100, 2),
    round(_v * COALESCE(NEW.percentual_corretor,0) / 100, 2),
    round(_v * COALESCE(NEW.percentual_gerente,0) / 100, 2),
    round(_v * COALESCE(NEW.percentual_superintendente,0) / 100, 2)
  )
  ON CONFLICT (venda_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_gerar_comissao ON public.vendas;
CREATE TRIGGER trg_gerar_comissao AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.gerar_comissao_da_venda();
