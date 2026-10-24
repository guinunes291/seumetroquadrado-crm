-- Painel de Marketing SMQ, Fase 1 (somente leitura do resto do banco).
-- Projeto: smq-operacional (lwebydmveyqyzfgmbqfk). Nada aqui altera tabelas de public.
-- O Painel acessa o banco pelo papel painel_marketing, que só enxerga o esquema marketing.
-- As vistas v_* são do dono do esquema e leem public com os direitos dele, então o
-- Painel lê campanha_intake_eventos, leads, agendamentos_visitas e vendas sem poder escrever nelas.

create schema if not exists marketing;
comment on schema marketing is 'Painel de Marketing SMQ. Leitura de public só por vistas; escrita só neste esquema.';

-- Acesso ---------------------------------------------------------------------
create table marketing.usuarios_permitidos (
  email text primary key check (email = lower(email)),
  nome text,
  criado_em timestamptz not null default now()
);

create table marketing.credenciais (
  email text primary key references marketing.usuarios_permitidos(email) on delete cascade,
  senha_hash text not null,           -- scrypt, gerado no servidor do Painel
  atualizado_em timestamptz not null default now()
);

create table marketing.convites (
  token_hash text primary key,        -- sha256 do token; o token em si nunca é gravado
  email text not null references marketing.usuarios_permitidos(email) on delete cascade,
  expira_em timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table marketing.sessoes (
  id_hash text primary key,           -- sha256 do id do cookie
  email text not null references marketing.usuarios_permitidos(email) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogada_em timestamptz,
  user_agent text
);

-- Auditoria e fila (a fila só passa a ser usada nas fases que escrevem) ------
create table marketing.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  quem text not null,
  acao text not null,
  alvo text,
  detalhe jsonb not null default '{}'::jsonb
);
create index on marketing.auditoria (quando desc);

