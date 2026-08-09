-- Tempo de 1ª resposta v2 (auditoria de métricas 2026-08-09).
--
-- Correções sobre 20260629160000_tempo_primeira_resposta.sql:
--
--  1) SEM resposta ⇒ NULL, nunca 0. O COALESCE(...,0) antigo fazia o
--     corretor que não respondeu NENHUM lead aparecer com "0 min" — o KPI
--     melhorava justamente quando o lead não era trabalhado. A UI trata
--     NULL como "pendente" (—).
--
--  2) Recorte de período no fuso da operação (America/Sao_Paulo). Antes o
--     corte era `created_at::date` no fuso do banco (UTC): lead criado às
--     21h+ de Brasília caía no dia seguinte e a janela não fechava com os
--     cards vizinhos do painel (dashboard_atividade_periodo corta em BRT).
--
--  3) A métrica passa a medir explicitamente o 1º contato HUMANO:
--     exige `autor_id IS NOT NULL` (exclui ecos de webhook/automação, que
--     gravam autor NULL) e exclui `tipo IN ('nota','mudanca_status')`
--     (nota interna não é contato com o cliente). Hoje a resposta do BOT
--     (pré-handoff, n8n) não é persistida no CRM — nem em `interacoes`
--     nem em `mensagens` de saída — portanto "1ª resposta incluindo bot"
--     segue imensurável até o n8n registrar o outbound (ver relatório em
--     docs/auditoria/2026-08-09-metricas-hhmm.md).
--
--  4) Coluna ADITIVA `leads_dado_sujo`: leads do período com interação de
--     saída humana registrada ANTES da criação do lead (timestamp
--     invertido — típico de importação em lote). Esses registros já eram
--     excluídos da média; agora ficam contáveis para o relatório de dados
--     sujos. Consumidores antigos ignoram a coluna extra.
--
-- A subtração continua entre timestamptz no mesmo referencial (UTC);
-- unidade de saída continua MINUTOS inteiros — a formatação hh:mm é
-- responsabilidade exclusiva da camada de exibição.
-- Idempotente (DROP + CREATE; assinatura de entrada preservada).

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
  tempo_mediana_min integer,
  leads_dado_sujo integer
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
      AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _di AND _df
      AND (_scope IS NULL OR l.corretor_id = _scope)
  ),
  primeira_resp AS (
    SELECT lp.corretor_id,
           EXTRACT(EPOCH FROM (fr.primeira - lp.created_at)) / 60 AS resp_min,
           fr.tem_invertida
    FROM leads_periodo lp
    JOIN LATERAL (
      SELECT MIN(i.ocorreu_em) FILTER (WHERE i.ocorreu_em >= lp.created_at) AS primeira,
             bool_or(i.ocorreu_em < lp.created_at)                          AS tem_invertida
      FROM public.interacoes i
      WHERE i.lead_id = lp.id
        AND i.direcao = 'saida'
        AND i.autor_id IS NOT NULL
        AND i.tipo NOT IN ('nota','mudanca_status')
        AND i.deleted_at IS NULL
    ) fr ON TRUE
    WHERE fr.primeira IS NOT NULL OR fr.tem_invertida
  ),
  counts AS (
    SELECT lp.corretor_id, COUNT(*)::int AS leads_no_periodo
    FROM leads_periodo lp
    GROUP BY lp.corretor_id
  )
  SELECT c.corretor_id,
         c.leads_no_periodo,
         COUNT(pr.resp_min)::int AS leads_respondidos,
         ROUND(AVG(pr.resp_min))::int AS tempo_medio_min,
         ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY pr.resp_min))::numeric)::int
           AS tempo_mediana_min,
         COUNT(*) FILTER (WHERE pr.tem_invertida)::int AS leads_dado_sujo
  FROM counts c
  LEFT JOIN primeira_resp pr ON pr.corretor_id = c.corretor_id
  GROUP BY c.corretor_id, c.leads_no_periodo;
END;
$$;

COMMENT ON FUNCTION public.tempo_primeira_resposta(date, date, uuid) IS
  'Tempo de 1º contato HUMANO por corretor: criação do lead (recorte de dia em America/Sao_Paulo) até a 1ª interação de SAÍDA com autor humano (autor_id não nulo; nota/mudanca_status não contam). Minutos inteiros; NULL = ninguém respondido (pendente, nunca 0). leads_dado_sujo conta leads com saída registrada antes da criação (timestamp invertido, fora da média). Resposta do bot não é persistida hoje — métrica "com bot" indisponível.';

GRANT EXECUTE ON FUNCTION public.tempo_primeira_resposta(date, date, uuid) TO authenticated;
