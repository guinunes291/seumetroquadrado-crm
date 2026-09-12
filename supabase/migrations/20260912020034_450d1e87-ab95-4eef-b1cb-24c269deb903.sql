CREATE OR REPLACE FUNCTION public.higiene_processar()
RETURNS TABLE(execucao_id uuid, avaliados integer, aplicados integer, pulados integer, erros integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _cfg      public.higiene_config%ROWTYPE;
  _exec     uuid := gen_random_uuid();
  _r        record;
  _aval     integer := 0;
  _apl      integer := 0;
  _pul      integer := 0;
  _err      integer := 0;
  _acao     text;
  _pulo     text;
  _erro     text;
  _perdidos integer;
  _ok       boolean;
BEGIN
  IF NOT (COALESCE(auth.role() = 'service_role', false)
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor'::public.app_role)
       OR public.has_role(auth.uid(), 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissao para rodar a higiene' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _cfg FROM public.higiene_config WHERE id;

  -- Teto do DIA em horario de Brasilia: o corte tem que ser o mesmo que a
  -- gestao enxerga na tela, nao meia-noite UTC (21h daqui).
  SELECT count(*) INTO _perdidos
    FROM public.higiene_execucao_log
   WHERE aplicado AND desfeito_em IS NULL AND acao = 'perdido'
     AND (ts AT TIME ZONE 'America/Sao_Paulo')::date
       = (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR _r IN
    WITH lote_global AS (
      -- Escrita em lote medida sobre a base INTEIRA (nao so os vivos): uma
      -- importacao de 6 mil leads em que metade ja virou perdido ainda e uma
      -- importacao, e a janela da v_higiene_base sozinha nao a enxergaria.
      SELECT date_trunc('second',
               COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)) AS inst
        FROM public.leads
       WHERE deleted_at IS NULL
       GROUP BY 1
      HAVING count(*) >= _cfg.lote_min_leads
    )
    SELECT b.id, b.status, b.corretor_id, b.dias_parado, b.nunca_tocado,
           b.escrita_em_lote,
           (lg.inst IS NOT NULL)      AS lote_global,
           (l.sdr_id IS NOT NULL)     AS ressurreicao_sdr,
           r.acao_automatica,
           COALESCE(r.dias_perda, _cfg.dias_parado_min) AS prazo
      FROM public.v_higiene_base b
      JOIN public.leads l ON l.id = b.id
      JOIN public.higiene_regra_fase r ON r.status = b.status AND r.ativa
      LEFT JOIN lote_global lg
        ON lg.inst = date_trunc('second',
             COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at))
     WHERE b.dias_parado >= COALESCE(r.dias_perda, _cfg.dias_parado_min)
     ORDER BY r.peso DESC, b.dias_parado DESC
     LIMIT _cfg.lote_max
  LOOP
    _aval := _aval + 1;
    _acao := _r.acao_automatica;
    _pulo := NULL;
    _erro := NULL;
    _ok   := false;

    IF _cfg.modo = 'sombra' THEN
      _pulo := 'modo_sombra';
    ELSIF _acao = 'nenhuma' THEN
      _pulo := 'sem_acao';
    ELSIF _cfg.modo = 'ativo_parcial' AND _acao <> 'alertar' THEN
      _pulo := 'modo_ativo_parcial';
    ELSIF _r.lote_global OR _r.escrita_em_lote THEN
      _pulo := 'escrita_em_lote';
    ELSIF _r.ressurreicao_sdr THEN
      _pulo := 'ressurreicao_sdr';
    ELSIF _r.corretor_id IS NULL AND _acao IN ('alertar','devolver_roleta') THEN
      _pulo := 'sem_corretor';
    ELSIF _acao = 'perdido' AND _perdidos >= _cfg.teto_perdidos_dia THEN
      _pulo := 'teto_perdidos_dia';
    END IF;

    IF _pulo IS NULL THEN
      BEGIN
        IF _acao = 'alertar' THEN
          INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
          VALUES (_r.corretor_id, 'sistema'::public.alerta_tipo,
                  'Lead parado ha ' || _r.dias_parado || ' dias',
                  'Higiene do funil: retome ou registre o desfecho.',
                  '/leads/' || _r.id, _r.id);
        ELSIF _acao = 'devolver_roleta' THEN
          PERFORM public.transicionar_lead(
            _r.id, 'aguardando_corretor'::public.lead_status,
            'Higiene: ' || _r.dias_parado || ' dias sem movimento', NULL, NULL, NULL);
          UPDATE public.leads
             SET corretor_anterior_id = corretor_id, corretor_id = NULL
           WHERE id = _r.id;
        ELSIF _acao = 'perdido' THEN
          PERFORM public.transicionar_lead(
            _r.id, 'perdido'::public.lead_status,
            'Higiene: ' || _r.dias_parado || ' dias sem movimento', NULL, NULL, 'sem_contato');
          _perdidos := _perdidos + 1;
        END IF;
        _ok := true;
        _apl := _apl + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Um lead que falha nao pode derrubar o lote inteiro.
        _erro := SQLERRM;
        _err := _err + 1;
      END;
    ELSE
      _pul := _pul + 1;
    END IF;

    INSERT INTO public.higiene_execucao_log (
      execucao_id, lead_id, corretor_id, status_antes, acao_regra, acao,
      dias_parado, motivo_pulo, nunca_tocado, escrita_lote, escrita_lote_global,
      ressurreicao_sdr, cfg_modo, cfg_dias_parado_min, cfg_lote_min_leads,
      cfg_teto_perdidos_dia, aplicado, erro)
    VALUES (
      _exec, _r.id, _r.corretor_id, _r.status, _r.acao_automatica, _acao,
      _r.dias_parado, _pulo, _r.nunca_tocado, _r.escrita_em_lote, _r.lote_global,
      _r.ressurreicao_sdr, _cfg.modo, _cfg.dias_parado_min, _cfg.lote_min_leads,
      _cfg.teto_perdidos_dia, _ok, _erro);
  END LOOP;

  RETURN QUERY SELECT _exec, _aval, _apl, _pul, _err;
END;
$fn$;

COMMENT ON FUNCTION public.higiene_processar() IS
  'Motor de higiene por fase. Em modo sombra grava apenas higiene_execucao_log — nenhum lead e tocado.';

CREATE OR REPLACE FUNCTION public.higiene_desfazer_lote(_execucao_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _r record;
  _n integer := 0;
BEGIN
  IF NOT (COALESCE(auth.role() = 'service_role', false)
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor'::public.app_role)
       OR public.has_role(auth.uid(), 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissao para desfazer a higiene' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT * FROM public.higiene_execucao_log
     WHERE execucao_id = _execucao_id AND aplicado AND desfeito_em IS NULL
     ORDER BY id
  LOOP
    IF _r.acao = 'alertar' THEN
      DELETE FROM public.alertas
       WHERE ref_id = _r.lead_id AND tipo = 'sistema'::public.alerta_tipo
         AND created_at >= _r.ts - interval '1 minute';
    ELSIF _r.acao = 'devolver_roleta' THEN
      UPDATE public.leads
         SET corretor_id = COALESCE(corretor_id, _r.corretor_id),
             status = _r.status_antes
       WHERE id = _r.lead_id;
    ELSIF _r.acao = 'perdido' THEN
      UPDATE public.leads
         SET status = _r.status_antes,
             motivo_perda = NULL, motivo_perda_categoria = NULL, data_perda = NULL
       WHERE id = _r.lead_id;
    END IF;

    UPDATE public.higiene_execucao_log SET desfeito_em = now() WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$fn$;

COMMENT ON FUNCTION public.higiene_desfazer_lote(uuid) IS
  'Reverte em bloco o que uma execucao do motor aplicou. Idempotente: linhas ja desfeitas sao ignoradas.';

REVOKE ALL ON FUNCTION public.higiene_processar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.higiene_desfazer_lote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.higiene_processar() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.higiene_desfazer_lote(uuid) TO authenticated, service_role;