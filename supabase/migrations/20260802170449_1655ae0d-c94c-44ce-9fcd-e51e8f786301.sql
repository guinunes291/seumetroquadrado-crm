ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS unidade text;

CREATE OR REPLACE FUNCTION public.vendas_normalizar_unidade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.unidade := NULLIF(btrim(COALESCE(NEW.unidade, '')), '');
  IF NEW.unidade IS NOT NULL AND char_length(NEW.unidade) > 60 THEN
    RAISE EXCEPTION 'unidade excede 60 caracteres' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendas_normalizar_unidade ON public.vendas;
CREATE TRIGGER trg_vendas_normalizar_unidade
BEFORE INSERT OR UPDATE OF unidade ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.vendas_normalizar_unidade();