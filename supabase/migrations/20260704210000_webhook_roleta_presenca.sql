-- Roleta do webhook/chatbot: rodízio justo + regra de presença.
--
-- Decisão do gestor: leads que entram pelo webhook público (chatbot, site,
-- integrações — rota /api/public/webhooks/lead/:token, via distribuir_lead_webhook)
-- seguem SOMENTE a roleta justa (menos-recentemente-atendido) e a regra de
-- presença do dia. Nada de trava dos 90% nem de cota diária nesse caminho —
-- essas continuam valendo apenas para as fontes internas (Facebook/Zapier, cron
-- e botão Roleta), que passam por distribuir_lead + corretor_elegivel.
--
-- O que muda: distribuir_lead_webhook() passa a exigir presença marcada no dia
-- ("Cheguei"). Antes distribuía para qualquer corretor ativo com telefone,
-- inclusive quem não tinha marcado presença. Agora, se ninguém estiver presente,
-- a função retorna NULL e o webhook cai no gestor fallback (status
-- 'aguardando_corretor'), exatamente como quando não há corretor disponível.
--
-- Presença: profiles.presente = true AND presente_em no dia atual. A comparação
-- de "hoje" usa America/Sao_Paulo (não o current_date cru em UTC), para bater
-- com o auto-checkout diário (cron às 23:00 BRT), com a consolidação de presença
-- e com o "presente hoje" que o corretor vê no app. Os filtros de identidade
-- (ativo, role='corretor', telefone preenchido, exclui docs-bot) e a ordenação
-- por last_lead_assigned_at seguem iguais: o telefone é necessário para notificar
-- o corretor no WhatsApp.

CREATE OR REPLACE FUNCTION public.distribuir_lead_webhook()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
BEGIN
  SELECT p.id
    INTO _cid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
   WHERE p.ativo = true
     AND p.telefone IS NOT NULL
     AND btrim(p.telefone) <> ''
     AND lower(coalesce(p.nome,'')) <> 'docs-bot'
     -- Regra de presença: só corretor que marcou "Cheguei" hoje entra na roleta.
     AND p.presente = true
     AND p.presente_em IS NOT NULL
     AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
           = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF _cid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _cid;
  RETURN _cid;
END;
$$;

REVOKE ALL ON FUNCTION public.distribuir_lead_webhook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_webhook() TO service_role;
