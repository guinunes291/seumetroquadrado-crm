-- ============================================================================
-- RPCs SECURITY DEFINER: fim do EXECUTE para anon
-- ============================================================================
-- Continuação de 20261009120300. A lista de docs/ops/funcoes-executaveis-anon.md
-- tinha sido feita por leitura automática do corpo das funções, e errou: seis
-- funções marcadas como "uid nulo = sistema" (create_oferta_ativa,
-- copa_inicializar_dados, dashboard_metricas_por_corretor,
-- dashboard_redistribuicoes, equipe_metricas_campanha,
-- rel_conversao_por_corretor) fazem `IF _caller IS NULL OR NOT <papel> THEN
-- RAISE 'forbidden'` — RECUSAM o anônimo. A auditoria foi refeita chamando, como
-- anon e numa transação desfeita, cada uma das 43 SECURITY DEFINER que ainda
-- aceitavam anon: 24 recusam; 19 executam. Entre as 19, os problemas reais:
--
--   * dashboard_atividade_periodo — este SIM trata uid nulo como sistema
--     (`_sem_caller := (_caller IS NULL)` tira o recorte de carteira): um
--     anônimo lia os números da empresa inteira — leads novos, agendamentos,
--     visitas, pastas, análises, perdidos, VENDAS e VGV;
--   * regua_devolucao_candidatos_v1 — lista de leads candidatos a devolução
--     (lead, corretor, origem, status, dias parado);
--   * produtividade_corretores — carteira, aguardando e % trabalhado de cada
--     corretor;
--   * mcp_aplicar_guardas — executa DDL como dono (cria triggers, sincroniza
--     grants de coluna);
--   * mcp_log_bloqueio — grava no api_escrita_log (poluição do log);
--   * copa_ranking — ranking da Copa com o id da edição previsível.
--
-- Regra aplicada (todas conferidas: nenhuma política RLS nem view usa estas
-- funções; nenhuma tela SEM login as chama — as rotas públicas chamam RPC só
-- pelo service_role):
--   * sai PUBLIC e anon; authenticated e service_role ficam com o EXECUTE —
--     as telas logadas e as funções SECURITY INVOKER que as chamam
--     (mcp_marcar_perdido → is_mcp/mcp_log_bloqueio; _prospeccao_zona →
--     zona_do_bairro) continuam iguais;
--   * mcp_aplicar_guardas é ferramenta de manutenção: só service_role.
-- As seis que já recusavam anon também perdem o grant — a porta fica fechada
-- na permissão, não só numa linha do corpo que uma edição futura pode tirar.
--
-- Com o anon fora, "auth.uid() nulo" volta a significar só "sistema" (cron,
-- service_role) nessas funções.
--
-- Idempotente.
-- ============================================================================

DO $revoga$
DECLARE
  _fn text;
  _p regprocedure;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    -- as seis da lista original (já recusavam anon no corpo)
    'public.create_oferta_ativa(text,text,jsonb,uuid)',
    'public.copa_inicializar_dados()',
    'public.dashboard_metricas_por_corretor(timestamptz,timestamptz,text)',
    'public.dashboard_redistribuicoes(timestamptz,timestamptz)',
    'public.equipe_metricas_campanha(uuid)',
    'public.rel_conversao_por_corretor(timestamptz,timestamptz)',
    -- as que o anônimo executava de fato
    'public.dashboard_atividade_periodo(timestamptz,timestamptz,uuid,text)',
    'public.regua_devolucao_candidatos_v1()',
    'public.produtividade_corretores()',
    'public.mcp_log_bloqueio(text,text,text)',
    'public.copa_ranking(uuid)',
    'public.pontos_de(text)',
    'public.verificar_minhas_conquistas()',
    'public.cadencia_cumprida_100(uuid)',
    'public.cadencia_etapa_completa(uuid,text)',
    'public.cadencia_horarios_tentados(uuid)',
    'public.cadencia_prioridade_reativacao(uuid)',
    'public.corretor_elegivel(uuid)',
    'public.gestor_gere_corretor(uuid,uuid)',
    'public.is_mcp()',
    'public.pode_escrever(text,text)',
    'public.roleta_da_zona(text)',
    'public.zona_do_bairro(text)',
    'public.zona_do_lead(uuid)'
  ] LOOP
    -- A que não existe no banco é pulada: a produção não tem
    -- verificar_minhas_conquistas() nem copa_ranking(uuid) (lá a Copa usa
    -- copa_ranking() sem argumento) — só o replay do repositório as cria.
    _p := to_regprocedure(_fn);
    CONTINUE WHEN _p IS NULL;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', _p);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _p);
  END LOOP;
END;
$revoga$;

-- DDL como dono: só manutenção (service_role / console).
REVOKE ALL ON FUNCTION public.mcp_aplicar_guardas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_aplicar_guardas() TO service_role;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.dashboard_atividade_periodo(timestamptz,timestamptz,uuid,text)',
    'public.regua_devolucao_candidatos_v1()',
    'public.produtividade_corretores()',
    'public.mcp_aplicar_guardas()',
    'public.mcp_log_bloqueio(text,text,text)',
    'public.create_oferta_ativa(text,text,jsonb,uuid)',
    'public.rel_conversao_por_corretor(timestamptz,timestamptz)'
  ] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'rpcs anon: % continua executável por anon', _fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.dashboard_atividade_periodo(timestamptz,timestamptz,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.zona_do_bairro(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpcs anon: authenticated perdeu o EXECUTE de que as telas precisam';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
