DO $do$
DECLARE
  r record;
  novo text;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('leads_filtered_v3','leads_filtered_v4','leads_filtered_v5',
                        'leads_status_counts_v3','leads_status_counts_v4','leads_status_counts_v5')
      AND pg_get_functiondef(p.oid) LIKE '%OR (_gestor AND l.corretor_id IS NULL)%'
  LOOP
    -- Gestor vê apenas a própria carteira e a do time; leads sem corretor
    -- (estoque/bolsão) ficam restritos a admin/superintendente (_ve_tudo).
    novo := replace(
      r.def,
      'OR (_gestor AND l.corretor_id IS NULL)',
      'OR (false AND _gestor AND l.corretor_id IS NULL)'
    );
    EXECUTE novo;
  END LOOP;
END
$do$;