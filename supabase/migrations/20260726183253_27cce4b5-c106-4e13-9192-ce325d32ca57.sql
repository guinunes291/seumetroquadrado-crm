CREATE TABLE IF NOT EXISTS public.extrato_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta text NOT NULL CHECK (conta IN ('itau_ltda','c6_ei')),
  data date NOT NULL,
  valor numeric(14,2) NOT NULL,
  descricao text NOT NULL DEFAULT '',
  contraparte text,
  fitid text NOT NULL,
  arquivo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','conciliada','ignorada')),
  motivo_ignorada text,
  importado_por uuid,
  importado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extrato_transacoes_conta_fitid_key UNIQUE (conta, fitid)
);

CREATE INDEX IF NOT EXISTS idx_extrato_transacoes_status ON public.extrato_transacoes (status, data DESC);
CREATE INDEX IF NOT EXISTS idx_extrato_transacoes_conta_data ON public.extrato_transacoes (conta, data DESC);

GRANT SELECT ON public.extrato_transacoes TO authenticated;
GRANT ALL ON public.extrato_transacoes TO service_role;
ALTER TABLE public.extrato_transacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extrato_select_admin_gestor" ON public.extrato_transacoes;
CREATE POLICY "extrato_select_admin_gestor" ON public.extrato_transacoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TABLE IF NOT EXISTS public.conciliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transacao_id uuid NOT NULL REFERENCES public.extrato_transacoes(id),
  tipo text NOT NULL CHECK (tipo IN ('comissao','venda')),
  comissao_id uuid REFERENCES public.comissoes(id),
  venda_id uuid REFERENCES public.vendas(id),
  data_anterior date,
  data_aplicada date,
  confirmado_por uuid,
  confirmado_por_nome text,
  desfeito_em timestamptz,
  desfeito_por uuid,
  desfeito_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conciliacoes_alvo_coerente CHECK (
    (tipo = 'comissao' AND comissao_id IS NOT NULL AND venda_id IS NULL) OR
    (tipo = 'venda' AND venda_id IS NOT NULL AND comissao_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_conciliacao_comissao_ativa
  ON public.conciliacoes (comissao_id) WHERE desfeito_em IS NULL AND comissao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacoes_transacao ON public.conciliacoes (transacao_id);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_venda ON public.conciliacoes (venda_id);

GRANT SELECT ON public.conciliacoes TO authenticated;
GRANT ALL ON public.conciliacoes TO service_role;
ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conciliacoes_select_admin_gestor" ON public.conciliacoes;
CREATE POLICY "conciliacoes_select_admin_gestor" ON public.conciliacoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS data_recebimento date;

DROP TRIGGER IF EXISTS trg_extrato_transacoes_updated_at ON public.extrato_transacoes;
CREATE TRIGGER trg_extrato_transacoes_updated_at BEFORE UPDATE ON public.extrato_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_conciliacoes_updated_at ON public.conciliacoes;
CREATE TRIGGER trg_conciliacoes_updated_at BEFORE UPDATE ON public.conciliacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();