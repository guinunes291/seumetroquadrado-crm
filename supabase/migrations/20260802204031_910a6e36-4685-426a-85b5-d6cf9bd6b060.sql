CREATE OR REPLACE FUNCTION public.is_mcp()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cache text; u text; v boolean;
BEGIN
  u := coalesce(auth.uid()::text, '-');
  cache := current_setting('app.is_mcp_cache', true);
  IF cache = u || ':t' THEN RETURN true; END IF;
  IF cache = u || ':f' THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.mcp_identidade m
    WHERE m.uid = auth.uid() AND m.ativo
  ) INTO v;
  PERFORM set_config('app.is_mcp_cache', u || CASE WHEN v THEN ':t' ELSE ':f' END, true);
  RETURN v;
END;
$$;