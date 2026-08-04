-- Item 3.4 da auditoria — medir ANTES de apagar.
--
-- A auditoria encontrou ~30 funções de consulta/comando que nenhuma tela deste
-- repositório chama (01-inventario.md §4.1). A hipótese levantada foi que
-- serviriam ao MCP. Verifiquei as três portas que existem no repo e nenhuma as
-- usa: o servidor MCP interno (src/lib/mcp/) expõe 4 ferramentas que consultam
-- TABELAS direto, e os endpoints api/public/* usam outras 7 RPCs — nenhuma
-- órfã. api/public/metricas.ts chega a agregar de leads e vendas na mão em vez
-- de usar metricas_periodo_v2, que existe exatamente para isso.
--
-- O que NÃO consigo ver do repositório: um cliente EXTERNO (MCP hospedado
-- fora, n8n, script) chamando a RPC direto na API do Supabase com service key.
-- Esse caminho não passa por este código.
--
-- Este script fecha a questão com dado real. Rode no SQL Editor do Supabase.
-- Deixe rodando por 7 dias antes de concluir: função de fechamento mensal ou
-- de rotina semanal não aparece numa janela curta.

-- ---------------------------------------------------------------------------
-- PASSO 1 — habilitar a extensão (uma vez)
-- ---------------------------------------------------------------------------
-- No Supabase: Database > Extensions > pg_stat_statements. Ou:
--   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--
-- PASSO 2 — zerar o contador e anotar a data
--   SELECT pg_stat_statements_reset();
-- Anote: reset em ____/____/______

-- ---------------------------------------------------------------------------
-- PASSO 3 — depois de 7 dias, rodar isto
-- ---------------------------------------------------------------------------
-- Cruza as funções suspeitas com o que o banco realmente executou.
-- Coluna `chamadas` = 0 significa: ninguém chamou, nem o front, nem o MCP,
-- nem n8n, nem script. Aí sim é código morto.

WITH suspeitas(nome) AS (
  VALUES
    -- Consulta/agregação sem tela (as que mais doem: foram construídas para
    -- responder perguntas que hoje ninguém consegue responder)
    ('gestao_metricas'), ('metricas_periodo_v2'), ('produtividade_corretores'),
    ('ranking_atividades'), ('rel_conversao_por_corretor'), ('rel_evolucao_vendas'),
    ('dashboard_atividade_periodo'),
    -- Operação da Copa não consumida pela aba Competição
    ('copa_pontos_corretor'), ('copa_get_ajuste_manual'), ('copa_salvar_pontuacao'),
    ('copa_set_participantes'), ('copa_apurar_fase'), ('copa_definir_vencedor'),
    ('copa_aplicar_bonus_final'),
    -- Comando sem tela
    ('mesclar_leads_dup_lote'), ('verificar_minhas_conquistas'), ('atualizar_meu_perfil'),
    -- Versões superadas (o front usa a mais nova)
    ('distribuir_lead'), ('distribuir_lead_elegivel'), ('distribuir_lead_ponderado'),
    ('atribuir_lead_a_corretor'), ('marcar_lead_perdido'),
    ('gerar_comissoes_para_venda'), ('gerar_comissao_da_venda'),
    ('leads_filtered'), ('leads_status_counts'), ('atendimento_inbox_v2'),
    ('pipeline_snapshot_v2'),
    -- Esta saiu da lista: foi ligada ao ⌘K (commit "⌘K passa a usar
    -- leads_search_v2"). Fica aqui para confirmar que passou a ter tráfego.
    ('leads_search_v2')
)
SELECT
  s.nome,
  COALESCE(sum(st.calls), 0)                   AS chamadas,
  round(COALESCE(sum(st.total_exec_time), 0)::numeric, 1) AS ms_total,
  CASE
    WHEN COALESCE(sum(st.calls), 0) = 0 THEN 'SEM TRÁFEGO — candidata a remoção'
    ELSE 'EM USO — tem consumidor (provavelmente externo)'
  END                                          AS veredito
FROM suspeitas AS s
LEFT JOIN pg_stat_statements AS st
  -- Casa pelo nome da função no texto da query. Evita falso positivo com
  -- prefixo comum (marcar_lead_perdido x marcar_lead_perdido_v2) exigindo que
  -- o nome seja seguido de '(' ou fim de palavra.
  ON st.query ~ ('\m' || s.nome || '\M\s*\(')
GROUP BY s.nome
ORDER BY chamadas ASC, s.nome;

-- ---------------------------------------------------------------------------
-- PASSO 4 — conferência cruzada: quem chamou, se chamou
-- ---------------------------------------------------------------------------
-- Para as que tiverem tráfego, ver o texto da query ajuda a identificar a
-- origem (PostgREST manda a chamada com um formato reconhecível).

-- SELECT calls, round(total_exec_time::numeric,1) AS ms, left(query, 160) AS query
-- FROM pg_stat_statements
-- WHERE query ~ '\m(gestao_metricas|metricas_periodo_v2|rel_evolucao_vendas)\M\s*\('
-- ORDER BY calls DESC;

-- ---------------------------------------------------------------------------
-- Como agir com o resultado
-- ---------------------------------------------------------------------------
-- SEM TRÁFEGO em 7 dias:
--   - versões superadas (leads_filtered v1, distribuir_lead, marcar_lead_perdido)
--     podem cair com DROP FUNCTION numa migration de limpeza;
--   - as de consulta (gestao_metricas, produtividade_corretores, rel_*) são
--     decisão de PRODUTO antes de técnica: elas respondem perguntas que a
--     auditoria mostrou não terem tela. Vale conectar em vez de apagar — em
--     especial gestao_metricas, que agrega atividade e aderência do time e
--     resolveria a tarefa 16 ("cobrar corretor sem atividade hoje").
--
-- COM TRÁFEGO: existe consumidor externo. Documente qual antes de qualquer
-- mudança de assinatura — quebrar um n8n silenciosamente é pior que a duplicação.
