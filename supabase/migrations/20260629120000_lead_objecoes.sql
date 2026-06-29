-- Objeções do cliente por lead (chips estruturados em vez de "texto solto na nota").
-- Guarda as objeções marcadas na página do lead; alimenta a sugestão de mensagem
-- por IA no WhatsApp. As sugestões de chip vêm da biblioteca pública `objecoes`.
-- Idempotente: pode rodar mais de uma vez sem erro.

alter table public.leads
  add column if not exists objecoes text[] not null default '{}'::text[];

comment on column public.leads.objecoes is
  'Objeções levantadas pelo cliente (chips). Sugestões vêm da tabela public.objecoes.';
