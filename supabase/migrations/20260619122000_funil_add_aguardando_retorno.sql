-- Funil novo de 7 etapas (parte 1/2): adiciona o único valor de status novo.
-- "Venda" será apenas o rótulo de exibição de 'contrato_fechado' (no frontend),
-- então não criamos um valor 'venda' aqui — isso mantém intactos os ~15
-- objetos SQL (KPIs, comissão, distribuição) que dependem de 'contrato_fechado'.
--
-- ADD VALUE precisa ser commitado antes de ser usado: o remap dos dados que usa
-- o funil fica na migration seguinte (transação separada).

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'aguardando_retorno';
