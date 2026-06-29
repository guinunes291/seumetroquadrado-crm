-- Munição comercial do empreendimento (Fase 6): campos para o corretor argumentar
-- e para o Match cruzar com o perfil/orçamento do lead. Idempotente.

alter table public.projetos
  add column if not exists renda_minima numeric,
  add column if not exists perfil_ideal text,
  add column if not exists diferenciais text[] not null default '{}'::text[],
  add column if not exists argumentos_venda text[] not null default '{}'::text[];

comment on column public.projetos.renda_minima is
  'Renda familiar mínima sugerida para enquadrar no empreendimento (munição comercial).';
comment on column public.projetos.perfil_ideal is
  'Descrição do perfil de cliente ideal para este empreendimento.';
comment on column public.projetos.diferenciais is
  'Diferenciais rápidos (chips) do empreendimento — ex.: lazer completo, pet place.';
comment on column public.projetos.argumentos_venda is
  'Argumentos de venda (bullets) para uso comercial e para alimentar o Match.';
