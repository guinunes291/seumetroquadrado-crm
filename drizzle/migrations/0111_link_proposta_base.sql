ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS modelo text NOT NULL DEFAULT 'proposta' CHECK (modelo IN ('apresentacao','proposta')),
  ADD COLUMN IF NOT EXISTS token_hash text UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS versao_atual integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS revogado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceita_em timestamptz,
  ADD COLUMN IF NOT EXISTS primeira_abertura_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS total_aberturas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_requisicoes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_janela_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS limite_janela_requisicoes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agendamento_link_id uuid REFERENCES public.agendamento_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criado_por uuid;
COMMENT ON COLUMN public.propostas.link_token IS 'DEPRECATED: substituido por token_hash (o token bruto nunca e guardado)';

CREATE TABLE public.proposta_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposta_id, numero)
);
CREATE TABLE public.proposta_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  chave text NOT NULL CHECK (chave ~ '^[A-Za-z0-9_-]{16,64}$'),
  numero_abertura integer NOT NULL,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_sinal_em timestamptz NOT NULL DEFAULT now(),
  encerrada_em timestamptz,
  aparelho text,
  navegador text,
  tempo_total_s integer NOT NULL DEFAULT 0,
  profundidade_max smallint NOT NULL DEFAULT 0,
  tempo_por_secao jsonb NOT NULL DEFAULT '{}'::jsonb,
  aviso_enviado_em timestamptz
);
CREATE INDEX proposta_sessoes_ativas ON public.proposta_sessoes (proposta_id, chave, ultimo_sinal_em DESC);
CREATE INDEX proposta_sessoes_abertas ON public.proposta_sessoes (ultimo_sinal_em) WHERE encerrada_em IS NULL;
CREATE TABLE public.proposta_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  sessao_id uuid REFERENCES public.proposta_sessoes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('abertura','secao_vista','clique_whatsapp','clique_mapa','fluxo_visto','visita_pedida','aceite')),
  secao text CHECK (secao IS NULL OR length(secao) <= 40),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 80),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposta_id, idempotency_key)
);
CREATE TABLE public.proposta_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL UNIQUE REFERENCES public.propostas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  opcao_fluxo smallint NOT NULL CHECK (opcao_fluxo BETWEEN 1 AND 3),
  nome_completo text NOT NULL CHECK (length(nome_completo) BETWEEN 5 AND 160),
  cpf_hash text NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$'),
  cpf_final text NOT NULL CHECK (cpf_final ~ '^[0-9]{3}$'),
  ip text,
  user_agent text,
  snapshot_hash text NOT NULL,
  aceito_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.proposta_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('sessao','aceite','visita')),
  referencia text NOT NULL,
  mensagem text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  UNIQUE (tipo, referencia)
);

