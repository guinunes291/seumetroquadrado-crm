-- ============================================================================
-- Correções de distribuição (DIST-1..4) + gestor marca presença (UI-3)
-- + emissão de eventos de métricas para n8n (fire-and-forget via pg_net).
-- Modo de presença: "preferencia" (presentes têm prioridade; sem presentes,
-- cai em ativos elegíveis; nunca trava).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config: webhook do n8n para métricas de status/atribuição de lead.
-- Uma única linha (id=1). Admin pode atualizar URL/token via update.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_webhook_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  url text NOT NULL,
  token text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.metric_webhook_settings TO authenticated;
GRANT ALL ON public.metric_webhook_settings TO service_role;

ALTER TABLE public.metric_webhook_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin ve config webhook metricas" ON public.metric_webhook_settings;
CREATE POLICY "admin ve config webhook metricas"
  ON public.metric_webhook_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "admin gerencia config webhook metricas" ON public.metric_webhook_settings;
CREATE POLICY "admin gerencia config webhook metricas"
  ON public.metric_webhook_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.metric_webhook_settings (id, url, token, enabled)
VALUES (1, 'https://guilhermenunessmq.app.n8n.cloud/webhook/smq-metricas-status', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- RPC para atualizar o token (chamada pelo backend do CRM com o valor do secret).
CREATE OR REPLACE FUNCTION public.set_metric_webhook_token(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.metric_webhook_settings
     SET token = NULLIF(btrim(_token), ''), updated_at = now()
   WHERE id = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_metric_webhook_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_metric_webhook_token(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger de emissão: dispara POST para o n8n sempre que o status muda
-- (tipo='status') ou o corretor é atribuído/alterado (tipo='atribuicao').
-- Fire-and-forget: pg_net enfileira e retorna imediatamente. Erros são
-- silenciados via EXCEPTION WHEN OTHERS — nunca bloqueia a operação do CRM.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lead_metric_emit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cfg record;
  _headers jsonb;
  _corretor_nome text;
  _payload jsonb;
  _emit_status boolean := false;
  _emit_atribuicao boolean := false;
  _de_estado text;
  _para_estado text;
  _corretor_para uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.corretor_id IS NOT NULL THEN
      _emit_atribuicao := true;
      _corretor_para := NEW.corretor_id;
    END IF;
    IF NEW.status IS NOT NULL THEN
      _emit_status := true;
      _de_estado := NULL;
      _para_estado := NEW.status::text;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      _emit_status := true;
      _de_estado := OLD.status::text;
      _para_estado := NEW.status::text;
    END IF;
    IF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id AND NEW.corretor_id IS NOT NULL THEN
      _emit_atribuicao := true;
      _corretor_para := NEW.corretor_id;
    END IF;
  END IF;

  IF NOT (_emit_status OR _emit_atribuicao) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT * INTO _cfg FROM public.metric_webhook_settings WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF _cfg IS NULL OR NOT _cfg.enabled OR _cfg.url IS NULL OR btrim(_cfg.url) = '' THEN
    RETURN NEW;
  END IF;

  _headers := jsonb_build_object('Content-Type','application/json');
  IF _cfg.token IS NOT NULL AND btrim(_cfg.token) <> '' THEN
    _headers := _headers || jsonb_build_object('X-Webhook-Token', _cfg.token);
  END IF;

  IF _emit_status THEN
    BEGIN
      SELECT nome INTO _corretor_nome FROM public.profiles WHERE id = NEW.corretor_id;
    EXCEPTION WHEN OTHERS THEN _corretor_nome := NULL; END;

    _payload := jsonb_build_object(
      'tipo','status',
      'lead_id', NEW.id,
      'corretor_id', NEW.corretor_id,
      'corretor_nome', _corretor_nome,
      'origem', NEW.origem::text,
      'de_estado', _de_estado,
      'para_estado', _para_estado,
      'ts', to_char(now() AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD"T"HH24:MI:SS-03:00')
    );

    BEGIN
      PERFORM net.http_post(url := _cfg.url, headers := _headers, body := _payload);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF _emit_atribuicao THEN
    BEGIN
      SELECT nome INTO _corretor_nome FROM public.profiles WHERE id = _corretor_para;
    EXCEPTION WHEN OTHERS THEN _corretor_nome := NULL; END;

    _payload := jsonb_build_object(
      'tipo','atribuicao',
      'lead_id', NEW.id,
      'corretor_id', _corretor_para,
      'corretor_nome', _corretor_nome,
      'origem', NEW.origem::text,
      'de_estado', NEW.status::text,
      'para_estado', NEW.status::text,
      'ts', to_char(now() AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD"T"HH24:MI:SS-03:00')
    );

    BEGIN
      PERFORM net.http_post(url := _cfg.url, headers := _headers, body := _payload);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_metric_emit_ins ON public.leads;
CREATE TRIGGER trg_lead_metric_emit_ins
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_metric_emit();

DROP TRIGGER IF EXISTS trg_lead_metric_emit_upd ON public.leads;
CREATE TRIGGER trg_lead_metric_emit_upd
AFTER UPDATE OF status, corretor_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_metric_emit();

-- ---------------------------------------------------------------------------
-- DIST-4: higiene da fila — remove admin/gestor/superintendente e docs-bot
-- ---------------------------------------------------------------------------
DELETE FROM public.fila_distribuicao fd
 WHERE lower(coalesce((SELECT nome FROM public.profiles WHERE id = fd.corretor_id),'')) = 'docs-bot'
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = fd.corretor_id AND ur.role = 'corretor'::app_role
    );

-- ---------------------------------------------------------------------------
-- DIST-1: elegibilidade unificada — agora exige role='corretor' e exclui docs-bot.
-- Mantém a trava de 90% e o teto de max_leads_dia (canal interno).
-- Presença NÃO entra como filtro rígido aqui — é prioridade na seleção.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretor_elegivel(_corretor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ok boolean;
  _total int;
  _trabalhados int;
BEGIN
  SELECT (p.ativo
          AND lower(coalesce(p.nome,'')) <> 'docs-bot'
          AND fd.ativo
          AND fd.leads_recebidos_hoje < fd.max_leads_dia
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role
          ))
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
  RETURN (_trabalhados::numeric / _total::numeric) >= 0.9;
END;
$$;

GRANT EXECUTE ON FUNCTION public.corretor_elegivel(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- DIST-2: roleta do webhook em duas camadas — presentes primeiro; se ninguém
-- presente, distribui para ativos elegíveis (modo "preferencia"). Aplica teto
-- max_leads_dia e incrementa leads_recebidos_hoje (contabiliza cota).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead_webhook()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
BEGIN
  -- Camada 1: PRESENTES elegíveis (rodízio justo por last_lead_assigned_at)
  SELECT p.id INTO _cid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
    JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
   WHERE p.ativo AND fd.ativo
     AND p.telefone IS NOT NULL AND btrim(p.telefone) <> ''
     AND lower(coalesce(p.nome,'')) <> 'docs-bot'
     AND fd.leads_recebidos_hoje < fd.max_leads_dia
     AND p.presente = true AND p.presente_em IS NOT NULL
     AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
           = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  -- Camada 2 (MODO_PRESENCA='preferencia'): sem presentes → ativos elegíveis
  IF _cid IS NULL THEN
    SELECT p.id INTO _cid
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
      JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
     WHERE p.ativo AND fd.ativo
       AND p.telefone IS NOT NULL AND btrim(p.telefone) <> ''
       AND lower(coalesce(p.nome,'')) <> 'docs-bot'
       AND fd.leads_recebidos_hoje < fd.max_leads_dia
     ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;
  END IF;

  IF _cid IS NULL THEN RETURN NULL; END IF;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _cid;
  UPDATE public.fila_distribuicao
     SET leads_recebidos_hoje = leads_recebidos_hoje + 1,
         ultima_distribuicao = now()
   WHERE corretor_id = _cid;

  RETURN _cid;
END;
$$;

REVOKE ALL ON FUNCTION public.distribuir_lead_webhook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_webhook() TO service_role;

-- ---------------------------------------------------------------------------
-- DIST-3: motor interno prioriza PRESENTES (sem quebrar o fallback dos ativos).
-- Continua usando corretor_elegivel (com role check já incluído em DIST-1).
-- Mantém a lógica específica de Facebook (posicao_facebook).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo,
  _distribuido_por uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _corretor uuid;
  _max_pos int;
  _caller uuid := auth.uid();
  _atual uuid;
  _origem text;
  _is_fb boolean;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT corretor_id, origem::text INTO _atual, _origem
    FROM public.leads WHERE id = _lead_id;

  IF _atual IS NOT NULL AND _tipo = 'automatica' THEN
    RETURN _atual;
  END IF;

  _is_fb := (_origem = 'facebook');

  -- Camada 1: presentes elegíveis
  IF _is_fb THEN
    SELECT fd.corretor_id INTO _corretor
      FROM public.fila_distribuicao fd
      JOIN public.profiles p ON p.id = fd.corretor_id
     WHERE fd.ativo AND fd.leads_recebidos_hoje < fd.max_leads_dia
       AND public.corretor_elegivel(fd.corretor_id)
       AND p.presente = true AND p.presente_em IS NOT NULL
       AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
             = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY COALESCE(fd.posicao_facebook, fd.posicao) ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  ELSE
    SELECT fd.corretor_id INTO _corretor
      FROM public.fila_distribuicao fd
      JOIN public.profiles p ON p.id = fd.corretor_id
     WHERE fd.ativo AND fd.leads_recebidos_hoje < fd.max_leads_dia
       AND public.corretor_elegivel(fd.corretor_id)
       AND p.presente = true AND p.presente_em IS NOT NULL
       AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
             = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY fd.posicao ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  END IF;

  -- Camada 2: sem presentes → ativos elegíveis (fallback, mesmo critério)
  IF _corretor IS NULL THEN
    IF _is_fb THEN
      SELECT corretor_id INTO _corretor
        FROM public.fila_distribuicao
       WHERE ativo AND leads_recebidos_hoje < max_leads_dia
         AND public.corretor_elegivel(corretor_id)
       ORDER BY COALESCE(posicao_facebook, posicao) ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED;
    ELSE
      SELECT corretor_id INTO _corretor
        FROM public.fila_distribuicao
       WHERE ativo AND leads_recebidos_hoje < max_leads_dia
         AND public.corretor_elegivel(corretor_id)
       ORDER BY posicao ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED;
    END IF;
  END IF;

  IF _corretor IS NULL THEN RETURN NULL; END IF;

  IF _is_fb THEN
    SELECT COALESCE(MAX(posicao_facebook), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
       SET posicao_facebook = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _corretor;
  ELSE
    SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _corretor;
  END IF;

  UPDATE public.leads
     SET corretor_id = _corretor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         corretores_que_tentaram = array_append(corretores_que_tentaram, _corretor)
   WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, distribuido_por_id, motivo)
  VALUES (_lead_id, _corretor, _tipo, COALESCE(_distribuido_por, _caller),
          CASE
            WHEN _tipo = 'automatica' AND _is_fb THEN 'Roleta automática (Facebook) — presente/prioridade'
            WHEN _tipo = 'automatica' THEN 'Roleta automática — presente/prioridade'
            ELSE 'Distribuição ' || _tipo::text
          END);

  -- Marca o cursor do webhook também para não desbalancear os canais
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _corretor;

  RETURN _corretor;
END;
$function$;

-- ---------------------------------------------------------------------------
-- UI-3: gestor pode marcar presença de outro corretor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_presenca_admin(_corretor_id uuid, _presente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL
     OR (NOT public.has_role(_uid,'admin') AND NOT public.has_role(_uid,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
     SET presente = _presente,
         presente_em = CASE WHEN _presente THEN now() ELSE NULL END
   WHERE id = _corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_presenca_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_presenca_admin(uuid, boolean) TO authenticated;
