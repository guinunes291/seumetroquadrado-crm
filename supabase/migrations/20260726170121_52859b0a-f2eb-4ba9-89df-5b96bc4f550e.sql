WITH lote AS (
  DELETE FROM public.leads_import_tmp t
  RETURNING t.*
),
norm AS (
  SELECT l.*,
         CASE WHEN length(l.d) >= 10
              THEN left(CASE WHEN length(l.d) > 11 THEN right(l.d, 11) ELSE l.d END, 2) || right(l.d, 8)
         END AS chave
  FROM (
    SELECT lote.*,
           CASE WHEN length(regexp_replace(lote.telefone, '\D', '', 'g')) IN (12, 13)
                     AND regexp_replace(lote.telefone, '\D', '', 'g') LIKE '55%'
                THEN substr(regexp_replace(lote.telefone, '\D', '', 'g'), 3)
                ELSE regexp_replace(lote.telefone, '\D', '', 'g') END AS d
    FROM lote
  ) l
),
existentes AS (
  SELECT DISTINCT
         CASE WHEN length(x.d) >= 10
              THEN left(CASE WHEN length(x.d) > 11 THEN right(x.d, 11) ELSE x.d END, 2) || right(x.d, 8)
         END AS chave
  FROM (
    SELECT CASE WHEN length(regexp_replace(l.telefone, '\D', '', 'g')) IN (12, 13)
                     AND regexp_replace(l.telefone, '\D', '', 'g') LIKE '55%'
                THEN substr(regexp_replace(l.telefone, '\D', '', 'g'), 3)
                ELSE regexp_replace(l.telefone, '\D', '', 'g') END AS d
    FROM public.leads l
  ) x
),
dedup AS (
  SELECT DISTINCT ON (n.chave) n.*
  FROM norm n
  WHERE n.chave IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM existentes e WHERE e.chave = n.chave)
  ORDER BY n.chave, n.nome
)
INSERT INTO public.leads (nome, telefone, email, projeto_nome, renda_informada, origem, status)
SELECT d.nome, d.telefone, d.email, d.projeto_nome, d.renda,
       'importacao'::lead_origem, 'aguardando_corretor'::lead_status
FROM dedup d;

DROP TABLE public.leads_import_tmp;