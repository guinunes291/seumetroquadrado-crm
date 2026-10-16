ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS previsao_recebimento date;
NOTIFY pgrst, 'reload schema';