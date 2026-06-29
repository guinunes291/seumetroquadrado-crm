-- Tempo de 1ª resposta (KPI histórico, complementa o alerta de SLA ao vivo).
-- Para os leads CRIADOS no período, mede o tempo entre a criação do lead e a
-- 1ª interação de SAÍDA (primeiro contato do corretor), agregando por corretor.
-- Idempotente (CREATE OR REPLACE). Roda no Painel do Gestor.

DROP FUNCTION IF EXISTS public.tempo_primeira_resposta(date, date, uuid);
CREATE OR REPLACE FUNCTION public.tempo_primeira_resposta(
  _di date,
  _df date,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE (
  corretor_id uuid,
  leads_no_periodo integer,
  leads_respondidos integer,
  tempo_medio_min integer,
  tempo_mediana_min integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin')
                      OR public.has_role(_caller,'gestor')
                      OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  -- Corretor só enxerga os próprios números.
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH leads_periodo AS (
    SELECT l.id, l.corretor_id, l.created_at
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.created_at::date BETWEEN _di AND _df
      AND (_scope IS NULL OR l.corretor_id = _scope)
  ),
  primeira_resp AS (
    SELECT lp.corretor_id,
           EXTRACT(EPOCH FROM (fr.primeira - lp.created_at)) / 60 AS resp_min
    FROM leads_periodo lp
    JOIN LATERAL (
      SELECT MIN(i.ocorreu_em) AS primeira
      FROM public.interacoes i
      WHERE i.lead_id = lp.id
        AND i.direcao = 'saida'
        AND i.deleted_at IS NULL
        AND i.ocorreu_em >= lp.created_at
    ) fr ON TRUE
    WHERE fr.primeira IS NOT NULL
  ),
  counts AS (
    SELECT lp.corretor_id, COUNT(*)::int AS leads_no_periodo
    FROM leads_periodo lp
    GROUP BY lp.corretor_id
  )
  SELECT c.corretor_id,
         c.leads_no_periodo,
         COUNT(pr.resp_min)::int AS leads_respondidos,
         COALESCE(ROUND(AVG(pr.resp_min)), 0)::int AS tempo_medio_min,
         COALESCE(
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY pr.resp_min)),
           0
         )::int AS tempo_mediana_min
  FROM counts c
  LEFT JOIN primeira_resp pr ON pr.corretor_id = c.corretor_id
  GROUP BY c.corretor_id, c.leads_no_periodo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tempo_primeira_resposta(date, date, uuid) TO authenticated;
