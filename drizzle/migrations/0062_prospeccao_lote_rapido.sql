CREATE OR REPLACE FUNCTION public.prospeccao_pedir_lote(_zona text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _z text := public._prospeccao_zona_pedida(_zona);
  _st jsonb;
  _lote uuid;
  _n integer := 0;
  _l record;
  _etapa text;
  _tamanho constant integer := 30;
  _anti integer := COALESCE(
    (public.gestao_config_valor('bolsao') ->> 'discador_anti_ioio_dias')::int, 30);
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _z IS NULL THEN
    RAISE EXCEPTION 'zona invalida: %', _zona USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('prospeccao_lote:' || _me::text));

  _st := public.prospeccao_lote_status_v1();
  IF NOT (_st ->> 'pode_pedir')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _st ->> 'motivo');
  END IF;

  IF public._zona_estrita()
     AND public.has_role(_me, 'corretor'::public.app_role)
     AND NOT public.corretor_atende_zona(_me, _z) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', CASE WHEN cardinality(public.regiao_do_corretor(_me)) = 0
                     THEN 'sem_regiao' ELSE 'zona_fora_da_regiao' END,
      'zona', _z,
      'regiao', to_jsonb(public.regiao_do_corretor(_me)));
  END IF;

  INSERT INTO public.prospeccao_lotes (corretor_id, zona, solicitados)
  VALUES (_me, _z, _tamanho)
  RETURNING id INTO _lote;

  PERFORM set_config('app.prospeccao_lote', 'on', true);

  FOR _l IN
    -- Desempenho (05/10/2026): a regra inteira por linha estourava o limite
    -- de 8 s. Recorte barato (colunas + zona) dos 400 mais antigos primeiro.
    WITH recorte AS MATERIALIZED (
      SELECT l.id
        FROM public.leads AS l
       WHERE l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.cadencia_etapa IS NULL
         AND l.deleted_at IS NULL
         AND NOT l.na_lixeira
         AND l.status IN ('novo'::public.lead_status,
                          'aguardando_atendimento'::public.lead_status,
                          'em_atendimento'::public.lead_status,
                          'aguardando_retorno'::public.lead_status)
         AND l.created_at < now() - interval '1 day'
         AND public._prospeccao_zona_do_lead(l) = _z
       ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
                l.id ASC
       LIMIT 400
    )
    SELECT l.id, l.status, l.classe_lead, l.corretores_que_tentaram,
           l.data_distribuicao, l.timestamp_recebimento
      FROM public.leads AS l
      JOIN recorte AS r ON r.id = l.id
     WHERE l.corretor_id IS NULL
       AND public._prospeccao_lote_elegivel(l, _me, _anti)
     ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
              l.id ASC
     LIMIT _tamanho
     FOR UPDATE OF l SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.prospeccao_lote_itens
        (lote_id, lead_id, status_anterior, classe_anterior,
         data_distribuicao_anterior, recebimento_anterior)
      VALUES
        (_lote, _l.id, _l.status, _l.classe_lead,
         _l.data_distribuicao, _l.timestamp_recebimento);

      UPDATE public.leads
         SET corretor_id               = _me,
             prospeccao_lote_id        = _lote,
             data_distribuicao         = now(),
             timestamp_recebimento     = now(),
             tentativas_redistribuicao = 0,
             via_webhook               = false,
             classe_lead               = 'base',
             corretores_que_tentaram   = CASE
               WHEN _me = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
                 THEN _l.corretores_que_tentaram
               ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _me)
             END
       WHERE id = _l.id AND corretor_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'lead mudou de mãos' USING ERRCODE = 'SMQL1';
      END IF;

      IF _l.status = 'novo'::public.lead_status THEN
        PERFORM public.transicionar_lead(
          _l.id, 'aguardando_atendimento'::public.lead_status, 'Lote de prospecção');
      END IF;

      SELECT l.cadencia_etapa INTO _etapa FROM public.leads AS l WHERE l.id = _l.id;
      IF _etapa IS DISTINCT FROM 'D0' THEN
        RAISE EXCEPTION 'lead fora da cadência' USING ERRCODE = 'SMQL1';
      END IF;

      UPDATE public.discador_atendimentos AS a
         SET encerrado_em = now(),
             encerrado_motivo = CASE WHEN a.corretor_id = _me THEN 'posse_propria' ELSE 'posse_outro' END
       WHERE a.lead_id = _l.id AND a.encerrado_em IS NULL;

      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
      VALUES
        (_l.id, _me, 'manual'::public.distribuicao_tipo,
         'Lote de prospecção (Zona ' || _z || ')', 'lote_prospeccao', 'sucesso');

      _n := _n + 1;
    EXCEPTION WHEN SQLSTATE 'SMQL1' THEN
      NULL;
    END;
  END LOOP;

  PERFORM set_config('app.prospeccao_lote', 'off', true);

  IF _n = 0 THEN
    DELETE FROM public.prospeccao_lotes WHERE id = _lote;
    RETURN jsonb_build_object('ok', false, 'motivo', 'zona_vazia', 'zona', _z);
  END IF;

  UPDATE public.prospeccao_lotes SET entregues = _n WHERE id = _lote;

  RETURN jsonb_build_object(
    'ok', true, 'lote_id', _lote, 'entregues', _n, 'solicitados', _tamanho, 'zona', _z);
END;
$function$;