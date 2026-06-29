-- Reafirma o valor 'superintendente' no enum public.app_role.
--
-- Contexto: a RPC public.leads_com_sla() (usada pelo Modo Blitz, Kanban, Hoje e
-- Dashboard) avalia has_role(_caller,'superintendente'). Como o `OR` do Postgres
-- só faz short-circuit quando um operando anterior é verdadeiro, ADMIN/GESTOR não
-- chegam a esse termo, mas CORRETOR (que não é nenhum dos dois) força a coerção
-- do literal 'superintendente' para app_role. Se o valor não existir no enum no
-- banco, isso lança `invalid input value for enum app_role: "superintendente"`,
-- quebrando a RPC apenas para corretores.
--
-- O valor já é adicionado pela migration 20260615230000, mas reaplicamos aqui de
-- forma idempotente para cobrir bancos onde aquela migration não foi aplicada
-- (drift). `IF NOT EXISTS` torna a operação um no-op quando já existe.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superintendente';
