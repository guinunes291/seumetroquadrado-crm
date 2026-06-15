CREATE TABLE IF NOT EXISTS public.stg_leads (
  legacy_id bigint, nome text, email text, telefone text, cpf text, origem text,
  projeto_custom text, corretor_legacy bigint, corretor_anterior_legacy bigint,
  status text, temperatura text, observacoes text, motivo_perdido text, campanha text,
  renda_informada text, usa_fgts text, entrada_disponivel text, na_lixeira text,
  data_distribuicao text, timestamp_recebimento text, proximo_followup text,
  ultimo_contato text, ultima_interacao text, data_movido_lixeira text,
  utm_source text, utm_medium text, utm_content text, utm_campaign text,
  created_at text, updated_at text
);
CREATE TABLE IF NOT EXISTS public.stg_agendamentos (
  legacy_id bigint, lead_legacy bigint, corretor_legacy bigint, status text,
  data_agendamento text, construtora text, observacoes text, created_at text
);
CREATE TABLE IF NOT EXISTS public.stg_visitas (
  lead_legacy bigint, corretor_legacy bigint, data_visita text, created_at text
);
CREATE TABLE IF NOT EXISTS public.stg_analises (
  lead_legacy bigint, corretor_legacy bigint, status text, created_at text
);
GRANT ALL ON public.stg_leads, public.stg_agendamentos, public.stg_visitas, public.stg_analises TO service_role;