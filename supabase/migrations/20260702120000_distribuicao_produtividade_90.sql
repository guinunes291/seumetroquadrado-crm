-- Distribuição automática por produtividade (regra dos 90%).
--
-- O que muda e por quê:
-- 1. corretor_elegivel: volta ao threshold de 90% (tinha sido afrouxado para
--    70% em 20260616150008) e DEIXA DE exigir presença marcada no dia — a
--    trava de "Cheguei" fazia o motor automático não distribuir nada quando
--    ninguém marcava presença. Elegível = ativo na fila + dentro da cota
--    diária + >=90% da carteira ativa fora de "aguardando_atendimento".
-- 2. distribuir_lead: passa a aplicar a MESMA elegibilidade na entrada
--    (webhook, Facebook, botão Roleta, novo lead). Sem corretor elegível o
--    lead fica na base (retorna NULL, callers já tratam) e o processador
--    automático entrega assim que alguém cruzar os 90%.
-- 3. distribuir_lead_elegivel: vira um wrapper de distribuir_lead — um único
--    motor (inclusive fila específica do Facebook) para todos os caminhos.
-- 4. processar_distribuicao_automatica: além de `novo`, também pega leads
--    `aguardando_atendimento` sem corretor, e drena em ordem FIFO
--    (created_at ASC) — antes os mais antigos apodreciam na base.
-- 5. produtividade_corretores(): visão para a tela de Distribuição mostrar a
--    % trabalhada e a elegibilidade de cada corretor da fila.

-- 1. Elegibilidade: ativo na fila + cota do dia + >=90% da carteira trabalhada.
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
  SELECT (fd.ativo AND fd.leads_recebidos_hoje < fd.max_leads_dia)
  INTO _ok
  FROM public.fila_distribuicao fd
  WHERE fd.corretor_id = _corretor_id;

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

-- 2. Roleta unificada: mesma regra de elegibilidade em toda entrada de lead.
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

  IF _is_fb THEN
    SELECT corretor_id INTO _corretor
    FROM public.fila_distribuicao
    WHERE ativo = true
      AND leads_recebidos_hoje < max_leads_dia
      AND public.corretor_elegivel(corretor_id)
    ORDER BY COALESCE(posicao_facebook, posicao) ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  ELSE
    SELECT corretor_id INTO _corretor
    FROM public.fila_distribuicao
    WHERE ativo = true
      AND leads_recebidos_hoje < max_leads_dia
      AND public.corretor_elegivel(corretor_id)
    ORDER BY posicao ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF _corretor IS NULL THEN
    RETURN NULL;
  END IF;

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
            WHEN _tipo = 'automatica' AND _is_fb THEN 'Roleta automática por produtividade (Facebook ADS)'
            WHEN _tipo = 'automatica' THEN 'Roleta automática por produtividade'
            ELSE 'Distribuição ' || _tipo::text
          END);

  RETURN _corretor;
END;
$function$;

-- 3. Wrapper: mantém a assinatura usada pelo cron/redistribuição, delegando
--    ao motor unificado (que agora já é elegibilidade-aware e trata Facebook).
CREATE OR REPLACE FUNCTION public.distribuir_lead_elegivel(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.distribuir_lead(_lead_id, 'automatica'::distribuicao_tipo, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribuir_lead_elegivel(uuid) TO service_role;

-- 4. Processador automático: drena a base em FIFO, incluindo leads
--    `aguardando_atendimento` que ficaram sem corretor.
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

  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object('distribuidos', _dist, 'redistribuidos', _redist, 'em', now());
END;
$$;

-- 5. Produtividade por corretor da fila — alimenta a tela de Distribuição.
CREATE OR REPLACE FUNCTION public.produtividade_corretores()
RETURNS TABLE(
  corretor_id uuid,
  total_ativos int,
  aguardando int,
  pct_trabalhado numeric,
  elegivel boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin') AND NOT public.has_role(_caller, 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT fd.corretor_id,
         COALESCE(c.total, 0)::int,
         COALESCE(c.aguardando, 0)::int,
         CASE
           WHEN COALESCE(c.total, 0) = 0 THEN 100
           ELSE round((c.total - c.aguardando)::numeric / c.total::numeric * 100, 1)
         END,
         public.corretor_elegivel(fd.corretor_id)
  FROM public.fila_distribuicao fd
  LEFT JOIN LATERAL (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE l.status = 'aguardando_atendimento') AS aguardando
    FROM public.leads l
    WHERE l.corretor_id = fd.corretor_id
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
  ) c ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.produtividade_corretores() TO authenticated;
