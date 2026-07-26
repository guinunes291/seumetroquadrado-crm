-- Camada de Gestão: origem que vende (aba Relatórios da /inteligencia).
--
-- Decisão de mídia: quantos leads cada origem gerou no período e quantos
-- VENDERAM (coorte — seguidos até hoje), com a cobertura de histórico para
-- a UI suprimir conversão de coortes sem transições. Fonte:
-- metrics.funil_coorte_mensal (grão mes × corretor × origem já existente).
-- Fallback do front: rel_origem_efetiva (conta por status atual, sem coorte).

CREATE OR REPLACE FUNCTION public.gestao_origens(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  origem text,
  leads int,
  vendas int,
  conv_pct numeric,
  cobertura_pct numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    COALESCE(m.origem, 'desconhecida'),
    sum(m.leads)::int,
    sum(m.vendas)::int,
    round(100.0 * sum(m.vendas) / NULLIF(sum(m.leads), 0), 1),
    round(sum(m.cobertura_transicoes_pct * m.leads) / NULLIF(sum(m.leads), 0), 1),
    (SELECT a.atualizado_em FROM metrics.atualizacoes a
     WHERE a.objeto = 'funil_coorte_mensal')
  FROM metrics.funil_coorte_mensal m
  WHERE (_de IS NULL OR m.mes_coorte >= date_trunc('month', _de)::date)
    AND (_ate IS NULL OR m.mes_coorte <= date_trunc('month', _ate)::date)
    AND (_esc.ve_tudo OR m.corretor_id = ANY(_esc.equipe))
  GROUP BY 1
  ORDER BY 3 DESC, 2 DESC;
END;
$$;

COMMENT ON FUNCTION public.gestao_origens(date, date) IS
  'Relatórios: leads × vendas × conversão por ORIGEM na leitura de coorte (leads criados no período, seguidos até hoje — metrics.funil_coorte_mensal). cobertura_pct baixa ⇒ UI mostra "sem dado" na conversão. Escopo: gestor só a equipe; corretor: forbidden.';

REVOKE ALL ON FUNCTION public.gestao_origens(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_origens(date, date) TO authenticated, service_role;
