DO $do$
DECLARE r record; src text; novo text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosrc LIKE '%data_assinatura::timestamptz%'
  LOOP
    src := pg_get_functiondef(r.oid);
    novo := replace(src, 'data_assinatura::timestamptz', 'data_assinatura::timestamp AT TIME ZONE ''America/Sao_Paulo''');
    IF novo <> src THEN EXECUTE novo; END IF;
  END LOOP;
END
$do$;