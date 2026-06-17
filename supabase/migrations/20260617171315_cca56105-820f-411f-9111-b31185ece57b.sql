
CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _sem_dias int;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]'::jsonb)));
  _temps    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]'::jsonb)));
  _projetos := ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'::jsonb)))::uuid);
  _origens  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]'::jsonb)));
  _sem_dias := NULLIF(_filtros->>'semInteracaoHaDias','')::int;

  RETURN QUERY
  SELECT l.* FROM public.leads l
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_corretor IS NULL OR l.corretor_id = _corretor)
    AND (COALESCE(array_length(_statuses,1),0) = 0 OR l.status::text = ANY(_statuses))
    AND (COALESCE(array_length(_temps,1),0) = 0 OR l.temperatura::text = ANY(_temps))
    AND (
      COALESCE(array_length(_projetos,1),0) = 0
      OR l.projeto_id = ANY(_projetos)
      OR EXISTS (
        SELECT 1 FROM public.projetos p
        WHERE p.id = ANY(_projetos)
          AND l.projeto_nome IS NOT NULL
          AND lower(btrim(l.projeto_nome)) = lower(btrim(p.nome))
      )
    )
    AND (COALESCE(array_length(_origens,1),0) = 0 OR l.origem::text = ANY(_origens))
    AND (
      _sem_dias IS NULL
      OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - (_sem_dias || ' days')::interval
    );
END;
$$;
