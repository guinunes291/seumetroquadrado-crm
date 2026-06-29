-- Construtora de destino do lead. Complementa projeto_id/projeto_nome (o par
-- "selecionar OU digitar" já existente): quando o corretor escolhe um projeto
-- cadastrado guardamos a construtora denormalizada de projetos.construtora;
-- quando digita manualmente, guardamos o texto livre. Alimenta o registro de
-- "para qual empreendimento/construtora direcionar o cliente" na aba de
-- documentação. Idempotente: pode rodar mais de uma vez sem erro.

alter table public.leads
  add column if not exists construtora text;

comment on column public.leads.construtora is
  'Construtora/incorporadora de destino do lead. Denormalizada de projetos.construtora quando há projeto vinculado, ou texto livre quando inserida manualmente.';
