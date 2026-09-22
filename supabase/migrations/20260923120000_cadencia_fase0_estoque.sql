-- ===========================================================================
-- CADÊNCIA — Fase 0: o estoque parado entra no processo
-- ===========================================================================
-- Cadência em 20260921120000/120100/120200, avanço na escrita em
-- 20260922120000. Desenho: docs/ops/cadencia-followup-reativacao.md.
--
-- A cadência nasceu governando só o fluxo novo: lead que ganha corretor entra
-- em D1 pelo gatilho. O estoque que já estava na carteira — o problema que
-- motivou o projeto inteiro — continua invisível para ela, porque
-- `cadencia_etapa` é NULL e nenhum job olha para quem está fora da cadência.
--
-- Esta migration dá a esses leads um destino, uma vez só, na régua do §"Fase 0"
-- do documento:
--
--   telefone suspeito ou opt-out  -> encerrado com motivo, fora de toda fila
--   parado há mais de 30 dias     -> reativação direto, SEM janela de descanso
--   parado entre 7 e 30 dias      -> D1 na carteira atual, em lotes diários
--   movimento nos últimos 7 dias  -> D1 também, e antes dos outros
--
-- ---------------------------------------------------------------------------
-- TRÊS DECISÕES QUE O DOCUMENTO NÃO TOMOU
-- ---------------------------------------------------------------------------
-- 1. ESCRITA EM LOTE NÃO É ABANDONO. A medição de 11/09/2026 achou 12.995
--    leads (22,4% da base) com relógio idêntico AO SEGUNDO, de duas
--    importações. Ler isso como "parado há 30 dias" despejaria mais de doze
--    mil leads na reativação por causa de um carimbo de importação, e o
--    discador passaria semanas ligando para gente que nunca foi trabalhada.
--    `v_higiene_base` já marca esses casos (`escrita_em_lote`); aqui eles
--    NUNCA vão para a reativação por tempo — vão para a cadência, com o
--    corretor, que é quem descobre se o lead presta.
--
-- 2. FASE 0 SÓ MEXE EM LEAD COM CORRETOR. Lead sem dono já é do Bolsão, e o
--    discador já o alcança por lá. Mandá-lo para `reativacao_fila` o TIRARIA
--    do Bolsão (por `_bolsao_elegivel`, desde 20260921120200) — trocaria uma
--    fila por outra sem ganho, e ainda esconderia o lead atrás de uma janela
--    de elegibilidade. O escopo é o que o documento chama de estoque: o que
--    está parado DENTRO de uma carteira.
--
-- 3. A ADMISSÃO ORDENA PELO MAIS QUENTE. O documento separa "7 a 30 dias" de
--    "últimos 7 dias" mas manda os dois para D1. Em vez de duas filas, uma
--    só, ordenada por dias parados crescente: quem se mexeu ontem entra antes
--    de quem parou há três semanas. Com teto de `lote_estoque_dia` por
--    corretor por chamada, o corretor recebe primeiro o que tem mais chance
--    de responder — e a Fila do Dia dele não abre com 200 itens, que é o
--    risco que o próprio documento nomeia.
--
-- ---------------------------------------------------------------------------
-- COMO SE USA (nada aqui roda sozinho — não há cron nesta migration)
-- ---------------------------------------------------------------------------
--   -- 1. Ver o que aconteceria, sem tocar em nada:
--   select destino, count(*) from public.cadencia_fase0_classificar() group by 1;
--
--   -- 2. A carga única (encerrar suspeitos + mandar o >30d para a reativação):
--   select * from public.cadencia_fase0_executar('sombra');   -- ensaio
--   select * from public.cadencia_fase0_executar('ativo');    -- valendo
--
--   -- 3. A admissão diária na cadência, 15 por corretor por chamada:
--   select * from public.cadencia_fase0_admitir('ativo');
--
-- Tudo registra em `cadencia_execucao_log` com `job = 'fase0'` e um `lote_id`,
-- e tudo é idempotente: rodar duas vezes não processa o mesmo lead de novo,
-- porque depois da primeira passagem ele deixa de casar com a classificação.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) O log aceita o job novo
-- ---------------------------------------------------------------------------
ALTER TABLE public.cadencia_execucao_log DROP CONSTRAINT IF EXISTS cadencia_execucao_log_job_check;
ALTER TABLE public.cadencia_execucao_log
  ADD CONSTRAINT cadencia_execucao_log_job_check
  CHECK (job IN ('avancar','encerrar','vencidos','auditoria','fase0'));

-- ---------------------------------------------------------------------------
-- 2) A classificação: uma regra, usada pelo ensaio E pela execução
-- ---------------------------------------------------------------------------
-- Ler e agir pela MESMA função é o que garante que o número do ensaio seja o
-- número da execução. Duas consultas parecidas divergem no primeiro ajuste, e
-- a divergência só aparece depois de mover mil leads.
--
-- `dias_parado` sai de `higiene_dias_parado`, o relógio único da casa
-- (20260911230100). Inventar um segundo aqui faria a Fase 0 discordar da tela
-- de higiene sobre quem está parado, com os dois números certos.
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
      -- Mesma janela de `v_higiene_base`: quantos leads vivos carregam o
      -- mesmo instante ao segundo. Recalculada aqui porque o recorte desta
      -- função é outro (só carteira), e a contagem precisa ser do recorte.
      (count(*) OVER (PARTITION BY date_trunc('second',
         COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))
       >= (SELECT lote_min_leads FROM public.higiene_config WHERE id)) AS em_lote
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      -- Decisão 2: só estoque DENTRO de carteira.
      AND l.corretor_id IS NOT NULL
      -- Quem já está na cadência não é estoque — já tem destino.
      AND l.cadencia_etapa IS NULL
      AND l.arquivado_em IS NULL
      -- A janela pré-resposta. Fundo de funil tem SLA por fase, não cadência.
      AND l.status IN ('novo'::public.lead_status,
                       'aguardando_atendimento'::public.lead_status,
                       'aguardando_corretor'::public.lead_status,
                       'em_atendimento'::public.lead_status,
                       'aguardando_retorno'::public.lead_status)
      -- Regra nº 1 da diretoria: não se mexe em lead com venda viva.
      AND NOT public._lead_venda_viva(l.id)
  )
  SELECT
    b.id,
    b.corretor_id,
    CASE
      WHEN b.suspeito OR b.optout            THEN 'encerrar'
      -- Decisão 1: importação não vira reativação por tempo.
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
  'Classificação do estoque para a Fase 0 (encerrar | reativacao | cadencia). '
  'Só lead COM corretor, fora da cadência e na janela pré-resposta. É a mesma '
  'função que o ensaio e a execução usam — o número do dry-run é o da carga.';

