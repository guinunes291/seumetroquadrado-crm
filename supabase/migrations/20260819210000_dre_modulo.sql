-- ============================================================================
-- MÓDULO DRE POR UNIDADE + CONSOLIDADO (100% aditivo)
-- ============================================================================
-- Demonstração de resultado por unidade operacional (SMQ Bruno / SMQ Sheldon /
-- SMQ Guilherme) com a cascata da planilha oficial, mais o consolidado da
-- rede. Vive inteiro em tabelas novas com prefixo `dre_` e funções `dre_*`:
-- nenhuma tabela existente é alterada; o módulo apenas LÊ vendas, comissoes,
-- profiles, leads e projetos.
--
-- Peças:
--  * dre_unidades / dre_unidade_membros — as 3 unidades e o vínculo de cada
--    usuário do CRM (profiles) a uma unidade+papel, com vigência.
--  * dre_venda_unidade — override manual venda→unidade (vence a regra
--    automática); alimentado pela fila "vendas sem unidade".
--  * dre_parametros — percentuais do modelo (comissão, imposto, cadeiras,
--    reinvestimento, reserva, caixa mínimo), versionados por vigência.
--  * dre_categorias_despesa / dre_despesas — custos fixos por unidade e
--    competência (regime caixa usa data_pagamento).
--  * dre_orcamento — orçado por unidade/ano/mês/linha (comparar com o real).
--  * dre_socios_participacao — matriz societária % por sócio × unidade.
--  * dre_vw_vendas_unidade — resolve a unidade de cada venda (override >
--    gerente comissionado > corretor responsável > não atribuída).
--  * dre_calcular / dre_avisos / dre_drill_vendas / dre_renda_pessoas — RPCs
--    da tela (SECURITY DEFINER, exclusivas de admin/gestor).
--
-- Percentuais: dre_parametros guarda FRAÇÃO (0.0400 = 4%); as colunas
-- percentual_* de vendas guardam PONTOS (3.5 = 3,5%) — a conversão (/100) é
-- feita em _dre_pct, com fallback ao parâmetro vigente quando a venda não tem
-- percentual gravado (0/null). Todo valor monetário é numeric com round(_, 2).

-- ============================================================================
-- 1. TABELAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dre_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  operador_nome text,
  ativa boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dre_unidades IS
  'DRE — unidades operacionais da rede (SMQ Bruno/Sheldon/Guilherme). Cada uma tem operador, custos e DRE próprios.';
ALTER TABLE public.dre_unidades ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_unidade_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'corretor'
    CHECK (papel IN ('corretor', 'gerente', 'superintendente', 'socio')),
  vigencia_inicio date NOT NULL DEFAULT '2026-01-01',
  vigencia_fim date,
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  UNIQUE (profile_id, vigencia_inicio)
);
COMMENT ON TABLE public.dre_unidade_membros IS
  'DRE — vincula usuários existentes do CRM (profiles) a uma unidade, sem tocar em profiles. A vigência permite trocar alguém de unidade sem reescrever o passado.';
