-- Vitrine de Empreendimentos: coordenadas geográficas por projeto.
-- Permitem o mapa geográfico real (pinos por lat/lng) no lugar do esquemático.
-- Preenchidas por geocodificação em massa (workflow n8n) ou manualmente.

alter table public.projetos
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.projetos.lat is
  'Latitude (WGS84) do empreendimento, para o mapa geográfico. Opcional.';
comment on column public.projetos.lng is
  'Longitude (WGS84) do empreendimento, para o mapa geográfico. Opcional.';
