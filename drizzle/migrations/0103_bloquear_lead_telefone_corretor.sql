CREATE OR REPLACE FUNCTION public.telefone_nacional_corretor(_telefone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  WITH d AS (SELECT regexp_replace(coalesce(_telefone, ''), '\D', '', 'g') AS valor),
  n AS (SELECT CASE WHEN length(valor) IN (12,13) AND left(valor,2) = '55' THEN substr(valor,3) ELSE valor END AS valor FROM d)
  SELECT CASE WHEN length(valor) IN (10,11) THEN valor ELSE NULL END FROM n;
$$;
REVOKE ALL ON FUNCTION public.telefone_nacional_corretor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telefone_nacional_corretor(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.impedir_telefone_corretor(_telefone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE _n text := public.telefone_nacional_corretor(_telefone);
BEGIN
  IF _n IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.telefone_nacional_corretor(p.telefone) = _n
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'corretor')
  ) THEN
    RAISE EXCEPTION 'Este telefone pertence a um corretor cadastrado e não pode ser usado em um cliente.' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.impedir_telefone_corretor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.impedir_telefone_corretor(text) TO service_role;

CREATE OR REPLACE FUNCTION public.validar_telefone_cliente(_telefone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.impedir_telefone_corretor(_telefone);
END;
$$;
REVOKE ALL ON FUNCTION public.validar_telefone_cliente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_telefone_cliente(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_leads_bloquear_telefone_corretor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  -- Archived history remains editable; restoring or creating a lead is guarded.
  IF TG_OP = 'UPDATE' AND (NEW.deleted_at IS NOT NULL OR coalesce(NEW.na_lixeira, false)) THEN
    RETURN NEW;
  END IF;
  PERFORM public.impedir_telefone_corretor(NEW.telefone);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_leads_bloquear_telefone_corretor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_leads_bloquear_telefone_corretor() TO service_role;
CREATE TRIGGER trg_leads_00_bloquear_telefone_corretor
BEFORE INSERT OR UPDATE OF telefone, deleted_at, na_lixeira ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_bloquear_telefone_corretor();
COMMENT ON FUNCTION public.impedir_telefone_corretor(text) IS 'Reject leads using a registered broker phone, including inactive brokers. Exact national phone comparison retains DDD and ignores formatting/DDI 55.';