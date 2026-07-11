-- Remove o overload duplicado de leads_com_sla que quebra a fila do "Meu Dia".
--
-- O banco vivo tinha DUAS versões da função:
--   public.leads_com_sla(_corretor uuid)               -- canônica (nas migrations)
--   public.leads_com_sla(_corretor uuid, _di date, _df date)  -- criada direto no
--                                                             -- banco, não versionada
-- Todos os consumidores do frontend chamam rpc("leads_com_sla", { _corretor })
-- — apenas com _corretor. Como os dois candidatos aceitam só _corretor (os
-- demais parâmetros têm DEFAULT), o PostgREST não consegue escolher e retorna
-- "function is not unique" (42725 / PGRST203). Isso derruba a fila de
-- prioridades (Central de Comando), o badge de SLA do Kanban, o Modo Blitz e o
-- SLA no detalhe do lead.
--
-- Mantemos a versão canônica de 1 argumento (definida nas migrations e usada por
-- todos os consumidores) e removemos a 3-arg. Idempotente: no-op onde ela não
-- existe (ex.: db reset limpo, que só cria a 1-arg).
DROP FUNCTION IF EXISTS public.leads_com_sla(uuid, date, date);

-- Recarrega o schema do PostgREST para refletir a resolução única da função.
NOTIFY pgrst, 'reload schema';
