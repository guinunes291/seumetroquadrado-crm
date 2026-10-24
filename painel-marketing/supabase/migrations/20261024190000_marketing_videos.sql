-- Fase 4: vídeos gerados ou editados pelo Higgsfield.
-- Cada vídeo nasce de um pedido aprovado em marketing.jobs (gasta saldo da API do
-- Higgsfield, por isso passa pela aprovação). O arquivo final é copiado para o
-- armazenamento do Painel, porque o Higgsfield apaga tudo 7 dias depois.
-- Nada é apagado: vídeo que não serve é arquivado.

create table marketing.videos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references marketing.jobs(id),
  tipo text not null check (tipo in ('gerar', 'editar')),
  empreendimento_id bigint references marketing.empreendimentos(id),
  titulo text not null,
  ideia text not null,
  prompt text not null,
  modelo text not null,
  parametros jsonb not null default '{}'::jsonb,
  entrada_url text,
  hf_request_id text,
  status text not null default 'gerando'
    check (status in ('gerando', 'pronto', 'falhou', 'cancelado')),
  custo_estimado_usd numeric(10, 3),
  url text,
  erro text,
  criado_por text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz,
  arquivado_por text
);
create index on marketing.videos (criado_em desc);
create index on marketing.videos (status) where status = 'gerando';

grant select, insert on marketing.videos to painel_marketing;
grant update (hf_request_id, status, url, erro, atualizado_em, arquivado_em, arquivado_por)
  on marketing.videos to painel_marketing;
