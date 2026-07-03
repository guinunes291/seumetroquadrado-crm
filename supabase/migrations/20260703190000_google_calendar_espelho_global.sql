-- Espelho global do Google Calendar: gestor/admin pode receber TODOS os
-- agendamentos da equipe na própria agenda. Um agendamento passa a poder ter
-- eventos em várias agendas (corretor + espelhos), rastreados por linha.

alter table public.google_calendar_connections
  add column if not exists espelho_global boolean not null default false;

create table if not exists public.google_event_mirrors (
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  primary key (agendamento_id, user_id)
);

-- Somente service-role escreve/lê (nenhuma policy exposta).
alter table public.google_event_mirrors enable row level security;

-- Backfill: eventos já espelhados na agenda do corretor entram no novo rastreio.
insert into public.google_event_mirrors (agendamento_id, user_id, google_event_id)
select a.id, a.corretor_id, a.google_event_id
from public.agendamentos a
where a.google_event_id is not null
  and a.corretor_id is not null
on conflict do nothing;