CREATE INDEX IF NOT EXISTS idx_dre_membros_profile ON public.dre_unidade_membros (profile_id);
CREATE INDEX IF NOT EXISTS idx_dre_membros_unidade ON public.dre_unidade_membros (unidade_id);
ALTER TABLE public.dre_unidade_membros ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_venda_unidade (
  venda_id uuid PRIMARY KEY REFERENCES public.vendas(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  definido_por uuid,
  definido_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dre_venda_unidade IS
  'DRE — override manual venda→unidade para vendas que a regra automática (gerente/corretor) não resolve. Vence qualquer regra.';
CREATE INDEX IF NOT EXISTS idx_dre_venda_unidade_unidade ON public.dre_venda_unidade (unidade_id);
ALTER TABLE public.dre_venda_unidade ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_parametros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- null = padrão da rede (vale para toda unidade sem parâmetro próprio)
  unidade_id uuid REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  comissao_total_pct numeric(6,4) NOT NULL CHECK (comissao_total_pct BETWEEN 0 AND 1),
  imposto_sobre_faturamento_pct numeric(6,4) NOT NULL CHECK (imposto_sobre_faturamento_pct BETWEEN 0 AND 1),
  consultor_pct numeric(6,4) NOT NULL CHECK (consultor_pct BETWEEN 0 AND 1),
  gerente_pct numeric(6,4) NOT NULL CHECK (gerente_pct BETWEEN 0 AND 1),
  socio_operador_pct numeric(6,4) NOT NULL CHECK (socio_operador_pct BETWEEN 0 AND 1),
  reinvestimento_pct_ebitda numeric(6,4) NOT NULL CHECK (reinvestimento_pct_ebitda BETWEEN 0 AND 1),
  reserva_expansao_pct_ebitda numeric(6,4) NOT NULL CHECK (reserva_expansao_pct_ebitda BETWEEN 0 AND 1),
  caixa_minimo_meses_custo_fixo numeric(4,2) NOT NULL DEFAULT 1 CHECK (caixa_minimo_meses_custo_fixo >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  UNIQUE NULLS NOT DISTINCT (unidade_id, vigencia_inicio)
);
COMMENT ON TABLE public.dre_parametros IS
  'DRE — parâmetros do modelo em FRAÇÃO (0.0400 = 4%), versionados por vigência (nova vigência = linha nova, nunca sobrescrever). unidade_id null = padrão da rede.';
ALTER TABLE public.dre_parametros ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_categorias_despesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  grupo text NOT NULL,
  ativa boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.dre_categorias_despesa IS 'DRE — categorias de custo fixo (marketing, ocupação, tecnologia...).';
ALTER TABLE public.dre_categorias_despesa ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.dre_categorias_despesa(id),
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  -- sempre dia 1 do mês (normalizado por trigger)
  competencia date NOT NULL,
  data_pagamento date,
  fornecedor text,
  recorrente boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
COMMENT ON TABLE public.dre_despesas IS
  'DRE — custos fixos e investimentos por unidade. Regime competência usa `competencia` (dia 1 do mês); regime caixa usa `data_pagamento` (null = ainda não pago).';
CREATE INDEX IF NOT EXISTS idx_dre_despesas_unidade_comp ON public.dre_despesas (unidade_id, competencia);
CREATE INDEX IF NOT EXISTS idx_dre_despesas_categoria ON public.dre_despesas (categoria_id);
ALTER TABLE public.dre_despesas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_orcamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  ano int NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  linha text NOT NULL CHECK (linha IN (
    'vendas_qtd', 'vgv', 'faturamento', 'impostos', 'receita_liquida',
    'consultor', 'gerente', 'socio_operador', 'margem_empresa', 'custos_fixos',
    'ebitda', 'reinvestimento', 'reserva_expansao', 'lucro_distribuicao',
    'resultado_mes', 'pro_labore', 'caixa_retido', 'caixa_acumulado')),
  valor numeric(14,2) NOT NULL,
  UNIQUE (unidade_id, ano, mes, linha)
);
COMMENT ON TABLE public.dre_orcamento IS
  'DRE — orçado por unidade/ano/mês/linha da cascata (import CSV unidade;ano;mes;linha;valor). Base do comparativo Real × Orçado.';
ALTER TABLE public.dre_orcamento ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dre_socios_participacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_nome text NOT NULL,
  unidade_id uuid NOT NULL REFERENCES public.dre_unidades(id) ON DELETE CASCADE,
  percentual numeric(6,4) NOT NULL CHECK (percentual BETWEEN 0 AND 1),
  vigencia_inicio date NOT NULL DEFAULT '2026-01-01',
  vigencia_fim date,
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  UNIQUE (socio_nome, unidade_id, vigencia_inicio)
);
COMMENT ON TABLE public.dre_socios_participacao IS
  'DRE — matriz societária: participação (fração) de cada sócio em cada unidade. A distribuição do lucro por sócio = lucro da unidade × percentual.';
ALTER TABLE public.dre_socios_participacao ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. GRANTS + RLS (gestão: admin e gestor; escrita idem — a configuração da
--    DRE é ferramenta de gestão, como o Fechamento)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.dre_unidades, public.dre_unidade_membros, public.dre_venda_unidade,
  public.dre_parametros, public.dre_categorias_despesa, public.dre_despesas,
  public.dre_orcamento, public.dre_socios_participacao
TO authenticated;
GRANT ALL ON
  public.dre_unidades, public.dre_unidade_membros, public.dre_venda_unidade,
  public.dre_parametros, public.dre_categorias_despesa, public.dre_despesas,
  public.dre_orcamento, public.dre_socios_participacao
TO service_role;

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dre_unidades', 'dre_unidade_membros', 'dre_venda_unidade',
    'dre_parametros', 'dre_categorias_despesa', 'dre_despesas',
    'dre_orcamento', 'dre_socios_participacao']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_gestao', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (
           public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
           OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role))
         WITH CHECK (
           public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
           OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role))$p$,
      t || '_gestao', t);
  END LOOP;
END;
$do$;

