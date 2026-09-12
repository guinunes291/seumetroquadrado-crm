CREATE TABLE IF NOT EXISTS public.higiene_execucao_log (
  id            bigserial PRIMARY KEY,
  execucao_id   uuid NOT NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  lead_id       uuid NOT NULL,
  corretor_id   uuid,
  status_antes  public.lead_status NOT NULL,
  acao_regra    text NOT NULL,
  acao          text NOT NULL,
  dias_parado   integer NOT NULL,
  -- Por que NAO agiu. Sem isto, "0 aplicados" e indistinguivel de "motor
  -- quebrado" — a falha silenciosa que este projeto existe para evitar.
  motivo_pulo   text,
  nunca_tocado  boolean NOT NULL,
  escrita_lote        boolean NOT NULL,
  escrita_lote_global boolean NOT NULL,
  ressurreicao_sdr    boolean NOT NULL DEFAULT false,
  -- A seguranca do motor depende de lote_min_leads. Um UPDATE nele torna
  -- milhares de leads elegiveis sem rastro. Por isso a config vai carimbada.
  cfg_modo              text,
  cfg_dias_parado_min   integer,
  cfg_lote_min_leads    integer,
  cfg_teto_perdidos_dia integer,
  aplicado      boolean NOT NULL DEFAULT false,
  erro          text,
  desfeito_em   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hig_log_exec ON public.higiene_execucao_log (execucao_id);
CREATE INDEX IF NOT EXISTS idx_hig_log_lead ON public.higiene_execucao_log (lead_id);
CREATE INDEX IF NOT EXISTS idx_hig_log_ts   ON public.higiene_execucao_log (ts DESC);

GRANT SELECT ON public.higiene_execucao_log TO authenticated;
GRANT ALL ON public.higiene_execucao_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.higiene_execucao_log_id_seq TO service_role;

ALTER TABLE public.higiene_execucao_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS higiene_log_select_gestao ON public.higiene_execucao_log;
CREATE POLICY higiene_log_select_gestao ON public.higiene_execucao_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role));

COMMENT ON TABLE public.higiene_execucao_log IS
  'Registro do motor de higiene. Em modo sombra e o unico produto do motor: o que ele FARIA.';