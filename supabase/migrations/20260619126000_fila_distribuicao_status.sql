-- Diagnóstico por corretor da roleta: devolve o motivo exato de (in)elegibilidade,
-- espelhando public.corretor_elegivel (presente hoje + ativo + dentro da cota +
-- >= 70% da carteira trabalhada). Usado na tela /distribuição para mostrar, por
-- corretor, POR QUE recebe ou não recebe leads (ex.: "sem check-in hoje").

CREATE OR REPLACE FUNCTION public.fila_distribuicao_status()
RETURNS TABLE (
  corretor_id uuid,
  presente_hoje boolean,
  pct_trabalhada numeric,
  elegivel boolean,
  motivo text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fd.corretor_id,
    (p.presente AND p.presente_em IS NOT NULL AND p.presente_em::date = current_date) AS presente_hoje,
    round(cart.pct * 100, 0) AS pct_trabalhada,
    public.corretor_elegivel(fd.corretor_id) AS elegivel,
    CASE
      WHEN NOT fd.ativo THEN 'inativo na roleta'
      WHEN NOT (p.presente AND p.presente_em IS NOT NULL AND p.presente_em::date = current_date)
        THEN 'sem check-in hoje'
      WHEN fd.leads_recebidos_hoje >= fd.max_leads_dia THEN 'cota diária atingida'
      WHEN cart.pct < 0.7 THEN 'carteira < 70% trabalhada'
      ELSE 'elegível'
    END AS motivo
  FROM public.fila_distribuicao fd
  JOIN public.profiles p ON p.id = fd.corretor_id
  LEFT JOIN LATERAL (
    SELECT CASE
             WHEN count(*) = 0 THEN 1::numeric
             ELSE (count(*) FILTER (WHERE status <> 'aguardando_atendimento'))::numeric / count(*)::numeric
           END AS pct
    FROM public.leads l
    WHERE l.corretor_id = fd.corretor_id
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
  ) cart ON true
  ORDER BY fd.posicao;
$$;

GRANT EXECUTE ON FUNCTION public.fila_distribuicao_status() TO authenticated;
