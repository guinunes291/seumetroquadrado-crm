-- Papel SDR — parte 3/3: o motor.
--
-- O que vive aqui (toda a regra no Postgres, como manda a política v1):
--  1. Roleta de agendados do SDR com aptidão PRÓPRIA (decisão: ativo,
--     telefone, teto de carteira e agenda livre — sem presença nem cota).
--  2. Entrega: agendar visita (roleta ANTES do agendamento, pulando conflito
--     de agenda) ou entrega manual com motivo. Corretor original de lead
--     reaquecido tem prioridade. Push + WhatsApp (edge) + handoff n8n.
--  3. Espelho: mesmo registro; admin adiciona OU substitui, sempre com motivo.
--  4. Devolução ao SDR: no-show (trigger) ou corretor sem registro por N dias
--     (cron). Espelhos caem, tarefas do corretor cancelam, SDR ganha tarefa.
--  5. Alimentação da base atrás da flag: estoque sem dono, posse expirada e
--     perdidos reciclados rodam rodízio simples entre SDRs ativos.
--  6. Raio-X do SDR (KPIs + metas) e fatia de comissão do SDR na aprovação.
--
-- Nenhuma função existente muda de assinatura. As redefinições
-- (distribuir_estoque_roleta, devolver_leads_posse_expirada,
-- processar_distribuicao_automatica, gerar_comissoes_para_venda,
-- elegibilidade_roleta, pont_after_agendamento) preservam o corpo vigente e
-- só ganham o ramo do SDR — com a flag desligada o caminho é o de sempre.

-- ---------------------------------------------------------------------------
-- 0) Helpers internos
-- ---------------------------------------------------------------------------

-- Transição de status por fluxo de SISTEMA (cron/trigger/devolução), onde não
-- há JWT do ator ou o ator acabou de perder o acesso. Respeita a matriz
-- (p_gestao = true) salvo quando _forcar — uso único: perdido → base do SDR,
-- transição nova de política, registrada como tal no evento.
CREATE OR REPLACE FUNCTION public._sdr_set_status(
  _lead_id uuid,
  _novo public.lead_status,
  _motivo text,
  _proxima_acao text,
  _agente text,
  _forcar boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _l.status = _novo THEN
    RETURN;
  END IF;
  IF NOT _forcar AND NOT public.transicao_lead_permitida(_l.status, _novo, true) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _l.status, _novo
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET status = _novo,
         proxima_acao = COALESCE(NULLIF(btrim(_proxima_acao), ''), proxima_acao),
         motivo_perdido = CASE WHEN _l.status = 'perdido'::public.lead_status THEN NULL ELSE motivo_perdido END,
         motivo_perda_categoria = CASE WHEN _l.status = 'perdido'::public.lead_status THEN NULL ELSE motivo_perda_categoria END,
         ultima_interacao = now()
   WHERE id = _lead_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'transicao_lead',
    'Lead movido de ' || _l.status::text || ' para ' || _novo::text || '.',
    _agente,
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _l.status, 'para_status', _novo,
      'motivo', NULLIF(btrim(_motivo), ''),
      'proxima_acao', NULLIF(btrim(_proxima_acao), ''),
      'forcado', CASE WHEN _forcar THEN true ELSE NULL END,
      'alterado_por', auth.uid()
    ))
  );
END; $$;

