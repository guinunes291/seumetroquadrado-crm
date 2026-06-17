CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _novo uuid;
  _dist int := 0;
  _redist int := 0;
BEGIN
  FOR _lead_id IN
    SELECT id FROM public.leads
    WHERE corretor_id IS NULL
      AND status = 'novo'
      AND deleted_at IS NULL
      AND na_lixeira = false
    ORDER BY created_at DESC
    LIMIT 200
  LOOP
    _novo := public.distribuir_lead_elegivel(_lead_id);
    IF _novo IS NOT NULL THEN _dist := _dist + 1;
    ELSE EXIT;
    END IF;
  END LOOP;

  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object('distribuidos', _dist, 'redistribuidos', _redist, 'em', now());
END;
$$;