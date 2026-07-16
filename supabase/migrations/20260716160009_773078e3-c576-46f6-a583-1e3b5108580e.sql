UPDATE public.copa_fases SET semana_inicio = 7, semana_fim = 8 WHERE tipo = 'semifinal';
UPDATE public.copa_fases SET semana_inicio = 9, semana_fim = 9 WHERE tipo IN ('terceiro','final');