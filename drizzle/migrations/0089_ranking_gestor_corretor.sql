DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.ranking_campeonato(date,date)'::regprocedure);
  n := replace(d,
$a$      CASE WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
          AND ur.role IN ('admin', 'gestor')
      ) OR EXISTS$a$,
$b$      CASE WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'
      ) THEN 'gestao'
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor'
      ) THEN 'corretor'
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'gestor'
      ) OR EXISTS$b$);
  IF n = d THEN RAISE EXCEPTION 'trecho da categoria não encontrado'; END IF;
  EXECUTE n;
END $do$;
NOTIFY pgrst, 'reload schema';