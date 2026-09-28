-- =====================================================================
-- ACADEMIA SMQ · camada de dados (migration 01)
-- Projeto: CRM SMQ (Supabase rldnprwjlomjmjvinxuh)
-- Autor: especificação ESPEC-ACADEMIA-SMQ.md · 28/09/2026
--
-- O que este arquivo faz: cria as tabelas, views, RLS e RPCs do módulo
-- Academia. NÃO toca em nenhuma tabela existente (leads, profiles,
-- roletas, sla_*). A única dependência externa é public.profiles(id)
-- e a função de papel (ver academia_eh_gestor, marcada com ADAPTE).
--
-- Reversão: 99-rollback-academia.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.academia_nivel as enum
    ('iniciante','apto','intermediario','especialista','mestre');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.academia_status_conteudo as enum
    ('rascunho','publicado','arquivado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.academia_tipo_aula as enum
    ('texto','slides','video','pratica','material');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.academia_status_pratica as enum
    ('pendente','aprovada','refazer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.academia_status_recomendacao as enum
    ('sombra','aberta','atribuida','concluida','descartada','expirada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Papel. ADAPTE ao guard real do CRM (descoberto na Fatia 0).
--    Hipótese: existe public.has_role(uuid, app_role) no padrão Lovable.
-- ---------------------------------------------------------------------
create or replace function public.academia_eh_gestor(_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.has_role(_uid, 'admin')
    or public.has_role(_uid, 'gestor')
    or public.has_role(_uid, 'superintendente'),
  false);
$$;

-- ---------------------------------------------------------------------
-- 2. Configuração (uma linha só)
-- ---------------------------------------------------------------------
create table if not exists public.academia_config (
  id                        boolean primary key default true check (id),
  nota_minima_padrao        smallint not null default 80 check (nota_minima_padrao between 50 and 100),
  quiz_tempo_limite_min     smallint not null default 30,
  quiz_intervalo_min        smallint not null default 60,   -- espera entre tentativas reprovadas
  quiz_max_tentativas_dia   smallint not null default 3,
  recomendacao_modo         text not null default 'sombra'
                            check (recomendacao_modo in ('desligado','sombra','ativo')),
  recomendacao_validade_dias smallint not null default 21,
  -- Gate da roleta: decisão do Guilherme em 28/09/2026 = só na fase 2.
  -- 'ativo' NÃO é aceito aqui de propósito: ligar exige migration nova e revisada.
  gate_roleta_modo          text not null default 'desligado'
                            check (gate_roleta_modo in ('desligado','sombra')),
  atualizado_em             timestamptz not null default now(),
  atualizado_por            uuid
);
insert into public.academia_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Conteúdo
-- ---------------------------------------------------------------------
create table if not exists public.academia_fases (
  numero            smallint primary key check (numero between 0 and 9),  -- 0 = onboarding
  nome              text not null,
  periodo_texto     text,
  dia_inicio        smallint,            -- dias desde o início da trilha
  dia_fim           smallint,            -- null = recorrente
  foco              text,
  nivel_que_exige   public.academia_nivel -- nível que só se alcança com esta fase concluída
);

create table if not exists public.academia_modulos (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,           -- 'M01'..'M24', 'P01'
  numero              smallint not null,
  fase                smallint not null references public.academia_fases(numero),
  titulo              text not null,
  objetivo_principal  text,
  objetivos           jsonb not null default '[]'::jsonb,   -- array de strings
  pontos_chave        jsonb not null default '[]'::jsonb,
  pilares             text[] not null default '{}',
  carga_horaria_h     numeric(4,1),
  carga_horaria_texto text,
  prazo_dias          smallint,           -- prazo contado do inicio_trilha do corretor
  obrigatorio         boolean not null default true,
  exige_pratica       boolean not null default true,
  pratica_descricao   text,
  pratica_rubrica     jsonb not null default '[]'::jsonb,  -- [{criterio, peso}]
  nota_minima         smallint check (nota_minima between 50 and 100), -- null = config
  url_gamma           text,
  url_notion          text,
  notion_page_id      text,
  status              public.academia_status_conteudo not null default 'rascunho',
  versao              integer not null default 1,
  revisao_pendente    text,               -- nota de curadoria: bloqueia publicar enquanto não for limpa
  revisar_em          date,               -- conteúdo técnico (MCMV, crédito) expira: data da próxima revisão
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  publicado_em        timestamptz,
  publicado_por       uuid
);
create index if not exists academia_modulos_fase_idx on public.academia_modulos (fase, numero);

create table if not exists public.academia_aulas (
  id            uuid primary key default gen_random_uuid(),
  modulo_id     uuid not null references public.academia_modulos(id) on delete cascade,
  ordem         smallint not null,
  titulo        text not null,
  tipo          public.academia_tipo_aula not null default 'texto',
  conteudo_md   text,
  url_video     text,          -- vazio hoje: ainda não há vídeo gravado
  url_material  text,          -- Gamma, Notion, PDF
  duracao_min   smallint,
  status        public.academia_status_conteudo not null default 'publicado',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (modulo_id, ordem)
);

create table if not exists public.academia_questoes (
  id           uuid primary key default gen_random_uuid(),
  modulo_id    uuid not null references public.academia_modulos(id) on delete cascade,
  ordem        smallint not null,
  enunciado    text not null,
  alternativas jsonb not null check (jsonb_typeof(alternativas) = 'array'
                                     and jsonb_array_length(alternativas) between 2 and 6),
  correta      smallint not null,
  explicacao   text,
  ativa        boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (modulo_id, ordem),
  check (correta >= 0 and correta < jsonb_array_length(alternativas))
);

-- ---------------------------------------------------------------------
-- 4. Pessoas e progresso
-- ---------------------------------------------------------------------
create table if not exists public.academia_participantes (
  corretor_id        uuid primary key references public.profiles(id) on delete cascade,
  participa          boolean not null default true,
  inicio_trilha      date not null default current_date,
  nivel              public.academia_nivel not null default 'iniciante',
  nivel_em           timestamptz not null default now(),
  apto_override      boolean,         -- null = segue a regra; true/false = decisão do gestor
  override_motivo    text,
  override_por       uuid,
  override_em        timestamptz,
  criado_em          timestamptz not null default now(),
  check (apto_override is null or override_motivo is not null)
);

create table if not exists public.academia_niveis_historico (
  id          bigserial primary key,
  corretor_id uuid not null references public.profiles(id) on delete cascade,
  de          public.academia_nivel,
  para        public.academia_nivel not null,
  motivo      text not null,
  por         uuid,
  em          timestamptz not null default now()
);

create table if not exists public.academia_progresso_aulas (
  corretor_id  uuid not null references public.profiles(id) on delete cascade,
  aula_id      uuid not null references public.academia_aulas(id) on delete cascade,
  concluida_em timestamptz not null default now(),
  primary key (corretor_id, aula_id)
);

create table if not exists public.academia_tentativas (
  id             uuid primary key default gen_random_uuid(),
  corretor_id    uuid not null references public.profiles(id) on delete cascade,
  modulo_id      uuid not null references public.academia_modulos(id) on delete cascade,
  versao_modulo  integer not null,
  questoes_ids   uuid[] not null,
  iniciada_em    timestamptz not null default now(),
  enviada_em     timestamptz,
  respostas      jsonb,              -- {questao_id: indice}
  acertos        smallint,
  total          smallint,
  nota           numeric(5,2),
  aprovado       boolean
);
create index if not exists academia_tentativas_corretor_idx
  on public.academia_tentativas (corretor_id, modulo_id, iniciada_em desc);

create table if not exists public.academia_praticas (
  id                uuid primary key default gen_random_uuid(),
  corretor_id       uuid not null references public.profiles(id) on delete cascade,
  modulo_id         uuid not null references public.academia_modulos(id) on delete cascade,
  origem            text not null default 'envio' check (origem in ('envio','roleplay_presencial')),
  evidencia_texto   text,
  evidencia_url     text,
  enviado_em        timestamptz not null default now(),
  status            public.academia_status_pratica not null default 'pendente',
  avaliador_id      uuid,
  avaliado_em       timestamptz,
  rubrica_resultado jsonb,           -- [{criterio, ok:boolean, obs}]
  feedback          text
);
create index if not exists academia_praticas_fila_idx on public.academia_praticas (status, enviado_em);

create table if not exists public.academia_atribuicoes (
  id                uuid primary key default gen_random_uuid(),
  corretor_id       uuid not null references public.profiles(id) on delete cascade,
  modulo_id         uuid not null references public.academia_modulos(id) on delete cascade,
  origem            text not null check (origem in ('gestor','recomendacao','onboarding','nova_versao')),
  recomendacao_id   uuid,
  motivo            text,
  prazo             date,
  atribuido_por     uuid,
  criado_em         timestamptz not null default now(),
  concluida_em      timestamptz,
  cancelada_em      timestamptz
);
create unique index if not exists academia_atribuicoes_aberta_uq
  on public.academia_atribuicoes (corretor_id, modulo_id)
  where concluida_em is null and cancelada_em is null;

create table if not exists public.academia_certificados (
  id          uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.profiles(id) on delete cascade,
  nivel       public.academia_nivel not null,
  codigo      text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  emitido_em  timestamptz not null default now(),
  unique (corretor_id, nivel)
);

-- ---------------------------------------------------------------------
-- 5. Integração com a operação: indicadores e recomendações
-- ---------------------------------------------------------------------
-- Uma linha por corretor x indicador x dia. Preenchida por
-- academia_calcular_indicadores() (escrita na Fatia 4, depois do diagnóstico).
create table if not exists public.academia_indicadores (
  corretor_id  uuid not null references public.profiles(id) on delete cascade,
  indicador    text not null,
  data_ref     date not null,
  janela_dias  smallint not null,
  valor        numeric,
  amostra      integer not null,
  referencia_time numeric,          -- mediana do time na mesma janela
  calculado_em timestamptz not null default now(),
  primary key (corretor_id, indicador, data_ref)
);

create table if not exists public.academia_regras_recomendacao (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  indicador      text not null,
  descricao      text not null,
  modulo_codigo  text not null references public.academia_modulos(codigo),
  direcao        text not null check (direcao in ('menor_e_pior','maior_e_pior')),
  limiar_relativo numeric not null,  -- ex 0.70 = abaixo de 70% da mediana do time
  janela_dias    smallint not null default 30,
  amostra_minima integer not null default 8,
  ativa          boolean not null default true,
  observacao     text
);

create table if not exists public.academia_recomendacoes (
  id               uuid primary key default gen_random_uuid(),
  regra_id         uuid not null references public.academia_regras_recomendacao(id),
  corretor_id      uuid not null references public.profiles(id) on delete cascade,
  modulo_id        uuid not null references public.academia_modulos(id),
  indicador        text not null,
  valor_corretor   numeric,
  valor_referencia numeric,
  amostra          integer,
  data_ref         date not null,
  status           public.academia_status_recomendacao not null default 'sombra',
  gerada_em        timestamptz not null default now(),
  decidido_por     uuid,
  decidido_em      timestamptz,
  motivo_decisao   text,
  expira_em        date
);
create unique index if not exists academia_recomendacoes_viva_uq
  on public.academia_recomendacoes (corretor_id, regra_id)
  where status in ('sombra','aberta','atribuida');

-- ---------------------------------------------------------------------
-- 6. Encontros presenciais (calendário de treinos)
-- ---------------------------------------------------------------------
create table if not exists public.academia_encontros (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in
                   ('roleplay_diario','maratona_objecoes','credito_quinzenal',
                    'revisao_mensal','onboarding','construtora','outro')),
  titulo         text not null,
  inicio         timestamptz not null,
  duracao_min    smallint,
  facilitador_id uuid references public.profiles(id),
  modulo_id      uuid references public.academia_modulos(id),
  descricao      text,
  acao_registrada text,             -- "todo treino gera 1 ação registrada"
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);

create table if not exists public.academia_presencas (
  encontro_id uuid not null references public.academia_encontros(id) on delete cascade,
  corretor_id uuid not null references public.profiles(id) on delete cascade,
  presente    boolean not null default true,
  observacao  text,
  primary key (encontro_id, corretor_id)
);

-- ---------------------------------------------------------------------
-- 7. Views de status
-- ---------------------------------------------------------------------
create or replace view public.v_academia_modulo_status
with (security_invoker = true) as
with base as (
  select p.corretor_id, p.inicio_trilha, m.*
  from public.academia_participantes p
  cross join public.academia_modulos m
  where p.participa and m.status = 'publicado'
),
aulas as (
  select a.modulo_id, count(*) as total
  from public.academia_aulas a
  where a.status = 'publicado'
  group by a.modulo_id
),
feitas as (
  select pa.corretor_id, a.modulo_id, count(*) as feitas, max(pa.concluida_em) as ultima
  from public.academia_progresso_aulas pa
  join public.academia_aulas a on a.id = pa.aula_id and a.status = 'publicado'
  group by pa.corretor_id, a.modulo_id
),
quiz as (
  select t.corretor_id, t.modulo_id,
         max(t.nota) as melhor_nota,
         bool_or(t.aprovado) as aprovado,
         min(t.enviada_em) filter (where t.aprovado) as aprovado_em,
         count(*) filter (where t.enviada_em is not null) as tentativas
  from public.academia_tentativas t
  group by t.corretor_id, t.modulo_id
),
prat as (
  select pr.corretor_id, pr.modulo_id,
         bool_or(pr.status = 'aprovada') as aprovada,
         min(pr.avaliado_em) filter (where pr.status = 'aprovada') as aprovada_em,
         bool_or(pr.status = 'pendente') as pendente
  from public.academia_praticas pr
  group by pr.corretor_id, pr.modulo_id
)
select
  b.corretor_id, b.id as modulo_id, b.codigo, b.fase, b.numero, b.titulo,
  b.obrigatorio, b.exige_pratica,
  coalesce(au.total, 0)  as aulas_total,
  coalesce(f.feitas, 0)  as aulas_feitas,
  q.melhor_nota, coalesce(q.aprovado, false) as quiz_aprovado, coalesce(q.tentativas, 0) as tentativas,
  case when not b.exige_pratica then 'dispensada'
       when pr.aprovada then 'aprovada'
       when pr.pendente then 'pendente'
       when pr.corretor_id is not null then 'refazer'
       else 'nao_enviada' end as pratica_status,
  ( coalesce(f.feitas,0) >= coalesce(au.total,0)
    and coalesce(q.aprovado,false)
    and (not b.exige_pratica or coalesce(pr.aprovada,false)) ) as concluido,
  greatest(q.aprovado_em, pr.aprovada_em) as concluido_em,
  case when b.prazo_dias is not null then b.inicio_trilha + b.prazo_dias end as prazo_em,
  greatest(f.ultima, (select max(t2.iniciada_em) from public.academia_tentativas t2
                       where t2.corretor_id = b.corretor_id and t2.modulo_id = b.id)) as ultima_atividade
from base b
left join aulas au on au.modulo_id = b.id
left join feitas f on f.corretor_id = b.corretor_id and f.modulo_id = b.id
left join quiz q  on q.corretor_id = b.corretor_id and q.modulo_id = b.id
left join prat pr on pr.corretor_id = b.corretor_id and pr.modulo_id = b.id;

create or replace view public.v_academia_fase_status
with (security_invoker = true) as
select corretor_id, fase,
       count(*) filter (where obrigatorio)                     as obrigatorios,
       count(*) filter (where obrigatorio and concluido)       as concluidos,
       -- fase só conta como completa se TEM módulo publicado. Sem isso,
       -- conteúdo em rascunho promoveria o time inteiro no dia 1.
       (count(*) filter (where obrigatorio) > 0
        and count(*) filter (where obrigatorio and not concluido) = 0) as completa
from public.v_academia_modulo_status
group by corretor_id, fase;

create or replace view public.v_academia_corretor_resumo
with (security_invoker = true) as
select
  p.corretor_id,
  pr.nome as corretor_nome,          -- ADAPTE se a coluna tiver outro nome
  p.participa, p.inicio_trilha, p.nivel, p.apto_override,
  coalesce(p.apto_override, p.nivel <> 'iniciante') as apto,
  coalesce(sum(ms.concluido::int), 0)                                   as modulos_concluidos,
  count(ms.modulo_id) filter (where ms.obrigatorio)                     as modulos_obrigatorios,
  count(ms.modulo_id) filter (where ms.obrigatorio and not ms.concluido
                               and ms.prazo_em < current_date)          as modulos_atrasados,
  count(ms.modulo_id) filter (where ms.pratica_status = 'pendente')     as praticas_pendentes,
  max(ms.ultima_atividade)                                              as ultima_atividade
from public.academia_participantes p
join public.profiles pr on pr.id = p.corretor_id
left join public.v_academia_modulo_status ms on ms.corretor_id = p.corretor_id
group by p.corretor_id, pr.nome, p.participa, p.inicio_trilha, p.nivel, p.apto_override;

-- ---------------------------------------------------------------------
-- 8. Regras de nível
-- ---------------------------------------------------------------------
create or replace function public.academia_recalcular_nivel(_corretor uuid)
returns public.academia_nivel
language plpgsql security definer set search_path = public
as $$
declare
  v_atual public.academia_nivel;
  v_novo  public.academia_nivel := 'iniciante';
  f0 boolean; f1 boolean; f2 boolean; f3 boolean;
begin
  select nivel into v_atual from academia_participantes where corretor_id = _corretor;
  if v_atual is null then return null; end if;
  if v_atual = 'mestre' then return v_atual; end if;  -- mestre só muda por decisão humana

  select coalesce(bool_or(completa) filter (where fase = 0), false),
         coalesce(bool_or(completa) filter (where fase = 1), false),
         coalesce(bool_or(completa) filter (where fase = 2), false),
         coalesce(bool_or(completa) filter (where fase = 3), false)
    into f0, f1, f2, f3
  from v_academia_fase_status where corretor_id = _corretor;

  -- Fase 0 (onboarding, 5 dias) = pronto para atender lead.
  -- Fases 1+2 = domínio técnico. Fase 3 = domínio comercial.
  if f0 then v_novo := 'apto'; end if;
  if f0 and f1 and f2 then v_novo := 'intermediario'; end if;
  if f0 and f1 and f2 and f3 then v_novo := 'especialista'; end if;

  -- nunca rebaixa sozinho: módulo novo publicado vira atribuição com prazo,
  -- não perda de nível (evita tirar selo de quem já estava operando).
  if v_novo > v_atual then
    update academia_participantes set nivel = v_novo, nivel_em = now() where corretor_id = _corretor;
    insert into academia_niveis_historico (corretor_id, de, para, motivo)
      values (_corretor, v_atual, v_novo, 'regra automatica: fases concluidas');
    insert into academia_certificados (corretor_id, nivel) values (_corretor, v_novo)
      on conflict (corretor_id, nivel) do nothing;
    return v_novo;
  end if;
  return v_atual;
end $$;

-- ---------------------------------------------------------------------
-- 9. RPCs do corretor
-- ---------------------------------------------------------------------
create or replace function public.academia_marcar_aula(_aula uuid, _concluida boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from academia_participantes where corretor_id = v_uid and participa) then
    raise exception 'voce nao esta inscrito na Academia';
  end if;
  if not exists (select 1 from academia_aulas a join academia_modulos m on m.id = a.modulo_id
                 where a.id = _aula and a.status = 'publicado' and m.status = 'publicado') then
    raise exception 'aula indisponivel';
  end if;
  if _concluida then
    insert into academia_progresso_aulas (corretor_id, aula_id) values (v_uid, _aula)
    on conflict do nothing;
  else
    delete from academia_progresso_aulas where corretor_id = v_uid and aula_id = _aula;
  end if;
end $$;

-- Devolve as questões SEM gabarito. O gabarito nunca sai do banco antes do envio.
create or replace function public.academia_quiz_iniciar(_modulo uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  cfg   academia_config%rowtype;
  m     academia_modulos%rowtype;
  v_ult academia_tentativas%rowtype;
  v_hoje integer;
  v_ids uuid[];
  v_id  uuid;
begin
  select * into cfg from academia_config where id;
  select * into m from academia_modulos where id = _modulo and status = 'publicado';
  if m.id is null then raise exception 'modulo indisponivel'; end if;
  if not exists (select 1 from academia_participantes where corretor_id = v_uid and participa) then
    raise exception 'voce nao esta inscrito na Academia';
  end if;

  -- precisa ter concluído as aulas: o quiz mede o que foi estudado
  if exists (select 1 from academia_aulas a
             where a.modulo_id = _modulo and a.status = 'publicado'
               and not exists (select 1 from academia_progresso_aulas pa
                               where pa.aula_id = a.id and pa.corretor_id = v_uid)) then
    raise exception 'conclua todas as aulas antes do quiz';
  end if;

  -- tentativa aberta e ainda no prazo? devolve a mesma (evita "reroll" de questões)
  select * into v_ult from academia_tentativas
   where corretor_id = v_uid and modulo_id = _modulo and enviada_em is null
     and iniciada_em > now() - make_interval(mins => cfg.quiz_tempo_limite_min)
   order by iniciada_em desc limit 1;

  if v_ult.id is null then
    select count(*) into v_hoje from academia_tentativas
     where corretor_id = v_uid and modulo_id = _modulo
       and iniciada_em::date = (now() at time zone 'America/Sao_Paulo')::date;
    if v_hoje >= cfg.quiz_max_tentativas_dia then
      raise exception 'limite de % tentativas por dia atingido', cfg.quiz_max_tentativas_dia;
    end if;
    if exists (select 1 from academia_tentativas
                where corretor_id = v_uid and modulo_id = _modulo and aprovado = false
                  and enviada_em > now() - make_interval(mins => cfg.quiz_intervalo_min)) then
      raise exception 'aguarde % minutos entre tentativas: revise as aulas antes', cfg.quiz_intervalo_min;
    end if;

    select array_agg(id order by random()) into v_ids
      from academia_questoes where modulo_id = _modulo and ativa;
    if coalesce(array_length(v_ids,1),0) < 3 then raise exception 'quiz sem questoes suficientes'; end if;
    v_ids := v_ids[1:10];

    insert into academia_tentativas (corretor_id, modulo_id, versao_modulo, questoes_ids)
    values (v_uid, _modulo, m.versao, v_ids) returning id into v_id;
  else
    v_id := v_ult.id; v_ids := v_ult.questoes_ids;
  end if;

  return jsonb_build_object(
    'tentativa_id', v_id,
    'tempo_limite_min', cfg.quiz_tempo_limite_min,
    'nota_minima', coalesce(m.nota_minima, cfg.nota_minima_padrao),
    'questoes', (select jsonb_agg(jsonb_build_object(
                    'id', q.id, 'enunciado', q.enunciado, 'alternativas', q.alternativas)
                  order by array_position(v_ids, q.id))
                 from academia_questoes q where q.id = any(v_ids))
  );
end $$;

create or replace function public.academia_quiz_enviar(_tentativa uuid, _respostas jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t   academia_tentativas%rowtype;
  cfg academia_config%rowtype;
  m   academia_modulos%rowtype;
  v_acertos int; v_total int; v_nota numeric; v_min int; v_ok boolean;
begin
  select * into cfg from academia_config where id;
  select * into t from academia_tentativas where id = _tentativa for update;
  if t.id is null or t.corretor_id <> v_uid then raise exception 'tentativa invalida'; end if;
  if t.enviada_em is not null then raise exception 'tentativa ja enviada'; end if;
  if t.iniciada_em < now() - make_interval(mins => cfg.quiz_tempo_limite_min + 2) then
    raise exception 'tempo esgotado: inicie uma nova tentativa';
  end if;
  select * into m from academia_modulos where id = t.modulo_id;

  select count(*) filter (where (_respostas ->> q.id::text)::int = q.correta), count(*)
    into v_acertos, v_total
  from academia_questoes q where q.id = any(t.questoes_ids);

  v_nota := round(100.0 * v_acertos / greatest(v_total,1), 2);
  v_min  := coalesce(m.nota_minima, cfg.nota_minima_padrao);
  v_ok   := v_nota >= v_min;

  update academia_tentativas
     set enviada_em = now(), respostas = _respostas, acertos = v_acertos,
         total = v_total, nota = v_nota, aprovado = v_ok
   where id = t.id;

  if v_ok then
    update academia_atribuicoes set concluida_em = now()
     where corretor_id = v_uid and modulo_id = t.modulo_id and concluida_em is null
       and cancelada_em is null and not m.exige_pratica;
    perform academia_recalcular_nivel(v_uid);
  end if;

  return jsonb_build_object(
    'nota', v_nota, 'nota_minima', v_min, 'aprovado', v_ok,
    'acertos', v_acertos, 'total', v_total,
    'gabarito', (select jsonb_agg(jsonb_build_object(
                   'id', q.id, 'enunciado', q.enunciado, 'alternativas', q.alternativas,
                   'correta', q.correta, 'marcada', (_respostas ->> q.id::text)::int,
                   'explicacao', q.explicacao)
                 order by array_position(t.questoes_ids, q.id))
                 from academia_questoes q where q.id = any(t.questoes_ids)));
end $$;

create or replace function public.academia_pratica_enviar(_modulo uuid, _texto text, _url text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if coalesce(trim(_texto),'') = '' and coalesce(trim(_url),'') = '' then
    raise exception 'descreva a pratica ou anexe um link';
  end if;
  if exists (select 1 from academia_praticas where corretor_id = v_uid and modulo_id = _modulo and status = 'pendente') then
    raise exception 'ja existe uma pratica aguardando avaliacao neste modulo';
  end if;
  insert into academia_praticas (corretor_id, modulo_id, evidencia_texto, evidencia_url)
  values (v_uid, _modulo, _texto, _url) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 10. RPCs do gestor
-- ---------------------------------------------------------------------
create or replace function public.academia_pratica_avaliar(
  _pratica uuid, _status public.academia_status_pratica, _rubrica jsonb, _feedback text)
returns void
language plpgsql security definer set search_path = public
as $$
declare p academia_praticas%rowtype;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  if _status = 'pendente' then raise exception 'escolha aprovada ou refazer'; end if;
  if coalesce(trim(_feedback),'') = '' then
    raise exception 'feedback obrigatorio: 1 foco de melhoria (regra da Biblioteca de Roleplays)';
  end if;
  update academia_praticas
     set status = _status, rubrica_resultado = _rubrica, feedback = _feedback,
         avaliador_id = auth.uid(), avaliado_em = now()
   where id = _pratica returning * into p;
  if _status = 'aprovada' then
    update academia_atribuicoes set concluida_em = now()
     where corretor_id = p.corretor_id and modulo_id = p.modulo_id
       and concluida_em is null and cancelada_em is null;
    perform academia_recalcular_nivel(p.corretor_id);
  end if;
end $$;

-- Roleplay presencial avaliado direto pelo gestor (sem envio do corretor)
create or replace function public.academia_registrar_roleplay(
  _corretor uuid, _modulo uuid, _status public.academia_status_pratica, _rubrica jsonb, _feedback text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  insert into academia_praticas (corretor_id, modulo_id, origem, evidencia_texto)
  values (_corretor, _modulo, 'roleplay_presencial', 'Roleplay presencial avaliado pelo gestor')
  returning id into v_id;
  perform academia_pratica_avaliar(v_id, _status, _rubrica, _feedback);
  return v_id;
end $$;

create or replace function public.academia_definir_apto(_corretor uuid, _apto boolean, _motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  if _apto is not null and coalesce(trim(_motivo),'') = '' then
    raise exception 'motivo obrigatorio para decisao manual';
  end if;
  update academia_participantes
     set apto_override = _apto, override_motivo = _motivo,
         override_por = auth.uid(), override_em = now()
   where corretor_id = _corretor;
  insert into academia_niveis_historico (corretor_id, de, para, motivo, por)
  select corretor_id, nivel, nivel,
         'override apto=' || coalesce(_apto::text,'regra') || ': ' || coalesce(_motivo,''), auth.uid()
  from academia_participantes where corretor_id = _corretor;
end $$;

create or replace function public.academia_promover_mestre(_corretor uuid, _motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_nivel academia_nivel; f4 boolean; f5 boolean;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  select nivel into v_nivel from academia_participantes where corretor_id = _corretor;
  if v_nivel <> 'especialista' then raise exception 'mestre exige nivel especialista'; end if;
  select coalesce(bool_or(completa) filter (where fase = 4), false),
         coalesce(bool_or(completa) filter (where fase = 5), false)
    into f4, f5 from v_academia_fase_status where corretor_id = _corretor;
  if not (f4 and f5) then raise exception 'mestre exige fases 4 e 5 concluidas'; end if;
  update academia_participantes set nivel = 'mestre', nivel_em = now() where corretor_id = _corretor;
  insert into academia_niveis_historico (corretor_id, de, para, motivo, por)
    values (_corretor, v_nivel, 'mestre', _motivo, auth.uid());
  insert into academia_certificados (corretor_id, nivel) values (_corretor, 'mestre')
    on conflict do nothing;
end $$;

create or replace function public.academia_atribuir(
  _corretor uuid, _modulo uuid, _prazo date, _motivo text,
  _origem text default 'gestor', _recomendacao uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  insert into academia_atribuicoes (corretor_id, modulo_id, origem, recomendacao_id, motivo, prazo, atribuido_por)
  values (_corretor, _modulo, _origem, _recomendacao, _motivo, _prazo, auth.uid())
  on conflict (corretor_id, modulo_id) where concluida_em is null and cancelada_em is null
  do update set prazo = excluded.prazo, motivo = excluded.motivo
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.academia_decidir_recomendacao(
  _rec uuid, _acao text, _motivo text, _prazo date default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare r academia_recomendacoes%rowtype;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  select * into r from academia_recomendacoes where id = _rec for update;
  if r.status not in ('sombra','aberta') then raise exception 'recomendacao ja decidida'; end if;
  if _acao = 'atribuir' then
    perform academia_atribuir(r.corretor_id, r.modulo_id,
             coalesce(_prazo, current_date + 7), coalesce(_motivo, r.indicador), 'recomendacao', r.id);
    update academia_recomendacoes set status = 'atribuida', decidido_por = auth.uid(),
           decidido_em = now(), motivo_decisao = _motivo where id = _rec;
  elsif _acao = 'descartar' then
    if coalesce(trim(_motivo),'') = '' then raise exception 'motivo obrigatorio ao descartar'; end if;
    update academia_recomendacoes set status = 'descartada', decidido_por = auth.uid(),
           decidido_em = now(), motivo_decisao = _motivo where id = _rec;
  else
    raise exception 'acao invalida';
  end if;
end $$;

create or replace function public.academia_publicar_modulo(_modulo uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare m academia_modulos%rowtype; n_aulas int; n_q int;
begin
  if not academia_eh_gestor() then raise exception 'apenas gestor'; end if;
  select * into m from academia_modulos where id = _modulo for update;
  select count(*) into n_aulas from academia_aulas where modulo_id = _modulo and status = 'publicado';
  select count(*) into n_q from academia_questoes where modulo_id = _modulo and ativa;
  if n_aulas < 1 then raise exception 'publique ao menos 1 aula'; end if;
  if n_q < 5 then raise exception 'o quiz precisa de ao menos 5 questoes ativas'; end if;
  if m.revisao_pendente is not null then
    raise exception 'revisao pendente: %', m.revisao_pendente;
  end if;
  update academia_modulos
     set status = 'publicado', publicado_em = now(), publicado_por = auth.uid(),
         versao = case when m.publicado_em is null then versao else versao + 1 end,
         atualizado_em = now()
   where id = _modulo;
  -- Módulo obrigatório novo em fase que o corretor JÁ concluiu vira atribuição
  -- com prazo (o nível dele não cai). Quem ainda não chegou na fase recebe o
  -- módulo naturalmente na trilha. Sem esse filtro, publicar os 24 módulos no
  -- lançamento criaria 24 atribuições por corretor.
  if m.obrigatorio and m.publicado_em is null then
    insert into academia_atribuicoes (corretor_id, modulo_id, origem, motivo, prazo, atribuido_por)
    select p.corretor_id, _modulo, 'nova_versao', 'modulo novo em fase ja concluida',
           current_date + 14, auth.uid()
    from academia_participantes p
    join academia_fases f on f.numero = m.fase
    where p.participa
      and f.nivel_que_exige is not null
      and p.nivel >= f.nivel_que_exige
    on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------
alter table public.academia_config              enable row level security;
alter table public.academia_fases               enable row level security;
alter table public.academia_modulos             enable row level security;
alter table public.academia_aulas               enable row level security;
alter table public.academia_questoes            enable row level security;
alter table public.academia_participantes       enable row level security;
alter table public.academia_niveis_historico    enable row level security;
alter table public.academia_progresso_aulas     enable row level security;
alter table public.academia_tentativas          enable row level security;
alter table public.academia_praticas            enable row level security;
alter table public.academia_atribuicoes         enable row level security;
alter table public.academia_certificados        enable row level security;
alter table public.academia_indicadores         enable row level security;
alter table public.academia_regras_recomendacao enable row level security;
alter table public.academia_recomendacoes       enable row level security;
alter table public.academia_encontros           enable row level security;
alter table public.academia_presencas           enable row level security;

-- gestor faz tudo em tudo
do $$
declare t text;
begin
  foreach t in array array[
    'academia_config','academia_fases','academia_modulos','academia_aulas','academia_questoes',
    'academia_participantes','academia_niveis_historico','academia_progresso_aulas',
    'academia_tentativas','academia_praticas','academia_atribuicoes','academia_certificados',
    'academia_indicadores','academia_regras_recomendacao','academia_recomendacoes',
    'academia_encontros','academia_presencas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_gestor_all', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.academia_eh_gestor()) with check (public.academia_eh_gestor())',
                   t || '_gestor_all', t);
  end loop;
end $$;

-- corretor: lê conteúdo publicado (questões NUNCA: só via RPC)
drop policy if exists academia_fases_ler on public.academia_fases;
create policy academia_fases_ler on public.academia_fases for select to authenticated using (true);

drop policy if exists academia_modulos_ler on public.academia_modulos;
create policy academia_modulos_ler on public.academia_modulos for select to authenticated
  using (status = 'publicado');

drop policy if exists academia_aulas_ler on public.academia_aulas;
create policy academia_aulas_ler on public.academia_aulas for select to authenticated
  using (status = 'publicado' and exists (select 1 from public.academia_modulos m
                                          where m.id = modulo_id and m.status = 'publicado'));

-- corretor: lê só o que é dele. Escrita só por RPC (sem policy de insert/update).
do $$
declare t text;
begin
  foreach t in array array[
    'academia_participantes','academia_niveis_historico','academia_progresso_aulas',
    'academia_praticas','academia_atribuicoes','academia_certificados','academia_presencas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_proprio', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (corretor_id = auth.uid())', t || '_proprio', t);
  end loop;
end $$;

-- tentativas: o corretor vê as dele, mas o gabarito vive em academia_questoes (bloqueada)
drop policy if exists academia_tentativas_proprio on public.academia_tentativas;
create policy academia_tentativas_proprio on public.academia_tentativas for select to authenticated
  using (corretor_id = auth.uid());

-- recomendação em modo sombra é invisível ao corretor
drop policy if exists academia_recomendacoes_proprio on public.academia_recomendacoes;
create policy academia_recomendacoes_proprio on public.academia_recomendacoes for select to authenticated
  using (corretor_id = auth.uid() and status in ('atribuida','concluida'));

drop policy if exists academia_encontros_ler on public.academia_encontros;
create policy academia_encontros_ler on public.academia_encontros for select to authenticated using (true);

-- RPCs: só usuários logados
revoke execute on function
  public.academia_marcar_aula(uuid, boolean),
  public.academia_quiz_iniciar(uuid),
  public.academia_quiz_enviar(uuid, jsonb),
  public.academia_pratica_enviar(uuid, text, text),
  public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text),
  public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text),
  public.academia_definir_apto(uuid, boolean, text),
  public.academia_promover_mestre(uuid, text),
  public.academia_atribuir(uuid, uuid, date, text, text, uuid),
  public.academia_decidir_recomendacao(uuid, text, text, date),
  public.academia_publicar_modulo(uuid),
  public.academia_recalcular_nivel(uuid)
from public, anon;
grant execute on function
  public.academia_marcar_aula(uuid, boolean),
  public.academia_quiz_iniciar(uuid),
  public.academia_quiz_enviar(uuid, jsonb),
  public.academia_pratica_enviar(uuid, text, text),
  public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text),
  public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text),
  public.academia_definir_apto(uuid, boolean, text),
  public.academia_promover_mestre(uuid, text),
  public.academia_atribuir(uuid, uuid, date, text, text, uuid),
  public.academia_decidir_recomendacao(uuid, text, text, date),
  public.academia_publicar_modulo(uuid)
to authenticated;
-- academia_recalcular_nivel fica interna (chamada pelas outras RPCs e pelo cron)

commit;
