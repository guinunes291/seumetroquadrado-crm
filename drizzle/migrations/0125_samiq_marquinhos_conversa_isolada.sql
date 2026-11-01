ALTER TABLE public.samiq_conversas DROP CONSTRAINT IF EXISTS samiq_conversas_canal_check;
ALTER TABLE public.samiq_conversas ADD CONSTRAINT samiq_conversas_canal_check CHECK (canal IN ('painel', 'whatsapp', 'marquinhos'));
CREATE OR REPLACE FUNCTION public.samiq_gravar_turno(_user_id uuid, _conversa_id uuid, _lead_id uuid, _pergunta text, _resposta text, _ferramentas text[] DEFAULT '{}'::text[], _execution_id uuid DEFAULT NULL::uuid, _canal text DEFAULT 'painel'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  _id uuid := _conversa_id;
  _pergunta_limpa text := left(btrim(COALESCE(_pergunta, '')), 6000);
  _resposta_limpa text := left(btrim(COALESCE(_resposta, '')), 6000);
  _now timestamptz := clock_timestamp();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'usuario ausente' USING ERRCODE = '22023'; END IF;
  IF _pergunta_limpa = '' OR _resposta_limpa = '' THEN RAISE EXCEPTION 'turno vazio' USING ERRCODE = '22023'; END IF;
  IF _canal IS NULL OR _canal NOT IN ('painel', 'whatsapp', 'marquinhos') THEN RAISE EXCEPTION 'canal invalido' USING ERRCODE = '22023'; END IF;
  IF _canal = 'marquinhos' AND (_user_id <> '07699874-e860-47f1-971b-a6bf3f71ae6f'::uuid OR NOT public.has_role(_user_id, 'admin'::public.app_role)) THEN RAISE EXCEPTION 'canal nao autorizado' USING ERRCODE = '42501'; END IF;
  IF _id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.samiq_conversas c WHERE c.id=_id AND c.user_id=_user_id AND c.canal=_canal) THEN _id := NULL; END IF;
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.samiq_conversas(user_id, lead_id, titulo, canal) VALUES (_user_id,_lead_id,left(regexp_replace(_pergunta_limpa, '\s+', ' ', 'g'),120),_canal) RETURNING id INTO _id;
  ELSE
    UPDATE public.samiq_conversas SET atualizado_em=_now,expira_em=_now+interval '90 days',lead_id=COALESCE(_lead_id,lead_id) WHERE id=_id;
  END IF;
  INSERT INTO public.samiq_conversa_mensagens(conversa_id,user_id,papel,conteudo) VALUES (_id,_user_id,'user',_pergunta_limpa);
  INSERT INTO public.samiq_conversa_mensagens(conversa_id,user_id,papel,conteudo,ferramentas,execution_id) VALUES (_id,_user_id,'assistant',_resposta_limpa,COALESCE(_ferramentas,'{}'),_execution_id);
  IF _execution_id IS NOT NULL THEN UPDATE public.samiq_execucoes SET conversa_id=_id WHERE id=_execution_id AND user_id=_user_id; END IF;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.samiq_gravar_turno(uuid,uuid,uuid,text,text,text[],uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_gravar_turno(uuid,uuid,uuid,text,text,text[],uuid,text) TO service_role;