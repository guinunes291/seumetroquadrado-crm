CREATE TABLE IF NOT EXISTS public.leads_import_tmp (
  id bigserial PRIMARY KEY,
  nome text,
  email text,
  telefone text,
  empreendimento text,
  projeto_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.leads_import_tmp TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_import_tmp TO sandbox_exec;
GRANT USAGE, SELECT ON SEQUENCE public.leads_import_tmp_id_seq TO sandbox_exec;
ALTER TABLE public.leads_import_tmp ENABLE ROW LEVEL SECURITY;