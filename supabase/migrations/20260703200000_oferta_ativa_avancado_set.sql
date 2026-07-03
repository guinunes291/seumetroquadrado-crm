-- Oferta Ativa: alinha o conjunto de status "avançado" gravado no snapshot de
-- criação com o funil completo (inclui os legados proposta_enviada e pos_venda,
-- que ainda existem em leads antigos). O front deriva "avançado" ao vivo do
-- status atual do lead com o mesmo conjunto (AVANCADO_STATUSES em
-- src/lib/oferta-ativa.ts); a coluna permanece como fallback para vínculos cujo
-- lead saiu do escopo (excluído/transferido).
CREATE OR REPLACE FUNCTION public.create_oferta_ativa(_nome text, _descricao text, _filtros jsonb, _corretor uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
  SELECT _oferta_id, l.id,
         l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda')
  FROM public._oferta_ativa_query(_filtros, _corretor) l
  ON CONFLICT DO NOTHING;

  RETURN _oferta_id;
END;
$$;
