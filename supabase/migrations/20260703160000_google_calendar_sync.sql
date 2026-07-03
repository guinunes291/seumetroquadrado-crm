-- Google Calendar (Fase B): conexão OAuth por usuário + espelho do evento.
-- O refresh_token é gravado apenas pelo service-role (callback OAuth); o dono
-- pode ler/desligar/apagar a própria conexão.

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expira_em timestamptz,
  calendar_id text not null default 'primary',
  google_email text,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;

drop policy if exists "own gcal connection select" on public.google_calendar_connections;
create policy "own gcal connection select"
  on public.google_calendar_connections for select
  using (auth.uid() = user_id);

drop policy if exists "own gcal connection update" on public.google_calendar_connections;
create policy "own gcal connection update"
  on public.google_calendar_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own gcal connection delete" on public.google_calendar_connections;
create policy "own gcal connection delete"
  on public.google_calendar_connections for delete
  using (auth.uid() = user_id);

-- Insert/refresh de tokens fica restrito ao service-role (sem policy de insert).

-- Espelho do evento no Google (por agendamento).
alter table public.agendamentos
  add column if not exists google_event_id text;
