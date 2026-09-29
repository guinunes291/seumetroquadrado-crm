CREATE OR REPLACE FUNCTION public.leads_funil_registros_v1(_na_lixeira boolean DEFAULT false, _origem text DEFAULT NULL, _corretor text DEFAULT NULL, _temperatura text DEFAULT NULL, _periodo_start timestamptz DEFAULT NULL, _periodo_end timestamptz DEFAULT NULL, _search text DEFAULT NULL, _search_digits text DEFAULT NULL)
RETURNS TABLE(etapa text, quantidade bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  RETURN QUERY
  WITH coorte AS (
    SELECT l.id, l.status::text AS status
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (_corretor IS NULL OR _corretor = 'all'
           OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
           OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor))
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (_search IS NULL OR _search = '' OR l.search_text ILIKE '%'||_search||'%'
           OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%'))
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
      AND (_periodo_start IS NULL OR l.created_at >= _periodo_start)
      AND (_periodo_end IS NULL OR l.created_at <= _periodo_end)
  ),
  marcas AS (
    SELECT c.id,
      (c.status IN ('contrato_fechado','pos_venda')
        OR EXISTS (SELECT 1 FROM public.vendas v WHERE v.lead_id = c.id AND COALESCE(v.distrato,false) = false AND v.status <> 'rejeitada' AND v.status <> 'cancelada')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'contrato_fechado')) AS venda,
      (c.status IN ('analise_credito')
        OR EXISTS (SELECT 1 FROM public.analises_credito a WHERE a.lead_id = c.id)
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'analise_credito')) AS analise,
      (c.status IN ('visita_realizada','proposta_enviada')
        OR EXISTS (SELECT 1 FROM public.visitas vi WHERE vi.lead_id = c.id)
        OR EXISTS (SELECT 1 FROM public.agendamentos ag WHERE ag.lead_id = c.id AND ag.deleted_at IS NULL AND ag.status::text = 'realizado')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status IN ('visita_realizada','proposta_enviada'))) AS visita,
      (c.status = 'agendado'
        OR EXISTS (SELECT 1 FROM public.agendamentos ag WHERE ag.lead_id = c.id AND ag.deleted_at IS NULL AND ag.tipo::text = 'visita')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'agendado')) AS agendado,
      (c.status IN ('em_atendimento','aguardando_retorno','qualificado','qualificacao_corretor')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status IN ('em_atendimento','aguardando_retorno','qualificado','qualificacao_corretor'))) AS atendimento,
      (c.status = 'perdido') AS perdido
    FROM coorte c
  ),
  -- Quem chegou a uma etapa adiante também passou pelas anteriores.
  acc AS (
    SELECT m.id, m.perdido, m.venda,
      (m.venda OR m.analise) AS analise,
      (m.venda OR m.analise OR m.visita) AS visita,
      (m.venda OR m.analise OR m.visita OR m.agendado) AS agendado,
      (m.venda OR m.analise OR m.visita OR m.agendado OR m.atendimento) AS atendimento
    FROM marcas m
  )
  SELECT 'entrada', count(*) FROM acc
  UNION ALL SELECT 'em_atendimento', count(*) FILTER (WHERE atendimento) FROM acc
  UNION ALL SELECT 'agendado', count(*) FILTER (WHERE agendado) FROM acc
  UNION ALL SELECT 'visita_realizada', count(*) FILTER (WHERE visita) FROM acc
  UNION ALL SELECT 'analise_credito', count(*) FILTER (WHERE analise) FROM acc
  UNION ALL SELECT 'venda', count(*) FILTER (WHERE venda) FROM acc
  UNION ALL SELECT 'perdido', count(*) FILTER (WHERE perdido) FROM acc;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.leads_funil_registros_v1(boolean,text,text,text,timestamptz,timestamptz,text,text) TO authenticated;