
-- Remover automações de pontuação da Copa: tudo passa a ser manual.

-- 1) Remover trigger de bônus W.O. automático em copa_confrontos
DROP TRIGGER IF EXISTS trg_copa_bonus_wo ON public.copa_confrontos;
DROP FUNCTION IF EXISTS public.copa_bonus_wo_trigger();

-- 2) Remover função de bônus finais (campeão/vice/3º/4º)
DROP FUNCTION IF EXISTS public.copa_aplicar_bonus_final(uuid);

-- 3) View semanal: o total passa a ser exatamente o que o admin digitou,
--    sem multiplicar por pesos automaticamente.
CREATE OR REPLACE VIEW public.copa_pontuacao_semanal
WITH (security_invoker=true) AS
SELECT
  cp.edicao_id, cp.corretor_id, pr.nome, cp.semana,
  cp.agendamentos, cp.visitas, cp.analise, cp.vendas,
  cp.total AS bonus, cp.observacao, cp.bonus_observacao,
  cp.total AS total_semana
FROM public.copa_pontuacoes cp
LEFT JOIN public.profiles pr ON pr.id = cp.corretor_id;

GRANT SELECT ON public.copa_pontuacao_semanal TO authenticated;
