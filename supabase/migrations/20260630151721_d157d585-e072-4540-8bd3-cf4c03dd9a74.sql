-- Bloco E: remover tabelas de staging do import histórico (sem RLS, sem uso pelo app)
DROP TABLE IF EXISTS public.stg_leads CASCADE;
DROP TABLE IF EXISTS public.stg_agendamentos CASCADE;
DROP TABLE IF EXISTS public.stg_visitas CASCADE;
DROP TABLE IF EXISTS public.stg_analises CASCADE;