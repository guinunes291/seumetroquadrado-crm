
-- Move confrontos para Quartas de Final, semana 5
UPDATE public.copa_confrontos
SET fase_id = '9fb5e5ae-dac6-4b90-969b-9c7bbbca01f7',
    semana_ref = 5
WHERE fase_id = '3dd9757e-00a9-4037-80af-09fcdcb2e94c';
