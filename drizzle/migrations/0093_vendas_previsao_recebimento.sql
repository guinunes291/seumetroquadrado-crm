ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS previsao_recebimento date;
COMMENT ON COLUMN public.vendas.previsao_recebimento IS 'Mês previsto para recebimento da construtora (sempre dia 1 do mês).';
NOTIFY pgrst, 'reload schema';