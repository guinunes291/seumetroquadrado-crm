
CREATE TABLE public.leads_landing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'novo',
  tipo text,
  nome text,
  whatsapp text,
  renda text,
  regiao text,
  origem text,
  pagina text,
  referrer text,
  timestamp_cliente timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  sim_renda numeric,
  sim_tem_dependente boolean,
  sim_carteira36m boolean,
  sim_fgts numeric,
  sim_entrada numeric,
  sim_aluguel numeric,
  sim_faixa int,
  sim_segmento text,
  sim_subsidio numeric,
  sim_financiamento numeric,
  sim_parcela numeric,
  sim_teto_imovel numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_landing TO authenticated;
GRANT ALL ON public.leads_landing TO service_role;

ALTER TABLE public.leads_landing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/gestores veem leads landing"
ON public.leads_landing FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));

CREATE POLICY "Admins/gestores atualizam leads landing"
ON public.leads_landing FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Admins deletam leads landing"
ON public.leads_landing FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_leads_landing_recebido_em ON public.leads_landing (recebido_em DESC);
CREATE INDEX idx_leads_landing_status ON public.leads_landing (status);
CREATE INDEX idx_leads_landing_tipo ON public.leads_landing (tipo);
CREATE INDEX idx_leads_landing_faixa ON public.leads_landing (sim_faixa);

CREATE TRIGGER trg_leads_landing_updated_at
BEFORE UPDATE ON public.leads_landing
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
