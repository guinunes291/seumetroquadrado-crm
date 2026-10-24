-- concat_ws is STABLE for polymorphic inputs; these four text inputs are immutable.
CREATE OR REPLACE FUNCTION public.projetos_regiao_busca_text(_regiao text, _zona text, _bairro text, _cidade text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT lower(public.immutable_unaccent(concat_ws(' ', _regiao, _zona, _bairro, _cidade))) $$;

ALTER TABLE public.projetos
  ADD COLUMN nome_busca text GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(nome, '') || ' ' || coalesce(construtora, '')))) STORED,
  ADD COLUMN regiao_busca text GENERATED ALWAYS AS (public.projetos_regiao_busca_text(regiao, zona_smq, bairro, cidade)) STORED;

GRANT SELECT (nome_busca, regiao_busca) ON public.projetos TO authenticated;

DO $$
DECLARE trgm_schema text;
BEGIN
  SELECT n.nspname INTO trgm_schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  IF trgm_schema IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS projetos_nome_busca_trgm_idx ON public.projetos USING gin (nome_busca %I.gin_trgm_ops)', trgm_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS projetos_regiao_busca_trgm_idx ON public.projetos USING gin (regiao_busca %I.gin_trgm_ops)', trgm_schema);
  END IF;
END $$;