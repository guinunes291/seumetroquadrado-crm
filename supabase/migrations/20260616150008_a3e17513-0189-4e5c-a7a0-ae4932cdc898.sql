-- Afrouxa a regra de elegibilidade da roleta automática:
-- antes exigia 90% dos leads ativos com status diferente de 'aguardando_atendimento';
-- agora exige 70%, para que a distribuição não trave quando o corretor está
-- com a base recém-recebida.
CREATE OR REPLACE FUNCTION public.corretor_elegivel(_corretor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ok boolean;
  _total int;
  _trabalhados int;
BEGIN
  SELECT (p.presente
          AND p.presente_em IS NOT NULL
          AND p.presente_em::date = current_date
          AND fd.ativo
          AND fd.leads_recebidos_hoje < fd.max_leads_dia)
  INTO _ok
  FROM public.profiles p
  JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
  WHERE p.id = _corretor_id;

  IF _ok IS NULL OR _ok = false THEN RETURN false; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'aguardando_atendimento')
  INTO _total, _trabalhados
  FROM public.leads
  WHERE corretor_id = _corretor_id
    AND deleted_at IS NULL
    AND na_lixeira = false
    AND status NOT IN ('contrato_fechado','pos_venda','perdido');

  IF _total = 0 THEN RETURN true; END IF;
  RETURN (_trabalhados::numeric / _total::numeric) >= 0.7;
END;
$function$;