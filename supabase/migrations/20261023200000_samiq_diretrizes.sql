-- Melhoria contínua da Sami (23/10/2026): diretrizes aprendidas, aprovadas pelo
-- gestor no WhatsApp (Gate da Sami no n8n) e injetadas no prompt do SamiQ.
create table if not exists public.samiq_diretrizes (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 5 and 600),
  tipo text not null default 'comportamento' check (tipo in ('comportamento', 'conhecimento')),
  origem text not null default 'revisor-sami',
  id_origem text unique,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select on public.samiq_diretrizes to authenticated;
grant all on public.samiq_diretrizes to service_role;
alter table public.samiq_diretrizes enable row level security;
drop policy if exists "gestao le diretrizes da sami" on public.samiq_diretrizes;
create policy "gestao le diretrizes da sami" on public.samiq_diretrizes
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'gestor'));
