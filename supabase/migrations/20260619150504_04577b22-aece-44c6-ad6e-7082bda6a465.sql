-- Visitas realizadas (stg_visitas) → lead_status_transitions
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
SELECT l.id, l.corretor_id, NULL, 'visita_realizada'::public.lead_status,
       COALESCE(NULLIF(s.data_visita,'')::timestamptz, NULLIF(s.created_at,'')::timestamptz, now())
FROM public.stg_visitas s
JOIN public.leads l ON l.legacy_id = s.lead_legacy
WHERE l.corretor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = l.id
      AND t.para_status = 'visita_realizada'
      AND t.created_at = COALESCE(NULLIF(s.data_visita,'')::timestamptz, NULLIF(s.created_at,'')::timestamptz, now())
  );

-- Análises de crédito (stg_analises) → lead_status_transitions
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
SELECT l.id, l.corretor_id, NULL, 'analise_credito'::public.lead_status,
       COALESCE(NULLIF(s.created_at,'')::timestamptz, now())
FROM public.stg_analises s
JOIN public.leads l ON l.legacy_id = s.lead_legacy
WHERE l.corretor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = l.id
      AND t.para_status = 'analise_credito'
      AND t.created_at = COALESCE(NULLIF(s.created_at,'')::timestamptz, now())
  );

-- Vendas (stg_leads.status='contrato_fechado') → lead_status_transitions
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
SELECT l.id, l.corretor_id, NULL, 'contrato_fechado'::public.lead_status,
       COALESCE(NULLIF(s.updated_at,'')::timestamptz, now())
FROM public.stg_leads s
JOIN public.leads l ON l.legacy_id = s.legacy_id
WHERE s.status = 'contrato_fechado'
  AND l.corretor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = l.id AND t.para_status = 'contrato_fechado'
  );

-- Agendamentos que estavam atrelados a corretor_legacy "interno" (não user)
-- Religa pelo lead atual quando o corretor_legacy não bate com nenhum profile
INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, data_inicio, data_fim, created_at)
SELECT l.id, l.corretor_id, l.corretor_id, 'visita'::public.agendamento_tipo,
       (CASE s.status WHEN 'realizado' THEN 'realizado' WHEN 'cancelado' THEN 'cancelado'
                      WHEN 'nao_compareceu' THEN 'nao_compareceu' ELSE 'agendado' END)::public.agendamento_status,
       COALESCE(NULLIF(s.construtora,''),'Agendamento (histórico)'),
       NULLIF(s.data_agendamento,'')::timestamptz,
       NULLIF(s.data_agendamento,'')::timestamptz + interval '1 hour',
       COALESCE(NULLIF(s.created_at,'')::timestamptz, NULLIF(s.data_agendamento,'')::timestamptz, now())
FROM public.stg_agendamentos s
JOIN public.leads l ON l.legacy_id = s.lead_legacy
WHERE NULLIF(s.data_agendamento,'') IS NOT NULL
  AND l.corretor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.legacy_user_id = s.corretor_legacy)
  AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.lead_id = l.id
      AND a.data_inicio = NULLIF(s.data_agendamento,'')::timestamptz
  );