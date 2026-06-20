
-- Backfill lead_status_transitions a partir de vendas históricas importadas
-- e atualiza status do lead para 'contrato_fechado' quando aplicável.
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, alterado_por, created_at)
SELECT v.lead_id,
       COALESCE(v.corretor_id, l.corretor_id),
       l.status,
       'contrato_fechado'::lead_status,
       COALESCE(v.criado_por_id, v.corretor_id),
       COALESCE(v.data_assinatura, v.created_at)
FROM public.vendas v
JOIN public.leads l ON l.id = v.lead_id
WHERE NOT v.distrato
  AND v.lead_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = v.lead_id
      AND t.para_status = 'contrato_fechado'
      AND date(t.created_at) = date(COALESCE(v.data_assinatura, v.created_at))
  );

-- Atualiza status do lead para 'contrato_fechado' quando a venda mais recente não é distrato
-- e o lead ainda não está fechado nem perdido
UPDATE public.leads l
SET status = 'contrato_fechado'
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, distrato, data_assinatura
  FROM public.vendas
  WHERE lead_id IS NOT NULL
  ORDER BY lead_id, COALESCE(data_assinatura, created_at) DESC
) v
WHERE l.id = v.lead_id
  AND NOT v.distrato
  AND l.status NOT IN ('contrato_fechado','perdido','pos_venda');