GRANT SELECT ON public.proposta_versoes, public.proposta_sessoes, public.proposta_eventos, public.proposta_aceites TO authenticated;
GRANT ALL ON public.proposta_versoes, public.proposta_sessoes, public.proposta_eventos, public.proposta_aceites, public.proposta_avisos TO service_role;
ALTER TABLE public.proposta_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_aceites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_avisos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pode_ver_proposta(_user_id uuid, _proposta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.propostas p
     WHERE p.id = _proposta_id AND p.deleted_at IS NULL
       AND public.is_active_member(_user_id)
       AND ((p.lead_id IS NOT NULL AND public.pode_acessar_lead(_user_id, p.lead_id))
         OR (p.lead_id IS NULL AND public.pode_acessar_corretor(_user_id, p.corretor_id)))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.pode_ver_proposta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_proposta(uuid, uuid) TO authenticated, service_role;

CREATE POLICY proposta_versoes_select ON public.proposta_versoes FOR SELECT TO authenticated USING (public.pode_ver_proposta(auth.uid(), proposta_id));
CREATE POLICY proposta_sessoes_select ON public.proposta_sessoes FOR SELECT TO authenticated USING (public.pode_ver_proposta(auth.uid(), proposta_id));
CREATE POLICY proposta_eventos_select ON public.proposta_eventos FOR SELECT TO authenticated USING (public.pode_ver_proposta(auth.uid(), proposta_id));
CREATE POLICY proposta_aceites_select ON public.proposta_aceites FOR SELECT TO authenticated USING (public.pode_ver_proposta(auth.uid(), proposta_id));

-- Corretor: criar
CREATE OR REPLACE FUNCTION public.criar_proposta_link(_ator_id uuid, _lead_id uuid, _modelo text, _projeto_id uuid, _token_hash text, _expira_em timestamptz, _snapshot jsonb, _snapshot_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _id uuid; _corretor uuid;
BEGIN
  IF _ator_id IS NULL OR NOT public.is_active_member(_ator_id) OR NOT public.pode_acessar_lead(_ator_id, _lead_id) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _modelo NOT IN ('apresentacao','proposta') OR lower(_token_hash) !~ '^[0-9a-f]{64}$'
     OR lower(_snapshot_hash) !~ '^[0-9a-f]{64}$' OR jsonb_typeof(_snapshot) <> 'object'
     OR _expira_em <= now() OR _expira_em > now() + interval '60 days' THEN
    RAISE EXCEPTION 'proposta_invalida' USING ERRCODE = '22023';
  END IF;
  SELECT corretor_id INTO _corretor FROM public.leads WHERE id = _lead_id;
  INSERT INTO public.propostas (lead_id, corretor_id, projeto_id, modelo, token_hash, expira_em, validade, status, versao_atual, criado_por)
  VALUES (_lead_id, coalesce(_corretor, _ator_id), _projeto_id, _modelo, lower(_token_hash), _expira_em, _expira_em, 'enviada', 1, _ator_id)
  RETURNING id INTO _id;
  INSERT INTO public.proposta_versoes (proposta_id, numero, snapshot, snapshot_hash, criado_por)
  VALUES (_id, 1, _snapshot, lower(_snapshot_hash), _ator_id);
  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'proposta_enviada',
          CASE WHEN _modelo = 'proposta' THEN 'Link de proposta gerado' ELSE 'Link de apresentação gerado' END,
          'link_proposta', jsonb_build_object('proposta_id', _id, 'modelo', _modelo));
  RETURN _id;
END $$;

-- Corretor: nova versão (mesmo link)
CREATE OR REPLACE FUNCTION public.publicar_versao_proposta(_ator_id uuid, _proposta_id uuid, _snapshot jsonb, _snapshot_hash text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _n integer;
BEGIN
  IF _ator_id IS NULL OR NOT public.pode_ver_proposta(_ator_id, _proposta_id) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _p FROM public.propostas WHERE id = _proposta_id FOR UPDATE;
  IF _p.aceita_em IS NOT NULL OR _p.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'proposta_travada' USING ERRCODE = '22023';
  END IF;
  IF lower(_snapshot_hash) !~ '^[0-9a-f]{64}$' OR jsonb_typeof(_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'proposta_invalida' USING ERRCODE = '22023';
  END IF;
  _n := _p.versao_atual + 1;
  INSERT INTO public.proposta_versoes (proposta_id, numero, snapshot, snapshot_hash, criado_por)
  VALUES (_proposta_id, _n, _snapshot, lower(_snapshot_hash), _ator_id);
  UPDATE public.propostas SET versao_atual = _n, updated_at = now() WHERE id = _proposta_id;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.revogar_proposta_link(_ator_id uuid, _proposta_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
BEGIN
  IF _ator_id IS NULL OR NOT public.pode_ver_proposta(_ator_id, _proposta_id) THEN
    RAISE EXCEPTION 'proposta_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.propostas SET revogado_em = now(), status = 'revogada', updated_at = now()
   WHERE id = _proposta_id AND revogado_em IS NULL AND aceita_em IS NULL;
  RETURN FOUND;
END $$;

-- Público (via servidor): limite de requisições
CREATE OR REPLACE FUNCTION public.consumir_proposta_requisicao(_token_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _agora timestamptz := clock_timestamp(); _inicio timestamptz; _q integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN RETURN 'not_found'; END IF;
  SELECT * INTO _p FROM public.propostas WHERE token_hash = lower(_token_hash) AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _p.total_requisicoes >= 20000 THEN RETURN 'exhausted'; END IF;
  IF _p.limite_janela_inicio IS NULL OR _p.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora; _q := 1;
  ELSE _inicio := _p.limite_janela_inicio; _q := _p.limite_janela_requisicoes + 1; END IF;
  IF _q > 120 THEN RETURN 'rate_limited'; END IF;
  UPDATE public.propostas SET limite_janela_inicio = _inicio, limite_janela_requisicoes = _q, total_requisicoes = total_requisicoes + 1 WHERE id = _p.id;
  RETURN 'allowed';
END $$;

-- Público: conteúdo (snapshot da versão atual, sem dados pessoais do lead)
CREATE OR REPLACE FUNCTION public.obter_proposta_publica(_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _v public.proposta_versoes%ROWTYPE; _a public.proposta_aceites%ROWTYPE; _estado text;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO _p FROM public.propostas WHERE token_hash = lower(_token_hash) AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  _estado := CASE WHEN _p.aceita_em IS NOT NULL THEN 'aceita' WHEN _p.revogado_em IS NOT NULL THEN 'revogada'
                  WHEN _p.expira_em <= now() THEN 'expirada' ELSE 'ativa' END;
  IF _estado IN ('revogada') THEN RETURN jsonb_build_object('estado', _estado); END IF;
  SELECT * INTO _v FROM public.proposta_versoes WHERE proposta_id = _p.id AND numero = _p.versao_atual;
  SELECT * INTO _a FROM public.proposta_aceites WHERE proposta_id = _p.id;
  RETURN jsonb_build_object(
    'estado', _estado, 'modelo', _p.modelo, 'versao', _v.numero, 'expira_em', _p.expira_em,
    'snapshot', _v.snapshot, 'snapshot_hash', _v.snapshot_hash,
    'aceite', CASE WHEN _a.id IS NULL THEN NULL ELSE jsonb_build_object(
      'opcao_fluxo', _a.opcao_fluxo, 'nome_completo', _a.nome_completo, 'cpf_final', _a.cpf_final,
      'aceito_em', _a.aceito_em, 'snapshot_hash', _a.snapshot_hash) END);
END $$;

-- Público: sinal de leitura (abertura, heartbeat, eventos)
CREATE OR REPLACE FUNCTION public.registrar_proposta_sinal(_token_hash text, _chave text, _aparelho text, _navegador text, _tempo_total_s integer, _profundidade smallint, _tempo_por_secao jsonb, _eventos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _s public.proposta_sessoes%ROWTYPE; _agora timestamptz := now(); _nova boolean := false; _ev jsonb;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' OR _chave !~ '^[A-Za-z0-9_-]{16,64}$' THEN RETURN NULL; END IF;
  SELECT * INTO _p FROM public.propostas WHERE token_hash = lower(_token_hash) AND deleted_at IS NULL AND revogado_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _s FROM public.proposta_sessoes
   WHERE proposta_id = _p.id AND chave = _chave AND encerrada_em IS NULL AND ultimo_sinal_em > _agora - interval '30 minutes'
   ORDER BY ultimo_sinal_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    _nova := true;
    UPDATE public.proposta_sessoes SET encerrada_em = ultimo_sinal_em WHERE proposta_id = _p.id AND chave = _chave AND encerrada_em IS NULL;
    INSERT INTO public.proposta_sessoes (proposta_id, versao, chave, numero_abertura, aparelho, navegador)
    VALUES (_p.id, _p.versao_atual, _chave, _p.total_aberturas + 1, left(_aparelho, 40), left(_navegador, 40))
    RETURNING * INTO _s;
    UPDATE public.propostas SET total_aberturas = total_aberturas + 1,
      primeira_abertura_em = coalesce(primeira_abertura_em, _agora) WHERE id = _p.id;
    IF _p.primeira_abertura_em IS NULL AND _p.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_p.lead_id, 'proposta_aberta', 'Cliente abriu o link pela primeira vez', 'link_proposta', jsonb_build_object('proposta_id', _p.id));
    END IF;
  END IF;
  UPDATE public.proposta_sessoes SET
    ultimo_sinal_em = _agora,
    tempo_total_s = greatest(tempo_total_s, least(coalesce(_tempo_total_s, 0), 14400)),
    profundidade_max = greatest(profundidade_max, least(greatest(coalesce(_profundidade, 0), 0), 100)),
    tempo_por_secao = CASE WHEN jsonb_typeof(_tempo_por_secao) = 'object' THEN _tempo_por_secao ELSE tempo_por_secao END
  WHERE id = _s.id;
  UPDATE public.propostas SET ultimo_acesso_em = _agora WHERE id = _p.id;
  IF jsonb_typeof(_eventos) = 'array' THEN
    FOR _ev IN SELECT * FROM jsonb_array_elements(_eventos) LIMIT 20 LOOP
      BEGIN
        INSERT INTO public.proposta_eventos (proposta_id, sessao_id, tipo, secao, idempotency_key)
        VALUES (_p.id, _s.id, _ev->>'tipo', left(_ev->>'secao', 40), _ev->>'chave')
        ON CONFLICT (proposta_id, idempotency_key) DO NOTHING;
      EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('sessao_id', _s.id, 'nova', _nova);
END $$;

-- Público: aceite digital
CREATE OR REPLACE FUNCTION public.aceitar_proposta(_token_hash text, _opcao smallint, _nome text, _cpf_hash text, _cpf_final text, _ip text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _v public.proposta_versoes%ROWTYPE; _n_opcoes integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'not_found'); END IF;
  SELECT * INTO _p FROM public.propostas WHERE token_hash = lower(_token_hash) AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR _p.revogado_em IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'not_found'); END IF;
  IF _p.modelo <> 'proposta' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_permitido'); END IF;
  IF _p.aceita_em IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aceita'); END IF;
  IF _p.expira_em <= now() THEN RETURN jsonb_build_object('ok', false, 'motivo', 'expirada'); END IF;
  SELECT * INTO _v FROM public.proposta_versoes WHERE proposta_id = _p.id AND numero = _p.versao_atual;
  _n_opcoes := coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(_v.snapshot->'fluxos') = 'array' THEN _v.snapshot->'fluxos' END), 0);
  IF _opcao IS NULL OR _opcao < 1 OR _opcao > _n_opcoes THEN RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input'); END IF;
  INSERT INTO public.proposta_aceites (proposta_id, versao, opcao_fluxo, nome_completo, cpf_hash, cpf_final, ip, user_agent, snapshot_hash)
  VALUES (_p.id, _v.numero, _opcao, btrim(_nome), lower(_cpf_hash), _cpf_final, left(_ip, 64), left(_user_agent, 300), _v.snapshot_hash);
  UPDATE public.propostas SET aceita_em = now(), status = 'aceita', updated_at = now() WHERE id = _p.id;
  INSERT INTO public.proposta_eventos (proposta_id, tipo, idempotency_key) VALUES (_p.id, 'aceite', 'aceite-' || _p.id::text) ON CONFLICT DO NOTHING;
  IF _p.lead_id IS NOT NULL THEN
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_p.lead_id, 'proposta_aceita', 'Cliente aceitou a proposta (opção ' || _opcao || ')', 'link_proposta',
            jsonb_build_object('proposta_id', _p.id, 'versao', _v.numero, 'opcao', _opcao));
  END IF;
  RETURN jsonb_build_object('ok', true, 'aceito_em', now(), 'snapshot_hash', _v.snapshot_hash, 'corretor_id', _p.corretor_id, 'proposta_id', _p.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.criar_proposta_link(uuid,uuid,text,uuid,text,timestamptz,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publicar_versao_proposta(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revogar_proposta_link(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consumir_proposta_requisicao(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.obter_proposta_publica(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_proposta_sinal(text,text,text,text,integer,smallint,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aceitar_proposta(text,smallint,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_proposta_link(uuid,uuid,text,uuid,text,timestamptz,jsonb,text), public.publicar_versao_proposta(uuid,uuid,jsonb,text), public.revogar_proposta_link(uuid,uuid), public.consumir_proposta_requisicao(text), public.obter_proposta_publica(text), public.registrar_proposta_sinal(text,text,text,text,integer,smallint,jsonb,jsonb), public.aceitar_proposta(text,smallint,text,text,text,text,text) TO service_role;
