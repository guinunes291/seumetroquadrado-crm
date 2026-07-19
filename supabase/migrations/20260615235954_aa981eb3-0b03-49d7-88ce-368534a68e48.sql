
UPDATE public.copa_fases
SET semana_inicio = 1, semana_fim = 7
WHERE id = '3b986a16-13fb-4269-afe0-c77abf1eef32';

-- A versão anterior (20260615200100) retornava void; troca de tipo de retorno
-- exige DROP antes do CREATE.
DROP FUNCTION IF EXISTS public.copa_inicializar_dados();
CREATE OR REPLACE FUNCTION public.copa_inicializar_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _edicao uuid := 'a0000000-0000-4000-8000-000000000001';
  _fase   uuid := '3b986a16-13fb-4269-afe0-c77abf1eef32';
  _inseridos int := 0;
  _ignorados int := 0;
  _parts int := 0;
  _missing text[] := ARRAY[]::text[];
  _r record;
  _aid uuid; _bid uuid; _vid uuid;
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.copa_participantes (edicao_id, corretor_id, ativo)
  SELECT _edicao, p.id, true
  FROM public.profiles p
  WHERE p.legacy_user_id IN (
    '37980302','37980408','37980503','38400413','38400416','38400551',
    '38400667','38430037','38430149','38430789','38431121','38431527',
    '39780403','39782610'
  )
  ON CONFLICT (edicao_id, corretor_id) DO UPDATE SET ativo = true;

  SELECT count(*) INTO _parts FROM public.copa_participantes WHERE edicao_id = _edicao AND ativo;

  DELETE FROM public.copa_confrontos WHERE fase_id = _fase;

  FOR _r IN
    SELECT la, lb, lv, wo, sem, pos FROM (
      VALUES
      ('39782610'::text,'38431527'::text,'39782610'::text,false,1,1),
      ('37980302','38400416','38400416',false,1,2),
      ('38400551','38430037','38400551',false,1,3),
      ('39780403','38431121','39780403',false,1,4),
      ('38400413','37980503','38400413',false,1,5),
      ('37980408','38400667','37980408',false,1,6),
      ('38430789','38431527',NULL,false,2,7),
      ('39782610','38430037',NULL,false,2,8),
      ('37980302','38400551',NULL,false,2,9),
      ('38400413','38431121',NULL,false,2,10),
      ('37980408','38430149',NULL,false,2,11),
      ('38400667','37980503',NULL,false,2,12),
      ('38430789','38400416',NULL,false,3,13),
      ('38431527','38430037',NULL,false,3,14),
      ('39782610','37980302',NULL,false,3,15),
      ('39780403','38430149',NULL,false,3,16),
      ('38431121','37980503',NULL,false,3,17),
      ('38400413','37980408',NULL,false,3,18),
      ('38430789','38430037',NULL,false,4,19),
      ('38400416','38400551',NULL,false,4,20),
      ('38431527','37980302',NULL,false,4,21),
      ('39780403','37980503',NULL,false,4,22),
      ('38430149','38400667',NULL,false,4,23),
      ('38431121','37980408',NULL,false,4,24),
      ('38430789','38400551',NULL,false,5,25),
      ('38430037','37980302',NULL,false,5,26),
      ('38400416','39782610',NULL,false,5,27),
      ('39780403','38400667',NULL,false,5,28),
      ('37980503','37980408',NULL,false,5,29),
      ('38430149','38400413',NULL,false,5,30),
      ('38430789','37980302',NULL,false,6,31),
      ('38400551','39782610',NULL,false,6,32),
      ('38400416','38431527',NULL,false,6,33),
      ('39780403','37980408',NULL,false,6,34),
      ('38400667','38400413',NULL,false,6,35),
      ('38430149','38431121',NULL,false,6,36),
      ('38430789','39782610',NULL,false,7,37),
      ('38400551','38431527',NULL,false,7,38),
      ('38430037','38400416',NULL,false,7,39),
      ('39780403','38400413',NULL,false,7,40),
      ('38400667','38431121',NULL,false,7,41),
      ('37980503','38430149',NULL,false,7,42),
      ('38430789',NULL,'38430789',true,1,1000),
      ('39782610',NULL,NULL,true,4,1001),
      ('37980302',NULL,NULL,true,7,1002),
      ('38400551',NULL,NULL,true,3,1003),
      ('38430037',NULL,NULL,true,6,1004),
      ('38400416',NULL,NULL,true,2,1005),
      ('38431527',NULL,NULL,true,5,1006),
      ('39780403',NULL,NULL,true,2,1007),
      ('38400413',NULL,NULL,true,4,1008),
      ('37980408',NULL,NULL,true,7,1009),
      ('38400667',NULL,NULL,true,3,1010),
      ('37980503',NULL,NULL,true,6,1011),
      ('38430149',NULL,'38430149',true,1,1012),
      ('38431121',NULL,NULL,true,5,1013)
    ) AS t(la, lb, lv, wo, sem, pos)
  LOOP
    SELECT id INTO _aid FROM public.profiles WHERE legacy_user_id = _r.la LIMIT 1;
    _bid := NULL;
    IF _r.lb IS NOT NULL THEN
      SELECT id INTO _bid FROM public.profiles WHERE legacy_user_id = _r.lb LIMIT 1;
    END IF;
    _vid := NULL;
    IF _r.lv IS NOT NULL THEN
      SELECT id INTO _vid FROM public.profiles WHERE legacy_user_id = _r.lv LIMIT 1;
    END IF;

    IF _aid IS NULL OR (NOT _r.wo AND _bid IS NULL) THEN
      _ignorados := _ignorados + 1;
      IF _aid IS NULL THEN _missing := array_append(_missing, _r.la); END IF;
      IF NOT _r.wo AND _bid IS NULL THEN _missing := array_append(_missing, _r.lb); END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.copa_confrontos
      (fase_id, corretor_a_id, corretor_b_id, vencedor_id, definido_manual, semana_ref, posicao)
    VALUES
      (_fase, _aid, _bid, _vid, _vid IS NOT NULL, _r.sem, _r.pos);
    _inseridos := _inseridos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'participantes', _parts,
    'confrontos_inseridos', _inseridos,
    'confrontos_ignorados', _ignorados,
    'legacy_ids_sem_profile', (SELECT array_agg(DISTINCT x) FROM unnest(_missing) AS x)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.copa_inicializar_dados() TO authenticated;
