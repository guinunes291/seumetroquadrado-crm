CREATE TABLE IF NOT EXISTS public.proposta_aviso_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  template_nome text NOT NULL DEFAULT 'smq_atualizacao_cliente',
  template_idioma text NOT NULL DEFAULT 'pt_BR',
  template_aprovado boolean NOT NULL DEFAULT false,
  fallback_push_apos_min integer NOT NULL DEFAULT 10 CHECK (fallback_push_apos_min BETWEEN 2 AND 120),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.proposta_aviso_config (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.proposta_aviso_config TO authenticated;
GRANT ALL ON public.proposta_aviso_config TO service_role;
ALTER TABLE public.proposta_aviso_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposta_aviso_config_select ON public.proposta_aviso_config FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()));

ALTER TABLE public.proposta_avisos
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS template_parametros jsonb,
  ADD COLUMN IF NOT EXISTS reivindicado_em timestamptz,
  ADD COLUMN IF NOT EXISTS push_outbox_id uuid;

CREATE OR REPLACE FUNCTION public._proposta_rotulo_secao(_s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s WHEN 'capa' THEN 'Capa' WHEN 'corretor' THEN 'Seu corretor' WHEN 'empreendimento' THEN 'Empreendimento'
    WHEN 'diferenciais' THEN 'Diferenciais' WHEN 'localizacao' THEN 'Localização' WHEN 'plantas' THEN 'Plantas'
    WHEN 'unidade' THEN 'Sua unidade' WHEN 'fluxo' THEN 'Fluxo de pagamento' WHEN 'validade' THEN 'Validade'
    WHEN 'aceite' THEN 'Aceite' WHEN 'visita' THEN 'Visita' ELSE _s END
$$;

-- Decide o canal e enfileira. Dentro da janela de 24h da Sami: texto livre (o n8n busca).
-- Fora: template se aprovado; senão push direto. Nunca em silêncio: tudo fica em proposta_avisos.
CREATE OR REPLACE FUNCTION public._proposta_enfileirar_aviso(_proposta_id uuid, _tipo text, _referencia text, _mensagem text, _resumo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _p public.propostas%ROWTYPE; _cfg public.proposta_aviso_config%ROWTYPE; _tel text; _nome text; _cli text; _proj text;
        _janela boolean; _canal text; _id uuid; _push uuid;
BEGIN
  SELECT * INTO _p FROM public.propostas WHERE id = _proposta_id;
  IF NOT FOUND OR _p.corretor_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _cfg FROM public.proposta_aviso_config WHERE id;
  SELECT regexp_replace(coalesce(telefone,''), '\D', '', 'g'), split_part(coalesce(nome,''), ' ', 1) INTO _tel, _nome
    FROM public.profiles WHERE id = _p.corretor_id;
  IF length(_tel) IN (10, 11) THEN _tel := '55' || _tel; ELSIF length(_tel) NOT IN (12, 13) THEN _tel := NULL; END IF;
  SELECT v.snapshot->>'cliente_primeiro_nome', v.snapshot->'projeto'->>'nome' INTO _cli, _proj
    FROM public.proposta_versoes v WHERE v.proposta_id = _p.id AND v.numero = _p.versao_atual;
  _janela := EXISTS (SELECT 1 FROM public.samiq_canal_mensagens m WHERE m.user_id = _p.corretor_id AND m.chegou_em > now() - interval '23 hours 50 minutes');
  _canal := CASE WHEN _tel IS NOT NULL AND _janela THEN 'sami_texto'
                 WHEN _tel IS NOT NULL AND _cfg.template_aprovado THEN 'sami_template'
                 ELSE 'push' END;
  INSERT INTO public.proposta_avisos (proposta_id, corretor_id, tipo, referencia, mensagem, canal, status, telefone, template_parametros, ultimo_erro)
  VALUES (_p.id, _p.corretor_id, _tipo, _referencia, _mensagem, _canal, 'pendente',
          CASE WHEN _canal <> 'push' THEN _tel END,
          jsonb_build_array(coalesce(nullif(_nome,''),'corretor'), coalesce(_cli,'Cliente'), coalesce(_proj,'empreendimento'), _resumo),
          CASE WHEN _tel IS NULL THEN 'corretor sem telefone no perfil: aviso por push'
               WHEN NOT _janela AND NOT _cfg.template_aprovado THEN 'fora da janela de 24h e template ainda não aprovado: aviso por push' END)
  ON CONFLICT (tipo, referencia) DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NOT NULL AND _canal = 'push' THEN
    INSERT INTO public.push_outbox (user_id, title, body, url, tag)
    VALUES (_p.corretor_id, 'Link de proposta', _mensagem, CASE WHEN _p.lead_id IS NOT NULL THEN '/leads/' || _p.lead_id END, 'proposta-' || _p.id)
    RETURNING id INTO _push;
    UPDATE public.proposta_avisos SET status = 'enviado', enviado_em = now(), push_outbox_id = _push, tentativas = 1 WHERE id = _id;
  END IF;
  RETURN _id;
END $$;

-- Varredura (cron 5 min): uma mensagem por sessão encerrada (sem sinal há 10+ min) e fallback para push.
CREATE OR REPLACE FUNCTION public.proposta_avisos_varrer() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _s record; _n integer := 0; _top text; _tempo text; _msg text; _cfg public.proposta_aviso_config%ROWTYPE; _a record; _push uuid;
BEGIN
  SELECT * INTO _cfg FROM public.proposta_aviso_config WHERE id;
  FOR _s IN
    SELECT s.*, p.modelo, v.snapshot->>'cliente_primeiro_nome' AS cli, v.snapshot->'projeto'->>'nome' AS proj
      FROM public.proposta_sessoes s
      JOIN public.propostas p ON p.id = s.proposta_id AND p.deleted_at IS NULL
      JOIN public.proposta_versoes v ON v.proposta_id = p.id AND v.numero = s.versao
     WHERE s.aviso_enviado_em IS NULL AND s.ultimo_sinal_em < now() - interval '10 minutes'
       AND s.iniciado_em > now() - interval '2 days'
     ORDER BY s.ultimo_sinal_em LIMIT 200
     FOR UPDATE OF s SKIP LOCKED
  LOOP
    SELECT key INTO _top FROM jsonb_each_text(_s.tempo_por_secao) ORDER BY (value)::numeric DESC LIMIT 1;
    _tempo := CASE WHEN _s.tempo_total_s >= 3600 THEN to_char(make_interval(secs => _s.tempo_total_s), 'HH24:MI:SS')
                   ELSE to_char(make_interval(secs => _s.tempo_total_s), 'MI:SS') END;
    _msg := coalesce(_s.cli, 'O cliente') || ' abriu ' || CASE WHEN _s.modelo = 'proposta' THEN 'a proposta' ELSE 'a apresentação' END
            || ' do ' || coalesce(_s.proj, 'empreendimento') || ' agora. Ficou ' || _tempo
            || CASE WHEN _top IS NOT NULL THEN ', mais tempo em ' || public._proposta_rotulo_secao(_top) ELSE '' END
            || '. ' || _s.numero_abertura || 'ª abertura.';
    PERFORM public._proposta_enfileirar_aviso(_s.proposta_id, 'sessao', _s.id::text, _msg,
            'abriu o link (' || _tempo || ', ' || _s.numero_abertura || 'ª abertura)');
    UPDATE public.proposta_sessoes SET aviso_enviado_em = now(), encerrada_em = coalesce(encerrada_em, ultimo_sinal_em) WHERE id = _s.id;
    _n := _n + 1;
  END LOOP;
  -- WhatsApp que o canal não buscou/confirmou a tempo vira push.
  FOR _a IN SELECT a.*, p.lead_id FROM public.proposta_avisos a JOIN public.propostas p ON p.id = a.proposta_id
             WHERE a.status = 'pendente' AND a.canal IN ('sami_texto','sami_template')
               AND a.criado_em < now() - make_interval(mins => _cfg.fallback_push_apos_min)
             FOR UPDATE OF a SKIP LOCKED LOOP
    INSERT INTO public.push_outbox (user_id, title, body, url, tag)
    VALUES (_a.corretor_id, 'Link de proposta', _a.mensagem, CASE WHEN _a.lead_id IS NOT NULL THEN '/leads/' || _a.lead_id END, 'proposta-' || _a.proposta_id)
    RETURNING id INTO _push;
    UPDATE public.proposta_avisos SET canal = 'push', status = 'enviado', enviado_em = now(), push_outbox_id = _push,
      ultimo_erro = coalesce(ultimo_erro || ' | ', '') || 'WhatsApp não confirmado em ' || _cfg.fallback_push_apos_min || ' min: enviado por push'
     WHERE id = _a.id;
  END LOOP;
  RETURN _n;
END $$;

-- Canal da Sami (n8n): busca pendentes e devolve o resultado.
CREATE OR REPLACE FUNCTION public.proposta_avisos_reivindicar(_limite integer DEFAULT 20)
RETURNS SETOF public.proposta_avisos LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
  UPDATE public.proposta_avisos a SET reivindicado_em = now(), tentativas = a.tentativas + 1
   WHERE a.id IN (SELECT id FROM public.proposta_avisos
                   WHERE status = 'pendente' AND canal IN ('sami_texto','sami_template')
                     AND (reivindicado_em IS NULL OR reivindicado_em < now() - interval '2 minutes')
                   ORDER BY criado_em LIMIT least(greatest(coalesce(_limite, 20), 1), 50)
                   FOR UPDATE SKIP LOCKED)
  RETURNING a.*
$$;

CREATE OR REPLACE FUNCTION public.proposta_aviso_resultado(_id uuid, _ok boolean, _erro text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _a public.proposta_avisos%ROWTYPE; _lead uuid; _push uuid;
BEGIN
  SELECT * INTO _a FROM public.proposta_avisos WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _a.status <> 'pendente' THEN RETURN 'ignorado'; END IF;
  IF _ok THEN
    UPDATE public.proposta_avisos SET status = 'enviado', enviado_em = now() WHERE id = _id;
    RETURN 'enviado';
  END IF;
  SELECT lead_id INTO _lead FROM public.propostas WHERE id = _a.proposta_id;
  INSERT INTO public.push_outbox (user_id, title, body, url, tag)
  VALUES (_a.corretor_id, 'Link de proposta', _a.mensagem, CASE WHEN _lead IS NOT NULL THEN '/leads/' || _lead END, 'proposta-' || _a.proposta_id)
  RETURNING id INTO _push;
  UPDATE public.proposta_avisos SET canal = 'push', status = 'enviado', enviado_em = now(), push_outbox_id = _push,
    ultimo_erro = left('WhatsApp falhou (' || _a.canal || '): ' || coalesce(_erro, 'sem detalhe') || ' | enviado por push', 500)
   WHERE id = _id;
  RETURN 'push';
END $$;

-- Gatilhos imediatos: aceite e pedido de visita.
CREATE OR REPLACE FUNCTION public._proposta_evento_aviso() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE _cli text; _proj text; _modelo text; _opcao int;
BEGIN
  IF NEW.tipo NOT IN ('aceite','visita_pedida') THEN RETURN NEW; END IF;
  SELECT v.snapshot->>'cliente_primeiro_nome', v.snapshot->'projeto'->>'nome', p.modelo INTO _cli, _proj, _modelo
    FROM public.propostas p JOIN public.proposta_versoes v ON v.proposta_id = p.id AND v.numero = p.versao_atual WHERE p.id = NEW.proposta_id;
  IF NEW.tipo = 'aceite' THEN
    SELECT opcao_fluxo INTO _opcao FROM public.proposta_aceites WHERE proposta_id = NEW.proposta_id;
    PERFORM public._proposta_enfileirar_aviso(NEW.proposta_id, 'aceite', NEW.proposta_id::text,
      coalesce(_cli,'O cliente') || ' aceitou a proposta do ' || coalesce(_proj,'empreendimento') || ', opção ' || coalesce(_opcao::text,'?')
        || '. Já criei a tarefa para você seguir com a documentação.',
      'aceitou a proposta, opção ' || coalesce(_opcao::text,'?'));
  ELSE
    PERFORM public._proposta_enfileirar_aviso(NEW.proposta_id, 'visita', NEW.proposta_id::text || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD'),
      coalesce(_cli,'O cliente') || ' quer agendar a visita ao ' || coalesce(_proj,'empreendimento') || ' pelo link ' ||
        CASE WHEN _modelo = 'proposta' THEN 'da proposta' ELSE 'da apresentação' END || '. Vale chamar agora.',
      'pediu para agendar a visita');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proposta_eventos_aviso ON public.proposta_eventos;
CREATE TRIGGER proposta_eventos_aviso AFTER INSERT ON public.proposta_eventos FOR EACH ROW EXECUTE FUNCTION public._proposta_evento_aviso();

GRANT SELECT ON public.proposta_avisos TO authenticated;
CREATE POLICY proposta_avisos_select ON public.proposta_avisos FOR SELECT TO authenticated USING (public.pode_ver_proposta(auth.uid(), proposta_id));

REVOKE EXECUTE ON FUNCTION public._proposta_enfileirar_aviso(uuid,text,text,text,text), public.proposta_avisos_varrer(),
  public.proposta_avisos_reivindicar(integer), public.proposta_aviso_resultado(uuid,boolean,text), public._proposta_evento_aviso() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposta_avisos_varrer(), public.proposta_avisos_reivindicar(integer), public.proposta_aviso_resultado(uuid,boolean,text) TO service_role;