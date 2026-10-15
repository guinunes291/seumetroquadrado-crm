-- Origem do lead que chega pelo link de documentação do corretor
-- (20261024120000_link_documentacao_cliente). Em migration própria, como as
-- outras origens: o valor novo de um enum só pode ser USADO depois que a
-- transação que o criou termina.
ALTER TYPE public.lead_origem ADD VALUE IF NOT EXISTS 'documentacao_self_service';
