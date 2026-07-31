CREATE OR REPLACE FUNCTION public.create_oferta_ativa(_nome text, _descricao text, _filtros jsonb, _corretor uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _oferta_id uuid;
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.ofertas_ativas (nome, descricao, filtros, corretor_id, criado_por)
  VALUES (_nome, NULLIF(_descricao,''), COALESCE(_filtros,'{}'::jsonb), _corretor, _caller)
  RETURNING id INTO _oferta_id;

  -- O corretor destinatário define apenas o DONO da lista; o universo de leads
  -- vem só dos filtros (igual à prévia mostrada na tela de criação).
  INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
  SELECT _oferta_id, l.id, false
  FROM public._oferta_ativa_query(_filtros, NULL) l
  ON CONFLICT DO NOTHING;

  RETURN _oferta_id;
END;
$function$;

-- Backfill da lista criada vazia por causa do bug acima.
INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
SELECT '0421abc0-6046-443f-ad53-d9c9321c2501'::uuid, l.id, false
FROM public.leads l
WHERE l.deleted_at IS NULL AND l.na_lixeira = false
  AND l.status::text = 'aguardando_atendimento'
  AND l.projeto_id = ANY(ARRAY['3f889eee-ec2b-4eeb-a9bc-48e2d9a148c4','03343a60-4660-431b-92da-3922600b05d6','aec02d7b-8680-4a98-8903-2df95aab28a9','c53c4cec-975a-4e83-a25a-dfd054d82368']::uuid[])
ON CONFLICT DO NOTHING;