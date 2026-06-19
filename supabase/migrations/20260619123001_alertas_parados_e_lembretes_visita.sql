-- Parte 3 (C3 + C5 fase A): alerta de lead parado (5 dias) e lembretes de visita.

-- C3: alerta para o corretor quando um lead ativo fica 5+ dias sem interação.
-- Reusa a tabela `alertas` e o padrão de dedup (1 alerta por lead por dia).
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
        AND a.created_at::date = now()::date
    );
END;
$$;

SELECT cron.schedule(
  'alertar-leads-parados',
  '0 8 * * *',
  $$ SELECT public.gerar_alertas_leads_parados(); $$
);

-- C5 (fase A): lembretes de visita ao CORRETOR ~48h, ~24h e ~10h antes.
-- Insere em push_outbox uma vez por janela (tag distinta + dedup por tag).
CREATE OR REPLACE FUNCTION public.gerar_pushes_lembretes_visita()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_outbox(user_id, title, body, url, tag)
  SELECT ag.corretor_id,
         'Lembrete de visita: ' || ag.titulo,
         to_char(ag.data_inicio, 'DD/MM/YYYY HH24:MI') || COALESCE(' · ' || ag.local, ''),
         '/agendamentos',
         o.lbl || '-' || ag.id::text
  FROM public.agendamentos ag
  CROSS JOIN (VALUES
    ('lembrete-48h', interval '48 hours'),
    ('lembrete-24h', interval '24 hours'),
    ('lembrete-10h', interval '10 hours')
  ) AS o(lbl, janela)
  WHERE ag.tipo = 'visita'
    AND ag.status IN ('agendado','confirmado','remarcado')
    AND ag.deleted_at IS NULL
    AND ag.corretor_id IS NOT NULL
    AND ag.data_inicio > now()
    AND ag.data_inicio <= now() + o.janela
    AND NOT EXISTS (
      SELECT 1 FROM public.push_outbox po
      WHERE po.tag = o.lbl || '-' || ag.id::text
    );
END;
$$;

SELECT cron.schedule(
  'lembretes-visita',
  '*/5 * * * *',
  $$ SELECT public.gerar_pushes_lembretes_visita(); $$
);
