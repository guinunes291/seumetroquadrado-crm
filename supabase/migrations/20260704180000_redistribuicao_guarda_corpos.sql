-- Guarda-corpos na redistribuição de leads parados + transferência canônica.
--
-- Problema: redistribuir_leads_parados() arrancava TODO lead parado há +24h em
-- aguardando_atendimento (corretor_id=NULL, status='novo'), sem limite por
-- rodada nem por corretor, a cada 5 min — carteiras de 120 leads zeravam de um
-- dia para o outro. Transferências manuais (e a realocação via API) gravavam
-- só corretor_id, sem renovar data_distribuicao, e eram desfeitas pelo job em
-- minutos. Não havia trava de tentativas (pingue-pongue eterno entre corretores).
--
-- O que muda:
-- 1. transferir_leads(): caminho único de transferência (UI em lote, página
--    Leads por Corretor e endpoint de realocação da API). Renova o relógio
--    (data_distribuicao/timestamp_recebimento), zera tentativas (decisão de
--    gestor/agente reinicia o ciclo) e registra em distribution_log.
-- 2. redistribuir_leads_parados(): máx. 3 tentativas por lead (depois ele fica
--    com o corretor e cai na triagem do alerta diário); nunca devolve o lead a
--    quem já o teve (corretores_que_tentaram, mesmo padrão de
--    marcar_lead_perdido); caps de 50 leads/rodada e 10 por corretor/rodada
--    (drena os mais antigos primeiro); e o lead SÓ muda de mão se existir
--    destino elegível — fim do corretor_id=NULL em massa.

-- 1) Transferência canônica de leads (manual/realocação).
CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l record;
  _n int := 0;
  _ativo boolean;
BEGIN
  -- Service role (API/realocação) tem _caller NULL e passa; usuários precisam
  -- ser admin/gestor (mesmo padrão de distribuir_lead).
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatório';
  END IF;

  SELECT p.ativo INTO _ativo FROM public.profiles p WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo';
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads
    WHERE id = ANY(_ids)
    FOR UPDATE
  LOOP
    UPDATE public.leads
       SET corretor_anterior_id = _l.corretor_id,
           corretor_id = _corretor,
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = 0,
           corretores_que_tentaram = CASE
             WHEN _corretor = ANY(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
               THEN _l.corretores_que_tentaram
             ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
           END
     WHERE id = _l.id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_l.id, _corretor, 'manual', 'Transferência manual', _caller);

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid) TO authenticated, service_role;

-- 2) Redistribuição de parados com guarda-corpos.
CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _proximo uuid;
  _max_pos int;
  _tentou uuid[];
  _qtd int := 0;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao, l.corretores_que_tentaram,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             row_number() OVER (
               PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC
             ) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL
        AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND l.data_distribuicao IS NOT NULL
        -- Máx. 3 tentativas: depois o lead fica com o corretor e vai para a
        -- triagem manual (alerta diário de leads parados).
        AND COALESCE(l.tentativas_redistribuicao, 0) < 3
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
    )
    -- Caps: 10 por corretor por rodada e 50 no total, mais antigos primeiro —
    -- nenhuma carteira é zerada de uma só vez.
    SELECT id, corretor_id, data_distribuicao, corretores_que_tentaram, timeout_horas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    _tentou := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
    IF NOT (_lead.corretor_id = ANY(_tentou)) THEN
      _tentou := array_append(_tentou, _lead.corretor_id);
    END IF;

    -- Próximo elegível que ainda NÃO teve o lead (mesmo picker de
    -- marcar_lead_perdido). Sem destino → o lead permanece onde está.
    SELECT fd.corretor_id INTO _proximo
    FROM public.fila_distribuicao fd
    WHERE fd.ativo = true
      AND fd.leads_recebidos_hoje < fd.max_leads_dia
      AND NOT (fd.corretor_id = ANY(_tentou))
      AND public.corretor_elegivel(fd.corretor_id) = true
    ORDER BY fd.posicao ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF _proximo IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _proximo;

    UPDATE public.leads
       SET corretor_anterior_id = _lead.corretor_id,
           corretor_id = _proximo,
           status = 'aguardando_atendimento',
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1,
           corretores_que_tentaram = array_append(_tentou, _proximo)
     WHERE id = _lead.id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
    VALUES (_lead.id, _proximo, 'redistribuicao',
            'Lead parado há +' || _lead.timeout_horas ||
            'h em aguardando_atendimento — redistribuído (corretor anterior: ' ||
            _lead.corretor_id || ')');

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END;
$$;
