CREATE OR REPLACE FUNCTION public.is_mcp()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cache text; v boolean;
BEGIN
  cache := current_setting('app.is_mcp_cache', true);
  IF cache IN ('t','f') THEN
    RETURN cache = 't';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.mcp_identidade m
    WHERE m.uid = auth.uid() AND m.ativo
  ) INTO v;
  PERFORM set_config('app.is_mcp_cache', CASE WHEN v THEN 't' ELSE 'f' END, false);
  RETURN v;
END;
$$;

-- invalidar o cache quando a identidade for ligada/desligada
CREATE OR REPLACE FUNCTION public.mcp_identidade_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  PERFORM pg_notify('mcp_identidade', 'changed');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mcp_identidade_touch ON public.mcp_identidade;
CREATE TRIGGER trg_mcp_identidade_touch BEFORE UPDATE ON public.mcp_identidade
  FOR EACH ROW EXECUTE FUNCTION public.mcp_identidade_touch();