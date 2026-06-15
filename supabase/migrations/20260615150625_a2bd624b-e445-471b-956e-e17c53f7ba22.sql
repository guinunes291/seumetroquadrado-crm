
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Reset diário de cota da roleta (00:05 todo dia)
SELECT cron.unschedule('reset-cotas-diarias') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reset-cotas-diarias');
SELECT cron.schedule(
  'reset-cotas-diarias',
  '5 0 * * *',
  $$ SELECT public.resetar_cotas_diarias(); $$
);

-- Expiração de lixeira (90 dias)
CREATE OR REPLACE FUNCTION public.expirar_lixeira_antiga()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.interacoes   WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
  DELETE FROM public.tarefas      WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
  DELETE FROM public.agendamentos WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
  DELETE FROM public.unidades     WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
  DELETE FROM public.leads        WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
  DELETE FROM public.projetos     WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '90 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expirar_lixeira_antiga() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('expirar-lixeira') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='expirar-lixeira');
SELECT cron.schedule(
  'expirar-lixeira',
  '0 3 * * 0',
  $$ SELECT public.expirar_lixeira_antiga(); $$
);
