
CREATE OR REPLACE FUNCTION public.copa_set_participantes(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.copa_set_participantes('a0000000-0000-4000-8000-000000000001'::uuid, _ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.copa_realizar_sorteio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.copa_realizar_sorteio('a0000000-0000-4000-8000-000000000001'::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.copa_set_participantes(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copa_realizar_sorteio() TO authenticated;
