-- =====================================================================
-- Auditoria julho/2026 — Etapa 2 (M6/timezone)
-- O dedup "1 alerta por dia" usava created_at::date = now()::date em UTC.
-- Entre ~21h e a meia-noite BRT o "dia" UTC já virou, então o alerta podia
-- ser recriado uma vez perto da meia-noite. Redefine as duas funções usando
-- o dia em America/Sao_Paulo. CREATE OR REPLACE: só muda a janela de dedup,
-- o resto do corpo é idêntico à definição vigente. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gerar_alertas_tarefas_atrasadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT t.corretor_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || t.titulo,
         'Venceu em ' || to_char(t.data_vencimento, 'DD/MM/YYYY HH24:MI'),
         '/tarefas', t.id
  FROM public.tarefas t
  WHERE t.status IN ('pendente','em_andamento')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND t.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = t.id
        AND a.tipo = 'tarefa_atrasada'
        AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_alertas_leads_parados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id,
         'follow_up',
         'Lead parado: ' || l.nome,
         'Sem interação há 5+ dias. Retome o contato.',
         '/leads/' || l.id::text,
         l.id
  FROM public.leads l
  WHERE l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND COALESCE(l.ultima_interacao, l.created_at) < now() - interval '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = l.id
        AND a.tipo = 'follow_up'
        AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
END;
$$;
