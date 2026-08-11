-- Etapa nova no funil (pedido do dono, 2026-08-11): "Qualificação Corretor",
-- entre "Aguardando retorno" e "Em atendimento" — o corretor confirma perfil,
-- renda e urgência antes de assumir o atendimento de verdade.
--
-- Parte 1/2, no padrão da 20260619122000 (aguardando_retorno): ADD VALUE
-- precisa ser commitado antes de ser usado, então TODA a fiação (máquina de
-- estados, funil_ordem, kpis, inbox, score) fica na migration seguinte,
-- em transação separada. A ordem do enum não é a ordem comercial
-- (funil_ordem() é a fonte), então o valor entra no fim, como os anteriores.

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'qualificacao_corretor';