REVOKE ALL ON FUNCTION public._sdr_set_status(uuid, public.lead_status, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

-- Conflito de agenda: visita/compromisso ativo do corretor sobrepondo o slot.
CREATE OR REPLACE FUNCTION public._sdr_agenda_conflita(
  _corretor_id uuid, _inicio timestamptz, _fim timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _inicio IS NOT NULL AND _fim IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.corretor_id = _corretor_id
      AND a.deleted_at IS NULL
      AND a.status IN ('agendado','confirmado','remarcado')
      AND a.data_inicio < _fim
      AND a.data_fim > _inicio
  );
$$;

REVOKE ALL ON FUNCTION public._sdr_agenda_conflita(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sdr_agenda_conflita(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- Rodízio simples entre SDRs ativos (há mais tempo sem receber primeiro).
-- Efeito colateral deliberado: avança o cursor do SDR escolhido.
CREATE OR REPLACE FUNCTION public._proximo_sdr()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _id uuid;
BEGIN
  SELECT p.id INTO _id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'sdr'::public.app_role
  WHERE p.ativo AND p.status_conta = 'ativa'::public.status_conta
  ORDER BY p.last_lead_assigned_at ASC NULLS FIRST, p.id ASC
  LIMIT 1
  FOR UPDATE OF p SKIP LOCKED;

  IF _id IS NOT NULL THEN
    UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _id;
  END IF;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public._proximo_sdr() FROM PUBLIC, anon, authenticated;

-- Log de entrada na base do SDR (estoque, posse, perdidos): distribution_log
-- + contexto + evento — mesma trilha auditável das demais decisões.
CREATE OR REPLACE FUNCTION public._sdr_log_base(
  _lead_id uuid, _sdr_id uuid, _motivo text, _regra text, _gatilho text, _extra jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _log_id uuid;
BEGIN
  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, NULL, 'inicial'::public.distribuicao_tipo, _motivo, NULL, _regra, 'sucesso', auth.uid())
  RETURNING id INTO _log_id;

  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, jsonb_build_object('modelo', 'sdr', 'gatilho', _gatilho, 'sdr_id', _sdr_id) || COALESCE(_extra, '{}'::jsonb));

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'sdr_base_entrada', _motivo, 'sdr_motor',
          jsonb_build_object('sdr_id', _sdr_id, 'regra', _regra, 'gatilho', _gatilho));
END; $$;

REVOKE ALL ON FUNCTION public._sdr_log_base(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Aptidão da roleta de agendados (mesma forma da _elegibilidade_roleta,
--    para a Central exibir a fila como as demais)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._elegibilidade_roleta_sdr(
  _slug text, _inicio timestamptz DEFAULT NULL, _fim timestamptz DEFAULT NULL
)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT COALESCE((public.get_dist_setting('disjuntor_wip') #>> '{}')::int, 30) AS disjuntor,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt
  ),
  r AS (SELECT * FROM public.roletas WHERE slug = _slug),
  base AS (
    SELECT rp.corretor_id,
           p.nome,
           rp.ativo AS participante_ativo,
           (rp.pausado_ate IS NOT NULL AND rp.pausado_ate > now()) AS pausado,
           rp.motivo_pausa,
           rp.ultimo_lead_em,
           rp.incluido_por,
           rp.incluido_em,
           (p.ativo AND p.status_conta = 'ativa'::public.status_conta) AS perfil_ativo,
           (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
           (p.presente AND p.presente_em IS NOT NULL
             AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje_brt) AS presente_hoje,
           EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role) AS eh_corretor,
           public._wip_corretor(rp.corretor_id) AS wip,
           public._sdr_agenda_conflita(rp.corretor_id, _inicio, _fim) AS conflito,
           cfg.disjuntor,
           cfg.hoje_brt
    FROM public.roleta_participantes rp
    JOIN r ON r.id = rp.roleta_id
    JOIN public.profiles p ON p.id = rp.corretor_id
    CROSS JOIN cfg
    WHERE lower(coalesce(p.nome, '')) <> 'docs-bot'
  ),
  recebidos AS (
    SELECT b.corretor_id,
           (count(dl.id) FILTER (
              WHERE (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = b.hoje_brt))::int AS hoje_n,
           count(dl.id)::int AS mes_n
    FROM base b
    LEFT JOIN public.distribution_log dl
      ON dl.corretor_id = b.corretor_id
     AND dl.resultado = 'sucesso'
     AND dl.roleta_slug = _slug
     AND dl.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY b.corretor_id
  )
  SELECT
    b.corretor_id,
    b.nome,
    ( b.participante_ativo
      AND NOT b.pausado
      AND b.perfil_ativo
      AND b.eh_corretor
      AND b.tem_telefone
      AND b.wip < b.disjuntor
      AND NOT b.conflito
    ) AS apto,
    array_remove(ARRAY[
      CASE WHEN NOT b.participante_ativo THEN 'participacao_inativa' END,
      CASE WHEN b.pausado THEN 'pausado' END,
      CASE WHEN NOT b.perfil_ativo THEN 'perfil_inativo' END,
      CASE WHEN NOT b.eh_corretor THEN 'sem_role_corretor' END,
      CASE WHEN NOT b.tem_telefone THEN 'sem_telefone' END,
      CASE WHEN b.wip >= b.disjuntor THEN 'disjuntor_wip_' || b.wip END,
      CASE WHEN b.conflito THEN 'conflito_agenda' END
    ], NULL) AS motivos,
    100::numeric AS pct_trabalhado,
    b.wip AS carteira_total,
    0 AS aguardando,
    rec.hoje_n AS recebidos_hoje,
    rec.mes_n AS recebidos_mes,
    NULL::integer AS limite_diario,
    b.presente_hoje AS presente,
    b.pausado,
    b.motivo_pausa,
    b.participante_ativo,
    b.ultimo_lead_em,
    b.incluido_por,
    b.incluido_em
  FROM base b
  JOIN recebidos rec ON rec.corretor_id = b.corretor_id;
$$;

REVOKE ALL ON FUNCTION public._elegibilidade_roleta_sdr(text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._elegibilidade_roleta_sdr(text, timestamptz, timestamptz) TO service_role;

-- Wrapper com gate (mesma assinatura da 20260709120200): roleta tipo 'sdr'
-- usa a régua própria; as demais seguem a fonte única v3.
CREATE OR REPLACE FUNCTION public.elegibilidade_roleta(_slug text)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _gestao boolean;
  _tipo text;
BEGIN
  _gestao := _caller IS NULL
    OR public.has_role(_caller, 'admin')
    OR public.has_role(_caller, 'gestor')
    OR public.has_role(_caller, 'superintendente');

  SELECT r.tipo INTO _tipo FROM public.roletas r WHERE r.slug = _slug;

  IF _tipo = 'sdr' THEN
    RETURN QUERY
    SELECT e.*
    FROM public._elegibilidade_roleta_sdr(_slug) e
    WHERE _gestao OR e.corretor_id = _caller;
  ELSE
    RETURN QUERY
    SELECT e.*
    FROM public._elegibilidade_roleta(_slug) e
    WHERE _gestao OR e.corretor_id = _caller;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.elegibilidade_roleta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elegibilidade_roleta(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) O motor de entrega
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_sdr(
  _lead_id uuid,
  _motivo text,
  _inicio timestamptz DEFAULT NULL,
  _fim timestamptz DEFAULT NULL,
  _gatilho text DEFAULT 'sdr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _slug text := 'agendados-sdr';
  _roleta public.roletas%ROWTYPE;
  _vencedor uuid;
  _vencedor_nome text;
  _regra text;
  _tipo public.distribuicao_tipo := 'automatica'::public.distribuicao_tipo;
  _aptos jsonb;
  _inaptos jsonb;
  _aptos_ids uuid[];
  _n_ativos int := 0;
  _log_id uuid;
  _ctx jsonb;
  _sdr_nome text;
  _prioridade_recusa text;
  _motivo_excecao text;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  END IF;
  IF _lead.sdr_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_sdr');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _lead.sdr_id;
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _slug;

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  IF _lead.corretor_id IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _lead.corretor_id AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF public._sdr_agenda_conflita(_lead.corretor_id, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _lead.corretor_id;
      _regra := 'sdr_prioridade_corretor_original';
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  IF _vencedor IS NULL THEN
    IF _roleta.id IS NULL OR NOT _roleta.ativo THEN
      _motivo_excecao := 'sem_corretor_ativo';
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('roleta_sdr:' || _slug));

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome)) FILTER (WHERE e.apto), '[]'::jsonb),
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome, 'motivos', e.motivos)) FILTER (WHERE NOT e.apto), '[]'::jsonb),
        array_agg(e.corretor_id) FILTER (WHERE e.apto),
        count(*)::int
      INTO _aptos, _inaptos, _aptos_ids, _n_ativos
      FROM public._elegibilidade_roleta_sdr(_slug, _inicio, _fim) e;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      SELECT rp.corretor_id INTO _vencedor
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _roleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
    END IF;
  END IF;

  _ctx := jsonb_strip_nulls(jsonb_build_object(
    'modelo', 'sdr',
    'gatilho', _gatilho,
    'sdr_id', _lead.sdr_id,
    'sdr_nome', _sdr_nome,
    'regra', _regra,
    'aptos', COALESCE(_aptos, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos, '[]'::jsonb),
    'prioridade_recusa', _prioridade_recusa,
    'inicio', _inicio,
    'fim', _fim
  ));

  IF _vencedor IS NULL THEN
    PERFORM public._registrar_excecao_distribuicao(
      _lead_id, _motivo_excecao,
      'Roleta de agendados do SDR sem corretor apto (' || COALESCE(_motivo, _gatilho) || ')',
      _slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
    VALUES
      (_lead_id, NULL, 'automatica'::public.distribuicao_tipo, _motivo, _slug, 'roleta_sdr', 'sem_corretor', _uid)
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', _motivo_excecao,
                              'aptos', COALESCE(_aptos, '[]'::jsonb),
                              'inaptos', COALESCE(_inaptos, '[]'::jsonb));
  END IF;

  SELECT p.nome INTO _vencedor_nome FROM public.profiles p WHERE p.id = _vencedor;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = CASE WHEN corretor_id IS DISTINCT FROM _vencedor THEN corretor_id ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         sdr_entregue_em = now(),
         sdr_devolvido_em = NULL,
         roleta_slug = CASE WHEN _regra = 'roleta_sdr' THEN _slug ELSE roleta_slug END,
         via_webhook = false,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor)
         END
   WHERE id = _lead_id;

  IF _regra = 'roleta_sdr' THEN
    UPDATE public.roleta_participantes
       SET ultimo_lead_em = now(), updated_at = now()
     WHERE roleta_id = _roleta.id AND corretor_id = _vencedor;
  END IF;
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _vencedor, _tipo, _motivo, _slug, _regra, 'sucesso', _uid)
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object('vencedor', _vencedor, 'vencedor_nome', _vencedor_nome));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(), resolvida_por = _uid,
         resolucao = 'Entregue pelo SDR a ' || COALESCE(_vencedor_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente', 'em_analise');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_entrega',
    'Entregue pelo SDR ' || COALESCE(_sdr_nome, '') || ' ao corretor ' || COALESCE(_vencedor_nome, '') || ' (' || COALESCE(_motivo, _gatilho) || ').',
    'sdr_motor',
    jsonb_build_object('sdr_id', _lead.sdr_id, 'corretor_id', _vencedor, 'regra', _regra,
                       'motivo', _motivo, 'gatilho', _gatilho)
  );

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
    'Lead entregue pelo SDR',
    'SDR ' || COALESCE(_sdr_nome, '') || ' → corretor ' || COALESCE(_vencedor_nome, '') || ': ' || COALESCE(_motivo, _gatilho),
    jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_entrega', 'regra', _regra,
                       'sdr_id', _lead.sdr_id, 'corretor_id', _vencedor)
  );

  -- Push: o trigger de leads só dispara quando corretor_id MUDA; no caminho de
  -- prioridade (mesmo dono) avisamos explicitamente.
  IF _lead.corretor_id IS NOT DISTINCT FROM _vencedor THEN
    PERFORM public.enqueue_push(
      _vencedor, 'Lead do SDR para você',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_motivo, _gatilho),
      '/leads/' || _lead_id::text, 'sdr-' || _lead_id::text);
  END IF;

  PERFORM public._notificar_handoff_novo_dono(_lead_id, _vencedor, 'SDR: ' || COALESCE(_motivo, _gatilho));

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _vencedor, 'corretor_nome', _vencedor_nome,
    'regra', _regra, 'roleta', _slug);
