
-- 1) Normalização de nomes de projeto (sem acentos, sem pontuação, minúsculas, corrigindo mojibake comum)
CREATE OR REPLACE FUNCTION public._norm_projeto_nome(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public','extensions'
AS $$
  SELECT regexp_replace(
    lower(extensions.unaccent(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(txt,''),
        'Ã§','ç'),'Ã£','ã'),'Ã¡','á'),'Ã©','é'),'Ã­','í'),'Ã³','ó'),'Ãº','ú'),'Ã¢','â'),'Ãª','ê'),'Ã´','ô'),'Ã ','à'),'Ãµ','õ'),'Ã‡','Ç'),'Ã‰','É'),'ÃŠ','Ê'),'Ã"','Ó')
    )),
    '[^a-z0-9]+', '', 'g'
  );
$$;

-- 2) Atualiza a função de query da Oferta Ativa para usar a normalização
CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
 RETURNS SETOF leads
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _zonas text[];
  _sem_dias int;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]'::jsonb)));
  _temps    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]'::jsonb)));
  _projetos := ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'::jsonb)))::uuid);
  _origens  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]'::jsonb)));
  _zonas    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'zona','[]'::jsonb)));
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
          AND public._norm_projeto_nome(l.projeto_nome) = public._norm_projeto_nome(p.nome)
          AND public._norm_projeto_nome(p.nome) <> ''
      )
    )
    AND (COALESCE(array_length(_origens,1),0) = 0 OR l.origem::text = ANY(_origens))
    AND (
      COALESCE(array_length(_zonas,1),0) = 0
      OR EXISTS (
        SELECT 1 FROM public.projetos p
        WHERE p.zona_smq = ANY(_zonas)
          AND (
            l.projeto_id = p.id
            OR (l.projeto_nome IS NOT NULL
                AND public._norm_projeto_nome(l.projeto_nome) = public._norm_projeto_nome(p.nome)
                AND public._norm_projeto_nome(p.nome) <> '')
          )
      )
    )
    AND (
      _sem_dias IS NULL
      OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - (_sem_dias || ' days')::interval
    );
END;
$function$;

-- 3) Backfill: vincula leads sem projeto_id ao projeto correspondente quando o nome normalizado bate de forma única
WITH cand AS (
  SELECT l.id AS lead_id, p.id AS projeto_id,
         count(*) OVER (PARTITION BY l.id) AS n_matches
  FROM public.leads l
  JOIN public.projetos p
    ON p.deleted_at IS NULL
   AND public._norm_projeto_nome(p.nome) = public._norm_projeto_nome(l.projeto_nome)
   AND public._norm_projeto_nome(p.nome) <> ''
  WHERE l.projeto_id IS NULL
    AND l.projeto_nome IS NOT NULL
    AND btrim(l.projeto_nome) <> ''
    AND l.deleted_at IS NULL
)
UPDATE public.leads l
SET projeto_id = c.projeto_id
FROM cand c
WHERE c.lead_id = l.id AND c.n_matches = 1;

-- 4) Trigger para autovincular projeto_id em novos leads / updates de projeto_nome
CREATE OR REPLACE FUNCTION public._leads_autolink_projeto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pid uuid;
  _n int;
BEGIN
  IF NEW.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.projeto_nome IS NULL OR btrim(NEW.projeto_nome) = '' THEN
    RETURN NEW;
  END IF;

  SELECT p.id, count(*) OVER () INTO _pid, _n
  FROM public.projetos p
  WHERE p.deleted_at IS NULL
    AND public._norm_projeto_nome(p.nome) = public._norm_projeto_nome(NEW.projeto_nome)
    AND public._norm_projeto_nome(p.nome) <> ''
  LIMIT 1;

  IF _n = 1 THEN
    NEW.projeto_id := _pid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_autolink_projeto ON public.leads;
CREATE TRIGGER trg_leads_autolink_projeto
BEFORE INSERT OR UPDATE OF projeto_nome, projeto_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public._leads_autolink_projeto();
