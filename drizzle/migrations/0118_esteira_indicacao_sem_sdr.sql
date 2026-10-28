CREATE OR REPLACE FUNCTION public.lead_esteira_comissao(p_lead uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN l.origem::text = 'indicacao' THEN 'lead_empresa'
    WHEN EXISTS (SELECT 1 FROM agendamentos a WHERE a.lead_id=l.id AND a.tipo='visita' AND a.criado_por_id IS NULL
                   AND NOT a.auto_gerado
                   AND COALESCE(a.descricao, '') NOT IN ('Reagendada a partir do Modo Visita.',
                                                         'Reagendada após não comparecimento.')) THEN 'marquinhos'
    WHEN l.sdr_id IS NOT NULL THEN 'sdr'
    WHEN l.origem::text IN ('captacao_corretor','investimento_corretor') THEN 'lead_proprio'
    ELSE 'lead_empresa' END
  FROM leads l WHERE l.id = p_lead
$function$;