END; $$;

REVOKE ALL ON FUNCTION public._distribuir_lead_sdr(uuid, text, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_sdr(uuid, text, timestamptz, timestamptz, text) TO service_role;

-- Gate comum das ações do SDR sobre um lead: flag ligada, conta ativa, e o
-- ator é o SDR dono do lead (ou admin).
CREATE OR REPLACE FUNCTION public._sdr_gate_lead(_uid uuid, _lead public.leads)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public._sdr_ativo() THEN
    RAISE EXCEPTION 'modelo SDR desligado (distribuicao_settings.sdr_ativo)' USING ERRCODE = '42501';
  END IF;
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _lead.sdr_id IS NULL THEN
    RAISE EXCEPTION 'lead não está na base de nenhum SDR' USING ERRCODE = '22023';
  END IF;
  IF _lead.sdr_id <> _uid AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'lead fora da sua base' USING ERRCODE = '42501';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public._sdr_gate_lead(uuid, public.leads) FROM PUBLIC, anon, authenticated;

-- 2a) Agendar visita: roleta ANTES do agendamento (decisão), pulando conflito
--     de agenda; o agendamento já nasce no nome do corretor vencedor; o SDR
--     ganha as tarefas de confirmação D-1 e D-0 (decisão: SDR confirma,
--     corretor atende da visita em diante).
CREATE OR REPLACE FUNCTION public.agendar_visita_sdr(
  _lead_id uuid,
  _data_inicio timestamptz,
  _data_fim timestamptz DEFAULT NULL,
  _titulo text DEFAULT NULL,
  _local text DEFAULT NULL,
  _descricao text DEFAULT NULL,
  _proxima_acao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _fim timestamptz := COALESCE(_data_fim, _data_inicio + interval '1 hour');
  _res jsonb;
  _corretor uuid;
  _ag_id uuid;
  _titulo_final text;
  _d1 timestamptz;
  _d0 timestamptz;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._sdr_gate_lead(_uid, _lead);

  IF _data_inicio IS NULL OR _data_inicio <= now() THEN
    RAISE EXCEPTION 'a visita precisa estar no futuro' USING ERRCODE = '22023';
  END IF;
  IF _fim <= _data_inicio THEN
    RAISE EXCEPTION 'fim da visita precisa ser depois do início' USING ERRCODE = '22023';
  END IF;
  IF _lead.status IN ('perdido'::public.lead_status, 'contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status) THEN
    RAISE EXCEPTION 'lead encerrado não pode ser agendado pelo SDR' USING ERRCODE = '22023';
  END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN
    RAISE EXCEPTION 'lead já entregue ao corretor — a remarcação é feita pela agenda' USING ERRCODE = '22023';
  END IF;

  _res := public._distribuir_lead_sdr(_lead_id, 'Visita agendada pelo SDR', _data_inicio, _fim, 'agendamento_sdr');
  IF NOT COALESCE((_res ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'nenhum corretor apto para receber a visita (%). A gestão foi avisada.', _res ->> 'motivo'
      USING ERRCODE = '22023';
  END IF;
  _corretor := (_res ->> 'corretor_id')::uuid;

  _titulo_final := COALESCE(NULLIF(btrim(_titulo), ''), 'Visita - ' || _lead.nome);

  INSERT INTO public.agendamentos
    (lead_id, corretor_id, titulo, descricao, tipo, status, data_inicio, data_fim, local, criado_por_id)
  VALUES
    (_lead_id, _corretor, _titulo_final,
     COALESCE(NULLIF(btrim(_descricao), ''), 'Agendada pelo SDR'),
     'visita'::public.agendamento_tipo, 'agendado'::public.agendamento_status,
     _data_inicio, _fim, NULLIF(btrim(_local), ''), _uid)
  RETURNING id INTO _ag_id;

  -- Etapa: caixa de entrada não vai direto a agendado na matriz — passa por
  -- em_atendimento (o contato aconteceu, afinal).
  IF _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status) THEN
    PERFORM public.transicionar_lead(_lead_id, 'em_atendimento'::public.lead_status,
      'Contato feito pelo SDR', 'Confirmar a visita com o cliente');
  END IF;
  PERFORM public.transicionar_lead(_lead_id, 'agendado'::public.lead_status,
    'Visita agendada pelo SDR',
    COALESCE(NULLIF(btrim(_proxima_acao), ''), 'Confirmar a visita com o cliente (D-1 e no dia)'));

  -- Tarefas de confirmação ficam com o SDR.
  _d1 := GREATEST(_data_inicio - interval '1 day', now() + interval '1 hour');
  _d0 := GREATEST(_data_inicio - interval '3 hours', now() + interval '30 minutes');
  IF _d1 < _data_inicio THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_uid, _lead_id, 'Confirmar visita de ' || _lead.nome || ' (D-1)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d1, true, _uid);
  END IF;
  IF _d0 < _data_inicio AND _d0 > _d1 THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_uid, _lead_id, 'Confirmar visita de ' || _lead.nome || ' hoje (D-0)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
       _d0, true, _uid);
  END IF;

  RETURN _res || jsonb_build_object('agendamento_id', _ag_id, 'data_inicio', _data_inicio, 'data_fim', _fim);
END; $$;

REVOKE ALL ON FUNCTION public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_visita_sdr(uuid, timestamptz, timestamptz, text, text, text, text)
  TO authenticated, service_role;

-- 2b) Entrega manual com motivo (lead qualificado / com documento sem visita).
--     O lead chega ao corretor em "Qualificação Corretor" — a base do Modo
--     Foco em que ele confirma perfil antes de assumir.
CREATE OR REPLACE FUNCTION public.entregar_lead_sdr(_lead_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _res jsonb;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._sdr_gate_lead(_uid, _lead);

  IF char_length(COALESCE(btrim(_motivo), '')) < 5 THEN
    RAISE EXCEPTION 'motivo da entrega é obrigatório (mínimo 5 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF _lead.sdr_entregue_em IS NOT NULL THEN
    RAISE EXCEPTION 'lead já entregue ao corretor' USING ERRCODE = '22023';
  END IF;
  IF _lead.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status, 'perdido'::public.lead_status,
                      'contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status) THEN
    RAISE EXCEPTION 'entregue só depois do primeiro contato (lead em %)', _lead.status USING ERRCODE = '22023';
  END IF;

  _res := public._distribuir_lead_sdr(_lead_id, 'Entrega manual do SDR: ' || btrim(_motivo), NULL, NULL, 'entrega_manual_sdr');
  IF NOT COALESCE((_res ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'nenhum corretor apto para receber o lead (%). A gestão foi avisada.', _res ->> 'motivo'
      USING ERRCODE = '22023';
  END IF;

  IF _lead.status NOT IN ('agendado'::public.lead_status, 'visita_realizada'::public.lead_status,
                          'analise_credito'::public.lead_status, 'proposta_enviada'::public.lead_status)
     AND public.transicao_lead_permitida(_lead.status, 'qualificacao_corretor'::public.lead_status, false) THEN
    PERFORM public.transicionar_lead(_lead_id, 'qualificacao_corretor'::public.lead_status,
      'Entrega manual do SDR: ' || btrim(_motivo),
      'Assumir o atendimento do lead entregue pelo SDR');
  END IF;

  RETURN _res;
END; $$;

REVOKE ALL ON FUNCTION public.entregar_lead_sdr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_lead_sdr(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Reaquecer: lista e "pegar" (o corretor mantém a posse)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_leads_reaquecer(_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  nome text,
  telefone text,
  status public.lead_status,
  temperatura public.lead_temperatura,
  corretor_id uuid,
  corretor_nome text,
  projeto_nome text,
  zona text,
  ultima_atividade_em timestamptz,
  dias_parado int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _dias int := public._sdr_setting_int('sdr_reaquecer_dias', 7);
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid)
     OR NOT (public.has_role(_uid, 'sdr'::public.app_role) OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public._sdr_ativo() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.nome, l.telefone, l.status, l.temperatura, l.corretor_id, p.nome,
         l.projeto_nome, public.zona_do_lead(l.id), l.ultima_atividade_em,
         GREATEST(0, EXTRACT(day FROM (now() - l.ultima_atividade_em))::int)
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.corretor_id
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.sdr_id IS NULL
    AND l.corretor_id IS NOT NULL
    AND l.status IN (
      'aguardando_atendimento','aguardando_retorno','qualificacao_corretor',
      'em_atendimento','qualificado','agendado','visita_realizada'
    )
    AND l.ultima_atividade_em < now() - make_interval(days => _dias)
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.lead_id = l.id AND a.deleted_at IS NULL
        AND a.status IN ('agendado','confirmado','remarcado') AND a.data_inicio > now()
    )
  ORDER BY l.ultima_atividade_em ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
END; $$;

REVOKE ALL ON FUNCTION public.sdr_leads_reaquecer(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_leads_reaquecer(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sdr_pegar_lead(_lead_id uuid)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _sdr_nome text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT public.has_role(_uid, 'sdr'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public._sdr_ativo() THEN
    RAISE EXCEPTION 'modelo SDR desligado (distribuicao_settings.sdr_ativo)' USING ERRCODE = '42501';
  END IF;
  IF NOT public.lead_reaquecivel_sdr(_lead_id) THEN
    RAISE EXCEPTION 'lead não está disponível para reaquecimento' USING ERRCODE = '22023';
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _uid;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET sdr_id = _uid,
         sdr_entregue_em = NULL,
         sdr_devolvido_em = NULL,
         sdr_interesse_confirmado = false
   WHERE id = _lead_id AND sdr_id IS NULL
  RETURNING * INTO _lead;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outro SDR pegou este lead antes' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'sdr_reaquecer',
          'SDR ' || COALESCE(_sdr_nome, '') || ' assumiu o reaquecimento (corretor mantém a posse).',
          'sdr_motor', jsonb_build_object('sdr_id', _uid, 'corretor_id', _lead.corretor_id));

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'SDR reaquecendo o lead',
          'SDR ' || COALESCE(_sdr_nome, '') || ' pegou o lead parado para reaquecer. O corretor continua dono e tem prioridade na visita.',
          jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_reaquecer', 'sdr_id', _uid));

  IF _lead.corretor_id IS NOT NULL THEN
    PERFORM public.enqueue_push(
      _lead.corretor_id, 'SDR reaquecendo seu lead',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_sdr_nome, 'SDR') || ' está reaquecendo',
      '/leads/' || _lead_id::text, 'sdr-reaq-' || _lead_id::text);
  END IF;

  RETURN _lead;
END; $$;

REVOKE ALL ON FUNCTION public.sdr_pegar_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_pegar_lead(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Espelho pelo admin: adicionar ou substituir, sempre com motivo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alocar_espelho_lead(
  _lead_id uuid, _corretor_id uuid, _modo text, _motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _nome text;
  _anterior uuid;
  _anterior_nome text;
  _log_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'só o admin aloca espelhos' USING ERRCODE = '42501';
  END IF;
  IF _modo NOT IN ('adicionar', 'substituir') THEN
    RAISE EXCEPTION 'modo inválido (adicionar | substituir)' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(btrim(_motivo), '')) < 5 THEN
    RAISE EXCEPTION 'motivo é obrigatório (mínimo 5 caracteres)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.nome INTO _nome
  FROM public.profiles p
  WHERE p.id = _corretor_id AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role);
  IF _nome IS NULL THEN
    RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor' USING ERRCODE = '22023';
  END IF;

  IF _modo = 'adicionar' THEN
    IF _lead.corretor_id = _corretor_id THEN
      RAISE EXCEPTION 'este corretor já é o dono do lead' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_acessos a WHERE a.lead_id = _lead_id AND a.user_id = _corretor_id AND a.ativo) THEN
      RETURN jsonb_build_object('ok', true, 'ja_existia', true, 'corretor_id', _corretor_id);
    END IF;
    INSERT INTO public.lead_acessos (lead_id, user_id, papel, motivo, concedido_por)
    VALUES (_lead_id, _corretor_id, 'corretor_espelho', btrim(_motivo), _uid);

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
    VALUES
      (_lead_id, _corretor_id, 'manual'::public.distribuicao_tipo, btrim(_motivo), NULL, 'espelho_adicionado', 'sucesso', _uid)
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_build_object('modelo', 'sdr', 'acao', 'espelho_adicionado',
                                        'dono_atual', _lead.corretor_id, 'sdr_id', _lead.sdr_id));

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'espelho_adicionado',
            'Espelho adicionado: ' || _nome || ' (' || btrim(_motivo) || ').', 'admin',
            jsonb_build_object('corretor_id', _corretor_id, 'por', _uid, 'motivo', btrim(_motivo)));
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (_lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
            'Espelho adicionado', _nome || ' passa a acompanhar o lead: ' || btrim(_motivo),
            jsonb_build_object('fonte', 'sistema', 'evento', 'espelho_adicionado', 'corretor_id', _corretor_id));

    PERFORM public.enqueue_push(_corretor_id, 'Você entrou no espelho de um lead',
      COALESCE(_lead.nome, 'Lead') || ' · ' || btrim(_motivo),
      '/leads/' || _lead_id::text, 'espelho-' || _lead_id::text);
    PERFORM public._notificar_handoff_novo_dono(_lead_id, _corretor_id, 'espelho adicionado: ' || btrim(_motivo));

    RETURN jsonb_build_object('ok', true, 'modo', 'adicionar', 'corretor_id', _corretor_id, 'corretor_nome', _nome);
  END IF;

  -- substituir: troca o dono comercial; o anterior perde o acesso, itens
  -- abertos migram (mesma disciplina de transferir_leads).
  _anterior := _lead.corretor_id;
  IF _anterior = _corretor_id THEN
    RAISE EXCEPTION 'este corretor já é o dono do lead' USING ERRCODE = '22023';
  END IF;
  SELECT p.nome INTO _anterior_nome FROM public.profiles p WHERE p.id = _anterior;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = COALESCE(_anterior, corretor_anterior_id),
         corretor_id = _corretor_id,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         tentativas_redistribuicao = 0,
         via_webhook = false,
         sdr_entregue_em = CASE WHEN sdr_id IS NOT NULL THEN COALESCE(sdr_entregue_em, now()) ELSE sdr_entregue_em END,
         corretores_que_tentaram = CASE
           WHEN _corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _corretor_id)
         END
   WHERE id = _lead_id;

  -- Quem virou dono não precisa de espelho extra.
  UPDATE public.lead_acessos
     SET ativo = false, removido_em = now(), removido_por = _uid, motivo_remocao = 'Virou dono do lead'
   WHERE lead_id = _lead_id AND user_id = _corretor_id AND ativo;

  IF _anterior IS NOT NULL THEN
    UPDATE public.agendamentos
       SET corretor_id = _corretor_id, updated_at = now()
     WHERE lead_id = _lead_id AND corretor_id = _anterior
       AND status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status, 'remarcado'::public.agendamento_status);
    UPDATE public.tarefas
       SET corretor_id = _corretor_id, updated_at = now()
     WHERE lead_id = _lead_id AND corretor_id = _anterior
       AND status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status);
  END IF;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _corretor_id, 'manual'::public.distribuicao_tipo, btrim(_motivo), NULL, 'espelho_substituido', 'sucesso', _uid)
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, jsonb_build_object('modelo', 'sdr', 'acao', 'espelho_substituido',
                                      'anterior', _anterior, 'sdr_id', _lead.sdr_id));

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'espelho_substituido',
          'Dono substituído: ' || COALESCE(_anterior_nome, '(sem dono)') || ' → ' || _nome || ' (' || btrim(_motivo) || ').',
          'admin', jsonb_build_object('anterior', _anterior, 'novo', _corretor_id, 'por', _uid, 'motivo', btrim(_motivo)));
  PERFORM public._auditar_redistribuicao(_lead_id, _anterior, _corretor_id, 'Espelho substituído pelo admin: ' || btrim(_motivo));
  PERFORM public._notificar_handoff_novo_dono(_lead_id, _corretor_id, 'espelho substituído: ' || btrim(_motivo));

  RETURN jsonb_build_object('ok', true, 'modo', 'substituir', 'corretor_id', _corretor_id,
                            'corretor_nome', _nome, 'anterior', _anterior);
