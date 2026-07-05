-- Transferência + SLA de 5 minutos do webhook.
--
-- 1) Corrige o erro "Could not find the function public.transferir_leads(...)
--    in the schema cache": recria a função (o banco vivo não recebeu as
--    migrations 20260704180000/220000) e recarrega o cache do PostgREST —
--    mesmo padrão do precedente 20260616130300 (marcar_lead_perdido), que
--    cobre os dois cenários (função ausente OU cache desatualizado).
-- 2) Garante os guarda-corpos v2 da redistribuição no banco vivo.
-- 3) SLA de aceite para leads do webhook/chatbot: lead distribuído que ficar
--    N minutos (default 5) em aguardando_atendimento é repassado ao próximo
--    corretor da MESMA roleta de presença da chegada. Guarda-corpos valem:
--    máx. 3 repasses (depois fica com o último corretor e cai na triagem da
--    gestão), nunca volta para quem já teve, não conta cota diária.
-- 4) Cron da distribuição passa a rodar a cada minuto (latência efetiva do
--    SLA: ~5–6 min).

-- ---------------------------------------------------------------------------
-- 1) transferir_leads — transferência canônica (corpo de 20260704180000).
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
--    Semeia 5 min para as origens que entram pelo webhook público/chatbot.
--    Ajustável por origem via UPDATE em distribuicao_config.
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribuicao_config ADD COLUMN IF NOT EXISTS timeout_minutos integer;

UPDATE public.distribuicao_config
   SET timeout_minutos = 5
 WHERE origem IN ('chatbot', 'whatsapp', 'site', 'agendamento_self_service', 'outro')
   AND timeout_minutos IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Repasse por SLA de minutos: usa a MESMA roleta de presença da chegada
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
    WHERE l.status = 'aguardando_atendimento'
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
-- 5) Processador automático (corpo de 20260702120000) + repasse por SLA.
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
-- 6) Cadência: a cada minuto (upsert por nome, padrão do repo), para o SLA de
--    5 min ter latência efetiva de ~5–6 min.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'distribuicao-auto',
  '* * * * *',
  $$SELECT public.processar_distribuicao_automatica();$$
);

-- Recarrega o schema do PostgREST (resolve o "schema cache" da transferência).
NOTIFY pgrst, 'reload schema';
