CREATE OR REPLACE FUNCTION public.recalcular_temperatura_leads()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _n int;
BEGIN
  -- Em lotes de 5.000 e pulando linhas travadas: não segura a base inteira
  -- (e não bloqueia o corretor) enquanto recalcula.
  WITH calc AS (
    SELECT id,
      CASE
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
        WHEN status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
        WHEN created_at > now() - interval '48 hours' AND ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
        WHEN created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
        ELSE 'frio'::lead_temperatura
      END AS nova, temperatura
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND status NOT IN ('contrato_fechado','pos_venda','perdido')
  ),
  alvo AS (
    SELECT l.id, c.nova
      FROM calc c
      JOIN public.leads l ON l.id = c.id
     WHERE c.temperatura IS DISTINCT FROM c.nova
     LIMIT 5000
     FOR UPDATE OF l SKIP LOCKED
  )
  UPDATE public.leads l
  SET temperatura = a.nova
  FROM alvo a
  WHERE l.id = a.id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _fb jsonb;
  _dist int := 0;
  _falhas int := 0;
  _fallback int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.created_at > now() - interval '7 days'
      -- [19/10/2026] Lead importado em massa entra na base sem roleta.
      AND l.import_batch_id IS NULL
      AND l.origem IS DISTINCT FROM 'importacao'
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at DESC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      IF COALESCE(_res->>'motivo','') IN ('sem_corretor_na_zona','sem_corretor_elegivel','sem_corretor_ativo','zona_sem_time') THEN
        BEGIN
          _fb := public._fallback_velocidade(_lead_id);
          IF (_fb->>'ok')::boolean THEN
            _fallback := _fallback + 1;
          ELSE
            _falhas := _falhas + 1;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          _falhas := _falhas + 1;
        END;
      ELSE
        _falhas := _falhas + 1;
      END IF;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'fallback_velocidade', _fallback,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$function$;