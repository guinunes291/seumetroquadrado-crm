-- Índices compostos parciais para as consultas mais quentes da operação.
-- Idempotentes e não-destrutivos (CREATE INDEX IF NOT EXISTS). Complementam
-- 20260619120000_indices_filtros_leads.sql.
--
-- O predicado parcial (deleted_at IS NULL AND na_lixeira = false) cobre o estado
-- "ativo" usado por praticamente todas as listagens, reduzindo o tamanho do índice.

-- "Meus leads" / leads por corretor filtrando por etapa do funil (kanban, painel).
CREATE INDEX IF NOT EXISTS idx_leads_corretor_status
  ON public.leads (corretor_id, status)
  WHERE deleted_at IS NULL AND na_lixeira = false;

-- Dashboards/filtros que cruzam temperatura + status (funil, listas, oferta ativa).
CREATE INDEX IF NOT EXISTS idx_leads_temp_status
  ON public.leads (temperatura, status)
  WHERE deleted_at IS NULL AND na_lixeira = false;
