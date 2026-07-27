-- Camada de Gestão: performance por corretor agregada numa JANELA de meses.
-- Motivação (Raio-X do Corretor): os cards de resultado (vendas, VGV, visitas,
-- 1ª resposta) vinham de gestao_performance_corretores, que é MENSAL — o
-- filtro de período da tela não tinha efeito sobre eles. Esta RPC agrega
-- metrics.performance_corretor_mensal nos meses-calendário que contêm
-- [_de, _ate], mantendo o MESMO shape da versão mensal (o front reaproveita
-- PerformanceRow e compararComTime sem mudança).

CREATE OR REPLACE FUNCTION public.gestao_performance_corretores_janela(
  _de date,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  corretor_id uuid,
  nome text,
  presente boolean,
  limite_diario_leads int,
  leads_recebidos int,
  interacoes int,
  contatos int,
  agendamentos_criados int,
  visitas_realizadas int,
  no_shows int,
  analises int,
  tarefas_concluidas int,
  vendas int,
  vgv numeric,
  primeira_resposta_p50_min numeric,
  leads_respondidos int,
  carga_ativa int,
  capacidade_pct numeric,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _esc record;
  -- Grão da camada metrics é o mês-calendário: a janela arredonda para os
  -- meses que contêm [_de, _ate] (sem _de: últimos 6 meses; sem _ate: hoje).
  _mes_ini date := date_trunc('month',
    COALESCE(_de, (now() - interval '5 months')::date))::date;
  _mes_fim date := date_trunc('month', COALESCE(_ate, now()::date))::date;
  _mes_atual date := date_trunc('month', now())::date;
  _capacidade int := GREATEST(COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 40), 1);
BEGIN
  _esc := public._gestao_escopo();
  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.presente,
    p.limite_diario_leads,
    COALESCE(sum(m.leads_recebidos), 0)::int,
    COALESCE(sum(m.interacoes), 0)::int,
    COALESCE(sum(m.contatos), 0)::int,
    COALESCE(sum(m.agendamentos_criados), 0)::int,
    COALESCE(sum(m.visitas_realizadas), 0)::int,
    COALESCE(sum(m.no_shows), 0)::int,
    COALESCE(sum(m.analises), 0)::int,
    COALESCE(sum(m.tarefas_concluidas), 0)::int,
    COALESCE(sum(m.vendas), 0)::int,
    COALESCE(sum(m.vgv), 0),
    -- p50 da janela ≈ média dos p50 mensais ponderada por leads respondidos
    -- (o p50 exato exigiria os tempos brutos, que a MV não guarda).
    round(
      sum(m.primeira_resposta_p50_min * m.leads_respondidos)
        FILTER (WHERE m.primeira_resposta_p50_min IS NOT NULL AND m.leads_respondidos > 0)
      / NULLIF(sum(m.leads_respondidos)
        FILTER (WHERE m.primeira_resposta_p50_min IS NOT NULL AND m.leads_respondidos > 0), 0),
      0),
    COALESCE(sum(m.leads_respondidos), 0)::int,
    -- Carga é leitura de AGORA (não soma na janela): mês corrente da MV.
    COALESCE(max(m.carga_ativa) FILTER (WHERE m.mes = _mes_atual), 0)::int,
    round(100.0 * COALESCE(max(m.carga_ativa) FILTER (WHERE m.mes = _mes_atual), 0) / _capacidade, 0),
    (SELECT a.atualizado_em FROM metrics.atualizacoes a
     WHERE a.objeto = 'performance_corretor_mensal')
  FROM public.profiles p
  LEFT JOIN metrics.performance_corretor_mensal m
    ON m.corretor_id = p.id AND m.mes BETWEEN _mes_ini AND _mes_fim
  WHERE p.ativo = true
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = p.id AND ur.role = 'corretor')
    AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  GROUP BY p.id, p.nome, p.presente, p.limite_diario_leads
  ORDER BY COALESCE(sum(m.vgv), 0) DESC, COALESCE(sum(m.vendas), 0) DESC, p.nome;
END;
$$;

COMMENT ON FUNCTION public.gestao_performance_corretores_janela(date, date) IS
  'Raio-X/Tela 4: mesma linha por corretor de gestao_performance_corretores, agregada nos meses-calendário que contêm [_de, _ate] (grão da MV é mensal — datas no meio do mês arredondam para o mês inteiro). Somas para esforço/resultado; 1ª resposta = média dos p50 mensais ponderada por leads respondidos (proxy); carga/capacidade = leitura do mês corrente. Escopo: gestor só a equipe; corretor recebe forbidden.';

REVOKE ALL ON FUNCTION public.gestao_performance_corretores_janela(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_performance_corretores_janela(date, date) TO authenticated, service_role;
