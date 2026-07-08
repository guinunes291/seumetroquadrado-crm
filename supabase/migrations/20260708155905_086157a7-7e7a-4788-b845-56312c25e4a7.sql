
-- SQL-1: proximo_followup como espelho derivado
CREATE OR REPLACE FUNCTION public.sync_proximo_followup(_lead_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.leads l
     SET proximo_followup = (
       SELECT min(t.data_vencimento)
         FROM public.tarefas t
        WHERE t.lead_id = _lead_id
          AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
     )
   WHERE l.id = _lead_id
     AND l.proximo_followup IS DISTINCT FROM (
       SELECT min(t.data_vencimento) FROM public.tarefas t
        WHERE t.lead_id = _lead_id AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL AND t.data_vencimento IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.trg_tarefa_sync_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN PERFORM public.sync_proximo_followup(OLD.lead_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.lead_id IS NOT NULL THEN PERFORM public.sync_proximo_followup(NEW.lead_id); END IF;
  IF TG_OP = 'UPDATE' AND OLD.lead_id IS DISTINCT FROM NEW.lead_id AND OLD.lead_id IS NOT NULL THEN
    PERFORM public.sync_proximo_followup(OLD.lead_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tarefa_sync_followup ON public.tarefas;
CREATE TRIGGER trg_tarefa_sync_followup
AFTER INSERT OR DELETE OR UPDATE OF status, data_vencimento, deleted_at, lead_id
ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_sync_followup();

-- SQL-2: cancelar follow-ups ao fechar/perder
CREATE OR REPLACE FUNCTION public.trg_cancelar_followups_fechamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('contrato_fechado','perdido','pos_venda')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.tarefas
       SET status = 'cancelada', updated_at = now()
     WHERE lead_id = NEW.id
       AND status IN ('pendente','em_andamento')
       AND tipo IN ('follow_up','ligacao','whatsapp','email');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_leads_cancelar_followups ON public.leads;
CREATE TRIGGER trg_leads_cancelar_followups
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_cancelar_followups_fechamento();

-- SQL-3: remover motor duplicado
DROP TRIGGER IF EXISTS trg_followup_em_atendimento ON public.leads;
DROP FUNCTION IF EXISTS public.criar_followup_em_atendimento() CASCADE;

-- SQL-4: corrigir fuso do alerta de parado (08:00 BRT = 11:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-leads-parados') THEN
    PERFORM cron.unschedule('alertar-leads-parados');
  END IF;
  PERFORM cron.schedule('alertar-leads-parados','0 11 * * *',
    $cron$ SELECT public.gerar_alertas_leads_parados(); $cron$);
END $$;

-- SQL-5: backfill
UPDATE public.leads l SET proximo_followup = s.prox
FROM (SELECT lead_id, min(data_vencimento) AS prox FROM public.tarefas
      WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
        AND data_vencimento IS NOT NULL AND lead_id IS NOT NULL
      GROUP BY lead_id) s
WHERE l.id = s.lead_id AND l.proximo_followup IS DISTINCT FROM s.prox;

UPDATE public.leads SET proximo_followup = NULL
WHERE proximo_followup IS NOT NULL
  AND id NOT IN (SELECT lead_id FROM public.tarefas
                 WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
                   AND data_vencimento IS NOT NULL AND lead_id IS NOT NULL);

UPDATE public.tarefas SET status='cancelada', updated_at=now()
WHERE status IN ('pendente','em_andamento')
  AND tipo IN ('follow_up','ligacao','whatsapp','email')
  AND lead_id IN (SELECT id FROM public.leads
                  WHERE status IN ('contrato_fechado','perdido','pos_venda'));

UPDATE public.tarefas SET data_conclusao = COALESCE(updated_at, now())
WHERE status='concluida' AND data_conclusao IS NULL;
