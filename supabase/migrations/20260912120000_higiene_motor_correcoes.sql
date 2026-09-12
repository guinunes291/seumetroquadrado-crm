-- ===========================================================================
-- Higiene 2b — tres correcoes encontradas na revisao da fatia.
--
-- A fatia 2b entregue esta correta no essencial: nao duplicou tabela, os dois
-- CHECK estruturais estao no lugar, a deteccao de lote GLOBAL funciona (50 de
-- 50 leads de importacao protegidos, verificado no harness) e a config vai
-- carimbada no log. Esta migration fecha tres lacunas.
--
-- 1. TRAVA DE NUNCA TOCADO — ausente. Verificado no harness com modo='ativo':
--    um lead nunca tocado e sem relogio de lote era marcado perdido. A unica
--    protecao real era escrita_em_lote, que cobre 99,97% dos casos por
--    coincidencia (dos 12.718 nunca tocados, 12.714 tambem sao lote), nao por
--    desenho. Agora rebaixa 'perdido' para 'alertar'.
--    RISCO HOJE: nenhum. Todas as regras nasceram 'alertar' e o motor esta em
--    sombra. A lacuna so morderia no dia em que a primeira regra virasse
--    'perdido' — que e exatamente a Fatia 2d.
--
-- 2. ORDEM DOS PULOS — modo_sombra vinha primeiro e curto-circuitava tudo.
--    Verificado: 52 candidatos, motivo_pulo='modo_sombra' em 100% deles. A
--    sombra dizia quantos candidatos existem, nunca o que aconteceria ao
--    ligar. Agora os bloqueios substantivos sao avaliados antes, e a contagem
--    de 'modo_sombra' vira a resposta direta: e quantos o motor moveria.
--
-- 3. TIPO DO ALERTA — o motor inseria alerta_tipo='sistema', mas o job diario
--    gerar_alertas_leads_parados (11h) insere 'follow_up' e deduplica em
--    tipo='follow_up'. Com regra 'alertar' ligada, o corretor receberia DOIS
--    alertas por dia do mesmo lead. Com 'follow_up', o job das 11h enxerga o
--    alerta do motor (4h) e nao repete.
--
-- NAO MUDA: a deteccao de lote global, os CHECK, o teto em fuso de Brasilia,
-- o desfeito_em na contagem do teto, o guard de permissao, nem o desfazer.
-- Esses quatro ultimos sao melhorias da 2b sobre a especificacao original.
--
-- ROLLBACK: reaplicar 20260912020034 (a funcao) e 20260912020112 (a view).
--   Ambas sao CREATE OR REPLACE puros, sem dado envolvido.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- CORRECAO 5 — o batimento cardiaco nao podia depender do log de LEADS.
--
-- Encontrado pelos testes desta correcao: quando a execucao avalia ZERO
-- candidatos, ela nao insere nenhuma linha em higiene_execucao_log, e a view
-- entao nao distingue "rodou e nao achou ninguem" de "nunca rodou" — devolvia
-- motor_atrasado = true logo depois de uma execucao bem-sucedida.
--
-- E o caso que vai acontecer justamente quando o funil ficar limpo, que e o
-- objetivo do projeto: o cabecalho gritaria "o motor nao roda desde nunca"
-- no dia em que ele passasse a nao ter o que fazer.
--
-- Uma linha por execucao, sempre, independente de ter achado candidato.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.higiene_execucao (
  execucao_id uuid PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  modo        text NOT NULL,
  avaliados   integer NOT NULL DEFAULT 0,
  aplicados   integer NOT NULL DEFAULT 0,
  pulados     integer NOT NULL DEFAULT 0,
  erros       integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_higiene_execucao_ts ON public.higiene_execucao (ts DESC);

ALTER TABLE public.higiene_execucao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS higiene_execucao_select_gestao ON public.higiene_execucao;
CREATE POLICY higiene_execucao_select_gestao ON public.higiene_execucao
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
GRANT SELECT ON public.higiene_execucao TO authenticated;

-- Semeia a partir do que ja existe, para nao perder o historico da 2b.
INSERT INTO public.higiene_execucao (execucao_id, ts, modo, avaliados, aplicados, pulados, erros)
SELECT execucao_id, max(ts), COALESCE(max(cfg_modo), 'sombra'), count(*),
       count(*) FILTER (WHERE aplicado),
       count(*) FILTER (WHERE motivo_pulo IS NOT NULL),
       count(*) FILTER (WHERE erro IS NOT NULL)
  FROM public.higiene_execucao_log
 GROUP BY execucao_id
ON CONFLICT (execucao_id) DO NOTHING;


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
  -- CORRECAO 6 — o guard barrava o proprio cron.
  -- pg_cron executa SEM contexto de request: auth.role() e auth.uid() sao
  -- ambos NULL. A checagem original exigia service_role OU um papel de gestao,
  -- entao o job das 4h levantava 42501 TODA NOITE e o motor nunca rodava.
  -- Reproduzido no harness com request.jwt.claims vazio, e e o mesmo erro que
  -- aparece ao chamar a funcao pelo SQL editor.
  --
  -- Sem contexto nenhum = chamada server-side (pg_cron, psql, service_role):
  -- o portao real ali e o GRANT EXECUTE. Com contexto, exige gestao — e a
  -- funcao tem GRANT para `authenticated`, entao essa parte segue necessaria.
  -- Mesma forma que disparar_repasse_sla_lead usa: so checa quando HA caller.
  IF NOT (
       (auth.uid() IS NULL AND auth.role() IS NULL)
    OR COALESCE(auth.role() = 'service_role', false)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  ) THEN
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

    -- CORRECAO 1 — trava de lead nunca tocado.
    -- Perder um lead que NINGUEM atendeu nao limpa o funil: esconde que a
    -- distribuicao nao entregou. E rebaixamento, nao pulo: o lead segue
    -- merecendo atencao, so nao pode ser descartado. Sem isto, um lead
    -- nunca tocado e sem relogio de lote era marcado perdido (reproduzido
    -- no harness antes desta migration).
    IF _r.nunca_tocado AND _acao = 'perdido' THEN
      _acao := 'alertar';
    END IF;

    -- CORRECAO 2 — ordem dos pulos: bloqueio SUBSTANTIVO antes do MODO.
    -- Com modo_sombra em primeiro lugar, 100% das linhas saiam com
    -- motivo_pulo='modo_sombra' e a sombra nao respondia a unica pergunta
    -- que ela existe para responder: o que aconteceria se eu ligasse.
    -- Nesta ordem, a contagem de 'modo_sombra' passa a ser exatamente
    -- quantos leads o motor moveria se o modo virasse 'ativo'.
    IF _acao = 'nenhuma' THEN
      _pulo := 'sem_acao';
    ELSIF _r.lote_global OR _r.escrita_em_lote THEN
      _pulo := 'escrita_em_lote';
    ELSIF _r.ressurreicao_sdr THEN
      _pulo := 'ressurreicao_sdr';
    ELSIF _r.corretor_id IS NULL AND _acao IN ('alertar','devolver_roleta') THEN
      _pulo := 'sem_corretor';
    ELSIF _acao = 'perdido' AND _perdidos >= _cfg.teto_perdidos_dia THEN
      _pulo := 'teto_perdidos_dia';
    -- Os portoes de MODO ficam por ultimo, de proposito.
    ELSIF _cfg.modo = 'sombra' THEN
      _pulo := 'modo_sombra';
    ELSIF _cfg.modo = 'ativo_parcial' AND _acao <> 'alertar' THEN
      _pulo := 'modo_ativo_parcial';
    END IF;

    IF _pulo IS NULL THEN
      BEGIN
        IF _acao = 'alertar' THEN
          INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
          VALUES (_r.corretor_id, 'follow_up'::public.alerta_tipo,
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

  -- Cabecalho da execucao: gravado SEMPRE, inclusive com zero candidatos.
  -- E o que separa "rodou e nao achou ninguem" de "nunca rodou".
  INSERT INTO public.higiene_execucao
    (execucao_id, modo, avaliados, aplicados, pulados, erros)
  VALUES (_exec, _cfg.modo, _aval, _apl, _pul, _err);

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
       WHERE ref_id = _r.lead_id AND tipo = 'follow_up'::public.alerta_tipo
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

-- View do batimento cardiaco do motor, agora com motor_atrasado.
-- DROP + CREATE em vez de CREATE OR REPLACE: a coluna nova entra no MEIO da
-- lista, e replace so aceita coluna nova no fim. Seguro porque nada depende
-- desta view ainda (a tela do motor e a Fatia 2c).

DROP VIEW IF EXISTS public.v_higiene_motor_status;

-- Le o CABECALHO da execucao (higiene_execucao), nao o log de leads: execucao
-- com zero candidatos tambem conta como execucao. O detalhamento por motivo
-- continua vindo do log, por LEFT JOIN — quando nao ha linhas, vem NULL, e
-- isso e correto: "rodou e nao achou ninguem" tem motivos_pulo vazio, nao
-- ultima_execucao vazia.
CREATE VIEW public.v_higiene_motor_status
WITH (security_invoker = true) AS
SELECT
  c.modo,
  c.dias_parado_min,
  c.lote_min_leads,
  c.teto_perdidos_dia,
  c.lote_max,
  e.ts          AS ultima_execucao,
  -- Criterio de aceite 3(a): motor parado nao pode parecer "nada a fazer".
  -- TRUE tambem quando nunca rodou — motor recem-instalado e motor quebrado
  -- pintam o cabecalho de vermelho igual. Verde seria o pior bug desta tela.
  (e.ts IS NULL OR now() - e.ts > interval '26 hours') AS motor_atrasado,
  e.execucao_id,
  COALESCE(e.avaliados, 0) AS avaliados,
  COALESCE(e.aplicados, 0) AS aplicados,
  COALESCE(e.pulados, 0)   AS pulados,
  COALESCE(e.erros, 0)     AS erros,
  m.motivos_pulo
FROM public.higiene_config c
LEFT JOIN LATERAL (
  SELECT execucao_id, ts, avaliados, aplicados, pulados, erros
    FROM public.higiene_execucao ORDER BY ts DESC LIMIT 1
) e ON true
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(x.motivo, x.n) AS motivos_pulo
    FROM (
      SELECT COALESCE(motivo_pulo, 'aplicado') AS motivo, count(*) AS n
        FROM public.higiene_execucao_log
       WHERE execucao_id = e.execucao_id
       GROUP BY 1
    ) x
) m ON true
WHERE c.id;

COMMENT ON VIEW public.v_higiene_motor_status IS
  'Batimento cardiaco do motor de higiene. Le higiene_execucao (uma linha por execucao, mesmo com zero candidatos) para que "rodou e nao achou ninguem" nunca se confunda com "nunca rodou". Sempre devolve uma linha.';

GRANT SELECT ON public.v_higiene_motor_status TO authenticated;