-- ============================================================================
-- 3. TRIGGER — normaliza competência da despesa para o dia 1 e carimba autor
-- ============================================================================

CREATE OR REPLACE FUNCTION public._dre_despesa_normalizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.competencia := date_trunc('month', NEW.competencia)::date;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dre_despesa_normalizar ON public.dre_despesas;
CREATE TRIGGER trg_dre_despesa_normalizar
  BEFORE INSERT OR UPDATE ON public.dre_despesas
  FOR EACH ROW EXECUTE FUNCTION public._dre_despesa_normalizar();

-- ============================================================================
-- 4. SEEDS (idempotentes — replay do harness e reaplicação em prod não duplicam)
-- ============================================================================

INSERT INTO public.dre_unidades (nome, operador_nome, ordem) VALUES
  ('SMQ Bruno', 'Bruno', 1),
  ('SMQ Sheldon', 'Sheldon', 2),
  ('SMQ Guilherme', 'Guilherme', 3)
ON CONFLICT (nome) DO NOTHING;

-- Parâmetro padrão da rede — valores da planilha oficial.
INSERT INTO public.dre_parametros (
  unidade_id, vigencia_inicio,
  comissao_total_pct, imposto_sobre_faturamento_pct,
  consultor_pct, gerente_pct, socio_operador_pct,
  reinvestimento_pct_ebitda, reserva_expansao_pct_ebitda,
  caixa_minimo_meses_custo_fixo)
SELECT NULL, DATE '2026-01-01', 0.0400, 0.1000, 0.0180, 0.0060, 0.0030, 0.2000, 0.2000, 1
WHERE NOT EXISTS (SELECT 1 FROM public.dre_parametros WHERE unidade_id IS NULL);

INSERT INTO public.dre_categorias_despesa (nome, grupo) VALUES
  ('Geração de leads', 'marketing'),
  ('Locação', 'ocupacao'),
  ('CRM', 'tecnologia'),
  ('Contador', 'administrativo'),
  ('Internet', 'tecnologia')
ON CONFLICT (nome) DO NOTHING;

-- Matriz societária atual (frações da planilha; 0.1670 ≈ 1/6 — a soma de cada
-- unidade fecha em 1.001 por arredondamento da planilha, tolerado na UI).
INSERT INTO public.dre_socios_participacao (socio_nome, unidade_id, percentual)
SELECT s.socio, u.id, s.pct
FROM (VALUES
  ('Bruno',     'SMQ Bruno',     0.5000), ('Bruno',     'SMQ Sheldon',   0.0000), ('Bruno',     'SMQ Guilherme', 0.0000),
  ('Sheldon',   'SMQ Bruno',     0.0000), ('Sheldon',   'SMQ Sheldon',   0.5000), ('Sheldon',   'SMQ Guilherme', 0.0000),
  ('Guilherme', 'SMQ Bruno',     0.1670), ('Guilherme', 'SMQ Sheldon',   0.1670), ('Guilherme', 'SMQ Guilherme', 0.5000),
  ('Fabio',     'SMQ Bruno',     0.1670), ('Fabio',     'SMQ Sheldon',   0.1670), ('Fabio',     'SMQ Guilherme', 0.2500),
  ('Alexandre', 'SMQ Bruno',     0.1670), ('Alexandre', 'SMQ Sheldon',   0.1670), ('Alexandre', 'SMQ Guilherme', 0.2500)
) AS s(socio, unidade, pct)
JOIN public.dre_unidades u ON u.nome = s.unidade
ON CONFLICT (socio_nome, unidade_id, vigencia_inicio) DO NOTHING;

-- ============================================================================
-- 5. VIEW — unidade de cada venda (sem alterar a tabela de vendas)
-- ============================================================================
-- Precedência: override manual > unidade do GERENTE comissionado na venda >
-- unidade do CORRETOR responsável > não atribuída (null). Vendas sem unidade
-- NÃO entram na DRE; aparecem na fila de atribuição da configuração.
-- security_invoker: quem consulta a view direto (fila da configuração) enxerga
-- apenas o que as RLS de vendas/leads/profiles já permitem.

CREATE OR REPLACE VIEW public.dre_vw_vendas_unidade
WITH (security_invoker = true) AS
SELECT
  v.id AS venda_id,
  COALESCE(o.unidade_id, ger.unidade_id, corr.unidade_id) AS unidade_id,
  CASE
    WHEN o.unidade_id IS NOT NULL THEN 'override'
    WHEN ger.unidade_id IS NOT NULL THEN 'gerente'
    WHEN corr.unidade_id IS NOT NULL THEN 'corretor'
  END AS origem_atribuicao,
  v.lead_id,
  l.nome AS cliente,
  COALESCE(pj.nome, v.projeto_nome) AS empreendimento,
  v.corretor_id,
  pr.nome AS corretor_nome,
  v.data_assinatura,
  v.data_recebimento,
  v.valor_venda,
  v.status_venda,
  v.distrato
