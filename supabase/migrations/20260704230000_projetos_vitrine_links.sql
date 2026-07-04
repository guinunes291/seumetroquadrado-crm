-- Vitrine de Empreendimentos: links de material comercial por projeto.
-- Cada empreendimento pode ter um "Book" (PDF de apresentação, normalmente no
-- Drive/Conhecimento-Projetos) e uma "Tabela de preços" atualizada. A Vitrine e
-- o card do lead abrem esses links direto pro corretor. Ambos são opcionais.

alter table public.projetos
  add column if not exists book_url text,
  add column if not exists tabela_precos_url text;

comment on column public.projetos.book_url is
  'Link do book/apresentação do empreendimento (PDF, Drive, etc.). Opcional.';
comment on column public.projetos.tabela_precos_url is
  'Link da tabela de preços atualizada do empreendimento. Opcional.';
