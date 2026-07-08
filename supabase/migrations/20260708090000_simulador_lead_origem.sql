-- Origem 'simulador' para leads criados pelo webhook do Simulador
-- Aluguel vs. Parcela (POST /api/public/webhooks/simulacao).
--
-- Fica em arquivo próprio: um valor novo de enum não pode ser usado na mesma
-- transação em que foi adicionado, e cada migration roda em transação própria.
ALTER TYPE public.lead_origem ADD VALUE IF NOT EXISTS 'simulador';
