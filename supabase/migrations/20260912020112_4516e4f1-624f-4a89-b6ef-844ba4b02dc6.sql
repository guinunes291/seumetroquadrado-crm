CREATE OR REPLACE VIEW public.v_higiene_motor_status
WITH (security_invoker = true) AS
SELECT
  c.modo,
  c.dias_parado_min,
  c.lote_min_leads,
  c.teto_perdidos_dia,
  c.lote_max,
  u.ultima_execucao,
  u.execucao_id,
  COALESCE(u.avaliados, 0)  AS avaliados,
  COALESCE(u.aplicados, 0)  AS aplicados,
  COALESCE(u.pulados, 0)    AS pulados,
  COALESCE(u.erros, 0)      AS erros,
  u.motivos_pulo
FROM public.higiene_config c
LEFT JOIN LATERAL (
  SELECT
    max(l.ts)                                            AS ultima_execucao,
    l.execucao_id,
    count(*)                                             AS avaliados,
    count(*) FILTER (WHERE l.aplicado)                   AS aplicados,
    count(*) FILTER (WHERE l.motivo_pulo IS NOT NULL)    AS pulados,
    count(*) FILTER (WHERE l.erro IS NOT NULL)           AS erros,
    jsonb_object_agg(COALESCE(l.motivo_pulo, 'aplicado'), l.n) AS motivos_pulo
  FROM (
    SELECT ts, execucao_id, aplicado, motivo_pulo, erro,
           count(*) OVER (PARTITION BY motivo_pulo) AS n
      FROM public.higiene_execucao_log
     WHERE execucao_id = (
       SELECT execucao_id FROM public.higiene_execucao_log ORDER BY ts DESC, id DESC LIMIT 1
     )
  ) l
  GROUP BY l.execucao_id
) u ON true
WHERE c.id;

COMMENT ON VIEW public.v_higiene_motor_status IS
  'Batimento cardiaco do motor de higiene: modo, ultima execucao e o que ela fez. Sempre devolve uma linha, mesmo sem execucao.';

GRANT SELECT ON public.v_higiene_motor_status TO authenticated;

-- Aposentadoria: o job arquivar-leads-sem-contato-30d rodava as 6h UTC com
-- corpo `RETURN 0`. Cron ativo que nao faz nada e pior que job inexistente:
-- ele passa a impressao de que a higiene ja esta coberta.
DO $$
BEGIN
  PERFORM cron.unschedule('arquivar-leads-sem-contato-30d');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM cron.unschedule('higiene-processar-diaria');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule('higiene-processar-diaria', '0 4 * * *',
  $$SELECT public.higiene_processar()$$);