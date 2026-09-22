ALTER TABLE public.cadencia_execucao_log DROP CONSTRAINT IF EXISTS cadencia_execucao_log_job_check;
ALTER TABLE public.cadencia_execucao_log
  ADD CONSTRAINT cadencia_execucao_log_job_check
  CHECK (job IN ('avancar','encerrar','vencidos','auditoria','fase0'));

CREATE OR REPLACE FUNCTION public.cadencia_fase0_classificar()
RETURNS TABLE(
  lead_id       uuid,
  corretor_id   uuid,
  destino       text,
  dias_parado   integer,
  motivo        text,
  escrita_lote  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH base AS (
    SELECT
      l.id,
      l.corretor_id,
      public.higiene_dias_parado(l.ultima_interacao, l.ultimo_contato, l.created_at) AS dias,
      public.telefone_suspeito(l.telefone) AS suspeito,
      COALESCE(l.opt_out, false) AS optout,
      (count(*) OVER (PARTITION BY date_trunc('second',
         COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))
       >= (SELECT lote_min_leads FROM public.higiene_config WHERE id)) AS em_lote
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.corretor_id IS NOT NULL
      AND l.cadencia_etapa IS NULL
      AND l.arquivado_em IS NULL
      AND l.status IN ('novo'::public.lead_status,
                       'aguardando_atendimento'::public.lead_status,
                       'aguardando_corretor'::public.lead_status,
                       'em_atendimento'::public.lead_status,
                       'aguardando_retorno'::public.lead_status)
      AND NOT public._lead_venda_viva(l.id)
  )
  SELECT
    b.id,
    b.corretor_id,
    CASE
      WHEN b.suspeito OR b.optout            THEN 'encerrar'
      WHEN b.dias > 30 AND NOT b.em_lote     THEN 'reativacao'
      ELSE                                        'cadencia'
    END,
    b.dias,
    CASE
      WHEN b.optout   THEN 'opt_out'
      WHEN b.suspeito THEN 'numero_invalido'
      WHEN b.dias > 30 AND NOT b.em_lote THEN 'estoque_30d'
      WHEN b.em_lote  THEN 'escrita_em_lote_vai_para_cadencia'
      ELSE 'estoque_ate_30d'
    END,
    b.em_lote
  FROM base b;
$$;

REVOKE ALL ON FUNCTION public.cadencia_fase0_classificar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_fase0_classificar() TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_fase0_classificar() IS
  'Classificação do estoque para a Fase 0 (encerrar | reativacao | cadencia). Só lead COM corretor, fora da cadência e na janela pré-resposta.';

CREATE OR REPLACE FUNCTION public.cadencia_fase0_executar(
  _modo   text DEFAULT NULL,
  _limite integer DEFAULT 2000
)
RETURNS TABLE(lote_id uuid, modo text, destino text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _c record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin executa a carga da Fase 0' USING ERRCODE = '42501';
  END IF;

  FOR _c IN
    SELECT k.* FROM public.cadencia_fase0_classificar() AS k
    WHERE k.destino IN ('encerrar','reativacao')
    ORDER BY k.dias_parado DESC
    LIMIT GREATEST(COALESCE(_limite, 2000), 1)
  LOOP
    _ok := false;

    IF _m = 'ativo' AND _c.destino = 'encerrar' THEN
      PERFORM set_config('app.transicionar_lead', 'on', true);
      UPDATE public.leads
         SET corretor_anterior_id   = corretor_id,
             corretor_id            = NULL,
             status                 = 'perdido'::public.lead_status,
             motivo_perda_categoria = _c.motivo,
             motivo_perdido         = 'Fase 0 da cadência: ' || _c.motivo || '.',
             cadencia_etapa         = 'encerrado'
       WHERE id = _c.lead_id AND cadencia_etapa IS NULL;
      _ok := FOUND;
      PERFORM set_config('app.transicionar_lead', 'off', true);

    ELSIF _m = 'ativo' AND _c.destino = 'reativacao' THEN
      PERFORM set_config('app.transicionar_lead', 'on', true);
      UPDATE public.leads
         SET corretor_anterior_id   = corretor_id,
             corretor_id            = NULL,
             classe_lead            = 'base',
             status                 = 'perdido'::public.lead_status,
             motivo_perda_categoria = 'sem_retorno_cadencia',
             motivo_perdido         = 'Fase 0 da cadência: estoque parado há '
                                        || _c.dias_parado || ' dias.',
             cadencia_etapa         = 'descanso'
       WHERE id = _c.lead_id AND cadencia_etapa IS NULL;
      _ok := FOUND;
      PERFORM set_config('app.transicionar_lead', 'off', true);

      IF _ok THEN
        INSERT INTO public.reativacao_fila
          (lead_id, elegivel_em, origem, empreendimento, faixa_renda,
           prioridade, horarios_tentados)
        SELECT _c.lead_id, now(), 'estoque_30d', l.projeto_nome,
               COALESCE(l.faixa_mcmv, l.renda_estimada::text),
               public.cadencia_prioridade_reativacao(_c.lead_id),
               NULL
        FROM public.leads l WHERE l.id = _c.lead_id
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF _ok THEN
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_c.lead_id, 'cadencia_etapa',
              'Fase 0: estoque classificado como ' || _c.destino || '.', 'cadencia',
              jsonb_build_object('para_estado', _c.destino, 'motivo', _c.motivo,
                                 'dias_parado', _c.dias_parado));
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, _c.destino, _c.motivo, _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado,
                          'escrita_em_lote', _c.escrita_lote,
                          'etapa_aplicada',
                          CASE _c.destino WHEN 'reativacao' THEN 'descanso'
                                          ELSE 'encerrado' END));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, g.etapa_para, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote
  GROUP BY g.etapa_para;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_fase0_executar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_fase0_executar(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_fase0_executar(text, integer) IS
  'Carga única da Fase 0: encerra suspeito/opt-out e manda o estoque frio (>30d, fora de escrita em lote) para a reativação sem janela de descanso. Admin apenas.';

CREATE OR REPLACE FUNCTION public.cadencia_fase0_admitir(
  _modo         text DEFAULT NULL,
  _por_corretor integer DEFAULT NULL
)
RETURNS TABLE(lote_id uuid, modo text, corretores integer, admitidos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _teto integer;
  _lote uuid := gen_random_uuid();
  _c record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;
  _teto := GREATEST(COALESCE(_por_corretor, _cfg.lote_estoque_dia, 15), 1);

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin admite estoque na cadência' USING ERRCODE = '42501';
  END IF;

  FOR _c IN
    SELECT f.lead_id, f.corretor_id, f.dias_parado
    FROM (
      SELECT k.*,
             row_number() OVER (PARTITION BY k.corretor_id
                                ORDER BY k.dias_parado ASC, k.lead_id) AS pos
      FROM public.cadencia_fase0_classificar() AS k
      WHERE k.destino = 'cadencia'
    ) f
    WHERE f.pos <= _teto
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      _ok := public.cadencia_iniciar(_c.lead_id);
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, 'D1', 'admissao_estoque', _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado, 'teto_por_corretor', _teto,
                          'etapa_aplicada', 'D1'));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m,
         count(DISTINCT g.corretor_id)::int,
         count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_fase0_admitir(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_fase0_admitir(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_fase0_admitir(text, integer) IS
  'Admite o estoque na cadência em lotes por corretor (padrão cadencia_config.lote_estoque_dia), do mais quente para o mais frio. Admin apenas.';

CREATE OR REPLACE FUNCTION public.cadencia_fase0_desfazer(_lote uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _r record; _n integer := 0; _voltou integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin desfaz a Fase 0' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT * FROM public.cadencia_execucao_log
    WHERE lote_id = _lote AND job = 'fase0' AND aplicado
  LOOP
    DELETE FROM public.reativacao_fila
     WHERE lead_id = _r.lead_id AND origem = 'estoque_30d' AND status = 'aguardando';

    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET corretor_id            = COALESCE(corretor_id, _r.corretor_id),
           status                 = CASE WHEN status = 'perdido'::public.lead_status
                                         THEN 'aguardando_atendimento'::public.lead_status
                                         ELSE status END,
           motivo_perda_categoria = NULL,
           motivo_perdido         = NULL,
           data_perda             = NULL,
           classe_lead            = 'quente',
           cadencia_etapa         = NULL,
           cadencia_prazo_ts      = NULL,
           cadencia_inicio_ts     = NULL
     WHERE id = _r.lead_id
       AND cadencia_etapa IS NOT DISTINCT FROM (_r.detalhe ->> 'etapa_aplicada')
       AND NOT EXISTS (SELECT 1 FROM public.cadencia_tentativas t
                        WHERE t.lead_id = _r.lead_id);
    GET DIAGNOSTICS _voltou = ROW_COUNT;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    _n := _n + _voltou;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_fase0_desfazer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_fase0_desfazer(uuid) TO service_role;

COMMENT ON FUNCTION public.cadencia_fase0_desfazer(uuid) IS
  'Volta um lote da Fase 0 ao dono anterior. Pula lead que já foi trabalhado depois.';

NOTIFY pgrst, 'reload schema';