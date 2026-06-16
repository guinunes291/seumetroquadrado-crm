-- Correção: "invalid input value for enum distribuicao_tipo: 'redistribuicao'"
-- ao distribuir/redistribuir leads (botão "Rodar agora" → processar_distribuicao_automatica
-- → redistribuir_leads_parados, que grava tipo='redistribuicao' em distribution_log).
-- O enum nunca teve esse valor. Adiciona-o (idempotente).
ALTER TYPE public.distribuicao_tipo ADD VALUE IF NOT EXISTS 'redistribuicao';
