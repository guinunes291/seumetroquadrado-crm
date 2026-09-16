-- Fase 3.1 — busca de lead por telefone agnóstica a DDI (9 últimos dígitos).
-- Usa a mesma expressão de mesclar_leads_por_telefone e do índice
-- leads_tel9_ativo_idx (escrita literalmente para casar com o índice).
--
-- ROLLBACK (corpo antigo):
--   SELECT l.id FROM public.leads l
--   WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.status <> 'perdido'
--     AND length(public.telefone_digits(l.telefone)) >= 8
--     AND public.telefone_digits(l.telefone) = public.telefone_digits(_telefone)
--   ORDER BY l.updated_at DESC LIMIT 1;

CREATE OR REPLACE FUNCTION public.buscar_lead_ativo_por_telefone_global(_telefone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status <> 'perdido'
    AND length(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g')) >= 9
    AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9)
        = right(regexp_replace(coalesce(_telefone, ''), '\D', '', 'g'), 9)
  ORDER BY l.updated_at DESC
  LIMIT 1;
$function$;