FROM public.vendas v
LEFT JOIN public.dre_venda_unidade o ON o.venda_id = v.id
LEFT JOIN LATERAL (
  SELECT m.unidade_id
  FROM public.comissoes cm
  JOIN public.dre_unidade_membros m ON m.profile_id = cm.beneficiario_id
  WHERE cm.venda_id = v.id
    AND cm.tipo = 'gerente'
    AND cm.beneficiario_id IS NOT NULL
    AND m.vigencia_inicio <= v.data_assinatura
    AND (m.vigencia_fim IS NULL OR m.vigencia_fim >= v.data_assinatura)
  ORDER BY m.vigencia_inicio DESC
  LIMIT 1
) ger ON true
LEFT JOIN LATERAL (
  SELECT m.unidade_id
  FROM public.dre_unidade_membros m
  WHERE m.profile_id = v.corretor_id
    AND m.vigencia_inicio <= v.data_assinatura
    AND (m.vigencia_fim IS NULL OR m.vigencia_fim >= v.data_assinatura)
  ORDER BY m.vigencia_inicio DESC
  LIMIT 1
) corr ON true
LEFT JOIN public.leads l ON l.id = v.lead_id
LEFT JOIN public.projetos pj ON pj.id = v.projeto_id
LEFT JOIN public.profiles pr ON pr.id = v.corretor_id;

COMMENT ON VIEW public.dre_vw_vendas_unidade IS
  'DRE — venda→unidade resolvida (override > gerente comissionado > corretor > null), com campos de exibição para a fila de vendas sem unidade.';
GRANT SELECT ON public.dre_vw_vendas_unidade TO authenticated;
GRANT SELECT ON public.dre_vw_vendas_unidade TO service_role;

-- ============================================================================
-- 6. FUNÇÕES INTERNAS (sem grant — só as RPCs SECURITY DEFINER as alcançam)
-- ============================================================================

-- Percentual efetivo de uma venda: modo 'parametro' usa a fração do parâmetro;
-- modo 'venda' usa o percentual gravado na venda (PONTOS → /100), caindo no
-- parâmetro quando a venda não tem percentual gravado (0/null).
CREATE OR REPLACE FUNCTION public._dre_pct(p_pct_venda numeric, p_pct_param numeric, p_modo text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_modo = 'parametro' THEN p_pct_param
    ELSE COALESCE(NULLIF(p_pct_venda, 0) / 100.0, p_pct_param)
  END;
$$;
REVOKE ALL ON FUNCTION public._dre_pct(numeric, numeric, text) FROM PUBLIC, anon, authenticated;

-- Parâmetro vigente numa data: específico da unidade > padrão da rede; se a
-- data for anterior à primeira vigência, usa a vigência mais antiga (vendas
-- históricas não podem ficar sem parâmetro).
CREATE OR REPLACE FUNCTION public.dre_param_vigente(p_unidade_id uuid, p_data date)
RETURNS public.dre_parametros
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.dre_parametros;
BEGIN
  SELECT p.* INTO r
  FROM public.dre_parametros p
  WHERE (p.unidade_id = p_unidade_id OR p.unidade_id IS NULL)
    AND p.vigencia_inicio <= p_data
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim >= p_data)
  ORDER BY (p.unidade_id IS NOT NULL) DESC, p.vigencia_inicio DESC
  LIMIT 1;
  IF r.id IS NULL THEN
    SELECT p.* INTO r
    FROM public.dre_parametros p
    WHERE p.unidade_id = p_unidade_id OR p.unidade_id IS NULL
    ORDER BY (p.unidade_id IS NULL) DESC, p.vigencia_inicio ASC
    LIMIT 1;
  END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.dre_param_vigente(uuid, date) FROM PUBLIC, anon, authenticated;

-- Vendas de uma unidade/ano já calculadas venda a venda (nunca percentual
-- médio sobre VGV agregado). Percentual buscado sempre pela DATA DE ASSINATURA;
-- regime 'caixa' posiciona a venda no mês do recebimento (sem recebimento =
-- fora do regime caixa). Só vendas aprovadas e sem distrato.
CREATE OR REPLACE FUNCTION public._dre_vendas_calc(
  p_unidade_id uuid, p_ano int, p_regime text, p_modo_pct text)
