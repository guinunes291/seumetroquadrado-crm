-- Fix: transicionar_lead precisa gravar motivo_perda_categoria para satisfazer
-- o trigger enforce_motivo_perda_categoria ao mover para 'perdido'.
CREATE OR REPLACE FUNCTION public.transicionar_lead(
  p_lead_id uuid,
  p_novo_status lead_status,
  p_motivo text DEFAULT NULL::text,
  p_proxima_acao text DEFAULT NULL::text,
  p_proximo_followup timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_motivo_categoria text DEFAULT NULL::text
)
 RETURNS leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _resultado public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _gestao boolean;
  _acao_final text;
  _followup_final timestamptz;
  _categoria_final text;
BEGIN
  IF NOT _service_role AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF p_novo_status IS NULL THEN
    RAISE EXCEPTION 'novo status é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _service_role AND NOT public.pode_acessar_lead(_uid, p_lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  _gestao := _service_role
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT public.transicao_lead_permitida(_lead.status, p_novo_status, _gestao) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status = 'perdido'::public.lead_status
     AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório ao perder um lead' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT EXISTS (
       SELECT 1 FROM public.vendas AS v
       WHERE v.lead_id = p_lead_id AND v.status_venda = 'aprovada'::public.status_venda
     ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda' USING ERRCODE = '23514';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT _gestao THEN
    RAISE EXCEPTION 'fechamento e pós-venda exigem papel de gestão' USING ERRCODE = '42501';
  END IF;

  IF p_proxima_acao IS NOT NULL AND char_length(btrim(p_proxima_acao)) > 500 THEN
    RAISE EXCEPTION 'próxima ação excede 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_proximo_followup IS NOT NULL AND p_proximo_followup <= now()
     AND p_novo_status NOT IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status) THEN
    RAISE EXCEPTION 'follow-up deve estar no futuro' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres' USING ERRCODE = '22023';
  END IF;

  _acao_final := COALESCE(NULLIF(btrim(p_proxima_acao), ''), _lead.proxima_acao);
  _followup_final := COALESCE(p_proximo_followup, _lead.proximo_followup);

  -- Ao mover para 'perdido' garantimos motivo_perda_categoria: usa o passado
  -- explicitamente, senão herda o já registrado no lead; fallback 'outro' evita
  -- que o trigger enforce_motivo_perda_categoria trave a operação.
  IF p_novo_status = 'perdido'::public.lead_status THEN
    _categoria_final := COALESCE(
      NULLIF(btrim(p_motivo_categoria), ''),
      _lead.motivo_perda_categoria,
      'outro'
    );
  ELSE
    _categoria_final := _lead.motivo_perda_categoria;
  END IF;

  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND (_followup_final IS NULL OR _followup_final <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'em_atendimento'::public.lead_status, 'aguardando_retorno'::public.lead_status,
    'qualificado'::public.lead_status, 'agendado'::public.lead_status,
    'visita_realizada'::public.lead_status, 'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status
  ) AND _acao_final IS NULL AND _followup_final IS NULL THEN
    RAISE EXCEPTION 'informe próxima ação ou follow-up' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);

  UPDATE public.leads
  SET status = p_novo_status,
      motivo_perdido = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN btrim(p_motivo)
        WHEN _lead.status = 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perdido
      END,
      motivo_perda_categoria = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN _categoria_final
        WHEN _lead.status = 'perdido'::public.lead_status
             AND p_novo_status <> 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perda_categoria
      END,
      proxima_acao = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _acao_final
      END,
      proximo_followup = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _followup_final
      END,
      ultima_interacao = now()
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    p_lead_id, 'transicao_lead',
    'Lead movido de ' || _lead.status::text || ' para ' || p_novo_status::text || '.',
    'transicionar_lead',
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _lead.status, 'para_status', p_novo_status,
      'motivo', NULLIF(btrim(p_motivo), ''),
      'motivo_categoria', CASE WHEN p_novo_status='perdido' THEN _categoria_final ELSE NULL END,
      'proxima_acao', _resultado.proxima_acao,
      'proximo_followup', _resultado.proximo_followup,
      'alterado_por', _uid
    ))
  );

  RETURN _resultado;
END;
$function$;

-- v2 agora passa a categoria diretamente para transicionar_lead.
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido_v2(_lead_id uuid, _categoria text, _detalhe text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), btrim(_categoria));
BEGIN
  IF NOT _service_role AND NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(_categoria), '') IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatório' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  PERFORM public.transicionar_lead(
    _lead_id,
    'perdido'::public.lead_status,
    _motivo,
    NULL,
    NULL,
    btrim(_categoria)
  );
  RETURN public.marcar_lead_perdido(_lead_id, _categoria, _detalhe);
END;
$function$;