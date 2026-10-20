CREATE OR REPLACE FUNCTION public._tcplus_presenca_filial(_corretor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.presenca_checkins c JOIN public.profiles p ON p.id=c.corretor_id JOIN public.filiais f ON f.id=c.filial_id WHERE c.corretor_id=_corretor AND p.ativo AND f.ativa AND c.dia=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND c.modo='loja' AND c.apto_roleta AND c.encerrado_em IS NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='corretor'));
$$;
REVOKE ALL ON FUNCTION public._tcplus_presenca_filial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tcplus_presenca_filial(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public._tcplus_sync_presenca() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _roleta uuid; _apto boolean;
BEGIN
 IF TG_TABLE_NAME='profiles' THEN _id:=NEW.id; ELSE _id:=NEW.corretor_id; END IF;
 SELECT id INTO _roleta FROM public.roletas WHERE slug='3c-plus';
 IF _roleta IS NULL THEN RETURN NEW; END IF;
 _apto:=public._tcplus_presenca_filial(_id);
 IF _apto THEN
  INSERT INTO public.roleta_participantes(roleta_id,corretor_id,ativo) VALUES(_roleta,_id,true) ON CONFLICT(roleta_id,corretor_id) DO UPDATE SET ativo=true WHERE NOT public.roleta_participantes.ativo;
 ELSE
  UPDATE public.roleta_participantes SET ativo=false WHERE roleta_id=_roleta AND corretor_id=_id AND ativo;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._tcplus_sync_presenca() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tcplus_checkin_sync ON public.presenca_checkins;
CREATE TRIGGER tcplus_checkin_sync AFTER INSERT OR UPDATE OF encerrado_em,apto_roleta,modo,filial_id ON public.presenca_checkins FOR EACH ROW EXECUTE FUNCTION public._tcplus_sync_presenca();
DROP TRIGGER IF EXISTS tcplus_profile_sync ON public.profiles;
CREATE TRIGGER tcplus_profile_sync AFTER UPDATE OF ativo,presente ON public.profiles FOR EACH ROW EXECUTE FUNCTION public._tcplus_sync_presenca();
CREATE TABLE IF NOT EXISTS public.tcplus_eventos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL, evento text NOT NULL, tabela text NOT NULL, registro_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), request_id bigint, erro text);
GRANT SELECT ON public.tcplus_eventos TO authenticated;
GRANT ALL ON public.tcplus_eventos TO service_role;
ALTER TABLE public.tcplus_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcplus_eventos_admin ON public.tcplus_eventos;
CREATE POLICY tcplus_eventos_admin ON public.tcplus_eventos FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS tcplus_eventos_created_idx ON public.tcplus_eventos(created_at);
CREATE OR REPLACE FUNCTION public._tcplus_emit_evento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE _lead uuid; _evento text; _id uuid; _request bigint; _novo jsonb:=to_jsonb(NEW); _velho jsonb; _payload jsonb; _log uuid;
BEGIN
 IF TG_OP='UPDATE' THEN _velho:=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='leads' THEN
  _lead:=NEW.id;
  IF NEW.roleta_slug IS DISTINCT FROM '3c-plus' AND (TG_OP='INSERT' OR OLD.roleta_slug IS DISTINCT FROM '3c-plus') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN _evento:='lead.created';
  ELSIF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id THEN _evento:='lead.assigned';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN _evento:='lead.stage_changed';
  ELSE RETURN NEW; END IF;
 ELSE
  _lead:=(_novo->>'lead_id')::uuid;
  IF _lead IS NULL OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=_lead AND roleta_slug='3c-plus') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND _novo IS NOT DISTINCT FROM _velho THEN RETURN NEW; END IF;
  _evento:=CASE TG_TABLE_NAME WHEN 'interacoes' THEN 'lead.interaction_created' WHEN 'agendamentos' THEN 'appointment.changed' WHEN 'visitas' THEN 'visit.changed' WHEN 'vendas' THEN 'sale.changed' WHEN 'tarefas' THEN 'task.changed' ELSE 'record.changed' END;
 END IF;
 _id:=(_novo->>'id')::uuid;
 INSERT INTO public.tcplus_eventos(lead_id,evento,tabela,registro_id) VALUES(_lead,_evento,TG_TABLE_NAME,_id) RETURNING id INTO _log;
 _payload:=jsonb_build_object('event',_evento,'event_id',_log,'source','smq_crm','integration','3c_plus','test',false,'occurred_at',now(),'data',jsonb_build_object('lead_id',_lead,'record_id',_id,'table',TG_TABLE_NAME,'operation',TG_OP,'status',coalesce(_novo->>'status',_novo->>'status_venda'),'previous_status',coalesce(_velho->>'status',_velho->>'status_venda'),'corretor_id',_novo->>'corretor_id'));
 BEGIN
  SELECT net.http_post(url:='https://n8n-produto.3c.plus/webhook/d1d5a0dd-5355-43ac-94b5-3626c648bc20',headers:='{"Content-Type":"application/json"}'::jsonb,body:=_payload,timeout_milliseconds:=10000) INTO _request;
  UPDATE public.tcplus_eventos SET request_id=_request WHERE id=_log;
 EXCEPTION WHEN OTHERS THEN UPDATE public.tcplus_eventos SET erro=SQLSTATE WHERE id=_log;
 END;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._tcplus_emit_evento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tcplus_lead_event ON public.leads;
CREATE TRIGGER tcplus_lead_event AFTER INSERT OR UPDATE OF status,corretor_id,roleta_slug ON public.leads FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
DROP TRIGGER IF EXISTS tcplus_interacao_event ON public.interacoes;
CREATE TRIGGER tcplus_interacao_event AFTER INSERT ON public.interacoes FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
DROP TRIGGER IF EXISTS tcplus_agendamento_event ON public.agendamentos;
CREATE TRIGGER tcplus_agendamento_event AFTER INSERT OR UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
DROP TRIGGER IF EXISTS tcplus_visita_event ON public.visitas;
CREATE TRIGGER tcplus_visita_event AFTER INSERT OR UPDATE ON public.visitas FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
DROP TRIGGER IF EXISTS tcplus_venda_event ON public.vendas;
CREATE TRIGGER tcplus_venda_event AFTER INSERT OR UPDATE ON public.vendas FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
DROP TRIGGER IF EXISTS tcplus_tarefa_event ON public.tarefas;
CREATE TRIGGER tcplus_tarefa_event AFTER INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public._tcplus_emit_evento();
NOTIFY pgrst, 'reload schema';