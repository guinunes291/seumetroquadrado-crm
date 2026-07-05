-- Oferta Ativa: sincroniza a régua da campanha com a carteira principal.
--
-- "Avançado" e "Contatado" passam a medir o progresso feito DEPOIS que o lead
-- entrou na lista (semântica delta), mantidos pelo banco via trigger — sem
-- depender do join com `leads` (que a RLS anula para corretores) nem de flag
-- congelada no snapshot:
--   • Avançado  = o status do lead mudou para qualquer etapa fora de
--                 novo/aguardando_atendimento/aguardando_corretor/perdido
--                 após entrar na lista.
--   • Contatado = idem, incluindo `perdido` (houve contato) — além da marcação
--                 manual pela aba, que continua valendo.
-- O reset da distribuição (atribuir_oferta_ativa → aguardando_atendimento,
-- roleta → aguardando_corretor) não marca nada: status pré-atendimento ficam
-- fora da régua.

-- 1) Trigger: mudança de status na carteira marca as listas do lead.
CREATE OR REPLACE FUNCTION public.sincronizar_oferta_com_lead()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status::text NOT IN ('novo', 'aguardando_atendimento', 'aguardando_corretor') THEN
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
       AND x.para_status::text NOT IN ('novo', 'aguardando_atendimento', 'aguardando_corretor')
     WHERE NOT o.contatado
     GROUP BY o.id
  ) sub
 WHERE sub.oal_id = oal.id;

-- Zera os trues herdados do snapshot antigo (semântica pré-delta, que gravava
-- "avançado" pelo estado do lead AO ENTRAR na lista); o UPDATE seguinte
-- restaura só os avanços legítimos, feitos após a entrada de cada vínculo.
-- `contatado`/`contatado_em` não são tocados (marcação manual continua valendo).
UPDATE public.oferta_ativa_leads SET avancado = false WHERE avancado;

UPDATE public.oferta_ativa_leads oal
   SET avancado = true
 WHERE NOT oal.avancado
   AND EXISTS (
     SELECT 1 FROM public.lead_status_transitions x
      WHERE x.lead_id = oal.lead_id
        AND x.created_at >= oal.created_at
        AND x.para_status::text NOT IN
            ('novo', 'aguardando_atendimento', 'aguardando_corretor', 'perdido')
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

-- 5) Perda com redistribuição: quando o corretor marca o lead como perdido e a
--    roleta o repassa a outro corretor, o status vai direto para
--    aguardando_atendimento — nunca passa por 'perdido', então o contato real
--    que houve não dispararia o trigger acima. Recria marcar_lead_perdido
--    (corpo idêntico ao de 20260616130300) marcando o contato nos vínculos
--    antes do repasse. Avançado não muda: perda não é avanço.
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(
  _lead_id uuid,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _proximo uuid;
  _max_pos int;
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria, 'Sem motivo informado');
BEGIN
  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

  -- Autorização: dono do lead, ou admin/gestor.
  IF _caller IS NOT NULL
     AND _caller <> COALESCE(_atual, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.has_role(_caller,'admin')
     AND NOT public.has_role(_caller,'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _atual IS NOT NULL AND NOT (_atual = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _atual);
  END IF;

  SELECT fd.corretor_id INTO _proximo
  FROM public.fila_distribuicao fd
  WHERE fd.ativo = true
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND NOT (fd.corretor_id = ANY(_tentou))
    AND public.corretor_elegivel(fd.corretor_id) = true
  ORDER BY fd.posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _proximo IS NOT NULL THEN
    -- Houve contato (o corretor trabalhou e perdeu o lead), mas o repasse pula
    -- o status 'perdido' — marca o contato nas listas de oferta manualmente.
    UPDATE public.oferta_ativa_leads
       SET contatado = true,
           contatado_em = COALESCE(contatado_em, now())
     WHERE lead_id = _lead_id
       AND NOT contatado;

    SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;

    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _proximo;

    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = _proximo,
           status = 'aguardando_atendimento',
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao,0) + 1,
           corretores_que_tentaram = array_append(_tentou, _proximo)
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, _proximo, 'manual', 'Redistribuído após perda: ' || _motivo, _caller);

    RETURN _proximo;
  ELSE
    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = NULL,
           status = 'perdido',
           na_lixeira = true,
           data_movido_lixeira = now(),
           corretores_que_tentaram = _tentou,
           motivo_perdido = _motivo,
           motivo_perda_categoria = _categoria
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller);

    RETURN NULL;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) TO authenticated, service_role;