-- ---------------------------------------------------------------------------
-- 3) A carga única: encerra os inválidos e manda o estoque frio à reativação
-- ---------------------------------------------------------------------------
-- Não mexe em quem vai para a cadência — esse é trabalho do `admitir`, que é
-- gradual de propósito.
--
-- O lead do estoque entra na reativação com `elegivel_em = now()`, SEM os 15
-- dias de descanso. A janela existe porque a mensagem do D3 avisa o cliente de
-- que o atendimento acabou, e ligar no dia seguinte irrita; este lead nunca
-- recebeu essa mensagem — está frio há mais de um mês e o silêncio já foi o
-- descanso.
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

  -- Alias obrigatório: `destino` e `dias_parado` também são nomes dos
  -- parâmetros de saída desta função, e sem o `k.` o Postgres não sabe se a
  -- referência é à coluna ou ao OUT — recusa com "column reference is
  -- ambiguous". A suíte pegou isto antes da primeira carga real.
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
               -- Sem ficha de tentativas: este lead nunca passou pela
               -- cadência. NULL é honesto; um objeto zerado faria o SDR achar
               -- que 7 tentativas foram feitas e falharam.
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
                          -- A etapa que o lead REALMENTE recebeu. `etapa_para`
                          -- guarda o destino ('reativacao'), que não é o mesmo
                          -- que o estado ('descanso'); o desfazer precisa do
                          -- estado para saber se o lead continua como a carga
                          -- o deixou. Gravar o que aconteceu é mais barato do
                          -- que uma segunda tabela de-para que pode divergir.
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
  'Carga única da Fase 0: encerra suspeito/opt-out e manda o estoque frio '
  '(>30d, fora de escrita em lote) para a reativação sem janela de descanso. '
  'Admin apenas. Idempotente: depois de rodar, o lead sai da classificação.';

-- ---------------------------------------------------------------------------
-- 4) A admissão diária na cadência
-- ---------------------------------------------------------------------------
-- Até `lote_estoque_dia` leads por corretor por chamada, do mais quente para o
-- mais frio. Chamar todo dia esvazia o estoque num ritmo que o corretor
-- consegue trabalhar; chamar de uma vez devolveria a Fila do Dia com 200
-- itens, que é a forma conhecida de fazer o time desistir no primeiro dia.
--
-- Quem coloca em D1 é `cadencia_iniciar`, a MESMA função do gatilho de
-- atribuição. Ela já recusa lead fora da janela, arquivado, com opt-out ou já
-- em cadência — então a admissão não precisa repetir nenhuma dessas guardas, e
-- não pode divergir delas.
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
  'Admite o estoque na cadência em lotes por corretor (padrão '
  'cadencia_config.lote_estoque_dia), do mais quente para o mais frio. Chamar '
  'uma vez por dia até a classificação zerar. Admin apenas.';

-- ---------------------------------------------------------------------------
-- 5) Desfazer um lote
-- ---------------------------------------------------------------------------
-- A Fase 0 move milhares de leads de uma vez; um engano descoberto na manhã
-- seguinte precisa de um caminho de volta que não seja arqueologia. O log
-- guarda o dono anterior de cada lead, e é dele que a volta sai.
--
-- Só desfaz o que a Fase 0 aplicou, e só se o lead ainda estiver como ela o
-- deixou — se alguém já trabalhou o lead depois, a linha é pulada em vez de
-- sobrescrever trabalho humano.
--
-- O lead volta JÁ EM D1, e não em limbo: devolver o corretor dispara
-- `trg_cadencia_ao_atribuir`, que inicia a cadência. É o desfecho certo —
-- lead de volta na carteira sem etapa e sem prazo é exatamente o estado que
-- este projeto existe para eliminar. Desfazer a carga não é desfazer o
-- processo.
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
       -- Só volta o que continua exatamente como a Fase 0 deixou.
       AND cadencia_etapa IS NOT DISTINCT FROM (_r.detalhe ->> 'etapa_aplicada')
       AND NOT EXISTS (SELECT 1 FROM public.cadencia_tentativas t
                        WHERE t.lead_id = _r.lead_id);
    -- GET DIAGNOSTICS, e não FOUND, porque o PERFORM abaixo REDEFINE FOUND:
    -- set_config devolve uma linha, então FOUND viraria true mesmo quando o
    -- UPDATE não casou — e o desfazer diria ter revertido leads que não
    -- tocou. A suíte pegou isto no teste do lead já trabalhado.
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
  'Volta um lote da Fase 0 ao dono anterior. Pula lead que já foi trabalhado '
  'depois (tem tentativa registrada ou mudou de etapa) — desfazer não '
  'sobrescreve trabalho humano.';

NOTIFY pgrst, 'reload schema';
