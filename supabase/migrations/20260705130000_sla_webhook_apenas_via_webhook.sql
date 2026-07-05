-- SLA de 5 min: restringe o repasse aos leads que CHEGARAM pelo webhook.
--
-- Corrige 20260705100000, que chaveava o SLA só por leads.origem — e origem
-- não é proxy de canal de chegada ('outro' é o default do formulário do
-- gestor, e o picker oferece 'whatsapp'/'site'/'outro' a corretores):
--   1. Lead criado à mão por corretor/gestor nessas origens era roubado pelo
--      robô em ~5 min e entregue a outro corretor.
--   2. Transferência manual (transferir_leads) era desfeita pelo SLA em 5 min,
--      com o corretor escolhido excluído da roleta (corretores_que_tentaram) —
--      e o teto de 3 repasses virava ciclo infinito (transferir zera tentativas).
--   3. atribuir_oferta_ativa seta aguardando_atendimento SEM renovar
--      data_distribuicao: listas de reativação nasciam "estouradas" e eram
--      desmontadas a até 50 leads/min.
--   4. Varredura retroativa: todo o backlog em aguardando_atendimento dessas
--      origens virava candidato no primeiro minuto após o apply.
--   5. O badge de SLA (leads_com_sla → sla_minutos=30) contradizia o repasse
--      real aos 5 min: o corretor via "restam 25m" e perdia o lead sem aviso.
--
-- Correção: coluna leads.via_webhook (default false), gravada apenas pela rota
-- pública do webhook. O SLA de minutos só considera via_webhook = true — o que
-- também imuniza o backlog pré-apply (todo false). Transferência manual e
-- atribuição de lista de oferta zeram a flag (gestão assumiu a triagem).
--
-- Este arquivo SUBSTITUI 20260705100000 por completo (idempotente): pode ser
-- aplicado sobre um banco que já rodou aquela migration ou no lugar dela.

-- ---------------------------------------------------------------------------
-- 0) Canal de chegada do lead. Só a rota pública do webhook grava true.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS via_webhook boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1) transferir_leads — transferência canônica (corpo de 20260704180000) +
--    via_webhook = false: transferência manual é triagem da gestão e encerra o
--    regime de SLA de minutos (sem isso, o robô desfazia a transferência em
--    5 min e o teto de 3 repasses virava ciclo infinito, já que a função zera
--    tentativas_redistribuicao).
-- ---------------------------------------------------------------------------
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
           via_webhook = false,
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

-- ---------------------------------------------------------------------------
-- 2) redistribuir_leads_parados — guarda-corpos v2 (corpo de 20260704220000).
-- ---------------------------------------------------------------------------
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

    -- Bump da roleta SEM incrementar leads_recebidos_hoje: redistribuir um lead
    -- parado não conta como "lead novo do dia" (intenção do Lovable, 20260704194347).
    SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
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

-- ---------------------------------------------------------------------------
-- 3) SLA em minutos por origem (NULL = origem segue só a regra de horas).
--    Semeia 5 min para as origens aceitas pelo webhook público/chatbot — o
--    valor é só o RELÓGIO; a elegibilidade é via_webhook = true.
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribuicao_config ADD COLUMN IF NOT EXISTS timeout_minutos integer;

UPDATE public.distribuicao_config
   SET timeout_minutos = 5
 WHERE origem IN ('chatbot', 'whatsapp', 'site', 'agendamento_self_service', 'outro')
   AND timeout_minutos IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Repasse por SLA de minutos: SÓ leads chegados pelo webhook
--    (via_webhook = true), usando a MESMA roleta de presença da chegada
--    (distribuir_lead_webhook — rodízio justo, presença do dia, sem trava de
--    90% nem cota), respeitando corretores_que_tentaram e o teto de 3 repasses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redistribuir_sla_webhook()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _proximo uuid;
  _tentou uuid[];
  _qtd int := 0;
