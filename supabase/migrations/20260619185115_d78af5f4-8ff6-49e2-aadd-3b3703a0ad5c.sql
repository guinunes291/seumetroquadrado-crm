
-- Reconciliação de replay (P1-5): esta migration re-emite vendas/comissoes/
-- analises_credito no formato definitivo ("v2" — o que existe em produção,
-- confirmado pelo types.ts gerado do banco vivo). Migrations anteriores do
-- histórico reescrito criam versões "v1" incompatíveis dessas tabelas; num
-- replay do zero elas chegam aqui VAZIAS. Se a tabela existente não tiver a
-- coluna-marcador do formato v2, é o resquício v1: derruba para permitir a
-- criação correta abaixo. Em produção (onde o v2 já existe) isto é um no-op.
DO $reconcile$
DECLARE
  alvo record;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('vendas', 'legacy_id'),
      ('comissoes', 'beneficiario_id'),
      ('analises_credito', 'legacy_id')
    ) AS t(tabela, marcador_v2)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = alvo.tabela)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = alvo.tabela
                         AND column_name = alvo.marcador_v2)
    THEN
      EXECUTE format('DROP TABLE public.%I CASCADE', alvo.tabela);
    END IF;
  END LOOP;
END $reconcile$;

-- =========================
-- VENDAS
-- =========================
CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  projeto_nome text,
  valor_venda numeric(14,2) NOT NULL DEFAULT 0,
  data_assinatura date NOT NULL DEFAULT current_date,
  percentual_comissao numeric(6,3) NOT NULL DEFAULT 0,
  percentual_corretor numeric(6,3) NOT NULL DEFAULT 0,
  percentual_gerente numeric(6,3) NOT NULL DEFAULT 0,
  percentual_superintendente numeric(6,3) NOT NULL DEFAULT 0,
  status_recebimento text NOT NULL DEFAULT 'pendente',
  data_recebimento date,
  distrato boolean NOT NULL DEFAULT false,
  data_distrato date,
  motivo_distrato text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendas_lead ON public.vendas(lead_id);
CREATE INDEX IF NOT EXISTS idx_vendas_corretor ON public.vendas(corretor_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON public.vendas(data_assinatura);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_select_own_or_gestor" ON public.vendas;
CREATE POLICY "vendas_select_own_or_gestor" ON public.vendas FOR SELECT TO authenticated
USING (
  corretor_id = auth.uid()
  OR criado_por_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
DROP POLICY IF EXISTS "vendas_insert_auth" ON public.vendas;
CREATE POLICY "vendas_insert_auth" ON public.vendas FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "vendas_update_own_or_gestor" ON public.vendas;
CREATE POLICY "vendas_update_own_or_gestor" ON public.vendas FOR UPDATE TO authenticated
USING (
  corretor_id = auth.uid()
  OR criado_por_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
DROP POLICY IF EXISTS "vendas_delete_gestor" ON public.vendas;
CREATE POLICY "vendas_delete_gestor" ON public.vendas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP TRIGGER IF EXISTS trg_vendas_updated_at ON vendas;
CREATE TRIGGER trg_vendas_updated_at BEFORE UPDATE ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- COMISSOES
-- =========================
CREATE TABLE IF NOT EXISTS public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  venda_id uuid REFERENCES public.vendas(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  beneficiario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiario_nome text,
  tipo text NOT NULL DEFAULT 'corretor',
  status text NOT NULL DEFAULT 'pendente',
  data_pagamento date,
  valor_base numeric(14,2) NOT NULL DEFAULT 0,
  percentual numeric(6,3) NOT NULL DEFAULT 0,
  valor_comissao numeric(14,2) NOT NULL DEFAULT 0,
  percentual_desconto numeric(6,3) NOT NULL DEFAULT 0,
  valor_liquido numeric(14,2) NOT NULL DEFAULT 0,
  contrato_vgv numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comissoes_venda ON public.comissoes(venda_id);
CREATE INDEX idx_comissoes_lead ON public.comissoes(lead_id);
CREATE INDEX idx_comissoes_beneficiario ON public.comissoes(beneficiario_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes TO authenticated;
GRANT ALL ON public.comissoes TO service_role;

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissoes_select_own_or_gestor" ON public.comissoes FOR SELECT TO authenticated
USING (
  beneficiario_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
CREATE POLICY "comissoes_insert_gestor" ON public.comissoes FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
CREATE POLICY "comissoes_update_gestor" ON public.comissoes FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
CREATE POLICY "comissoes_delete_admin" ON public.comissoes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_comissoes_updated_at BEFORE UPDATE ON public.comissoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ANALISES_CREDITO
-- =========================
CREATE TABLE public.analises_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'enviada',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analises_lead ON public.analises_credito(lead_id);
CREATE INDEX idx_analises_corretor ON public.analises_credito(corretor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analises_credito TO authenticated;
GRANT ALL ON public.analises_credito TO service_role;

ALTER TABLE public.analises_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analises_select_own_or_gestor" ON public.analises_credito FOR SELECT TO authenticated
USING (
  corretor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
CREATE POLICY "analises_insert_auth" ON public.analises_credito FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "analises_update_own_or_gestor" ON public.analises_credito FOR UPDATE TO authenticated
USING (
  corretor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);
CREATE POLICY "analises_delete_gestor" ON public.analises_credito FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_analises_updated_at BEFORE UPDATE ON public.analises_credito
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
