CREATE TABLE public.leads_import_tmp (
  nome text,
  telefone text,
  email text,
  projeto_nome text,
  renda text
);

GRANT ALL ON public.leads_import_tmp TO service_role;
GRANT INSERT, SELECT ON public.leads_import_tmp TO sandbox_exec;

ALTER TABLE public.leads_import_tmp ENABLE ROW LEVEL SECURITY;