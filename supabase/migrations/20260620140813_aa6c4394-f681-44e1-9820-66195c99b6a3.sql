REVOKE ALL ON FUNCTION public.leads_status_counts(boolean, text, text, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_status_counts(boolean, text, text, text, timestamptz, timestamptz, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_status_counts(boolean, text, text, text, timestamptz, timestamptz, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.leads_filtered(boolean, text, text, text, text, timestamptz, timestamptz, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_filtered(boolean, text, text, text, text, timestamptz, timestamptz, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_filtered(boolean, text, text, text, text, timestamptz, timestamptz, text, text, int, int) TO authenticated;