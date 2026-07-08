-- Webhook do Simulador Aluguel vs. Parcela — POST /api/public/webhooks/simulacao.
--
-- 1) Tabela simulacoes: registra toda simulação recebida (com ou sem telefone).
-- 2) telefone_canonico + buscar_lead_por_telefone: casa o telefone do cliente
--    com um lead ativo da base, tolerante ao DDI 55 (a base tem os dois formatos).
-- 3) Config de distribuição da origem 'simulador' (enum criado na migration
--    anterior — precisa de transação separada).
--
-- Regra de negócio (DESIGN §2.4 do simulador):
--   telefone casa com lead  -> anexa a simulação à timeline (interacoes);
--   telefone novo           -> cria lead origem 'simulador' e entra na roleta;
--   sem telefone            -> grava só o evento (linha em simulacoes).

-- ---------------------------------------------------------------------------
-- 1) Tabela simulacoes
-- ---------------------------------------------------------------------------
CREATE TABLE public.simulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'simulador-aluguel-parcela',
  versao_calculo text,
  -- Id externo do corretor no simulador (ex.: COR001, do corretores.csv).
  -- NÃO é o uuid de profiles — o vínculo com o CRM é feito fora do banco.
  corretor_ref text,
  -- Telefone do cliente como recebido: 55 + DDD + número, só dígitos.
  cliente_telefone text,
  empreendimento text,

  -- Inputs achatados (relatórios/dashboards sem abrir o jsonb)
  aluguel numeric,
  renda numeric,
  entrada numeric,

  -- Resultado achatado
  faixa text,
  taxa_aa numeric,
  parcela_estimada numeric,
  valor_imovel_max numeric,
  aluguel_10anos numeric,
  patrimonio_10anos numeric,
  mes_cruzamento int,

  -- Carimbo do servidor do simulador (payload.ts)
  ts_origem timestamptz,

  -- Vínculo com o lead (casado por telefone ou criado por esta simulação)
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_criado boolean NOT NULL DEFAULT false,

  -- Payload completo, para nada se perder
  raw jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.simulacoes IS
  'Simulações recebidas do Simulador Aluguel vs. Parcela (webhook público).';
COMMENT ON COLUMN public.simulacoes.corretor_ref IS
  'Id do corretor no simulador (COR001…), não é uuid de profiles.';
COMMENT ON COLUMN public.simulacoes.mes_cruzamento IS
  'Primeiro mês (1–120) em que o aluguel acumulado ultrapassa o patrimônio; null = patrimônio ficou à frente os 10 anos.';

GRANT SELECT ON public.simulacoes TO authenticated;
GRANT ALL ON public.simulacoes TO service_role;

ALTER TABLE public.simulacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/gestores veem simulacoes"
ON public.simulacoes FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR public.has_role(auth.uid(),'superintendente')
);

CREATE POLICY "Corretor vê simulações dos seus leads"
ON public.simulacoes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = simulacoes.lead_id AND l.corretor_id = auth.uid()
  )
);

CREATE POLICY "Admins deletam simulacoes"
ON public.simulacoes FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_simulacoes_recebido_em ON public.simulacoes (recebido_em DESC);
CREATE INDEX idx_simulacoes_lead_id ON public.simulacoes (lead_id);
CREATE INDEX idx_simulacoes_corretor_ref ON public.simulacoes (corretor_ref);
CREATE INDEX idx_simulacoes_telefone ON public.simulacoes (cliente_telefone);

CREATE TRIGGER trg_simulacoes_updated_at
BEFORE UPDATE ON public.simulacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Casamento de telefone tolerante ao DDI 55
--    A base tem telefones com e sem o 55 (Facebook manda com, landing sem).
--    Canônico = só dígitos, removendo o DDI apenas quando ele existe de fato
--    (12–13 dígitos começando com 55) — preserva DDD 55 (região de Santa Maria).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.telefone_canonico(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(t.d) IN (12, 13) AND t.d LIKE '55%' THEN substring(t.d FROM 3)
    ELSE t.d
  END
  FROM (SELECT regexp_replace(coalesce(_telefone, ''), '\D', '', 'g') AS d) t;
$$;

CREATE OR REPLACE FUNCTION public.buscar_lead_por_telefone(_telefone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.leads l
  WHERE length(public.telefone_canonico(_telefone)) >= 10
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND public.telefone_canonico(l.telefone) = public.telefone_canonico(_telefone)
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

-- Só o webhook (service_role) usa: evita sondagem de leads por telefone
-- a partir de qualquer sessão autenticada.
REVOKE EXECUTE ON FUNCTION public.buscar_lead_por_telefone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_lead_por_telefone(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Distribuição: leads do simulador seguem o caminho dos webhooks
--    (roleta de presença + repasse por SLA de minutos, como chatbot/site).
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_config (origem, timeout_horas, timeout_minutos)
VALUES ('simulador', 24, 5)
ON CONFLICT (origem) DO NOTHING;
