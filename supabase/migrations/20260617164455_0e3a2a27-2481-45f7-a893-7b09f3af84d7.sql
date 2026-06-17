
-- 1) Tabela principal
CREATE TABLE public.ofertas_ativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('rascunho','ativa','concluida','arquivada')),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofertas_ativas TO authenticated;
GRANT ALL ON public.ofertas_ativas TO service_role;

ALTER TABLE public.ofertas_ativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oa_select" ON public.ofertas_ativas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR corretor_id = auth.uid()
  OR criado_por = auth.uid()
);

CREATE POLICY "oa_insert" ON public.ofertas_ativas FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "oa_update" ON public.ofertas_ativas FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "oa_delete" ON public.ofertas_ativas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_ofertas_ativas_updated_at
BEFORE UPDATE ON public.ofertas_ativas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Tabela de associação
CREATE TABLE public.oferta_ativa_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id uuid NOT NULL REFERENCES public.ofertas_ativas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  contatado boolean NOT NULL DEFAULT false,
  contatado_em timestamptz,
  avancado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oferta_id, lead_id)
);

CREATE INDEX idx_oal_oferta ON public.oferta_ativa_leads(oferta_id);
CREATE INDEX idx_oal_lead ON public.oferta_ativa_leads(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oferta_ativa_leads TO authenticated;
GRANT ALL ON public.oferta_ativa_leads TO service_role;

ALTER TABLE public.oferta_ativa_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oal_select" ON public.oferta_ativa_leads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ofertas_ativas o
    WHERE o.id = oferta_id
      AND (
        public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'gestor')
        OR o.corretor_id = auth.uid()
        OR o.criado_por = auth.uid()
      )
  )
);

CREATE POLICY "oal_insert" ON public.oferta_ativa_leads FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "oal_update" ON public.oferta_ativa_leads FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR EXISTS (SELECT 1 FROM public.ofertas_ativas o WHERE o.id = oferta_id AND o.corretor_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'gestor')
  OR EXISTS (SELECT 1 FROM public.ofertas_ativas o WHERE o.id = oferta_id AND o.corretor_id = auth.uid())
);

CREATE POLICY "oal_delete" ON public.oferta_ativa_leads FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- 3) Função: query SQL dinâmico para os filtros (interna)
CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _sem_dias int;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]'::jsonb)));
  _temps    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]'::jsonb)));
  _projetos := ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'::jsonb)))::uuid);
  _origens  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]'::jsonb)));
  _sem_dias := NULLIF(_filtros->>'semInteracaoHaDias','')::int;

  RETURN QUERY
  SELECT l.* FROM public.leads l
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_corretor IS NULL OR l.corretor_id = _corretor)
    AND (COALESCE(array_length(_statuses,1),0) = 0 OR l.status::text = ANY(_statuses))
    AND (COALESCE(array_length(_temps,1),0) = 0 OR l.temperatura::text = ANY(_temps))
    AND (COALESCE(array_length(_projetos,1),0) = 0 OR l.projeto_id = ANY(_projetos))
    AND (COALESCE(array_length(_origens,1),0) = 0 OR l.origem::text = ANY(_origens))
    AND (
      _sem_dias IS NULL
      OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - (_sem_dias || ' days')::interval
    );
END;
$$;

-- 4) Preview RPC
CREATE OR REPLACE FUNCTION public.preview_oferta_ativa(_filtros jsonb, _corretor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean;
  _scope uuid;
  _count int;
  _sample jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _is_gestor := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor');
  _scope := CASE WHEN _is_gestor THEN _corretor ELSE _caller END;

  SELECT count(*) INTO _count FROM public._oferta_ativa_query(_filtros, _scope);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome)), '[]'::jsonb)
  INTO _sample
  FROM (
    SELECT id, nome FROM public._oferta_ativa_query(_filtros, _scope)
    ORDER BY created_at DESC LIMIT 5
  ) s;

  RETURN jsonb_build_object('count', _count, 'sample', _sample);
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_oferta_ativa(jsonb, uuid) TO authenticated;

-- 5) Create oferta + popular leads
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
         l.status IN ('agendado','qualificado','visita_realizada','analise_credito','contrato_fechado')
  FROM public._oferta_ativa_query(_filtros, _corretor) l
  ON CONFLICT DO NOTHING;

  RETURN _oferta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_oferta_ativa(text, text, jsonb, uuid) TO authenticated;
