-- Oferta Ativa: sincroniza a régua da campanha com a carteira principal.
--
-- "Avançado" e "Contatado" passam a medir o progresso feito DEPOIS que o lead
-- entrou na lista (semântica delta), mantidos pelo banco via trigger — sem
-- depender do join com `leads` (que a RLS anula para corretores) nem de flag
-- congelada no snapshot:
--   • Avançado  = o status do lead mudou para qualquer etapa fora de
--                 novo/aguardando_atendimento/perdido após entrar na lista.
--   • Contatado = idem, incluindo `perdido` (houve contato) — além da marcação
--                 manual pela aba, que continua valendo.
-- O reset da distribuição (atribuir_oferta_ativa → aguardando_atendimento)
-- não marca nada, pois os status iniciais ficam fora da régua.

-- 1) Trigger: mudança de status na carteira marca as listas do lead.
CREATE OR REPLACE FUNCTION public.sincronizar_oferta_com_lead()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status::text NOT IN ('novo', 'aguardando_atendimento') THEN
    UPDATE public.oferta_ativa_leads
       SET contatado = true,
           contatado_em = COALESCE(contatado_em, now()),
           avancado = CASE WHEN NEW.status::text <> 'perdido' THEN true ELSE avancado END
     WHERE lead_id = NEW.id
       -- só toca linhas onde algo muda (evita churn/realtime à toa)
       AND (NOT contatado OR (NEW.status::text <> 'perdido' AND NOT avancado));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_oferta_com_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_oferta_sync_status ON public.leads;
CREATE TRIGGER trg_oferta_sync_status
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sincronizar_oferta_com_lead();

-- 2) Snapshot de criação começa zerado: a métrica mede a campanha, não o
--    estado herdado do funil (senão listas de reativação nasceriam "100%
--    avançadas"). Corpo idêntico ao de 20260703200000, com avancado = false.
CREATE OR REPLACE FUNCTION public.create_oferta_ativa(_nome text, _descricao text, _filtros jsonb, _corretor uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _oferta_id uuid;
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.ofertas_ativas (nome, descricao, filtros, corretor_id, criado_por)
  VALUES (_nome, NULLIF(_descricao,''), COALESCE(_filtros,'{}'::jsonb), _corretor, _caller)
  RETURNING id INTO _oferta_id;

  INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
  SELECT _oferta_id, l.id, false
  FROM public._oferta_ativa_query(_filtros, _corretor) l
  ON CONFLICT DO NOTHING;

  RETURN _oferta_id;
END;
$$;

-- 3) Backfill: reconstrói o delta das listas existentes a partir do histórico
--    de transições (recupera os avanços feitos desde a criação de cada vínculo).
UPDATE public.oferta_ativa_leads oal
   SET contatado = true,
       contatado_em = COALESCE(oal.contatado_em, sub.primeiro_contato)
  FROM (
    SELECT o.id AS oal_id, min(x.created_at) AS primeiro_contato
      FROM public.oferta_ativa_leads o
      JOIN public.lead_status_transitions x
        ON x.lead_id = o.lead_id
       AND x.created_at >= o.created_at
       AND x.para_status::text NOT IN ('novo', 'aguardando_atendimento')
     WHERE NOT o.contatado
     GROUP BY o.id
  ) sub
 WHERE sub.oal_id = oal.id;

UPDATE public.oferta_ativa_leads oal
   SET avancado = true
 WHERE NOT oal.avancado
   AND EXISTS (
     SELECT 1 FROM public.lead_status_transitions x
      WHERE x.lead_id = oal.lead_id
        AND x.created_at >= oal.created_at
        AND x.para_status::text NOT IN ('novo', 'aguardando_atendimento', 'perdido')
   );

-- 4) Realtime: as tabelas da Oferta Ativa nunca entraram na publicação — as
--    assinaturas das páginas eram no-ops. Com elas publicadas, o trigger acima
--    faz as telas abertas atualizarem sozinhas.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ofertas_ativas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.oferta_ativa_leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
