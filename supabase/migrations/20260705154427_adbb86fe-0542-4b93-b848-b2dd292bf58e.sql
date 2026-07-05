-- Disparo imediato do repasse por SLA (chatbot/webhook) quando o timer chega a 0:00
-- no navegador do corretor. Sem esperar o cron de 1 min.
--
-- Wrapper por-lead: qualquer usuário autenticado pode acionar, mas a função só
-- age se o lead realmente estourou (dc.timeout_minutos vencido, status ainda
-- aguardando_atendimento, tentativas < 3). É idempotente e re-executa a mesma
-- lógica de redistribuir_sla_webhook (mesma roleta de presença, mesmos
-- guarda-corpos).

CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _proximo uuid;
  _tentou uuid[];
BEGIN
  SELECT l.id, l.corretor_id, l.corretores_que_tentaram, l.origem,
         l.status, l.data_distribuicao,
         COALESCE(l.tentativas_redistribuicao, 0) AS tentativas,
         dc.timeout_minutos
    INTO _lead
    FROM public.leads l
    LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
   WHERE l.id = _lead_id
     AND l.deleted_at IS NULL
     AND l.na_lixeira = false
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR _lead.tentativas >= 3
     OR _lead.data_distribuicao > (now() - (_lead.timeout_minutos || ' minutes')::interval)
  THEN
    RETURN false;
  END IF;

  _tentou := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  IF NOT (_lead.corretor_id = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _lead.corretor_id);
  END IF;

  SELECT p.id INTO _proximo
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
   WHERE p.ativo = true
     AND p.telefone IS NOT NULL
     AND btrim(p.telefone) <> ''
     AND lower(coalesce(p.nome, '')) <> 'docs-bot'
     AND p.presente = true
     AND p.presente_em IS NOT NULL
     AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
           = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND NOT (p.id = ANY(_tentou))
   ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF _proximo IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _proximo;

  UPDATE public.leads
     SET corretor_anterior_id = _lead.corretor_id,
         corretor_id = _proximo,
         status = 'aguardando_atendimento',
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         tentativas_redistribuicao = _lead.tentativas + 1,
         corretores_que_tentaram = array_append(_tentou, _proximo)
   WHERE id = _lead.id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
  VALUES (_lead.id, _proximo, 'redistribuicao',
          'SLA webhook estourado (' || _lead.timeout_minutos ||
          ' min) — repasse imediato via timer do corretor (anterior: ' ||
          _lead.corretor_id || ')');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.disparar_repasse_sla_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_repasse_sla_lead(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';