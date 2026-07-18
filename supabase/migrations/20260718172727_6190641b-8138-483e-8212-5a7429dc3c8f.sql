
-- 1) RPC: métricas ao vivo da equipe da campanha (fonte canônica = distribution_log)
CREATE OR REPLACE FUNCTION public.equipe_metricas_campanha(_roleta_id uuid)
RETURNS TABLE (
  corretor_id uuid,
  leads_janela int,
  agendamentos_janela int,
  vendas_janela int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
BEGIN
  SELECT slug, janela_ag_dias, janela_venda_dias
    INTO _r
    FROM public.roletas
   WHERE id = _roleta_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    rp.corretor_id,
    COALESCE((
      SELECT count(*)::int FROM public.distribution_log dl
       WHERE dl.corretor_id = rp.corretor_id
         AND dl.roleta_slug = _r.slug
         AND dl.resultado = 'sucesso'
         AND dl.created_at > now() - (_r.janela_ag_dias || ' days')::interval
    ), 0) AS leads_janela,
    COALESCE((
      SELECT count(*)::int FROM public.agendamentos a
        JOIN public.leads l ON l.id = a.lead_id
       WHERE a.corretor_id = rp.corretor_id
         AND l.roleta_slug = _r.slug
         AND a.created_at > now() - (_r.janela_ag_dias || ' days')::interval
    ), 0) AS agendamentos_janela,
    COALESCE((
      SELECT count(*)::int FROM public.vendas v
        JOIN public.leads l ON l.id = v.lead_id
       WHERE v.corretor_id = rp.corretor_id
         AND l.roleta_slug = _r.slug
         AND v.created_at > now() - (_r.janela_venda_dias || ' days')::interval
    ), 0) AS vendas_janela
  FROM public.roleta_participantes rp
  WHERE rp.roleta_id = _roleta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.equipe_metricas_campanha(uuid) TO authenticated, service_role;

-- 2) SLA: manter o lead na MESMA campanha ao redistribuir.
--    Antes o RPC v3 recebia _roleta_slug=NULL e resolvia via origem/canal,
--    o que jogava o lead da campanha para a roleta padrão (Marquinhos)
--    e ainda quebrava a contabilização (log ia sem o slug da campanha).
CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _lead record; _res jsonb; _anterior uuid; _novo uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, l.roleta_slug, dc.timeout_minutos
    INTO _lead
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.id = _lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
    PERFORM public._escalar_lead_gestor(_lead_id, _lead.tentativas_redistribuicao);
    RETURN false;
  END IF;

  _anterior := _lead.corretor_id;

  UPDATE public.leads
     SET corretores_que_tentaram = array_append(
           COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
   WHERE id = _lead_id
     AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  -- Se o lead nasceu numa campanha (roleta.tipo='campanha'), redistribui
  -- via ponderada dentro da MESMA campanha (mantém equipe/tier/slug).
  IF _lead.roleta_slug IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.roletas r
        WHERE r.slug = _lead.roleta_slug AND r.tipo = 'campanha' AND r.ativo
     ) THEN
    _res := public.distribuir_lead_ponderado(_lead_id, _lead.roleta_slug);
  ELSE
    _res := public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', _lead.roleta_slug, NULL, _caller, 'sla_webhook_imediato',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));
  END IF;

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id
     RETURNING corretor_id INTO _novo;

    IF _novo IS NOT NULL AND _novo <> _anterior THEN
      PERFORM public._auditar_redistribuicao(
        _lead_id, _anterior, _novo,
        'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
      PERFORM public._notificar_handoff_novo_dono(
        _lead_id, _novo,
        'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
        ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END; $$;
