ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS revogado_por uuid;

DROP POLICY IF EXISTS propostas_update_carteira ON public.propostas;
DROP POLICY IF EXISTS propostas_insert_carteira ON public.propostas;
REVOKE INSERT, UPDATE, DELETE ON public.propostas FROM authenticated, anon;
GRANT SELECT ON public.propostas TO authenticated;
GRANT ALL ON public.propostas TO service_role;

CREATE OR REPLACE FUNCTION public.revogar_proposta(_ator_id uuid, _proposta_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE;
BEGIN
  IF _ator_id IS NULL OR NOT public.is_active_member(_ator_id) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _p FROM public.propostas WHERE id = _proposta_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT (_p.corretor_id = _ator_id
          OR public.has_role(_ator_id, 'admin')
          OR (public.has_role(_ator_id, 'gestor') AND public.pode_ver_proposta(_ator_id, _proposta_id))) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _p.revogado_em IS NOT NULL OR _p.aceita_em IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.propostas SET revogado_em = now(), revogado_por = _ator_id, status = 'revogada', updated_at = now()
   WHERE id = _proposta_id;
  IF _p.lead_id IS NOT NULL THEN
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_p.lead_id, 'proposta_revogada',
            CASE WHEN _p.modelo = 'proposta' THEN 'Link de proposta revogado' ELSE 'Link de apresentação revogado' END,
            'link_proposta', jsonb_build_object('proposta_id', _p.id, 'revogado_por', _ator_id));
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.revogar_proposta(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_proposta(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.revogar_proposta_link(uuid, uuid) IS 'DEPRECATED: substituida por revogar_proposta';
REVOKE EXECUTE ON FUNCTION public.revogar_proposta_link(uuid, uuid) FROM service_role;