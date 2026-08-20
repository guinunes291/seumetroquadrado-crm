DELETE FROM public.alertas WHERE created_at < now() - interval '30 days';
ANALYZE public.alertas;