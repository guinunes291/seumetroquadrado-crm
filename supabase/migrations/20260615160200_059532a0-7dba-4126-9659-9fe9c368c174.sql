-- Produtores dos alertas que existiam no enum alerta_tipo mas nunca eram gerados:
-- 'tarefa_atrasada' e 'agendamento_proximo' (no sentido de "se aproximando").
-- Agendados via pg_cron, reusando o padrão das migrations anteriores.

-- 1) Tarefas atrasadas: 1 alerta por tarefa por dia.
CREATE OR REPLACE FUNCTION public.gerar_alertas_tarefas_atrasadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT t.corretor_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || t.titulo,
         'Venceu em ' || to_char(t.data_vencimento, 'DD/MM/YYYY HH24:MI'),
         '/tarefas', t.id
  FROM public.tarefas t
  WHERE t.status IN ('pendente','em_andamento')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND t.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = t.id
        AND a.tipo = 'tarefa_atrasada'
        AND a.created_at::date = now()::date
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_alertas_tarefas_atrasadas() FROM PUBLIC, anon, authenticated;

-- 2) Agendamentos entrando na janela de lembrete (data_inicio <= now + lembrete_minutos).
--    1 alerta de "em breve" por agendamento (distinto do alerta de criação).
CREATE OR REPLACE FUNCTION public.gerar_alertas_agendamentos_proximos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT ag.corretor_id, 'agendamento_proximo', 'Agendamento em breve: ' || ag.titulo,
         to_char(ag.data_inicio, 'DD/MM/YYYY HH24:MI') || COALESCE(' · ' || ag.local, ''),
         '/agendamentos', ag.id
  FROM public.agendamentos ag
  WHERE ag.deleted_at IS NULL
    AND ag.status IN ('agendado','confirmado','remarcado')
    AND ag.data_inicio > now()
    AND ag.data_inicio <= now() + (COALESCE(ag.lembrete_minutos, 30) || ' minutes')::interval
    AND ag.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = ag.id
        AND a.tipo = 'agendamento_proximo'
        AND a.titulo LIKE 'Agendamento em breve:%'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_alertas_agendamentos_proximos() FROM PUBLIC, anon, authenticated;

-- Tarefas atrasadas: de hora em hora. Agendamentos próximos: a cada 5 minutos.
SELECT cron.unschedule('alertar-tarefas-atrasadas')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='alertar-tarefas-atrasadas');
SELECT cron.schedule('alertar-tarefas-atrasadas', '0 * * * *',
  $$ SELECT public.gerar_alertas_tarefas_atrasadas(); $$);

SELECT cron.unschedule('alertar-agendamentos-proximos')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='alertar-agendamentos-proximos');
SELECT cron.schedule('alertar-agendamentos-proximos', '*/5 * * * *',
  $$ SELECT public.gerar_alertas_agendamentos_proximos(); $$);