END; $$;

REVOKE ALL ON FUNCTION public.alocar_espelho_lead(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alocar_espelho_lead(uuid, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remover_espelho_lead(_lead_id uuid, _corretor_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead public.leads%ROWTYPE;
  _nome text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'só o admin remove espelhos' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(btrim(_motivo), '')) < 5 THEN
    RAISE EXCEPTION 'motivo é obrigatório (mínimo 5 caracteres)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.lead_acessos
     SET ativo = false, removido_em = now(), removido_por = _uid, motivo_remocao = btrim(_motivo)
   WHERE lead_id = _lead_id AND user_id = _corretor_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ja_removido', true);
  END IF;

  SELECT p.nome INTO _nome FROM public.profiles p WHERE p.id = _corretor_id;

  -- Tarefas abertas do espelho voltam ao dono (ou cancelam se não há dono).
  IF _lead.corretor_id IS NOT NULL THEN
    UPDATE public.tarefas SET corretor_id = _lead.corretor_id, updated_at = now()
     WHERE lead_id = _lead_id AND corretor_id = _corretor_id
       AND status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status);
  ELSE
    UPDATE public.tarefas SET status = 'cancelada'::public.tarefa_status, updated_at = now()
     WHERE lead_id = _lead_id AND corretor_id = _corretor_id
       AND status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status);
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'espelho_removido',
          'Espelho removido: ' || COALESCE(_nome, '') || ' (' || btrim(_motivo) || ').', 'admin',
          jsonb_build_object('corretor_id', _corretor_id, 'por', _uid, 'motivo', btrim(_motivo)));
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'Espelho removido', COALESCE(_nome, '') || ' deixa de acompanhar o lead: ' || btrim(_motivo),
          jsonb_build_object('fonte', 'sistema', 'evento', 'espelho_removido', 'corretor_id', _corretor_id));

  RETURN jsonb_build_object('ok', true, 'corretor_id', _corretor_id);