RETURNS TABLE(
  venda_id uuid, lead_id uuid, cliente text, empreendimento text,
  corretor_nome text, data_assinatura date, data_recebimento date, mes int,
  vgv numeric, faturamento numeric, impostos numeric,
  consultor numeric, gerente numeric, socio_operador numeric)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    v.id,
    v.lead_id,
    l.nome,
    COALESCE(pj.nome, v.projeto_nome),
    pr.nome,
    v.data_assinatura,
    v.data_recebimento,
    CASE WHEN p_regime = 'caixa'
      THEN EXTRACT(month FROM v.data_recebimento)::int
      ELSE EXTRACT(month FROM v.data_assinatura)::int END,
    v.valor_venda,
    f.fat,
    round(f.fat * par.imposto_sobre_faturamento_pct, 2),
    round(v.valor_venda * public._dre_pct(v.percentual_corretor, par.consultor_pct, p_modo_pct), 2),
    round(v.valor_venda * public._dre_pct(v.percentual_gerente, par.gerente_pct, p_modo_pct), 2),
    round(v.valor_venda * public._dre_pct(v.percentual_superintendente, par.socio_operador_pct, p_modo_pct), 2)
  FROM public.vendas v
  JOIN public.dre_vw_vendas_unidade vu ON vu.venda_id = v.id AND vu.unidade_id = p_unidade_id
  LEFT JOIN public.leads l ON l.id = v.lead_id
  LEFT JOIN public.projetos pj ON pj.id = v.projeto_id
  LEFT JOIN public.profiles pr ON pr.id = v.corretor_id
  CROSS JOIN LATERAL public.dre_param_vigente(p_unidade_id, v.data_assinatura) par
  CROSS JOIN LATERAL (
    SELECT round(v.valor_venda * public._dre_pct(v.percentual_comissao, par.comissao_total_pct, p_modo_pct), 2) AS fat
  ) f
  WHERE v.status_venda = 'aprovada'::public.status_venda
    AND NOT v.distrato
    AND CASE WHEN p_regime = 'caixa'
      THEN v.data_recebimento IS NOT NULL AND EXTRACT(year FROM v.data_recebimento)::int = p_ano
      ELSE EXTRACT(year FROM v.data_assinatura)::int = p_ano END;
$$;
REVOKE ALL ON FUNCTION public._dre_vendas_calc(uuid, int, text, text) FROM PUBLIC, anon, authenticated;

-- A cascata de UMA unidade, mês a mês (mes 1..12). O consolidado soma as
-- unidades linha a linha em dre_calcular.
CREATE OR REPLACE FUNCTION public._dre_calcular_unidade(
  p_unidade_id uuid, p_ano int, p_regime text, p_modo_pct text)
RETURNS TABLE(linha text, mes int, valor numeric)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_qtd numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_vgv numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_fat numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_imp numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_cons numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_ger numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_soc numeric[] := array_fill(0::numeric, ARRAY[12]);
  v_custos numeric[] := array_fill(0::numeric, ARRAY[12]);
  r record;
  par public.dre_parametros;
  m int;
  rl numeric; margem numeric; ebitda numeric;
  reinv numeric; reserva numeric; lucro numeric;
  resultado numeric; prolab numeric; retido numeric;
  caixa numeric := 0;
  -- lucro ainda não distribuído: rola de um trimestre para o outro quando o
  -- caixa mínimo impede a distribuição.
  lucro_nao_dist numeric := 0;
  total_custos numeric := 0;
  meses_com_custo int := 0;
  media_custo numeric := 0;
  caixa_min numeric;
