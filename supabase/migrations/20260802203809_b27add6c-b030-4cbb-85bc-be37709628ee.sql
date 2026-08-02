DO $$
DECLARE
  t record;
  cols text;
  segredos text[];
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('copiloto_config', ARRAY['key']),
      ('propostas', ARRAY['link_token']),
      ('push_outbox', ARRAY['lease_token'])
    ) v(tab, segredos)
  LOOP
    segredos := t.segredos;
    SELECT string_agg(format('%I', column_name), ', ')
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.tab
       AND NOT (column_name = ANY (segredos));
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', t.tab);
    IF cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t.tab);
    END IF;
  END LOOP;
END $$;