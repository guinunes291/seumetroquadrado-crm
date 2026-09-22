-- lovable-cron-fallback-reviewed: avanço de etapa D1→D2→D3 precisa ser quase imediato após o corretor registrar o toque; 288 execuções/dia informadas ao usuário.
CREATE TABLE IF NOT EXISTS public.cadencia_execucao_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id     uuid NOT NULL,
  job         text NOT NULL CHECK (job IN ('avancar','encerrar','vencidos','auditoria')),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  etapa_de    text,
  etapa_para  text,
  motivo      text NOT NULL,
  modo        text NOT NULL,
  aplicado    boolean NOT NULL DEFAULT false,
  detalhe     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadencia_execucao_log_lote_idx
  ON public.cadencia_execucao_log (lote_id);
CREATE INDEX IF NOT EXISTS cadencia_execucao_log_lead_idx
  ON public.cadencia_execucao_log (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cadencia_execucao_log_job_idx
  ON public.cadencia_execucao_log (job, created_at DESC);

COMMENT ON TABLE public.cadencia_execucao_log IS
  'O que o motor da cadência fez (ou faria, em sombra).';

ALTER TABLE public.cadencia_execucao_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cadencia_execucao_log TO authenticated;
GRANT ALL    ON public.cadencia_execucao_log TO service_role;

DROP POLICY IF EXISTS "cadencia_execucao_log leitura gestao" ON public.cadencia_execucao_log;
CREATE POLICY "cadencia_execucao_log leitura gestao"
  ON public.cadencia_execucao_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.cadencia_fim_do_dia(
  _quando timestamptz DEFAULT now(),
  _mais_dias integer DEFAULT 0
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (
    ((_quando AT TIME ZONE 'America/Sao_Paulo')::date
      + make_interval(days => _mais_dias + 1))::timestamp
    - interval '1 microsecond'
  ) AT TIME ZONE 'America/Sao_Paulo';
$$;

COMMENT ON FUNCTION public.cadencia_fim_do_dia(timestamptz, integer) IS
  'Último instante do dia (fuso São Paulo) de _quando, deslocado _mais_dias.';

CREATE OR REPLACE FUNCTION public.cadencia_etapa_completa(_lead uuid, _etapa text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH ciclo AS (
    SELECT COALESCE(l.cadencia_ciclo, 1) AS n FROM public.leads l WHERE l.id = _lead
  ),
  cfg AS (SELECT intervalo_min_lig FROM public.cadencia_config WHERE id = 1),
  t AS (
    SELECT tt.canal,
           tt.ts - lag(tt.ts) OVER (PARTITION BY tt.canal ORDER BY tt.ts) AS gap
    FROM public.cadencia_tentativas tt, ciclo
    WHERE tt.lead_id = _lead
      AND tt.etapa = _etapa
      AND tt.ciclo = ciclo.n
  )
  SELECT CASE _etapa
    WHEN 'D3' THEN EXISTS (SELECT 1 FROM t WHERE t.canal = 'whatsapp')
    ELSE (
      (SELECT count(*) FROM t, cfg
        WHERE t.canal = 'ligacao'
          AND (t.gap IS NULL OR t.gap >= cfg.intervalo_min_lig)) >= 2
      AND EXISTS (SELECT 1 FROM t WHERE t.canal = 'whatsapp')
    )
  END;
$$;

COMMENT ON FUNCTION public.cadencia_etapa_completa(uuid, text) IS
  'D1/D2: 2 ligações (respeitando o intervalo mínimo) + 1 WhatsApp. D3: a mensagem de encerramento.';

CREATE OR REPLACE FUNCTION public.cadencia_cumprida_100(_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.cadencia_etapa_completa(_lead, 'D1')
     AND public.cadencia_etapa_completa(_lead, 'D2')
     AND public.cadencia_etapa_completa(_lead, 'D3')
     AND (
       SELECT count(DISTINCT (tt.ts AT TIME ZONE 'America/Sao_Paulo')::date)
       FROM public.cadencia_tentativas tt
       WHERE tt.lead_id = _lead
         AND tt.ciclo = COALESCE(
           (SELECT l.cadencia_ciclo FROM public.leads l WHERE l.id = _lead), 1)
     ) >= 3;
$$;

COMMENT ON FUNCTION public.cadencia_cumprida_100(uuid) IS
  'As 3 etapas completas E tentativas em >= 3 dias distintos (fuso São Paulo).';

CREATE OR REPLACE FUNCTION public.cadencia_horarios_tentados(_lead uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH t AS (
    SELECT tt.canal, tt.resultado,
           (tt.ts AT TIME ZONE 'America/Sao_Paulo') AS local_ts
    FROM public.cadencia_tentativas tt
    WHERE tt.lead_id = _lead
      AND tt.ciclo = COALESCE(
        (SELECT l.cadencia_ciclo FROM public.leads l WHERE l.id = _lead), 1)
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'ligacoes',  (SELECT count(*) FROM t WHERE canal = 'ligacao'),
    'atendidas', (SELECT count(*) FROM t WHERE resultado = 'atendeu'),
    'whatsapps', (SELECT count(*) FROM t WHERE canal = 'whatsapp'),
    'faixas_horario', (
      SELECT jsonb_agg(DISTINCT faixa ORDER BY faixa)
      FROM (
        SELECT to_char(date_trunc('hour', local_ts), 'HH24')
               || 'h-'
               || to_char(date_trunc('hour', local_ts) + interval '1 hour', 'HH24')
               || 'h' AS faixa
        FROM t WHERE canal = 'ligacao'
      ) f
    ),
    'dias_semana', (
      SELECT jsonb_agg(DISTINCT dia)
      FROM (
        SELECT lower(to_char(local_ts, 'dy')) AS dia FROM t
      ) d
    ),
    'ultimo_contato', (SELECT max(local_ts) FROM t)
  ));
$$;

COMMENT ON FUNCTION public.cadencia_horarios_tentados(uuid) IS
  'Resumo das tentativas do ciclo para a ficha de reativação.';

CREATE OR REPLACE FUNCTION public.cadencia_prioridade_reativacao(_lead uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN l.faixa_mcmv IN ('4','F4','faixa_4') THEN 1
    WHEN l.faixa_mcmv IN ('3','F3','faixa_3') THEN 2
    WHEN l.renda_estimada >= 8000 THEN 1
    WHEN l.renda_estimada >= 4700 THEN 2
    WHEN l.renda_estimada >= 2850 THEN 3
    WHEN l.renda_estimada > 0    THEN 4
    ELSE 5
  END
  FROM public.leads l WHERE l.id = _lead;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_iniciar(_lead uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead;
  IF NOT FOUND OR _l.corretor_id IS NULL THEN
    RETURN false;
  END IF;

  IF _l.cadencia_etapa IS NOT NULL
     OR _l.arquivado_em IS NOT NULL
     OR COALESCE(_l.opt_out, false)
     OR COALESCE(_l.na_lixeira, false)
     OR _l.deleted_at IS NOT NULL
     OR _l.status NOT IN (
          'novo'::public.lead_status,
          'aguardando_atendimento'::public.lead_status,
          'aguardando_corretor'::public.lead_status,
          'em_atendimento'::public.lead_status,
          'aguardando_retorno'::public.lead_status
        ) THEN
    RETURN false;
  END IF;

  UPDATE public.leads
     SET cadencia_etapa     = 'D1',
         cadencia_inicio_ts = now(),
         cadencia_prazo_ts  = public.cadencia_fim_do_dia(now(), 0)
   WHERE id = _lead;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_iniciar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_iniciar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_iniciar(uuid) IS
  'Coloca o lead em D1 com prazo no fim do dia.';

CREATE OR REPLACE FUNCTION public.tg_cadencia_ao_atribuir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id) THEN
    PERFORM public.cadencia_iniciar(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadencia_ao_atribuir ON public.leads;
CREATE TRIGGER trg_cadencia_ao_atribuir
  AFTER UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_cadencia_ao_atribuir();

DROP TRIGGER IF EXISTS trg_cadencia_ao_criar ON public.leads;
CREATE TRIGGER trg_cadencia_ao_criar
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_cadencia_ao_atribuir();

CREATE OR REPLACE FUNCTION public._cadencia_devolver_roleta(
  _lead uuid, _corretor uuid, _motivo text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _ok boolean;
BEGIN
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id      = corretor_id,
         corretor_id               = NULL,
         status                    = 'aguardando_corretor'::public.lead_status,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram   = ARRAY[corretor_id],
         cadencia_etapa            = NULL,
         cadencia_prazo_ts         = NULL,
         cadencia_inicio_ts        = NULL
   WHERE id = _lead AND corretor_id = _corretor;
  _ok := FOUND;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  IF NOT _ok THEN
    RETURN false;
  END IF;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead, NULL, 'redistribuicao'::public.distribuicao_tipo,
     'Cadência: ' || _motivo, 'roleta', 'cadencia_' || _motivo, 'sucesso');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead, 'cadencia_etapa',
          'Lead devolvido à roleta pela cadência (' || _motivo || ').',
          'cadencia',
          jsonb_build_object('para_estado', 'roleta', 'motivo', _motivo));

  IF _corretor IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (_corretor, 'distribuicao'::public.alerta_tipo,
            'Lead devolvido à roleta',
            'A etapa da cadência venceu e o lead voltou para a roleta da campanha.',
            '/leads/' || _lead, _lead);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._cadencia_devolver_roleta(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cadencia_encerrar_lead(
  _lead uuid, _corretor uuid, _etapa_final text,
  _motivo_categoria text, _descricao text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _ok boolean;
BEGIN
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id   = corretor_id,
         corretor_id            = NULL,
         classe_lead            = 'base',
         status                 = 'perdido'::public.lead_status,
         motivo_perda_categoria = _motivo_categoria,
         motivo_perdido         = _descricao,
         cadencia_etapa         = _etapa_final,
         cadencia_prazo_ts      = NULL,
         arquivado_em = CASE WHEN _etapa_final = 'arquivado' THEN now() ELSE arquivado_em END
   WHERE id = _lead AND cadencia_etapa = 'D3';
  _ok := FOUND;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  IF NOT _ok THEN
    RETURN false;
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead, 'cadencia_etapa', _descricao, 'cadencia',
          jsonb_build_object('de_estado', 'D3', 'para_estado', _etapa_final,
                             'motivo', _motivo_categoria,
                             'corretor_anterior', _corretor));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._cadencia_encerrar_lead(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cadencia_avancar(_modo text DEFAULT NULL, _limite integer DEFAULT 1000)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
  _proxima text;
  _prazo timestamptz;
  _concluida_em timestamptz;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_ciclo
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts NULLS FIRST
    LIMIT GREATEST(COALESCE(_limite, 1000), 1)
  LOOP
    CONTINUE WHEN NOT public.cadencia_etapa_completa(_l.id, _l.cadencia_etapa);

    _proxima := CASE _l.cadencia_etapa WHEN 'D1' THEN 'D2' ELSE 'D3' END;

    SELECT max(t.ts) INTO _concluida_em
    FROM public.cadencia_tentativas t
    WHERE t.lead_id = _l.id
      AND t.etapa = _l.cadencia_etapa
      AND t.ciclo = _l.cadencia_ciclo;

    _prazo := public.cadencia_fim_do_dia(COALESCE(_concluida_em, now()), 1);
    _ok := false;

    IF _m = 'ativo' THEN
      UPDATE public.leads
         SET cadencia_etapa = _proxima,
             cadencia_prazo_ts = _prazo
       WHERE id = _l.id AND cadencia_etapa = _l.cadencia_etapa;
      _ok := FOUND;

      IF _ok THEN
        INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
        VALUES (_l.id, 'cadencia_etapa',
                'Cadência avançou de ' || _l.cadencia_etapa || ' para ' || _proxima || '.',
                'cadencia',
                jsonb_build_object('de_estado', _l.cadencia_etapa, 'para_estado', _proxima));
      END IF;
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado)
    VALUES
      (_lote, 'avancar', _l.id, _l.corretor_id, _l.cadencia_etapa, _proxima,
       'etapa_completa', _m, _ok);
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_avancar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_avancar(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cadencia_encerrar(_modo text DEFAULT NULL, _limite integer DEFAULT 500)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
  _cumpriu boolean;
  _destino text;
  _ok boolean;
  _elegivel timestamptz;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_ciclo, l.projeto_nome,
           l.faixa_mcmv, l.renda_estimada
    FROM public.leads l
    WHERE l.cadencia_etapa = 'D3'
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND EXISTS (
        SELECT 1 FROM public.cadencia_tentativas t
        WHERE t.lead_id = l.id
          AND t.ciclo = l.cadencia_ciclo
          AND t.etapa = 'D3'
          AND t.canal = 'whatsapp'
          AND t.ts <= now() - make_interval(hours => _cfg.espera_pos_d3_h)
      )
    ORDER BY l.cadencia_prazo_ts NULLS FIRST
    LIMIT GREATEST(COALESCE(_limite, 500), 1)
  LOOP
    _cumpriu := public.cadencia_cumprida_100(_l.id);
    _ok := false;

    IF NOT _cumpriu THEN
      _destino := 'roleta';
      IF _m = 'ativo' THEN
        _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'cadencia_incompleta');
      END IF;

    ELSIF _l.cadencia_ciclo >= 2 THEN
      _destino := 'arquivo';
      IF _m = 'ativo' THEN
        _ok := public._cadencia_encerrar_lead(
          _l.id, _l.corretor_id, 'arquivado', 'sem_retorno_cadencia',
          'Cadência cumprida 100% sem retorno no 2º ciclo — arquivado.');
      END IF;

    ELSE
      _destino := 'descanso';
      _elegivel := now() + make_interval(days => _cfg.descanso_dias);
      IF _m = 'ativo' THEN
        _ok := public._cadencia_encerrar_lead(
          _l.id, _l.corretor_id, 'descanso', 'sem_retorno_cadencia',
          'Cadência cumprida 100% sem retorno — encerrado no processo.');

        IF _ok THEN
          INSERT INTO public.reativacao_fila
            (lead_id, elegivel_em, origem, empreendimento, faixa_renda,
             prioridade, horarios_tentados)
          VALUES
            (_l.id, _elegivel, 'cadencia_cumprida', _l.projeto_nome,
             COALESCE(_l.faixa_mcmv, _l.renda_estimada::text),
             public.cadencia_prioridade_reativacao(_l.id),
             public.cadencia_horarios_tentados(_l.id))
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'encerrar', _l.id, _l.corretor_id, 'D3', _destino,
       CASE WHEN _cumpriu THEN 'cumpriu_100' ELSE 'cadencia_incompleta' END,
       _m, _ok,
       jsonb_build_object('ciclo', _l.cadencia_ciclo, 'elegivel_em', _elegivel));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_encerrar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_encerrar(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cadencia_vencidos(_modo text DEFAULT NULL, _limite integer DEFAULT 500)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_prazo_ts
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts < now() - make_interval(days => _cfg.tolerancia_venc_d)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts
    LIMIT GREATEST(COALESCE(_limite, 500), 1)
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'etapa_vencida');
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'vencidos', _l.id, _l.corretor_id, _l.cadencia_etapa, 'roleta',
       'etapa_vencida', _m, _ok,
       jsonb_build_object('prazo', _l.cadencia_prazo_ts,
                          'dias_vencido',
                          floor(extract(epoch FROM now() - _l.cadencia_prazo_ts) / 86400)));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_vencidos(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_vencidos(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cadencia_auditoria(_limite integer DEFAULT 500)
RETURNS TABLE(lote_id uuid, achados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lote uuid := gen_random_uuid();
  _l record;
  _falta text;
  _n integer := 0;
  _gestor uuid;
BEGIN
  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa, l.proxima_acao, l.cadencia_prazo_ts
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2','D3')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND (l.corretor_id IS NULL OR l.cadencia_prazo_ts IS NULL)
    LIMIT GREATEST(COALESCE(_limite, 500), 1)
  LOOP
    _falta := concat_ws(', ',
      CASE WHEN _l.corretor_id IS NULL THEN 'sem corretor' END,
      CASE WHEN _l.cadencia_prazo_ts IS NULL THEN 'sem prazo' END);

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'auditoria', _l.id, _l.corretor_id, _l.cadencia_etapa, NULL,
       'integridade', 'auditoria', false, jsonb_build_object('falta', _falta));

    _n := _n + 1;
  END LOOP;

  IF _n > 0 THEN
    FOR _gestor IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'gestor'::public.app_role)
    LOOP
      INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link)
      VALUES (_gestor, 'sistema'::public.alerta_tipo,
              'Cadência: ' || _n || ' lead(s) em cadência sem próxima ação ou sem corretor',
              'Auditoria diária da cadência. Veja cadencia_execucao_log do lote '
                || _lote || '.',
              '/higiene-funil');
    END LOOP;
  END IF;

  RETURN QUERY SELECT _lote, _n;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_auditoria(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_auditoria(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
      FROM cron.job
      WHERE jobname IN ('cadencia-avancar','cadencia-encerrar',
                        'cadencia-vencidos','cadencia-auditoria');

    PERFORM cron.schedule('cadencia-avancar',   '*/5 * * * *',
      $cron$SELECT public.cadencia_avancar();$cron$);
    PERFORM cron.schedule('cadencia-encerrar',  '7 * * * *',
      $cron$SELECT public.cadencia_encerrar();$cron$);
    PERFORM cron.schedule('cadencia-vencidos',  '0 11 * * *',
      $cron$SELECT public.cadencia_vencidos();$cron$);
    PERFORM cron.schedule('cadencia-auditoria', '0 10 * * *',
      $cron$SELECT public.cadencia_auditoria();$cron$);
  END IF;
END $$;
