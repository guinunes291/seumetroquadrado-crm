
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = extensions, public
AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(public.immutable_unaccent(
      coalesce(nome, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(telefone, '') || ' ' ||
      coalesce(regexp_replace(telefone, '\D', '', 'g'), '')
    ))
  ) STORED;

CREATE INDEX IF NOT EXISTS leads_search_text_trgm
  ON public.leads USING gin (search_text extensions.gin_trgm_ops);
