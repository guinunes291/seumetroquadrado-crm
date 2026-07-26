ALTER TYPE public.api_cliente_escopo ADD VALUE IF NOT EXISTS 'commissions:write:beneficiary';
ALTER TABLE public.api_alteracao_auditoria ADD COLUMN IF NOT EXISTS motivo text;