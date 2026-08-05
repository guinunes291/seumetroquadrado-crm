DO $$
DECLARE r record; ok int := 0; falhou int := 0; res jsonb;
BEGIN
  FOR r IN
    SELECT id FROM public.leads
    WHERE import_batch_id = '11111111-2222-3333-4444-555555555001'::uuid
      AND corretor_id IS NULL AND deleted_at IS NULL
    ORDER BY created_at
  LOOP
    BEGIN
      res := public._distribuir_lead_v3(r.id, 'automatica'::distribuicao_tipo, 'marquinhos', NULL, NULL, 'importacao', '{}'::jsonb);
      IF (res->>'ok')::boolean IS TRUE OR res ? 'corretor_id' THEN ok := ok + 1; ELSE falhou := falhou + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      falhou := falhou + 1;
    END;
  END LOOP;
  RAISE NOTICE 'distribuidos=% falhas=%', ok, falhou;
END $$;