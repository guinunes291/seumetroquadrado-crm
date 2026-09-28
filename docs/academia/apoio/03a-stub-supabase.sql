-- Stub mínimo do Supabase para testar fora do projeto. NUNCA rode isto no banco real.
create role authenticated; create role anon;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;
create table public.profiles (id uuid primary key, nome text);
create table public.user_roles (user_id uuid, role text);
create or replace function public.has_role(_u uuid, _r text) returns boolean language sql stable as $$ select exists(select 1 from public.user_roles where user_id=_u and role=_r) $$;
insert into profiles values ('00000000-0000-0000-0000-000000000001','Gestor Teste'),('00000000-0000-0000-0000-000000000002','Corretor Teste'),('00000000-0000-0000-0000-000000000003','Veterano');
insert into user_roles values ('00000000-0000-0000-0000-000000000001','gestor');
grant usage on schema public, auth to authenticated; grant select on profiles to authenticated;