BEGIN
  FOR r IN
    SELECT c.mes AS m_venda, c.vgv, c.faturamento, c.impostos,
           c.consultor, c.gerente, c.socio_operador
    FROM public._dre_vendas_calc(p_unidade_id, p_ano, p_regime, p_modo_pct) c
  LOOP
    v_qtd[r.m_venda] := v_qtd[r.m_venda] + 1;
    v_vgv[r.m_venda] := v_vgv[r.m_venda] + r.vgv;
    v_fat[r.m_venda] := v_fat[r.m_venda] + r.faturamento;
    v_imp[r.m_venda] := v_imp[r.m_venda] + r.impostos;
    v_cons[r.m_venda] := v_cons[r.m_venda] + r.consultor;
    v_ger[r.m_venda] := v_ger[r.m_venda] + r.gerente;
    v_soc[r.m_venda] := v_soc[r.m_venda] + r.socio_operador;
  END LOOP;

  FOR r IN
    SELECT
      CASE WHEN p_regime = 'caixa'
        THEN EXTRACT(month FROM d.data_pagamento)::int
        ELSE EXTRACT(month FROM d.competencia)::int END AS m_desp,
      sum(d.valor) AS total
    FROM public.dre_despesas d
    WHERE d.unidade_id = p_unidade_id
      AND CASE WHEN p_regime = 'caixa'
        THEN d.data_pagamento IS NOT NULL AND EXTRACT(year FROM d.data_pagamento)::int = p_ano
        ELSE EXTRACT(year FROM d.competencia)::int = p_ano END
    GROUP BY 1
  LOOP
    v_custos[r.m_desp] := r.total;
  END LOOP;

  -- Custo fixo médio mensal (base do caixa mínimo): média dos meses do ano que
  -- têm despesa lançada — com 2 meses lançados, dividir por 12 subestimaria.
  SELECT COALESCE(sum(x), 0), count(*) FILTER (WHERE x > 0)
    INTO total_custos, meses_com_custo
  FROM unnest(v_custos) x;
  IF meses_com_custo > 0 THEN
    media_custo := total_custos / meses_com_custo;
  END IF;

  FOR m IN 1..12 LOOP
    par := public.dre_param_vigente(p_unidade_id, make_date(p_ano, m, 1));
    IF par.id IS NULL THEN
      RAISE EXCEPTION 'DRE: nenhum parâmetro cadastrado em dre_parametros';
    END IF;

    rl := v_fat[m] - v_imp[m];
    margem := rl - v_cons[m] - v_ger[m] - v_soc[m];
    ebitda := margem - v_custos[m];
    IF ebitda > 0 THEN
      reinv := round(ebitda * par.reinvestimento_pct_ebitda, 2);
      reserva := round(ebitda * par.reserva_expansao_pct_ebitda, 2);
    ELSE
      reinv := 0;
      reserva := 0;
    END IF;
    lucro := ebitda - reinv - reserva;
    resultado := lucro;
    lucro_nao_dist := lucro_nao_dist + resultado;

    -- Pró-labore só no fechamento de trimestre, sobre o lucro acumulado ainda
    -- não distribuído, e só no que exceder o caixa mínimo (meses × custo fixo
    -- médio). O que não der para distribuir rola para o trimestre seguinte.
    IF m IN (3, 6, 9, 12) THEN
      caixa_min := round(par.caixa_minimo_meses_custo_fixo * media_custo, 2);
      prolab := round(greatest(0, least(lucro_nao_dist, caixa + resultado - caixa_min)), 2);
      lucro_nao_dist := lucro_nao_dist - prolab;
    ELSE
      prolab := 0;
    END IF;
    retido := resultado - prolab;
    caixa := caixa + retido;

    linha := 'vendas_qtd';         mes := m; valor := v_qtd[m];    RETURN NEXT;
    linha := 'vgv';                mes := m; valor := v_vgv[m];    RETURN NEXT;
    linha := 'faturamento';        mes := m; valor := v_fat[m];    RETURN NEXT;
    linha := 'impostos';           mes := m; valor := v_imp[m];    RETURN NEXT;
    linha := 'receita_liquida';    mes := m; valor := rl;          RETURN NEXT;
    linha := 'consultor';          mes := m; valor := v_cons[m];   RETURN NEXT;
    linha := 'gerente';            mes := m; valor := v_ger[m];    RETURN NEXT;
    linha := 'socio_operador';     mes := m; valor := v_soc[m];    RETURN NEXT;
    linha := 'margem_empresa';     mes := m; valor := margem;      RETURN NEXT;
    linha := 'custos_fixos';       mes := m; valor := v_custos[m]; RETURN NEXT;
    linha := 'ebitda';             mes := m; valor := ebitda;      RETURN NEXT;
    linha := 'reinvestimento';     mes := m; valor := reinv;       RETURN NEXT;
    linha := 'reserva_expansao';   mes := m; valor := reserva;     RETURN NEXT;
    linha := 'lucro_distribuicao'; mes := m; valor := lucro;       RETURN NEXT;
    linha := 'resultado_mes';      mes := m; valor := resultado;   RETURN NEXT;
    linha := 'pro_labore';         mes := m; valor := prolab;      RETURN NEXT;
    linha := 'caixa_retido';       mes := m; valor := retido;      RETURN NEXT;
    linha := 'caixa_acumulado';    mes := m; valor := caixa;       RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._dre_calcular_unidade(uuid, int, text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. RPCs DA TELA (SECURITY DEFINER + guarda de papel; grant a authenticated)
-- ============================================================================

-- Cascata completa: 12 meses (mes 1..12) + total do ano (mes 0). p_unidade_id
-- null = CONSOLIDADO (soma das unidades ativas linha a linha — o pró-labore é
-- calculado por unidade, com o caixa mínimo de cada uma, e depois somado).
CREATE OR REPLACE FUNCTION public.dre_calcular(
  p_unidade_id uuid, p_ano int,
  p_regime text DEFAULT 'competencia', p_modo_pct text DEFAULT 'venda')
RETURNS TABLE(linha text, ordem int, rotulo text, mes int, valor numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'DRE é restrita à gestão' USING ERRCODE = '42501';
  END IF;
  IF p_regime NOT IN ('competencia', 'caixa') THEN
    RAISE EXCEPTION 'regime inválido: % (use competencia ou caixa)', p_regime;
  END IF;
  IF p_modo_pct NOT IN ('venda', 'parametro') THEN
    RAISE EXCEPTION 'modo de percentual inválido: % (use venda ou parametro)', p_modo_pct;
  END IF;
  IF p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'ano inválido: %', p_ano;
  END IF;

  RETURN QUERY
  WITH unidades AS (
    SELECT u.id
    FROM public.dre_unidades u
    WHERE (p_unidade_id IS NULL AND u.ativa) OR u.id = p_unidade_id
  ),
  bruto AS (
    SELECT r.linha, r.mes, r.valor
    FROM unidades u
    CROSS JOIN LATERAL public._dre_calcular_unidade(u.id, p_ano, p_regime, p_modo_pct) r
  ),
  meses AS (
    SELECT b.linha, b.mes, sum(b.valor) AS valor
    FROM bruto b
    GROUP BY b.linha, b.mes
  ),
  totais AS (
    -- mes 0 = total do ano. Caixa acumulado não se soma: o total é a posição
    -- de dezembro.
    SELECT m.linha, 0 AS mes,
      CASE WHEN m.linha = 'caixa_acumulado'
        THEN (SELECT m12.valor FROM meses m12 WHERE m12.linha = m.linha AND m12.mes = 12)
        ELSE sum(m.valor) END AS valor
    FROM meses m
    GROUP BY m.linha
  ),
  def(d_linha, d_ordem, d_rotulo) AS (VALUES
    ('vendas_qtd',         1,  'Vendas no mês'),
    ('vgv',                2,  'VGV do mês'),
    ('faturamento',        3,  'Faturamento (comissão)'),
    ('impostos',           4,  '(−) Impostos sobre faturamento'),
    ('receita_liquida',    5,  '(=) Receita Líquida'),
    ('consultor',          6,  '(−) Consultor'),
    ('gerente',            7,  '(−) Gerente'),
    ('socio_operador',     8,  '(−) Sócio operador'),
    ('margem_empresa',     9,  '(=) Margem da Empresa'),
    ('custos_fixos',       10, '(−) Custos Fixos e Investimentos'),
    ('ebitda',             11, '(=) EBITDA'),
    ('reinvestimento',     12, '(−) Reinvestimento'),
    ('reserva_expansao',   13, '(−) Reserva de expansão'),
    ('lucro_distribuicao', 14, '(=) Lucro para Distribuição'),
    ('resultado_mes',      15, 'Resultado do mês'),
    ('pro_labore',         16, '(−) Distribuição de pró-labore'),
    ('caixa_retido',       17, '(=) Caixa retido no mês'),
    ('caixa_acumulado',    18, 'Caixa acumulado (fim do mês)'))
  SELECT d.d_linha, d.d_ordem, d.d_rotulo, x.mes, COALESCE(x.valor, 0)
  FROM def d
  JOIN (SELECT * FROM meses UNION ALL SELECT * FROM totais) x ON x.linha = d.d_linha
  ORDER BY d.d_ordem, x.mes;
END;
$$;
REVOKE ALL ON FUNCTION public.dre_calcular(uuid, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_calcular(uuid, int, text, text) TO authenticated;

-- Avisos da tela: pendentes de aprovação (não incluídos), aprovadas sem data
-- de recebimento (fora do regime caixa) e aprovadas/pendentes sem unidade.
CREATE OR REPLACE FUNCTION public.dre_avisos(p_unidade_id uuid, p_ano int)
RETURNS TABLE(
  pendentes_qtd int, pendentes_vgv numeric,
  sem_recebimento_qtd int, sem_recebimento_vgv numeric,
  sem_unidade_qtd int, sem_unidade_vgv numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'DRE é restrita à gestão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE pend)::int,
    COALESCE(sum(t.valor_venda) FILTER (WHERE pend), 0)::numeric,
    count(*) FILTER (WHERE semrec)::int,
    COALESCE(sum(t.valor_venda) FILTER (WHERE semrec), 0)::numeric,
    count(*) FILTER (WHERE semuni)::int,
    COALESCE(sum(t.valor_venda) FILTER (WHERE semuni), 0)::numeric
  FROM (
    SELECT
      v.valor_venda,
      v.status_venda = 'pendente'::public.status_venda
        AND (p_unidade_id IS NULL OR vu.unidade_id = p_unidade_id) AS pend,
      v.status_venda = 'aprovada'::public.status_venda
        AND v.data_recebimento IS NULL
        AND (p_unidade_id IS NULL OR vu.unidade_id = p_unidade_id) AS semrec,
      v.status_venda IN ('aprovada'::public.status_venda, 'pendente'::public.status_venda)
        AND vu.unidade_id IS NULL AS semuni
    FROM public.vendas v
    JOIN public.dre_vw_vendas_unidade vu ON vu.venda_id = v.id
    WHERE NOT v.distrato
      AND EXTRACT(year FROM v.data_assinatura)::int = p_ano
  ) t;
END;
$$;
REVOKE ALL ON FUNCTION public.dre_avisos(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_avisos(uuid, int) TO authenticated;

-- Drill-down: as vendas que compõem uma célula (unidade/ano/mês/regime/modo).
-- p_unidade_id null = consolidado (todas as unidades ativas).
CREATE OR REPLACE FUNCTION public.dre_drill_vendas(
  p_unidade_id uuid, p_ano int, p_mes int,
  p_regime text DEFAULT 'competencia', p_modo_pct text DEFAULT 'venda')
RETURNS TABLE(
  venda_id uuid, lead_id uuid, unidade_nome text, cliente text,
  empreendimento text, corretor_nome text, data_assinatura date,
  data_recebimento date, vgv numeric, faturamento numeric, impostos numeric,
  consultor numeric, gerente numeric, socio_operador numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'DRE é restrita à gestão' USING ERRCODE = '42501';
  END IF;
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'mês inválido: %', p_mes;
  END IF;

  RETURN QUERY
  SELECT
    c.venda_id, c.lead_id, u.nome, c.cliente, c.empreendimento,
    c.corretor_nome, c.data_assinatura, c.data_recebimento, c.vgv,
    c.faturamento, c.impostos, c.consultor, c.gerente, c.socio_operador
  FROM public.dre_unidades u
  CROSS JOIN LATERAL public._dre_vendas_calc(u.id, p_ano, p_regime, p_modo_pct) c
  WHERE ((p_unidade_id IS NULL AND u.ativa) OR u.id = p_unidade_id)
    AND c.mes = p_mes
  ORDER BY c.data_assinatura, c.cliente;
END;
$$;
REVOKE ALL ON FUNCTION public.dre_drill_vendas(uuid, int, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_drill_vendas(uuid, int, int, text, text) TO authenticated;

-- Renda por pessoa no ano (aba consolidado): o que cada beneficiário recebeu
-- de comissão (cadeiras), lido das comissões existentes de vendas aprovadas.
-- A distribuição de lucro por sócio é combinada na tela (lucro da unidade ×
-- matriz societária).
CREATE OR REPLACE FUNCTION public.dre_renda_pessoas(p_ano int)
RETURNS TABLE(profile_id uuid, nome text, tipo text, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'DRE é restrita à gestão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.beneficiario_id,
    COALESCE(pr.nome, c.beneficiario_nome, 'Sem beneficiário'),
    c.tipo,
    sum(c.valor_liquido)::numeric
  FROM public.comissoes c
  JOIN public.vendas v ON v.id = c.venda_id
  LEFT JOIN public.profiles pr ON pr.id = c.beneficiario_id
  WHERE v.status_venda = 'aprovada'::public.status_venda
    AND NOT v.distrato
    AND EXTRACT(year FROM v.data_assinatura)::int = p_ano
    AND c.status <> 'cancelada'
  GROUP BY c.beneficiario_id, COALESCE(pr.nome, c.beneficiario_nome, 'Sem beneficiário'), c.tipo;
END;
$$;
REVOKE ALL ON FUNCTION public.dre_renda_pessoas(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_renda_pessoas(int) TO authenticated;