END; $$;

REVOKE ALL ON FUNCTION public.remover_espelho_lead(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_espelho_lead(uuid, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Devolução ao SDR (no-show e corretor parado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._devolver_lead_ao_sdr(_lead_id uuid, _motivo text, _gatilho text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
  _corretor uuid;
  _corretor_nome text;
  _log_id uuid;
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _l.sdr_id IS NULL OR _l.corretor_id IS NULL OR _l.sdr_entregue_em IS NULL THEN
    RETURN false;
  END IF;
  _corretor := _l.corretor_id;
  SELECT p.nome INTO _corretor_nome FROM public.profiles p WHERE p.id = _corretor;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = corretor_id,
         corretor_id = NULL,
         sdr_entregue_em = NULL,
         sdr_devolvido_em = now(),
         tentativas_redistribuicao = 0,
         via_webhook = false,
         corretores_que_tentaram = CASE
           WHEN _corretor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
         END
   WHERE id = _lead_id;

  IF _l.status IN ('agendado'::public.lead_status, 'visita_realizada'::public.lead_status,
                   'qualificacao_corretor'::public.lead_status, 'aguardando_retorno'::public.lead_status) THEN
    PERFORM public._sdr_set_status(_lead_id, 'em_atendimento'::public.lead_status,
      _motivo, 'Reaquecer o cliente e reagendar a visita', 'sdr_devolucao', false);
  END IF;

  -- Itens do corretor: tarefas abertas cancelam; visitas passadas sem
  -- validação cancelam (a agenda do corretor não fica com fantasma).
  UPDATE public.tarefas SET status = 'cancelada'::public.tarefa_status, updated_at = now()
   WHERE lead_id = _lead_id AND corretor_id = _corretor
     AND status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status);
  UPDATE public.agendamentos
     SET status = 'cancelado'::public.agendamento_status,
         motivo_cancelamento = 'Devolvido ao SDR: ' || _motivo, updated_at = now()
   WHERE lead_id = _lead_id AND corretor_id = _corretor AND deleted_at IS NULL
     AND status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status, 'remarcado'::public.agendamento_status)
     AND data_inicio <= now();

  UPDATE public.lead_acessos
     SET ativo = false, removido_em = now(), motivo_remocao = 'Devolvido ao SDR: ' || _motivo
   WHERE lead_id = _lead_id AND ativo;

  INSERT INTO public.tarefas
    (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica)
  VALUES
    (_l.sdr_id, _lead_id, 'Reaquecer ' || COALESCE(_l.nome, 'lead') || ' (devolvido: ' || _gatilho || ')',
     'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade, 'pendente'::public.tarefa_status,
     now() + interval '1 day', true);

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, NULL, 'redistribuicao'::public.distribuicao_tipo, _motivo, 'agendados-sdr',
     'sdr_devolucao:' || _gatilho, 'sucesso', auth.uid())
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, jsonb_build_object('modelo', 'sdr', 'gatilho', _gatilho, 'sdr_id', _l.sdr_id,
                                      'corretor_anterior', _corretor, 'status_no_momento', _l.status));

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'sdr_devolucao',
          'Devolvido ao SDR (' || _gatilho || '): ' || _motivo || '. Corretor anterior: ' || COALESCE(_corretor_nome, '') || '.',
          'sdr_motor', jsonb_build_object('sdr_id', _l.sdr_id, 'corretor_anterior', _corretor, 'gatilho', _gatilho));
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, auth.uid(), 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'Lead devolvido ao SDR', _motivo || ' — corretor anterior: ' || COALESCE(_corretor_nome, ''),
          jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_devolucao', 'gatilho', _gatilho, 'corretor_anterior', _corretor));

  PERFORM public.enqueue_push(_l.sdr_id, 'Lead devolvido para você',
    COALESCE(_l.nome, 'Lead') || ' · ' || _motivo,
    '/leads/' || _lead_id::text, 'sdr-dev-' || _lead_id::text);

  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public._devolver_lead_ao_sdr(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Wrapper manual (admin): devolver na hora, com motivo.
CREATE OR REPLACE FUNCTION public.devolver_lead_ao_sdr(_lead_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _uid uuid := auth.uid(); _ok boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'só o admin devolve lead ao SDR manualmente' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(btrim(_motivo), '')) < 5 THEN
    RAISE EXCEPTION 'motivo é obrigatório (mínimo 5 caracteres)' USING ERRCODE = '22023';
  END IF;
  _ok := public._devolver_lead_ao_sdr(_lead_id, btrim(_motivo), 'manual_admin');
  RETURN jsonb_build_object('ok', _ok);
END; $$;

REVOKE ALL ON FUNCTION public.devolver_lead_ao_sdr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_lead_ao_sdr(uuid, text) TO authenticated, service_role;

-- No-show → devolve (nunca derruba a validação da visita).
CREATE OR REPLACE FUNCTION public.sdr_devolver_apos_no_show()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _l record;
BEGIN
  IF NEW.lead_id IS NULL OR NOT public._sdr_ativo() THEN
    RETURN NEW;
  END IF;
  SELECT sdr_id, sdr_entregue_em, corretor_id INTO _l FROM public.leads WHERE id = NEW.lead_id;
  IF _l.sdr_id IS NULL OR _l.sdr_entregue_em IS NULL OR _l.corretor_id IS DISTINCT FROM NEW.corretor_id THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public._devolver_lead_ao_sdr(NEW.lead_id, 'Cliente não compareceu à visita', 'no_show');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sdr_devolver_apos_no_show: devolução do lead % falhou (%)', NEW.lead_id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.sdr_devolver_apos_no_show() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sdr_devolver_no_show ON public.agendamentos;
CREATE TRIGGER trg_sdr_devolver_no_show
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  WHEN (NEW.status = 'nao_compareceu' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sdr_devolver_apos_no_show();

-- Corretor sem registro por sdr_devolucao_dias → devolve (cron diário).
CREATE OR REPLACE FUNCTION public.devolver_leads_sdr_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead record;
  _qtd int := 0;
  _dias int := public._sdr_setting_int('sdr_devolucao_dias', 7);
BEGIN
  IF NOT public._sdr_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    SELECT l.id
    FROM public.leads l
    WHERE l.sdr_id IS NOT NULL
      AND l.sdr_entregue_em IS NOT NULL
      AND l.corretor_id IS NOT NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status IN (
        'aguardando_atendimento','aguardando_retorno','qualificacao_corretor',
        'em_atendimento','qualificado','agendado','visita_realizada'
      )
      AND l.ultima_atividade_em < now() - make_interval(days => _dias)
      AND NOT EXISTS (
        SELECT 1 FROM public.agendamentos a
        WHERE a.lead_id = l.id AND a.deleted_at IS NULL
          AND a.status IN ('agendado','confirmado','remarcado') AND a.data_inicio > now()
      )
    ORDER BY l.ultima_atividade_em ASC
    LIMIT 50
  LOOP
    IF public._devolver_lead_ao_sdr(_lead.id,
         'Corretor sem registro há ' || _dias || ' dias', 'posse_sdr') THEN
      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END; $$;

REVOKE ALL ON FUNCTION public.devolver_leads_sdr_parados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_leads_sdr_parados() TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Alimentação da base do SDR (atrás da flag)
-- ---------------------------------------------------------------------------
-- 6a) Estoque sem dono → SDRs em rodízio.
CREATE OR REPLACE FUNCTION public.distribuir_estoque_sdr(_limite int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead record;
  _sdr uuid;
  _ok int := 0;
  _lote int := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads' USING ERRCODE = '42501';
  END IF;

  FOR _lead IN
    SELECT l.id
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND COALESCE(l.na_lixeira, false) = false
      AND l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status = 'aguardando_corretor'::public.lead_status
    ORDER BY l.created_at ASC
    LIMIT _lote
  LOOP
    _sdr := public._proximo_sdr();
    EXIT WHEN _sdr IS NULL;

    PERFORM set_config('app.sdr_motor', 'on', true);
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET sdr_id = _sdr,
           status = 'aguardando_atendimento'::public.lead_status,
           classe_lead = 'base',
           sdr_interesse_confirmado = false,
           sdr_entregue_em = NULL,
           data_distribuicao = now(),
           timestamp_recebimento = now()
     WHERE id = _lead.id AND sdr_id IS NULL AND corretor_id IS NULL;
    IF FOUND THEN
      PERFORM public._sdr_log_base(_lead.id, _sdr, 'Estoque sem dono para a base do SDR', 'base_sdr:estoque', 'estoque');
      _ok := _ok + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'modelo', 'sdr', 'distribuidos', _ok, 'lote', _lote,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor'::public.lead_status));
END; $$;

REVOKE ALL ON FUNCTION public.distribuir_estoque_sdr(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_sdr(int) TO authenticated, service_role;

-- distribuir_estoque_roleta (20260903175059): mesmo corpo; com a flag ligada
-- o estoque vai para os SDRs em vez do Plantão (cron distribuir-estoque-plantao).
CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(
  _roleta text DEFAULT 'plantao',
  _limite int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _entregues int;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  -- Modelo SDR ligado: o estoque é matéria-prima do SDR, não do Plantão.
  IF public._sdr_ativo() THEN
    RETURN public.distribuir_estoque_sdr(_limite);
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _corretores := _corretores + 1;
    _entregues := 0;

    FOR _lead IN
      SELECT l.id
        FROM public.leads l
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.status = 'aguardando_corretor'
       ORDER BY l.created_at ASC
       LIMIT _por_corretor
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _por_corretor), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    EXIT WHEN _entregues = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'corretores_aptos', _corretores,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.status = 'aguardando_corretor')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuir_estoque_roleta(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_roleta(text, int) TO authenticated, service_role;

-- 6b) Perdidos reciclados → base do SDR (cron diário). Transição perdido →
--     aguardando_atendimento é nova de política (forçada e registrada).
CREATE OR REPLACE FUNCTION public.alimentar_base_sdr_perdidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead record;
  _sdr uuid;
  _qtd int := 0;
  _dias int := public._sdr_setting_int('sdr_perdidos_dias', 30);
BEGIN
  IF NOT public._sdr_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    SELECT l.id, l.corretor_id, l.motivo_perda_categoria
    FROM public.leads l
    WHERE l.status = 'perdido'::public.lead_status
      AND l.sdr_id IS NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND COALESCE(l.opt_out, false) = false
      AND COALESCE(l.data_perda, l.updated_at) < now() - make_interval(days => _dias)
      AND COALESCE(l.motivo_perda_categoria, 'outro') NOT IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil')
    ORDER BY COALESCE(l.data_perda, l.updated_at) ASC
    LIMIT 100
  LOOP
    _sdr := public._proximo_sdr();
    EXIT WHEN _sdr IS NULL;

    PERFORM set_config('app.sdr_motor', 'on', true);
    UPDATE public.leads
       SET sdr_id = _sdr,
           corretor_anterior_id = COALESCE(corretor_id, corretor_anterior_id),
           corretor_id = NULL,
           classe_lead = 'base',
           sdr_interesse_confirmado = false,
           sdr_entregue_em = NULL,
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = 0,
           via_webhook = false,
           corretores_que_tentaram = CASE
             WHEN corretor_id IS NULL THEN corretores_que_tentaram
             WHEN corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
             ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
           END
     WHERE id = _lead.id AND sdr_id IS NULL AND status = 'perdido'::public.lead_status;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    PERFORM public._sdr_set_status(_lead.id, 'aguardando_atendimento'::public.lead_status,
      'Lead perdido reciclado para a base do SDR (' || _dias || ' dias após a perda)',
      'Reaquecer o cliente', 'sdr_reativacao', true);
    PERFORM public._sdr_log_base(_lead.id, _sdr, 'Perdido reciclado para a base do SDR', 'base_sdr:perdido', 'perdido',
      jsonb_build_object('corretor_anterior', _lead.corretor_id, 'categoria_perda', _lead.motivo_perda_categoria));
    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $$;

REVOKE ALL ON FUNCTION public.alimentar_base_sdr_perdidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alimentar_base_sdr_perdidos() TO service_role;

-- 6c) Posse expirada (v2): corpo idêntico ao da 20260826121000; com a flag do
--     SDR ligada, o lead devolvido ganha um SDR (rodízio) em vez de cair na
--     roleta base dos corretores. Lead que já tinha SDR mantém o seu.
CREATE OR REPLACE FUNCTION public.devolver_leads_posse_expirada()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record; _qtd int := 0; _log_id uuid;
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
  _sdr_on boolean := public._sdr_ativo();
  _sdr uuid;
BEGIN
  IF NOT public._modelo_v2_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.status, l.ultima_atividade_em, l.sdr_id,
             CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                  THEN _d_av ELSE _d_ini END AS regra_dias,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.ultima_atividade_em ASC) AS rn
      FROM public.leads l
      WHERE l.corretor_id IS NOT NULL
        AND l.na_lixeira = false
        AND l.deleted_at IS NULL
        AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
        AND l.ultima_atividade_em < now() - (
              CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                   THEN _d_av ELSE _d_ini END || ' days')::interval
    )
    SELECT id, corretor_id, status, regra_dias, sdr_id
    FROM candidatos
    WHERE rn <= 10
    ORDER BY ultima_atividade_em ASC
    LIMIT 50
  LOOP
    _sdr := NULL;
    IF _sdr_on THEN
      _sdr := COALESCE(_lead.sdr_id, public._proximo_sdr());
    ELSE
      _sdr := _lead.sdr_id;
    END IF;

    PERFORM set_config('app.sdr_motor', 'on', true);
    UPDATE public.leads
       SET corretor_anterior_id = corretor_id,
           corretor_id = NULL,
           classe_lead = 'base',
           status = 'aguardando_atendimento',
           tentativas_redistribuicao = 0,
           corretores_que_tentaram = ARRAY[corretor_id],
           sdr_id = _sdr,
           sdr_entregue_em = NULL,
           sdr_interesse_confirmado = CASE WHEN _lead.sdr_id IS NULL THEN false ELSE sdr_interesse_confirmado END
     WHERE id = _lead.id AND corretor_id = _lead.corretor_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead.id, NULL, 'redistribuicao',
       'Posse expirada (' || _lead.regra_dias || ' dias sem registro) — devolvido para a base'
         || CASE WHEN _sdr IS NOT NULL THEN ' do SDR' ELSE '' END,
       'base', 'posse_expirada', 'sucesso')
    RETURNING id INTO _log_id;

    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_strip_nulls(jsonb_build_object(
      'gatilho', 'posse_expirada',
      'corretor_anterior', _lead.corretor_id,
      'status_no_momento', _lead.status,
      'regra_dias', _lead.regra_dias,
      'sdr_id', _sdr)));

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $$;