BEGIN
  FOR _lead IN
    SELECT l.id, l.corretor_id, l.corretores_que_tentaram, dc.timeout_minutos
    FROM public.leads l
    JOIN public.distribuicao_config dc
      ON dc.origem = l.origem
     AND dc.timeout_minutos IS NOT NULL
    WHERE l.via_webhook = true
      AND l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
      AND COALESCE(l.tentativas_redistribuicao, 0) < 3
      AND l.data_distribuicao < now() - (dc.timeout_minutos || ' minutes')::interval
    ORDER BY l.data_distribuicao ASC
    LIMIT 50
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    _tentou := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
    IF NOT (_lead.corretor_id = ANY(_tentou)) THEN
      _tentou := array_append(_tentou, _lead.corretor_id);
    END IF;

    -- Mesmos critérios de distribuir_lead_webhook (20260704210000), excluindo
    -- quem já teve o lead. Sem ninguém presente/elegível → o lead espera SEM
    -- queimar tentativa.
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
      CONTINUE;
    END IF;

    UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _proximo;

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
            'SLA de ' || _lead.timeout_minutos ||
            'min sem atendimento — repassado pela roleta de presença (corretor anterior: ' ||
            _lead.corretor_id || ')');

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.redistribuir_sla_webhook() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) atribuir_oferta_ativa (corpo de 20260704140010) + dois reparos nos
--    UPDATEs de leads (ramo único e divisão):
--      • via_webhook = false — a lista foi atribuída de propósito pela gestão;
--        o lead sai do regime de SLA de minutos (senão leads antigos de chatbot
--        reativados em campanha seriam arrancados do corretor escolhido).
--      • data_distribuicao = now() — sem renovar, leads de reativação mantinham
--        data antiga (semanas) e a régua de horas (redistribuir_leads_parados)
--        desmontava a campanha no dia seguinte; o badge de SLA também passa a
--        contar a partir da atribuição.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuir_oferta_ativa(
  _oferta_id uuid,
  _corretor_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _oferta record;
  _n int;
  _ids uuid[];
  _lead_ids uuid[];
  _total int;
  _base int;
  _resto int;
  _new_id uuid;
  _slice_from int;
  _slice_to int;
  _size int;
  _i int;
  _cid uuid;
  _slice uuid[];
  _created uuid[] := ARRAY[]::uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin ou gestor podem atribuir listas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _oferta FROM public.ofertas_ativas WHERE id = _oferta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::uuid[])
    INTO _ids
  FROM unnest(_corretor_ids) c
  WHERE c IS NOT NULL;

  _n := COALESCE(array_length(_ids, 1), 0);
  IF _n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um corretor' USING ERRCODE = '22023';
  END IF;

  IF _n = 1 THEN
    UPDATE public.ofertas_ativas
       SET corretor_id = _ids[1], updated_at = now()
     WHERE id = _oferta_id;

    UPDATE public.leads l
       SET corretor_id = _ids[1],
           status = 'aguardando_atendimento'::public.lead_status,
           via_webhook = false,
           data_distribuicao = now(),
           updated_at = now()
      FROM public.oferta_ativa_leads oal
     WHERE oal.oferta_id = _oferta_id
       AND l.id = oal.lead_id;

    UPDATE public.oferta_ativa_leads
       SET avancado = false
     WHERE oferta_id = _oferta_id;

    RETURN jsonb_build_object('modo', 'single', 'oferta_id', _oferta_id);
  END IF;

  SELECT COALESCE(array_agg(lead_id ORDER BY random()), ARRAY[]::uuid[])
    INTO _lead_ids
  FROM public.oferta_ativa_leads
  WHERE oferta_id = _oferta_id;

  _total := COALESCE(array_length(_lead_ids, 1), 0);
  IF _total = 0 THEN
    RAISE EXCEPTION 'A lista não tem leads para dividir' USING ERRCODE = '22023';
  END IF;

  _base := _total / _n;
  _resto := _total % _n;
  _slice_from := 1;

  FOR _i IN 1.._n LOOP
    _cid := _ids[_i];
    _size := _base + CASE WHEN _i <= _resto THEN 1 ELSE 0 END;
    IF _size = 0 THEN
      CONTINUE;
    END IF;
    _slice_to := _slice_from + _size - 1;
    _slice := _lead_ids[_slice_from:_slice_to];

    INSERT INTO public.ofertas_ativas (nome, descricao, status, criado_por, corretor_id, filtros)
    VALUES (
      left(_oferta.nome || ' — parte ' || _i::text || '/' || _n::text, 200),
      _oferta.descricao,
      'ativa',
      _uid,
      _cid,
      _oferta.filtros
    )
    RETURNING id INTO _new_id;

    INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
    SELECT _new_id, lid, false
      FROM unnest(_slice) AS lid;

    UPDATE public.leads
       SET corretor_id = _cid,
           status = 'aguardando_atendimento'::public.lead_status,
           via_webhook = false,
           data_distribuicao = now(),
           updated_at = now()
     WHERE id = ANY(_slice);

    _created := _created || _new_id;
    _slice_from := _slice_to + 1;
  END LOOP;

  UPDATE public.ofertas_ativas
     SET status = 'arquivada', updated_at = now()
   WHERE id = _oferta_id;

  RETURN jsonb_build_object(
    'modo', 'split',
    'original_id', _oferta_id,
    'criadas', to_jsonb(_created),
    'total_leads', _total
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) leads_com_sla (corpo de 20260619123000): o badge de SLA (kanban, detalhe
--    do lead, "Meu Dia") passa a exibir o prazo REAL — para lead do webhook o
--    relógio do repasse (timeout_minutos, 5 min), para os demais o sla_minutos
--    de exibição (Facebook 5, demais 30). Sem isso o corretor via "restam 25m"
--    enquanto o robô repassava aos 5.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_com_sla(_corretor uuid DEFAULT NULL)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  status text,
  sla_minutos integer,
  minutos_decorridos integer,
  sla_status text,
  temperatura_calc lead_temperatura
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  SELECT l.id,
         l.nome,
         l.telefone,
         l.status::text,
         sla.efetivo AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN l.status NOT IN ('novo','aguardando_atendimento') THEN 'ok'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > sla.efetivo THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (sla.efetivo * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
           WHEN l.created_at > now() - interval '48 hours' AND l.ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           WHEN l.created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN l.via_webhook AND dc.timeout_minutos IS NOT NULL
        THEN LEAST(dc.timeout_minutos, COALESCE(dc.sla_minutos, 30))
      ELSE COALESCE(dc.sla_minutos, 30)
    END AS efetivo
  ) sla
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND (_scope IS NULL OR l.corretor_id = _scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_com_sla(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Processador automático (corpo de 20260702120000) + repasse por SLA.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _novo uuid;
  _dist int := 0;
  _redist int := 0;
  _sla int := 0;
BEGIN
  FOR _lead_id IN
    SELECT id FROM public.leads
    WHERE corretor_id IS NULL
      AND status IN ('novo', 'aguardando_atendimento')
      AND deleted_at IS NULL
      AND na_lixeira = false
    ORDER BY created_at ASC
    LIMIT 200
  LOOP
    _novo := public.distribuir_lead_elegivel(_lead_id);
    IF _novo IS NOT NULL THEN _dist := _dist + 1;
    ELSE EXIT; -- ninguém elegível/com cota: não adianta continuar o lote
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'redistribuidos', _redist,
    'repassados_sla', _sla,
    'em', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Cadência: a cada minuto (upsert por nome, padrão do repo), para o SLA de
--    5 min ter latência efetiva de ~5–6 min.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'distribuicao-auto',
  '* * * * *',
  $$SELECT public.processar_distribuicao_automatica();$$
);

-- Recarrega o schema do PostgREST: resolve o "schema cache" da transferência e
-- expõe a coluna nova leads.via_webhook para o insert do webhook.
NOTIFY pgrst, 'reload schema';
