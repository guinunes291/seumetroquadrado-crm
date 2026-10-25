ALTER TABLE public.proposta_avisos ADD COLUMN IF NOT EXISTS wamid text;
ALTER TABLE public.proposta_avisos ADD COLUMN IF NOT EXISTS ultima_tentativa_em timestamptz;
ALTER TABLE public.proposta_aviso_config ALTER COLUMN template_nome SET DEFAULT 'alerta_operacao_smq';
ALTER TABLE public.proposta_aviso_config ADD COLUMN IF NOT EXISTS max_tentativas integer NOT NULL DEFAULT 3;
UPDATE public.proposta_aviso_config SET template_nome = 'alerta_operacao_smq', template_aprovado = true, atualizado_em = now();

-- Enfileira: o canal é decidido pela resposta do webhook (n8n tenta texto e cai no template).
CREATE OR REPLACE FUNCTION public._proposta_enfileirar_aviso(_proposta_id uuid, _tipo text, _referencia text, _mensagem text, _resumo text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _p public.propostas%ROWTYPE; _tel text; _cli text; _id uuid; _push uuid;
BEGIN
  SELECT * INTO _p FROM public.propostas WHERE id = _proposta_id;
  IF NOT FOUND OR _p.corretor_id IS NULL THEN RETURN NULL; END IF;
  SELECT regexp_replace(coalesce(telefone,''), '\D', '', 'g') INTO _tel FROM public.profiles WHERE id = _p.corretor_id;
  IF length(_tel) IN (10, 11) THEN _tel := '55' || _tel; ELSIF length(_tel) NOT IN (12, 13) THEN _tel := NULL; END IF;
  SELECT v.snapshot->>'cliente_primeiro_nome' INTO _cli
    FROM public.proposta_versoes v WHERE v.proposta_id = _p.id AND v.numero = _p.versao_atual;
  INSERT INTO public.proposta_avisos (proposta_id, corretor_id, tipo, referencia, mensagem, canal, status, telefone, template_parametros, ultimo_erro)
  VALUES (_p.id, _p.corretor_id, _tipo, _referencia, _mensagem, CASE WHEN _tel IS NULL THEN 'push' END, 'pendente', _tel,
          jsonb_build_object('assunto', left('Proposta: ' || coalesce(nullif(split_part(trim(_cli),' ',1),''),'cliente'), 60), 'resumo', _resumo),
          CASE WHEN _tel IS NULL THEN 'corretor sem telefone no perfil: aviso por push' END)
  ON CONFLICT (tipo, referencia) DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NOT NULL AND _tel IS NULL THEN
    INSERT INTO public.push_outbox (user_id, title, body, url, tag)
    VALUES (_p.corretor_id, 'Link de proposta', _mensagem, CASE WHEN _p.lead_id IS NOT NULL THEN '/leads/' || _p.lead_id END, 'proposta-' || _p.id)
    RETURNING id INTO _push;
    UPDATE public.proposta_avisos SET status = 'enviado', enviado_em = now(), push_outbox_id = _push WHERE id = _id;
  END IF;
  RETURN _id;
END $function$;

-- Reivindica avisos para o servidor chamar o webhook. Novos vão na hora; falhas esperam 5 min (próxima varredura).
CREATE OR REPLACE FUNCTION public.proposta_avisos_reivindicar_envio(_limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, telefone text, mensagem text, assunto text, template_nome text, tentativa integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _cfg public.proposta_aviso_config%ROWTYPE;
BEGIN
  SELECT * INTO _cfg FROM public.proposta_aviso_config WHERE proposta_aviso_config.id;
  RETURN QUERY
  WITH alvo AS (
    SELECT a.id FROM public.proposta_avisos a
     WHERE a.status = 'pendente' AND a.telefone IS NOT NULL AND a.tentativas < _cfg.max_tentativas
       AND (a.reivindicado_em IS NULL OR a.reivindicado_em < now() - interval '2 minutes')
       AND (a.ultima_tentativa_em IS NULL OR a.ultima_tentativa_em < now() - interval '5 minutes')
     ORDER BY a.criado_em LIMIT least(greatest(_limite,1),50)
     FOR UPDATE SKIP LOCKED)
  UPDATE public.proposta_avisos a SET reivindicado_em = now(), ultima_tentativa_em = now(), tentativas = a.tentativas + 1
    FROM alvo WHERE a.id = alvo.id
  RETURNING a.id, a.telefone, a.mensagem,
            coalesce(a.template_parametros->>'assunto', 'Proposta: cliente'), _cfg.template_nome, a.tentativas;
END $function$;

-- Registra a resposta do webhook. Após a última tentativa sem sucesso, cai para push.
CREATE OR REPLACE FUNCTION public.proposta_aviso_registrar_envio(_id uuid, _ok boolean, _canal text, _wamid text, _erro text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _a public.proposta_avisos%ROWTYPE; _cfg public.proposta_aviso_config%ROWTYPE; _lead uuid; _push uuid;
BEGIN
  SELECT * INTO _cfg FROM public.proposta_aviso_config WHERE proposta_aviso_config.id;
  SELECT * INTO _a FROM public.proposta_avisos WHERE proposta_avisos.id = _id FOR UPDATE;
  IF NOT FOUND OR _a.status <> 'pendente' THEN RETURN 'ignorado'; END IF;
  IF _ok THEN
    UPDATE public.proposta_avisos SET status = 'enviado', enviado_em = now(), reivindicado_em = NULL,
      canal = CASE WHEN _canal IN ('sami_texto','sami_template') THEN _canal ELSE 'sami_texto' END,
      wamid = nullif(left(coalesce(_wamid,''),200),'') WHERE proposta_avisos.id = _id;
    RETURN 'enviado';
  END IF;
  IF _a.tentativas < _cfg.max_tentativas THEN
    UPDATE public.proposta_avisos SET status = 'pendente', reivindicado_em = NULL,
      ultimo_erro = left('tentativa ' || _a.tentativas || ': ' || coalesce(nullif(_erro,''),'sem detalhe'), 500)
     WHERE proposta_avisos.id = _id;
    RETURN 'nova_tentativa';
  END IF;
  SELECT lead_id INTO _lead FROM public.propostas WHERE propostas.id = _a.proposta_id;
  INSERT INTO public.push_outbox (user_id, title, body, url, tag)
  VALUES (_a.corretor_id, 'Link de proposta', _a.mensagem, CASE WHEN _lead IS NOT NULL THEN '/leads/' || _lead END, 'proposta-' || _a.proposta_id)
  RETURNING push_outbox.id INTO _push;
  UPDATE public.proposta_avisos SET canal = 'push', status = 'falhou', enviado_em = now(), push_outbox_id = _push, reivindicado_em = NULL,
    ultimo_erro = left('WhatsApp falhou em ' || _a.tentativas || ' tentativas: ' || coalesce(nullif(_erro,''),'sem detalhe') || ' | enviado por push', 500)
   WHERE proposta_avisos.id = _id;
  RETURN 'push';
END $function$;

REVOKE ALL ON FUNCTION public.proposta_avisos_reivindicar_envio(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proposta_aviso_registrar_envio(uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposta_avisos_reivindicar_envio(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.proposta_aviso_registrar_envio(uuid, boolean, text, text, text) TO service_role;
-- Modelo antigo (n8n buscava /api/sami/avisos) desativado.
REVOKE ALL ON FUNCTION public.proposta_avisos_reivindicar(integer) FROM service_role;
REVOKE ALL ON FUNCTION public.proposta_aviso_resultado(uuid, boolean, text) FROM service_role;
COMMENT ON FUNCTION public.proposta_avisos_reivindicar(integer) IS 'DEPRECATED: substituída por proposta_avisos_reivindicar_envio (webhook n8n)';
COMMENT ON FUNCTION public.proposta_aviso_resultado(uuid, boolean, text) IS 'DEPRECATED: substituída por proposta_aviso_registrar_envio';
COMMENT ON COLUMN public.proposta_aviso_config.template_aprovado IS 'DEPRECATED: o n8n decide texto ou template (modo auto)';
COMMENT ON COLUMN public.proposta_aviso_config.fallback_push_apos_min IS 'DEPRECATED: fallback agora após max_tentativas';