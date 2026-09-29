CREATE OR REPLACE FUNCTION public.trg_sdr_visita_roleta_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _v uuid;
  _prev text := COALESCE(current_setting('app.sdr_motor', true), '');
  _uid uuid := auth.uid();
BEGIN
  -- Visita marcada pelo próprio corretor não é entrega do SDR:
  -- não passa pela roleta do SDR nem dispara o aviso "Lead do SDR".
  IF _uid IS NOT NULL AND public.has_role(_uid, 'corretor'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo = 'visita'::public.agendamento_tipo
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                        'remarcado'::public.agendamento_status)
     AND NEW.data_inicio > now() THEN
    _v := public._sdr_visita_roleta(NEW.lead_id, NEW.corretor_id, NEW.data_inicio, NEW.data_fim, 'agendamento_visita');
    PERFORM set_config('app.sdr_motor', _prev, true);
    IF _v IS NOT NULL THEN
      IF NULLIF(btrim(NEW.local), '') IS NULL THEN
        RAISE EXCEPTION 'informe o endereço da visita (campo Local): o corretor recebe a mensagem com endereço e horário'
          USING ERRCODE = '22023';
      END IF;
      NEW.corretor_id := _v;
      NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
      PERFORM set_config('app.sdr_visita_lead', NEW.lead_id::text, true);
    END IF;
  END IF;
  RETURN NEW;
END; $function$;