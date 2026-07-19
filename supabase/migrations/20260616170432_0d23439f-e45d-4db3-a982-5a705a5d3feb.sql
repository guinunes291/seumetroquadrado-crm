DROP FUNCTION IF EXISTS public.copa_ranking();
CREATE OR REPLACE FUNCTION public.copa_ranking()
RETURNS TABLE(corretor_id uuid, nome text, bandeira text,
              agendamentos integer, visitas integer, analise integer,
              vendas integer, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.corretor_id, r.nome, r.bandeira,
         r.agendamentos, r.visitas, r.analise, r.vendas, r.total
  FROM public.copa_ranking(
    (SELECT id FROM public.copa_edicao WHERE ativo = true ORDER BY data_inicio DESC LIMIT 1)
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.copa_pontos_por_semana()
RETURNS TABLE(corretor_id uuid, semana int, pontos int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.corretor_id, v.semana, v.total_semana::int AS pontos
  FROM public.copa_pontuacao_semanal v
  WHERE v.edicao_id = (
    SELECT id FROM public.copa_edicao WHERE ativo = true ORDER BY data_inicio DESC LIMIT 1
  )
  ORDER BY v.semana, v.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.copa_ranking() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_pontos_por_semana() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_ranking() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_pontos_por_semana() TO authenticated, service_role;