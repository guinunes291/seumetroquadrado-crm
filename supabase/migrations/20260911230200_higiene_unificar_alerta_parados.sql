-- ===========================================================================
-- Unifica a régua de "parado": o alerta diário passa a ler a MESMA definição
-- da tela de Higiene do Funil.
--
-- ESTA É A ÚNICA MIGRATION DA FATIA 1 QUE MUDA COMPORTAMENTO EM PRODUÇÃO.
-- Está sozinha no arquivo de propósito, para poder ser revertida sem derrubar
-- as views (20260911230100), que são só leitura.
--
-- ANTES: prazo 5 hardcoded, relógio COALESCE(ultima_interacao, created_at).
-- DEPOIS: prazo de higiene_config.dias_parado_min (default 5 — mesmo valor),
--         relógio public.higiene_dias_parado (= ...,ultimo_contato, created_at).
--
-- DELTA ESPERADO — duas componentes, em direções opostas:
--   (a) ENCOLHE: incluir ultimo_contato torna o relógio mais recente para
--       leads com ligação registrada e sem interação. Esses deixam de alertar.
--   (b) CRESCE UM POUCO: o corte muda de "> 5 dias" (interval) para
--       ">= 5 dias" (floor em dias inteiros), para ficar IDÊNTICO ao `parado`
--       de v_higiene_base — que é o objetivo da unificação. Leads no intervalo
--       [5d, 5d+resto) passam a alertar um ciclo antes. Como o job roda 1x/dia,
--       na prática isso antecipa o alerta de no máximo um dia.
-- Medir (a) e (b) com a consulta abaixo antes de aplicar; (a) tende a dominar.
--
-- MEDIR ANTES DE APLICAR (o número ANTES da regra 0.2.1):
--   SELECT count(*) FILTER (WHERE COALESCE(ultima_interacao, created_at)
--                                 < now() - interval '5 days') AS alertaveis_hoje,
--          count(*) FILTER (WHERE public.higiene_dias_parado(
--                                   ultima_interacao, ultimo_contato, created_at) >= 5
--                          ) AS alertaveis_depois
--     FROM public.leads
--    WHERE corretor_id IS NOT NULL AND deleted_at IS NULL AND na_lixeira = false
--      AND status NOT IN ('contrato_fechado','pos_venda','perdido');
--   -- A diferença entre as duas colunas é o delta real desta migration.
--
-- ROLLBACK: reaplicar 20260619123001_alertas_parados_e_lembretes_visita.sql
--   (bloco gerar_alertas_leads_parados), ou o CREATE OR REPLACE original:
--   ver supabase/migrations/20260619123001_alertas_parados_e_lembretes_visita.sql
--
-- NÃO MEXE no agendamento ('alertar-leads-parados', '0 11 * * *'), nem no
-- texto do link, nem na deduplicação por dia. Nada além da régua.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.gerar_alertas_leads_parados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dias integer := (SELECT dias_parado_min FROM public.higiene_config WHERE id);
BEGIN
  -- Defesa: se a config sumir, cai no valor histórico em vez de alertar a base
  -- inteira (dias NULL faria a comparação virar NULL e não alertar ninguém —
  -- falha silenciosa, que é justamente o que não queremos).
  _dias := COALESCE(_dias, 5);

  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id,
         'follow_up',
         'Lead parado: ' || l.nome,
         'Sem movimento há ' || _dias || '+ dias. Retome o contato.',
         '/leads/' || l.id::text,
         l.id
  FROM public.leads l
  WHERE l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND public.higiene_dias_parado(l.ultima_interacao, l.ultimo_contato, l.created_at) >= _dias
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = l.id
        AND a.tipo = 'follow_up'
        AND a.created_at::date = now()::date
    );
END;
$$;

COMMENT ON FUNCTION public.gerar_alertas_leads_parados() IS
  'Alerta diário de lead parado. Régua vinda de higiene_config + higiene_dias_parado — a MESMA que v_higiene_base usa, para que tela e alerta nunca divirjam.';
