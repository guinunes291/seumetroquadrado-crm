
-- Service role precisa de TODOS, mas o psql do dev usa o role autenticador.
-- Concedemos via função para inserir o secret de forma controlada.
CREATE OR REPLACE FUNCTION public.copiloto_set_secret(_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  INSERT INTO public.copiloto_config(key,value) VALUES ('handoff_secret', _secret)
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
END $$;
REVOKE EXECUTE ON FUNCTION public.copiloto_set_secret(text) FROM PUBLIC, anon, authenticated;
