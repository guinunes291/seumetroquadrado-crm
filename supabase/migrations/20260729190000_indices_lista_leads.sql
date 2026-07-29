-- Índices de suporte para a tela de Leads (leads_filtered_v3 /
-- leads_status_counts_v3) — só ADIÇÃO de índice, nenhuma mudança de contrato,
-- de escopo ou de RLS.
--
-- Contexto: a base passou de alguns milhares para ~55 mil leads (importações
-- de 27/07 + intake automático). As duas RPCs da tela varrem o recorte inteiro
-- a cada carregamento — `count(*) OVER()` obriga a materializar TODAS as
-- linhas filtradas mesmo devolvendo só 50 — e ainda pagam, POR LINHA, um
-- EXISTS em tarefas e um LEFT JOIN com o DISTINCT ON de vendas. Sem índice
-- casando esses acessos, cada abertura da tela virava varredura sequencial.
--
-- Os três índices abaixo atacam exatamente os três acessos quentes.

-- 1) Recorte padrão da lista: leads vivos, fora da lixeira, por carteira e
--    etapa. Parcial em (deleted_at IS NULL AND na_lixeira = false) porque é o
--    estado de mais de 99% das linhas úteis — índice pequeno e quente. Cobre
--    tanto o filtro de escopo (corretor_id / equipe / órfãos) quanto os chips
--    de status, e o created_at DESC no fim atende o desempate final da
--    ordenação sem sort extra.
CREATE INDEX IF NOT EXISTS idx_leads_lista_ativa
  ON public.leads (corretor_id, status, created_at DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

-- 2) `tem_followup`: EXISTS correlacionado disparado uma vez por lead do
--    recorte. idx_tarefas_lead (só lead_id) obrigava a visitar o heap para
--    conferir tipo/status/deleted_at em cada probe. Com tipo e status no
--    próprio índice o EXISTS se resolve no index.
CREATE INDEX IF NOT EXISTS idx_tarefas_followup_por_lead
  ON public.tarefas (lead_id, tipo, status)
  WHERE deleted_at IS NULL;

-- 3) CTE `ultima_venda` (DISTINCT ON (lead_id) ... ORDER BY lead_id,
--    data_assinatura DESC, created_at DESC): sem um índice na MESMA ordem, o
--    Postgres ordena a tabela de vendas inteira a cada chamada das RPCs. Este
--    índice entrega as linhas já ordenadas.
CREATE INDEX IF NOT EXISTS idx_vendas_ultima_por_lead
  ON public.vendas (lead_id, data_assinatura DESC, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- Estatísticas atualizadas para o planner escolher os índices novos já na
-- primeira consulta, em vez de esperar o autovacuum passar.
ANALYZE public.leads;
ANALYZE public.tarefas;
ANALYZE public.vendas;
