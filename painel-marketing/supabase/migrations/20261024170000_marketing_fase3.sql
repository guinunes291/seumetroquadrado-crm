-- Fase 3: Biblioteca de criativos.
-- Só acrescenta. A biblioteca é um retrato dos anúncios da Meta com o desempenho
-- de todo o período; favoritar ou esconder aqui não mexe em nada na Meta.

create table if not exists marketing.criativos (
  ad_id text primary key,
  nome text not null,
  status text,
  campaign_id text,
  campanha_nome text,
  adset_id text,
  criado_na_meta timestamptz,
  creative_id text,
  tipo text check (tipo in ('video','imagem','carrossel','outro')),
  miniatura text,
  imagem text,
  titulo text,
  texto text,
  link_publicacao text,
  gasto numeric(12,2) not null default 0,
  impressoes bigint,
  cliques bigint,
  resultados numeric not null default 0,
  tipo_resultado text,
  favorito boolean not null default false,
  oculto boolean not null default false,
  nota text,
  sincronizado_em timestamptz not null default now()
);

-- Empreendimento do anúncio: o vínculo manual da campanha, se houver; senão,
-- o primeiro apelido conhecido que aparece no nome da campanha ou do anúncio.
create or replace view marketing.v_criativos as
select c.*,
  case when mc.vinculo = 'fora' then null else coalesce(
    case when mc.vinculo in ('nome','manual') then mc.empreendimento_id end,
    (select a.empreendimento_id from marketing.empreendimento_apelidos a
      where position(a.apelido in lower(coalesce(c.campanha_nome, '') || ' ' || c.nome)) > 0
      order by length(a.apelido) desc limit 1)
  ) end as empreendimento_id,
  case when c.resultados > 0 then round(c.gasto / c.resultados, 2) end as custo_por_resultado,
  case when c.impressoes > 0 then round(100.0 * c.cliques / c.impressoes, 2) end as ctr
from marketing.criativos c
left join marketing.meta_campanhas mc on mc.campaign_id = c.campaign_id;

grant select, insert, update on marketing.criativos to painel_marketing;
grant select on marketing.v_criativos to painel_marketing;