REVOKE ALL ON FUNCTION public.devolver_leads_posse_expirada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_leads_posse_expirada() TO service_role;

-- 6d) Orquestrador do cron (20260709120300): corpo idêntico + o cron NÃO
--     rouba lead da base do SDR (sdr_id IS NULL).
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _dist int := 0;
  _falhas int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at ASC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      _falhas := _falhas + 1;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Raio-X do SDR — KPIs e metas (o SDR vê o próprio; gestão vê qualquer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_raio_x(
  _sdr_id uuid DEFAULT NULL, _de date DEFAULT NULL, _ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _alvo uuid := COALESCE(_sdr_id, auth.uid());
  _gestao boolean;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d date := COALESCE(_de, date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date);
  _a date := COALESCE(_ate, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  _ini timestamptz;
  _fim timestamptz;
  _hoje_ini timestamptz;
  _semana_ini timestamptz;
  _base jsonb;
  _base_total int; _reaquecendo int; _entregues_periodo int; _entregues_ativos int; _devolvidos_periodo int;
  _contatos_periodo int; _contatos_hoje int; _qualificados_periodo int;
  _ag_periodo int; _ag_semana int; _vis_realizadas int; _vis_no_show int; _vis_pendentes int;
  _vendas_qtd int; _vendas_valor numeric;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _gestao := public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'gestor'::public.app_role)
          OR public.has_role(_uid, 'superintendente'::public.app_role);
  IF _alvo <> _uid AND NOT _gestao THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _ini := (_d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim := ((_a + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _hoje_ini := (_hoje::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _semana_ini := (date_trunc('week', _hoje::timestamp)) AT TIME ZONE 'America/Sao_Paulo';

  SELECT COALESCE(jsonb_object_agg(s.status, s.n), '{}'::jsonb), COALESCE(sum(s.n), 0)::int
    INTO _base, _base_total
  FROM (
    SELECT l.status::text AS status, count(*)::int AS n
    FROM public.leads l
    WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NULL
      AND l.deleted_at IS NULL AND l.na_lixeira = false
      AND l.status NOT IN ('perdido','contrato_fechado','pos_venda')
    GROUP BY l.status
  ) s;

  SELECT count(*)::int INTO _reaquecendo
  FROM public.leads l
  WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NULL AND l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL AND l.na_lixeira = false;

  SELECT count(*)::int INTO _entregues_periodo
  FROM public.leads l
  WHERE l.sdr_id = _alvo AND l.sdr_entregue_em >= _ini AND l.sdr_entregue_em < _fim AND l.deleted_at IS NULL;

  SELECT count(*)::int INTO _entregues_ativos
  FROM public.leads l
  WHERE l.sdr_id = _alvo AND l.sdr_entregue_em IS NOT NULL AND l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.status NOT IN ('perdido','contrato_fechado','pos_venda');

  SELECT count(*)::int INTO _devolvidos_periodo
  FROM public.leads l
  WHERE l.sdr_id = _alvo AND l.sdr_devolvido_em >= _ini AND l.sdr_devolvido_em < _fim AND l.deleted_at IS NULL;

  SELECT count(*)::int, count(*) FILTER (WHERE i.ocorreu_em >= _hoje_ini)::int
    INTO _contatos_periodo, _contatos_hoje
  FROM public.interacoes i
  WHERE i.autor_id = _alvo AND i.deleted_at IS NULL
    AND i.tipo IN ('ligacao','whatsapp','email','sms')
    AND i.ocorreu_em >= LEAST(_ini, _hoje_ini) AND i.ocorreu_em < GREATEST(_fim, _hoje_ini + interval '1 day')
    AND (i.ocorreu_em < _fim OR i.ocorreu_em >= _hoje_ini);

  SELECT count(*)::int INTO _qualificados_periodo
  FROM public.lead_status_transitions t
  WHERE t.alterado_por = _alvo AND t.para_status = 'qualificado'::public.lead_status
    AND t.created_at >= _ini AND t.created_at < _fim;

  SELECT count(*) FILTER (WHERE a.created_at >= _ini AND a.created_at < _fim)::int,
         count(*) FILTER (WHERE a.created_at >= _semana_ini)::int
    INTO _ag_periodo, _ag_semana
  FROM public.agendamentos a
  WHERE a.criado_por_id = _alvo AND a.tipo = 'visita'::public.agendamento_tipo
    AND NOT a.auto_gerado AND a.deleted_at IS NULL
    AND a.created_at >= LEAST(_ini, _semana_ini);

  SELECT count(*) FILTER (WHERE a.status = 'realizado')::int,
         count(*) FILTER (WHERE a.status = 'nao_compareceu')::int,
         count(*) FILTER (WHERE a.status IN ('agendado','confirmado','remarcado'))::int
    INTO _vis_realizadas, _vis_no_show, _vis_pendentes
  FROM public.agendamentos a
  WHERE a.criado_por_id = _alvo AND a.tipo = 'visita'::public.agendamento_tipo
    AND NOT a.auto_gerado AND a.deleted_at IS NULL
    AND a.data_inicio >= _ini AND a.data_inicio < _fim;

  SELECT count(*)::int, COALESCE(sum(v.valor_venda), 0)
    INTO _vendas_qtd, _vendas_valor
  FROM public.vendas v
  JOIN public.leads l ON l.id = v.lead_id
  WHERE l.sdr_id = _alvo AND v.status_venda = 'aprovada'::public.status_venda
    AND v.aprovado_em >= _ini AND v.aprovado_em < _fim;

  RETURN jsonb_build_object(
    'sdr_id', _alvo,
    'periodo', jsonb_build_object('de', _d, 'ate', _a),
    'base', jsonb_build_object('total', _base_total, 'por_status', _base, 'reaquecendo', _reaquecendo),
    'contatos', jsonb_build_object('periodo', _contatos_periodo, 'hoje', _contatos_hoje),
    'qualificados', _qualificados_periodo,
    'agendamentos', jsonb_build_object('periodo', _ag_periodo, 'semana', _ag_semana),
    'visitas', jsonb_build_object(
      'realizadas', _vis_realizadas, 'no_show', _vis_no_show, 'pendentes', _vis_pendentes,
      'comparecimento_pct', CASE WHEN (_vis_realizadas + _vis_no_show) > 0
        THEN round(100.0 * _vis_realizadas / (_vis_realizadas + _vis_no_show), 1) ELSE NULL END),
    'entregues', jsonb_build_object('periodo', _entregues_periodo, 'ativos', _entregues_ativos),
    'devolvidos', _devolvidos_periodo,
    'vendas', jsonb_build_object('qtd', _vendas_qtd, 'valor', _vendas_valor),
    'metas', jsonb_build_object(
      'contatos_dia', public._sdr_setting_int('sdr_meta_contatos_dia', 40),
      'agendamentos_semana', public._sdr_setting_int('sdr_meta_agendamentos_semana', 8),
      'comparecimento_pct', public._sdr_setting_int('sdr_meta_comparecimento_pct', 60)),
    'comissao_percentual', COALESCE((public.get_dist_setting('sdr_comissao_percentual') #>> '{}')::numeric, 0)
  );
END; $$;

REVOKE ALL ON FUNCTION public.sdr_raio_x(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_raio_x(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Comissão do SDR — fatia configurável na aprovação da venda
--    (corpo da 20260711122000 + bloco 'sdr'; assinatura preservada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_comissoes_para_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _v public.vendas%ROWTYPE;
  _corretor_nome text;
  _gerente_id uuid;
  _gerente_nome text;
  _super_id uuid;
  _super_nome text;
  _sdr_id uuid;
  _sdr_nome text;
  _sdr_pct numeric := COALESCE((public.get_dist_setting('sdr_comissao_percentual') #>> '{}')::numeric, 0);
BEGIN
  SELECT * INTO _v
  FROM public.vendas
  WHERE id = _venda_id
  FOR UPDATE;

  IF NOT FOUND OR _v.status_venda <> 'aprovada'::public.status_venda THEN
    RETURN;
  END IF;

  SELECT p.nome INTO _corretor_nome
  FROM public.profiles AS p
  WHERE p.id = _v.corretor_id;

  SELECT e.gestor_id INTO _gerente_id
  FROM public.profiles AS p
  JOIN public.equipes AS e ON e.id = p.equipe_id
  WHERE p.id = _v.corretor_id;

  IF _gerente_id IS NOT NULL THEN
    SELECT p.nome INTO _gerente_nome
    FROM public.profiles AS p
    WHERE p.id = _gerente_id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta
  ) = 1 THEN
    SELECT ur.user_id INTO _super_id
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta;

    SELECT p.nome INTO _super_nome
    FROM public.profiles AS p
    WHERE p.id = _super_id;
  END IF;

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _v.corretor_id, _corretor_nome, 'corretor', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_corretor, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), _v.valor_venda
  WHERE (_v.corretor_id IS NOT NULL OR COALESCE(_v.percentual_corretor, 0) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'corretor'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _gerente_id, _gerente_nome, 'gerente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_gerente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_gerente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'gerente'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _super_id, _super_nome, 'superintendente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_superintendente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_superintendente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'superintendente'
    );

  -- SDR: fatia configurável (distribuicao_settings.sdr_comissao_percentual)
  -- para o dono de pré-venda do lead. 0 = sem linha.
  IF _v.lead_id IS NOT NULL AND _sdr_pct > 0 THEN
    SELECT l.sdr_id INTO _sdr_id FROM public.leads AS l WHERE l.id = _v.lead_id;
    IF _sdr_id IS NOT NULL THEN
      SELECT p.nome INTO _sdr_nome FROM public.profiles AS p WHERE p.id = _sdr_id;
      INSERT INTO public.comissoes (
        venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
        valor_base, percentual, valor_comissao, percentual_desconto,
        valor_liquido, contrato_vgv
      )
      SELECT
        _v.id, _v.lead_id, _sdr_id, _sdr_nome, 'sdr', 'pendente',
        _v.valor_venda, _sdr_pct,
        round(_v.valor_venda * _sdr_pct / 100, 2), 0,
        round(_v.valor_venda * _sdr_pct / 100, 2), _v.valor_venda
      WHERE NOT EXISTS (
        SELECT 1 FROM public.comissoes AS c
        WHERE c.venda_id = _v.id AND c.tipo = 'sdr'
      );
    END IF;
  END IF;

  INSERT INTO public.comissao_ledger (
    comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
    idempotency_key, criado_por, metadata
  )
  SELECT
    c.id,
    _v.id,
    c.beneficiario_id,
    c.tipo,
    'credito',
    GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
    'venda:' || _v.id::text || ':comissao:' || c.id::text || ':credito',
    _v.aprovado_por,
    jsonb_build_object('status_venda', _v.status_venda::text)
  FROM public.comissoes AS c
  WHERE c.venda_id = _v.id
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_comissoes_para_venda(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Pontuação diária: agendamento criado pelo SDR não credita ponto de
--    "agendamento criado" ao corretor (o Raio-X do SDR conta por criado_por_id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pont_after_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.auto_gerado THEN RETURN NEW; END IF;
  IF NEW.criado_por_id IS NOT NULL
     AND NEW.criado_por_id IS DISTINCT FROM NEW.corretor_id
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = NEW.criado_por_id AND ur.role = 'sdr'::public.app_role) THEN
    RETURN NEW;
  END IF;
  PERFORM public.bump_atividade(NEW.corretor_id, _dia, _ag => 1);
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.pont_after_agendamento() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Crons (no-op com a flag desligada)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('sdr-devolver-parados')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-devolver-parados');
  PERFORM cron.unschedule('sdr-alimentar-perdidos')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-alimentar-perdidos');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 09:30 BRT: devolução de leads entregues e parados.
SELECT cron.schedule('sdr-devolver-parados', '30 12 * * *', $$SELECT public.devolver_leads_sdr_parados()$$);
-- 08:00 BRT: perdidos reciclados para a base do SDR.
SELECT cron.schedule('sdr-alimentar-perdidos', '0 11 * * *', $$SELECT public.alimentar_base_sdr_perdidos()$$);

-- ---------------------------------------------------------------------------
-- 11) Sanidade — aborta o deploy se algum ramo sumiu
-- ---------------------------------------------------------------------------
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.distribuir_estoque_roleta(text,int)'::regprocedure);
  IF position('_sdr_ativo' IN _def) = 0 OR position('_distribuir_lead_v3' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta sem o desvio do SDR ou sem o caminho vigente';
  END IF;
  _def := pg_get_functiondef('public.processar_distribuicao_automatica()'::regprocedure);
  IF position('l.sdr_id IS NULL' IN _def) = 0 THEN
    RAISE EXCEPTION 'processar_distribuicao_automatica sem a exclusão da base do SDR';
  END IF;
  _def := pg_get_functiondef('public.devolver_leads_posse_expirada()'::regprocedure);
  IF position('_proximo_sdr' IN _def) = 0 OR position('_modelo_v2_ativo' IN _def) = 0 THEN
    RAISE EXCEPTION 'devolver_leads_posse_expirada sem o roteamento para o SDR ou sem a flag v2';
  END IF;
  _def := pg_get_functiondef('public.gerar_comissoes_para_venda(uuid)'::regprocedure);
  IF position('''sdr''' IN _def) = 0 THEN
    RAISE EXCEPTION 'gerar_comissoes_para_venda sem a fatia do SDR';
  END IF;
  _def := pg_get_functiondef('public._distribuir_lead_sdr(uuid,text,timestamptz,timestamptz,text)'::regprocedure);
  IF position('sdr_prioridade_corretor_original' IN _def) = 0 OR position('roleta_sdr' IN _def) = 0 THEN
    RAISE EXCEPTION 'motor SDR sem prioridade do corretor original ou sem roleta';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
