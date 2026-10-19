CREATE OR REPLACE PROCEDURE public.processar_distribuicao_automatica_proc()
LANGUAGE plpgsql
SET search_path TO 'public'
AS $proc$
DECLARE
  _ids uuid[];
  _lead_id uuid;
  _res jsonb;
  _fb jsonb;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  -- Igual a processar_distribuicao_automatica(), mas grava (COMMIT) a cada
  -- lead: as travas da roleta são soltas na hora e não seguram o corretor
  -- que está marcando perdido / transferindo durante a rodada.
  SELECT coalesce(array_agg(x.id), ARRAY[]::uuid[]) INTO _ids FROM (
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.created_at > now() - interval '7 days'
      AND l.import_batch_id IS NULL
      AND l.origem IS DISTINCT FROM 'importacao'
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent AND e.updated_at > now() - interval '30 minutes')
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at))
    ORDER BY l.created_at DESC
    LIMIT 200) x;
  COMMIT;

  FOREACH _lead_id IN ARRAY _ids LOOP
    BEGIN
      _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
      IF NOT coalesce((_res->>'ok')::boolean, false)
         AND COALESCE(_res->>'motivo','') IN ('sem_corretor_na_zona','sem_corretor_elegivel','sem_corretor_ativo','zona_sem_time') THEN
        _fb := public._fallback_velocidade(_lead_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'distribuicao automatica lead %: %', _lead_id, SQLERRM;
    END;
    COMMIT;
  END LOOP;

  PERFORM public.redistribuir_sla_webhook();
  COMMIT;
  PERFORM public.redistribuir_leads_parados();
  COMMIT;
END;
$proc$;

REVOKE ALL ON PROCEDURE public.processar_distribuicao_automatica_proc() FROM PUBLIC, anon, authenticated;

-- (troca do comando da rotina descartada)