create table marketing.jobs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_aprovacao','executando','concluido','erro','revertido')),
  agente text,
  payload jsonb not null default '{}'::jsonb,
  resultado jsonb,
  erro text,
  criado_por text not null,
  aprovado_por text,
  aprovado_em timestamptz,
  reverte_job_id uuid references marketing.jobs(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on marketing.jobs (status, criado_em desc);

-- Empreendimentos e apelidos -------------------------------------------------
-- O mesmo empreendimento aparece escrito de vários jeitos (ex.: "Playball - Cury" e
-- "Cury Playball"). Cada grafia vira um apelido de um nome único.
create table marketing.empreendimentos (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table marketing.empreendimento_apelidos (
  apelido text primary key check (apelido = lower(btrim(apelido))),
  empreendimento_id bigint not null references marketing.empreendimentos(id) on delete cascade
);

-- Meta Ads (retrato; a Fase 1 só lê a Meta) ----------------------------------
create table marketing.meta_campanhas (
  campaign_id text primary key,
  nome text not null,
  status text,
  objetivo text,
  empreendimento_id bigint references marketing.empreendimentos(id),
  vinculo text not null default 'pendente' check (vinculo in ('pendente','nome','manual','fora')),
  atualizado_em timestamptz not null default now()
);

create table marketing.meta_insights (
  campaign_id text not null references marketing.meta_campanhas(campaign_id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  gasto numeric(12,2) not null default 0,
  impressoes bigint,
  cliques bigint,
  resultados numeric,
  tipo_resultado text,
  fonte text not null default 'conector',
  capturado_em timestamptz not null default now(),
  primary key (campaign_id, data_inicio, data_fim)
);

-- Vistas do Diagnóstico ------------------------------------------------------
create or replace function marketing.empreendimento_de(p text) returns bigint
language sql stable as $$
  select a.empreendimento_id from marketing.empreendimento_apelidos a
  where a.apelido = lower(btrim(coalesce(p,'')))
$$;

create or replace function marketing.telefone_teste(p text) returns boolean
language sql immutable as $$
  select regexp_replace(coalesce(p,''), '\D', '', 'g') like '551195555%'
$$;
comment on function marketing.telefone_teste is 'Regra de negócio: telefones iniciados em 551195555 são testes e saem de toda análise.';

-- Leads de campanha: um por telefone e empreendimento por dia (o intake registra reentregas).
create or replace view marketing.v_leads as
select distinct on (regexp_replace(e.lead_telefone,'\D','','g'), coalesce(marketing.empreendimento_de(e.empreendimento), -1), e.criado_em::date)
  e.criado_em, e.criado_em::date as dia,
  marketing.empreendimento_de(e.empreendimento) as empreendimento_id,
  e.empreendimento as empreendimento_bruto,
  e.campanha, e.formulario, e.caso,
  regexp_replace(e.lead_telefone,'\D','','g') as telefone
from public.campanha_intake_eventos e
where coalesce(e.lead_telefone,'') <> ''
  and not marketing.telefone_teste(e.lead_telefone)
order by regexp_replace(e.lead_telefone,'\D','','g'), coalesce(marketing.empreendimento_de(e.empreendimento), -1), e.criado_em::date, e.criado_em;

create or replace view marketing.v_visitas as
select a.id, a.data_hora, a.data_hora::date as dia, a.status,
  marketing.empreendimento_de(l.empreendimento_interesse) as empreendimento_id,
  l.empreendimento_interesse as empreendimento_bruto
from public.agendamentos_visitas a
left join public.leads l on l.lead_id = a.lead_id
where not marketing.telefone_teste(coalesce(a.telefone, l.telefone_e164));

create or replace view marketing.v_vendas as
select v.id, coalesce(v.data_contrato, v.created_at) as quando,
  coalesce(v.data_contrato, v.created_at)::date as dia, v.status_venda, v.valor_venda,
  marketing.empreendimento_de(v.projeto) as empreendimento_id,
  v.projeto as empreendimento_bruto
from public.vendas v;

-- Apelidos sem dono: o que o Painel mostra para você ligar a um empreendimento.
create or replace view marketing.v_apelidos_pendentes as
select fonte, nome_bruto, count(*)::int as ocorrencias, max(dia) as ultimo_dia from (
  select 'leads' fonte, empreendimento_bruto nome_bruto, dia from marketing.v_leads where empreendimento_id is null
  union all select 'visitas', empreendimento_bruto, dia from marketing.v_visitas where empreendimento_id is null
  union all select 'vendas', empreendimento_bruto, dia from marketing.v_vendas where empreendimento_id is null
) x
where coalesce(btrim(nome_bruto),'') <> ''
group by fonte, nome_bruto;

-- Papel do Painel --------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'painel_marketing') then
    create role painel_marketing login noinherit;
  end if;
end $$;
comment on role painel_marketing is 'Painel de Marketing SMQ (Vercel). Só o esquema marketing; sem acesso a public.';

revoke all on schema marketing from public;
revoke execute on all functions in schema marketing from public;
grant usage on schema marketing to painel_marketing;
grant select on all tables in schema marketing to painel_marketing;
grant insert, update on marketing.credenciais, marketing.convites, marketing.sessoes to painel_marketing;
grant insert on marketing.auditoria to painel_marketing;
grant insert, update on marketing.jobs to painel_marketing;
grant insert, update on marketing.empreendimentos, marketing.empreendimento_apelidos, marketing.meta_campanhas to painel_marketing;
grant insert, update on marketing.meta_insights to painel_marketing;
grant delete on marketing.empreendimento_apelidos to painel_marketing;
grant execute on all functions in schema marketing to painel_marketing;
alter role painel_marketing set search_path = marketing;
alter role painel_marketing set statement_timeout = '20s';

insert into marketing.usuarios_permitidos (email, nome) values ('guilherme.97fn@gmail.com', 'Guilherme');
