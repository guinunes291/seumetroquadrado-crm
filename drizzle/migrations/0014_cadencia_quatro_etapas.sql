-- ===========================================================================
-- CADÊNCIA EM 4 ETAPAS: Lead chegou → D1 → D2 → D3
-- ===========================================================================
-- Decisão do dono (26/09/2026): "o primeiro toque não é um follow-up".
--
--   Lead chegou (D0)  mensagem de abertura + 2 ligações + 1 WhatsApp
--   D1                1º follow-up: 2 ligações + 1 WhatsApp
--   D2                2º follow-up: 2 ligações + 1 WhatsApp
--   D3                encerramento: a mensagem que avisa o cliente
--
-- Antes eram 3 etapas, e o D1 do motor ERA o dia da chegada. O que o corretor
-- chamava de "1º follow-up" o banco chamava de D2 — dois nomes para a mesma
-- coisa, e uma etapa (o 2º follow-up) que não existia. Agora o código do banco
-- é o que o dono fala: D1, D2 e D3 querem dizer exatamente isso nas consultas.
--
-- Cadência cumprida (100%) passa a exigir as 4 etapas completas em pelo menos
-- 4 dias diferentes (10 toques). Cada etapa vence no fim do dia seguinte ao da
-- conclusão da anterior; a chegada vence no fim do próprio dia. Etapa vencida
-- em Lead chegou, D1 ou D2 continua indo para a roleta; o D3 continua
-- terminando em descanso/reativação.
--
-- ---------------------------------------------------------------------------
-- A VIRADA DOS LEADS QUE JÁ ESTÃO NA CADÊNCIA
-- ---------------------------------------------------------------------------
--   D1 antigo (chegada)                    → D0
--   D2 antigo (1º follow-up)               → D1
--   D3 antigo SEM a mensagem de encerramento → D2 (ganha o 2º follow-up)
--   D3 antigo COM a mensagem já enviada    → fica em D3
--
-- O último caso não volta: o cliente já leu "vou encerrar seu atendimento".
-- Para ele a regra dos 100% é a antiga (3 etapas em 3 dias) — senão a
-- cadência que ele cumpriu viraria "incompleta" e ele iria para a roleta em
-- vez da reativação. A exceção se apaga sozinha: vale só para mensagem de
-- encerramento enviada antes de `cadencia_config.quatro_etapas_desde`, e esses
-- leads saem do D3 em até 24 h.
--
-- As tentativas são renomeadas junto (a etapa de cada toque tem de bater com
-- a etapa do lead, senão "etapa completa" conta toque de outra etapa). O
-- histórico que o Painel lê — os eventos de etapa em lead_eventos e o log do
-- motor — também: senão a semana da virada mostraria "respondeu no D1" do
-- modelo velho ao lado de "alcançou o D1" do novo, e a taxa por etapa sairia
-- misturada.
--
-- A virada roda UMA vez: `quatro_etapas_desde` é o marcador. Se esta migration
-- for reaplicada (colada à mão e depois aplicada pelo deploy), o segundo
-- `D1 → D0` empurraria de volta quem já está no 1º follow-up — por isso ele
-- não acontece.
--
-- Rollback: não há volta automática da virada dos dados. As funções anteriores
-- estão em 20260921120100..20260926120000.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Marcador da virada e as etapas aceitas
-- ---------------------------------------------------------------------------
ALTER TABLE public.cadencia_config ADD COLUMN IF NOT EXISTS quatro_etapas_desde timestamptz;

COMMENT ON COLUMN public.cadencia_config.quatro_etapas_desde IS
  'Quando a cadência passou a ter 4 etapas (Lead chegou/D1/D2/D3). Marca a '
  'virada dos dados (roda uma vez) e separa a regra dos 100% antiga da nova.';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_cadencia_etapa_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_cadencia_etapa_check CHECK (
    cadencia_etapa IS NULL OR cadencia_etapa IN (
      'D0','D1','D2','D3','respondeu','descanso','reativacao','arquivado','encerrado'
    )
  );

ALTER TABLE public.cadencia_tentativas DROP CONSTRAINT IF EXISTS cadencia_tentativas_etapa_check;
ALTER TABLE public.cadencia_tentativas
  ADD CONSTRAINT cadencia_tentativas_etapa_check CHECK (etapa IN ('D0','D1','D2','D3'));

COMMENT ON COLUMN public.leads.cadencia_etapa IS
  'O que o corretor deve fazer agora: D0 (lead chegou), D1 (1º follow-up), D2 '
  '(2º follow-up), D3 (encerramento). Independente de leads.status. NULL = fora '
  'da cadência.';

-- Os índices parciais que servem a Fila do Dia e o motor passam a ver o D0.
DROP INDEX IF EXISTS public.leads_cadencia_prazo_idx;
CREATE INDEX leads_cadencia_prazo_idx
  ON public.leads (corretor_id, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D0','D1','D2','D3');

DROP INDEX IF EXISTS public.leads_cadencia_etapa_prazo_idx;
CREATE INDEX leads_cadencia_etapa_prazo_idx
  ON public.leads (cadencia_etapa, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D0','D1','D2','D3');

-- ---------------------------------------------------------------------------
-- 2) A virada — uma vez só
-- ---------------------------------------------------------------------------
-- Função (e não um bloco solto) para o teste poder exercitar a virada num
-- banco montado no formato antigo. Sem grant: só o dono do banco a chama.
CREATE OR REPLACE FUNCTION public._cadencia_virada_quatro_etapas()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _para_d2 uuid[];
  _n_d0 int; _n_d1 int; _n_d2 int; _n_d3 int;
BEGIN
  IF (SELECT quatro_etapas_desde FROM public.cadencia_config WHERE id = 1) IS NOT NULL THEN
    RETURN jsonb_build_object('aplicada', false);
  END IF;

  -- Quem está no D3 antigo sem a mensagem de encerramento ganha o 2º follow-up.
  SELECT COALESCE(array_agg(l.id), '{}') INTO _para_d2
    FROM public.leads l
   WHERE l.cadencia_etapa = 'D3'
     AND NOT EXISTS (
       SELECT 1 FROM public.cadencia_tentativas t
        WHERE t.lead_id = l.id AND t.ciclo = COALESCE(l.cadencia_ciclo, 1)
          AND t.etapa = 'D3' AND t.canal = 'whatsapp');

  -- A ORDEM importa: D1 sai antes de D2 entrar no lugar dele.
  UPDATE public.cadencia_tentativas SET etapa = 'D0' WHERE etapa = 'D1';
  UPDATE public.cadencia_tentativas SET etapa = 'D1' WHERE etapa = 'D2';
  -- Ligação de "D3" (não deveria existir, mas o discador grava o que vier)
  -- do lead que volta para D2 passa a contar no D2.
  UPDATE public.cadencia_tentativas t SET etapa = 'D2'
    FROM public.leads l
   WHERE l.id = ANY (_para_d2) AND t.lead_id = l.id
     AND t.ciclo = COALESCE(l.cadencia_ciclo, 1) AND t.etapa = 'D3';

  -- Histórico: uma instrução por tabela, com CASE, para nada andar duas vezes.
  UPDATE public.lead_eventos e
     SET payload = e.payload
       || jsonb_build_object('de_estado',
            CASE e.payload->>'de_estado' WHEN 'D1' THEN 'D0' WHEN 'D2' THEN 'D1'
                 ELSE e.payload->>'de_estado' END)
       || jsonb_build_object('para_estado',
            CASE e.payload->>'para_estado' WHEN 'D1' THEN 'D0' WHEN 'D2' THEN 'D1'
                 ELSE e.payload->>'para_estado' END)
   WHERE e.tipo = 'cadencia_etapa'
     AND (e.payload->>'de_estado' IN ('D1','D2') OR e.payload->>'para_estado' IN ('D1','D2'));
  UPDATE public.cadencia_execucao_log g
     SET etapa_de   = CASE g.etapa_de   WHEN 'D1' THEN 'D0' WHEN 'D2' THEN 'D1' ELSE g.etapa_de END,
         etapa_para = CASE g.etapa_para WHEN 'D1' THEN 'D0' WHEN 'D2' THEN 'D1' ELSE g.etapa_para END
   WHERE g.etapa_de IN ('D1','D2') OR g.etapa_para IN ('D1','D2');

  UPDATE public.leads SET cadencia_etapa = 'D0' WHERE cadencia_etapa = 'D1';
  GET DIAGNOSTICS _n_d0 = ROW_COUNT;
  UPDATE public.leads SET cadencia_etapa = 'D1' WHERE cadencia_etapa = 'D2';
  GET DIAGNOSTICS _n_d1 = ROW_COUNT;
  UPDATE public.leads SET cadencia_etapa = 'D2' WHERE id = ANY (_para_d2);
  GET DIAGNOSTICS _n_d2 = ROW_COUNT;
  SELECT count(*) INTO _n_d3 FROM public.leads WHERE cadencia_etapa = 'D3';

  -- Os textos acompanham as etapas: o de abertura é da chegada, o de
  -- insistência é do 1º follow-up, e o 2º follow-up ganha um texto próprio.
  -- Todos os registros do contexto (ativos e variantes de teste A/B), na
  -- mesma ordem das etapas por causa do índice único de contexto ativo.
  UPDATE public.templates_mensagem
     SET contexto = 'cadencia_D0', nome = replace(nome, 'Cadência D1', 'Cadência — Lead chegou')
   WHERE contexto = 'cadencia_D1';
  UPDATE public.templates_mensagem
     SET contexto = 'cadencia_D1', nome = replace(nome, 'Cadência D2', 'Cadência D1 — 1º follow-up')
   WHERE contexto = 'cadencia_D2';
  INSERT INTO public.templates_mensagem (nome, canal, conteudo, contexto, ativo)
  SELECT 'Cadência D2 — 2º follow-up', 'whatsapp',
         '{nome}, sei que a rotina é corrida. Separei as condições do {empreendimento} para o seu perfil e te explico em 5 minutos. Te ligo hoje às 12h ou prefere às 19h?',
         'cadencia_D2', true
   WHERE NOT EXISTS (SELECT 1 FROM public.templates_mensagem WHERE contexto = 'cadencia_D2');

  UPDATE public.cadencia_config SET quatro_etapas_desde = now() WHERE id = 1;

  RETURN jsonb_build_object(
    'aplicada', true,
    'lead_chegou', _n_d0,
    'primeiro_followup', _n_d1,
    'segundo_followup', _n_d2,
    'encerramento', _n_d3
  );
END;
$$;

REVOKE ALL ON FUNCTION public._cadencia_virada_quatro_etapas() FROM PUBLIC, anon, authenticated;

DO $virada$
DECLARE
  _r jsonb := public._cadencia_virada_quatro_etapas();
BEGIN
  IF NOT (_r->>'aplicada')::boolean THEN
    RAISE NOTICE 'cadência: virada para 4 etapas já aplicada — nada a fazer';
  ELSE
    RAISE NOTICE 'cadência: virada para 4 etapas — % em Lead chegou, % no 1º follow-up, % foram para o 2º follow-up, % seguem no encerramento',
      _r->>'lead_chegou', _r->>'primeiro_followup', _r->>'segundo_followup', _r->>'encerramento';
  END IF;
END
$virada$;

-- ---------------------------------------------------------------------------
-- 3) A regra dos 100%
-- ---------------------------------------------------------------------------
-- 4 etapas completas em 4 dias diferentes. A exceção é a cadência que já tinha
-- mandado a mensagem de encerramento ANTES da virada: essa foi feita no modelo
-- de 3 etapas (sem 2º follow-up) e é julgada por ele.
CREATE OR REPLACE FUNCTION public.cadencia_cumprida_100(_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH l AS (
    SELECT COALESCE(ld.cadencia_ciclo, 1) AS ciclo FROM public.leads ld WHERE ld.id = _lead
  ),
  dias AS (
    SELECT count(DISTINCT (tt.ts AT TIME ZONE 'America/Sao_Paulo')::date) AS n
      FROM public.cadencia_tentativas tt, l
     WHERE tt.lead_id = _lead AND tt.ciclo = l.ciclo
  ),
  legado AS (
    SELECT NOT EXISTS (
             SELECT 1 FROM public.cadencia_tentativas tt, l
              WHERE tt.lead_id = _lead AND tt.ciclo = l.ciclo AND tt.etapa = 'D2')
       AND EXISTS (
             SELECT 1 FROM public.cadencia_tentativas tt, l, public.cadencia_config c
              WHERE c.id = 1 AND tt.lead_id = _lead AND tt.ciclo = l.ciclo
                AND tt.etapa = 'D3' AND tt.canal = 'whatsapp'
                AND tt.ts < c.quatro_etapas_desde) AS sim
  )
  SELECT public.cadencia_etapa_completa(_lead, 'D0')
     AND public.cadencia_etapa_completa(_lead, 'D1')
     AND public.cadencia_etapa_completa(_lead, 'D3')
     AND CASE WHEN (SELECT sim FROM legado)
              THEN (SELECT n FROM dias) >= 3
              ELSE public.cadencia_etapa_completa(_lead, 'D2') AND (SELECT n FROM dias) >= 4
         END;
$$;

COMMENT ON FUNCTION public.cadencia_cumprida_100(uuid) IS
  'Cadência cumprida: Lead chegou, D1, D2 e D3 completos em 4 dias diferentes '
  '(10 toques). Encerramento enviado antes de quatro_etapas_desde é julgado '
  'pela regra antiga de 3 etapas em 3 dias.';

-- ---------------------------------------------------------------------------
-- 4) O card da cadência, num lugar só
-- ---------------------------------------------------------------------------
-- A Fila do Dia e o Kanban mostram o mesmo card. Montado aqui, os dois não
-- divergem no contador de progresso — que é o número que diz ao corretor o
-- que falta para a etapa andar.
CREATE OR REPLACE FUNCTION public._cadencia_item(_lead uuid, _fim_hoje timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'nome', l.nome,
    'telefone', l.telefone,
    'email', l.email,
    'status', l.status::text,
    'etapa', l.cadencia_etapa,
    'ciclo', l.cadencia_ciclo,
    'reativado', l.reativado,
    'projeto_nome', l.projeto_nome,
    'faixa_mcmv', l.faixa_mcmv,
    'renda_estimada', l.renda_estimada,
    'prazo', l.cadencia_prazo_ts,
    'atrasado', (l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)),
    'proxima_acao', l.proxima_acao,
    'telefone_suspeito', public.telefone_suspeito(l.telefone),
    -- As ligações já respeitam o intervalo mínimo, senão o contador diria 2 e
    -- a etapa não fecharia — e o corretor não entenderia por quê.
    'ligacoes_validas', (
      SELECT count(*) FROM (
        SELECT tt.ts - lag(tt.ts) OVER (ORDER BY tt.ts) AS gap
        FROM public.cadencia_tentativas tt
        WHERE tt.lead_id = l.id AND tt.etapa = l.cadencia_etapa
          AND tt.ciclo = l.cadencia_ciclo AND tt.canal = 'ligacao'
      ) g, public.cadencia_config c
      WHERE c.id = 1 AND (g.gap IS NULL OR g.gap >= c.intervalo_min_lig)
    ),
    'whatsapp_enviado', EXISTS (
      SELECT 1 FROM public.cadencia_tentativas tt
      WHERE tt.lead_id = l.id AND tt.etapa = l.cadencia_etapa
        AND tt.ciclo = l.cadencia_ciclo AND tt.canal = 'whatsapp'
    ),
    'etapa_completa', public.cadencia_etapa_completa(l.id, l.cadencia_etapa)
  )
  FROM public.leads l
  WHERE l.id = _lead;
$$;

REVOKE ALL ON FUNCTION public._cadencia_item(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) A Fila do Dia: mesma regra, card compartilhado, Lead chegou primeiro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cadencia_fila_v1(
  _corretor uuid DEFAULT NULL,
  _take     integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := COALESCE(_corretor, auth.uid());
  _fim_hoje timestamptz := public.cadencia_fim_do_dia(now(), 0);
  _itens jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _target <> _uid AND NOT public.pode_acessar_corretor(_uid, _target) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _take := LEAST(GREATEST(COALESCE(_take, 200), 1), 500);

  SELECT COALESCE(jsonb_agg(public._cadencia_item(s.id, _fim_hoje) ORDER BY s.ordem), '[]'::jsonb)
    INTO _itens
  FROM (
    SELECT
      l.id,
      row_number() OVER (
        ORDER BY
          -- 1: atrasado, 2: vence hoje. Quem vence depois de hoje não entra.
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje) THEN 1 ELSE 2 END,
          -- atrasados: o mais antigo primeiro
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)
               THEN l.cadencia_prazo_ts END ASC NULLS LAST,
          -- vencendo hoje: Lead chegou antes de D1, D1 antes de D2, D2 antes
          -- de D3. Lead novo esfria mais rápido.
          CASE l.cadencia_etapa WHEN 'D0' THEN 0 WHEN 'D1' THEN 1 WHEN 'D2' THEN 2 ELSE 3 END,
          -- desempate: maior renda primeiro
          public.cadencia_prioridade_reativacao(l.id) ASC,
          l.created_at ASC
      ) AS ordem
    FROM public.leads l
    WHERE l.corretor_id = _target
      AND l.cadencia_etapa IN ('D0','D1','D2','D3')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts <= _fim_hoje
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY ordem
    LIMIT _take
  ) s;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'corretor_id', _target,
    'itens', _itens
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) O Kanban: todos os leads em cadência, por etapa
-- ---------------------------------------------------------------------------
-- Diferente da Fila do Dia, que só mostra o que vence hoje ou já venceu, o
-- Kanban mostra a cadência INTEIRA do corretor — é a visão de "onde está cada
-- cliente". Mesmas guardas de escopo da fila. Sem mover card: a etapa só anda
-- com toque registrado, e é o motor que a faz andar.
CREATE OR REPLACE FUNCTION public.cadencia_kanban_v1(
  _corretor uuid DEFAULT NULL,
  _take     integer DEFAULT 400
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := COALESCE(_corretor, auth.uid());
  _fim_hoje timestamptz := public.cadencia_fim_do_dia(now(), 0);
  _itens jsonb;
  _total int;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _target <> _uid AND NOT public.pode_acessar_corretor(_uid, _target) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _take := LEAST(GREATEST(COALESCE(_take, 400), 1), 1000);

  SELECT count(*) INTO _total
    FROM public.leads l
   WHERE l.corretor_id = _target
     AND l.cadencia_etapa IN ('D0','D1','D2','D3')
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false);

  SELECT COALESCE(jsonb_agg(public._cadencia_item(s.id, _fim_hoje) ORDER BY s.ordem), '[]'::jsonb)
    INTO _itens
  FROM (
    SELECT
      l.id,
      row_number() OVER (
        ORDER BY
          CASE l.cadencia_etapa WHEN 'D0' THEN 0 WHEN 'D1' THEN 1 WHEN 'D2' THEN 2 ELSE 3 END,
          -- dentro da coluna: atrasado primeiro, depois o prazo mais próximo
          l.cadencia_prazo_ts ASC NULLS LAST,
          l.created_at ASC
      ) AS ordem
    FROM public.leads l
    WHERE l.corretor_id = _target
      AND l.cadencia_etapa IN ('D0','D1','D2','D3')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY ordem
    LIMIT _take
  ) s;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'corretor_id', _target,
    'total', _total,
    'itens', _itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_kanban_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_kanban_v1(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_kanban_v1(uuid, integer) IS
  'Kanban da cadência: todos os leads em Lead chegou (D0), D1, D2 e D3 do '
  'corretor, com o mesmo card da Fila do Dia. Somente leitura — a etapa anda '
  'por toque registrado, nunca por arrastar o card.';

-- ---------------------------------------------------------------------------
-- 7) As outras 24 funções que conhecem as etapas
-- ---------------------------------------------------------------------------
-- Idênticas às vigentes, com duas classes de mudança conferidas por diff:
--   * "está em cadência" passa de ('D1','D2','D3') para ('D0','D1','D2','D3');
--   * lógica: cadencia_iniciar começa em D0; cadencia_avancar_lead anda
--     D0→D1→D2→D3; cadencia_avancar e cadencia_vencidos olham D0, D1 e D2;
--     a admissão da Fase 0 registra D0.
-- cadencia_etapa_completa não muda: o ramo geral (2 ligações + 1 WhatsApp) já
-- cobre D0, D1 e D2, e o D3 continua sendo só a mensagem de encerramento.

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
  -- Cadência é trabalho de quem está na casa (20260926120000).
  IF NOT public._cadencia_dono_ativo(_l.corretor_id) THEN
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
     SET cadencia_etapa     = 'D0',
         cadencia_inicio_ts = now(),
         cadencia_prazo_ts  = public.cadencia_fim_do_dia(now(), 0)
   WHERE id = _lead;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_avancar_lead(
  _lead   uuid,
  _modo   text DEFAULT NULL,
  _lote   uuid DEFAULT NULL,
  _origem text DEFAULT 'motor'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _l record;
  _proxima text;
  _concluida_em timestamptz;
  _prazo timestamptz;
  _ok boolean := false;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_ciclo
    INTO _l
  FROM public.leads l
  WHERE l.id = _lead
    AND l.cadencia_etapa IN ('D0','D1','D2')
    AND l.deleted_at IS NULL
    AND NOT COALESCE(l.na_lixeira, false);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.cadencia_etapa_completa(_l.id, _l.cadencia_etapa) THEN
    RETURN NULL;
  END IF;

  _proxima := CASE _l.cadencia_etapa WHEN 'D0' THEN 'D1' WHEN 'D1' THEN 'D2' ELSE 'D3' END;

  SELECT max(t.ts) INTO _concluida_em
  FROM public.cadencia_tentativas t
  WHERE t.lead_id = _l.id
    AND t.etapa = _l.cadencia_etapa
    AND t.ciclo = _l.cadencia_ciclo;

  _prazo := public.cadencia_fim_do_dia(COALESCE(_concluida_em, now()), 1);

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
              jsonb_build_object('de_estado', _l.cadencia_etapa,
                                 'para_estado', _proxima,
                                 'origem', _origem));
    END IF;
  END IF;

  INSERT INTO public.cadencia_execucao_log
    (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
  VALUES
    (COALESCE(_lote, gen_random_uuid()), 'avancar', _l.id, _l.corretor_id,
     _l.cadencia_etapa, _proxima, 'etapa_completa', _m, _ok,
     jsonb_build_object('origem', _origem, 'concluida_em', _concluida_em));

  RETURN CASE WHEN _ok THEN _proxima ELSE NULL END;
END;
$$;

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
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D0','D1','D2')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts NULLS FIRST
    LIMIT GREATEST(COALESCE(_limite, 1000), 1)
  LOOP
    PERFORM public.cadencia_avancar_lead(_l.id, _m, _lote, 'motor');
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

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

  PERFORM public.cadencia_devolver_inativos(_m);

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_prazo_ts
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D0','D1','D2')
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
  _cap_est integer;
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
  _cap_est := GREATEST(COALESCE(
    (public.carteira_ativa_config() ->> 'cap_formacao_estoque')::int,
    COALESCE((public.carteira_ativa_config() ->> 'cap_formacao')::int, 20) / 2), 0);

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin admite estoque na cadência' USING ERRCODE = '42501';
  END IF;

  FOR _c IN
    WITH k AS (
      SELECT x.lead_id, x.corretor_id, x.dias_parado,
             row_number() OVER (PARTITION BY x.corretor_id
                                ORDER BY x.dias_parado ASC, x.lead_id) AS pos
      FROM public.cadencia_fase0_classificar() AS x
      WHERE x.destino = 'cadencia'
    ),
    cota AS (
      SELECT d.corretor_id,
             LEAST(
               _teto,
               GREATEST(0, _cap_est - (
                 SELECT count(*)::int FROM public.leads AS l
                  WHERE l.corretor_id = d.corretor_id
                    AND l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3')
                    AND l.deleted_at IS NULL
                    AND l.na_lixeira = false)),
               public.carteira_vagas_entrada_v1(d.corretor_id)
             ) AS n
      FROM (SELECT DISTINCT k.corretor_id FROM k) AS d
    )
    SELECT k.lead_id, k.corretor_id, k.dias_parado, cota.n AS cota
    FROM k
    JOIN cota ON cota.corretor_id = k.corretor_id
    WHERE k.pos <= cota.n
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      _ok := public.cadencia_iniciar(_c.lead_id);
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, 'D0', 'admissao_estoque', _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado, 'teto_por_corretor', _teto,
                          'cota_formacao', _c.cota, 'etapa_aplicada', 'D0'));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m,
         count(DISTINCT g.corretor_id)::int,
         count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

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
      -- Etapas marcadas mas sem os 3 dias distintos: é cadência incompleta.
      _destino := 'roleta';
      IF _m = 'ativo' THEN
        _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'cadencia_incompleta');
      END IF;

    ELSIF _l.cadencia_ciclo >= 2 THEN
      -- Segunda passagem cumprida sem retorno: arquivo, sem nova reativação.
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
    WHERE l.cadencia_etapa IN ('D0','D1','D2','D3')
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

  -- Um alerta por rodada para cada gestor/admin, com o total. Um alerta por
  -- lead afogaria a caixa: são 500 no teto de uma varredura.
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

CREATE OR REPLACE FUNCTION public.cadencia_marcar_respondeu(
  _lead_id          uuid,
  _proxima_acao     text,
  _proximo_followup timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF _l.cadencia_etapa NOT IN ('D0','D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(_proxima_acao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'próxima ação é obrigatória ao marcar resposta'
      USING ERRCODE = '22023';
  END IF;
  IF _proximo_followup IS NULL OR _proximo_followup <= now() THEN
    RAISE EXCEPTION 'a próxima ação precisa de data no futuro'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET cadencia_etapa    = 'respondeu',
         cadencia_prazo_ts = NULL,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status,
                           'aguardando_corretor'::public.lead_status)
             THEN 'em_atendimento'::public.lead_status
           ELSE status
         END,
         proxima_acao     = btrim(_proxima_acao),
         ultima_interacao = now()
   WHERE id = _lead_id;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  -- O prazo vira TAREFA, e não um write direto em `proximo_followup`.
  -- Aquela coluna é espelho de min(data_vencimento) das tarefas pendentes
  -- (sync_proximo_followup, 20260708155905): escrever nela direto criaria um
  -- prazo que a primeira operação em `tarefas` apagaria sem aviso. Criando a
  -- tarefa, o espelho se preenche sozinho, o lead passa a ter "próximo passo
  -- vivo" para a carteira, e é a régua de 13 toques — que rege daqui em
  -- diante — quem agenda os toques seguintes.
  --
  -- `proxima_acao` AQUI é legítima: quem está falando é o corretor,
  -- declarando o passo combinado com o cliente. É o uso para o qual a coluna
  -- existe, e o oposto do preenchimento automático que o motor não faz.
  INSERT INTO public.tarefas
    (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
     criado_por, data_vencimento, origem_automatica)
  VALUES
    (btrim(_proxima_acao),
     'Passo combinado quando o cliente respondeu na cadência (' || _l.cadencia_etapa || ').',
     'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
     'alta'::public.tarefa_prioridade, _lead_id, COALESCE(_l.corretor_id, _uid),
     _uid, _proximo_followup, true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'cadencia_etapa',
          'Cliente respondeu — lead saiu da cadência para a qualificação.',
          'cadencia',
          jsonb_build_object('de_estado', _l.cadencia_etapa,
                             'para_estado', 'respondeu'));

  RETURN jsonb_build_object('etapa_anterior', _l.cadencia_etapa, 'ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_registrar_tentativa(
  _lead_id     uuid,
  _canal       text,
  _resultado   text,
  _template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
  _tentativa_id uuid;
  _completa boolean;
  _etapa_nova text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  IF _l.cadencia_etapa IS NULL OR _l.cadencia_etapa NOT IN ('D0','D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa (etapa: %)',
      COALESCE(_l.cadencia_etapa, 'nenhuma') USING ERRCODE = '22023';
  END IF;

  IF _canal NOT IN ('ligacao','whatsapp') THEN
    RAISE EXCEPTION 'canal inválido: %', _canal USING ERRCODE = '22023';
  END IF;

  IF _canal = 'whatsapp' AND _resultado NOT IN ('enviada','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para WhatsApp', _resultado USING ERRCODE = '22023';
  END IF;
  IF _canal = 'ligacao' AND _resultado NOT IN
     ('nao_atendeu','caixa_postal','ocupado','atendeu','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para ligação', _resultado USING ERRCODE = '22023';
  END IF;

  IF public.telefone_suspeito(_l.telefone) THEN
    RAISE EXCEPTION 'telefone suspeito: contate por e-mail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cadencia_tentativas
    (lead_id, corretor_id, etapa, canal, resultado, template_id, origem, ciclo)
  VALUES
    (_lead_id, _uid, _l.cadencia_etapa, _canal, _resultado, _template_id,
     'crm', _l.cadencia_ciclo)
  RETURNING id INTO _tentativa_id;

  UPDATE public.leads
     SET ultimo_contato = now(),
         ultima_interacao = now()
   WHERE id = _lead_id;

  IF _resultado = 'numero_invalido' THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status                 = 'perdido'::public.lead_status,
           motivo_perda_categoria = 'numero_invalido',
           motivo_perdido         = 'Número inválido registrado na cadência.',
           cadencia_etapa         = 'encerrado',
           cadencia_prazo_ts      = NULL
     WHERE id = _lead_id;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'cadencia_etapa', 'Encerrado por número inválido.', 'cadencia',
            jsonb_build_object('de_estado', _l.cadencia_etapa,
                               'para_estado', 'encerrado',
                               'motivo', 'numero_invalido'));

    RETURN jsonb_build_object(
      'tentativa_id', _tentativa_id, 'etapa', _l.cadencia_etapa,
      'etapa_completa', false, 'etapa_nova', NULL, 'encerrado', true);
  END IF;

  _completa := public.cadencia_etapa_completa(_lead_id, _l.cadencia_etapa);

  -- O avanço, aqui, na mesma transação. Em sombra devolve NULL e nada muda.
  IF _completa THEN
    _etapa_nova := public.cadencia_avancar_lead(_lead_id, NULL, NULL, 'escrita');
  END IF;

  RETURN jsonb_build_object(
    'tentativa_id', _tentativa_id,
    'etapa', _l.cadencia_etapa,
    'etapa_completa', _completa,
    'etapa_nova', _etapa_nova,
    'encerrado', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_painel_corretores(
  _de  date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  corretor_id            uuid,
  corretor_nome          text,
  fazer_hoje             integer,
  atrasados              integer,
  saidas_sem_resposta    integer,
  encerrados_no_processo integer,
  cumprimento_pct        numeric,
  perdas_por_falha       integer,
  entraram_d1            integer,
  responderam            integer,
  taxa_resposta_pct      numeric,
  minutos_1a_tentativa   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _esc  record;
  _j    record;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  _esc := public._gestao_escopo();
  _j   := public._cadencia_janela(_de, _ate);

  RETURN QUERY
  WITH visiveis AS (
    SELECT p.id, COALESCE(p.nome, p.email) AS nome
    FROM public.profiles p
    WHERE COALESCE(p.ativo, true)
      AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  ),
  donos AS (
    SELECT l.id AS lead_id,
           COALESCE(l.corretor_id,
                    (SELECT t.corretor_id FROM public.cadencia_tentativas t
                      WHERE t.lead_id = l.id ORDER BY t.ts LIMIT 1)) AS corretor_id,
           l.cadencia_inicio_ts,
           (SELECT min(t.ts) FROM public.cadencia_tentativas t
             WHERE t.lead_id = l.id) AS ts1
    FROM public.leads l
    WHERE l.cadencia_inicio_ts IS NOT NULL
      AND l.cadencia_inicio_ts >= _j.ini
      AND l.cadencia_inicio_ts <  _j.fim
  ),
  respostas AS (
    SELECT e.lead_id,
           COALESCE(l.corretor_id,
                    (SELECT t.corretor_id FROM public.cadencia_tentativas t
                      WHERE t.lead_id = e.lead_id ORDER BY t.ts LIMIT 1)) AS corretor_id
    FROM public.lead_eventos e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.tipo = 'cadencia_etapa'
      AND e.payload ->> 'para_estado' = 'respondeu'
      AND e.created_at >= _j.ini AND e.created_at < _j.fim
  ),
  saidas AS (
    SELECT g.corretor_id,
           count(*) FILTER (WHERE g.job IN ('encerrar','vencidos'))::int AS total,
           count(*) FILTER (WHERE g.job = 'encerrar'
                              AND g.motivo = 'cumpriu_100')::int          AS cumpriu,
           count(*) FILTER (WHERE g.job = 'vencidos')::int                AS falha
    FROM public.cadencia_execucao_log g
    WHERE g.aplicado
      AND g.created_at >= _j.ini AND g.created_at < _j.fim
    GROUP BY g.corretor_id
  )
  SELECT
    v.id,
    v.nome,
    (SELECT count(*)::int FROM public.leads l
      WHERE l.corretor_id = v.id
        AND l.cadencia_etapa IN ('D0','D1','D2','D3')
        AND (l.cadencia_prazo_ts AT TIME ZONE 'America/Sao_Paulo')::date = _hoje),
    (SELECT count(*)::int FROM public.leads l
      WHERE l.corretor_id = v.id
        AND l.cadencia_etapa IN ('D0','D1','D2','D3')
        AND (l.cadencia_prazo_ts AT TIME ZONE 'America/Sao_Paulo')::date < _hoje),
    COALESCE(s.total, 0),
    COALESCE(s.cumpriu, 0),
    round(100.0 * COALESCE(s.cumpriu, 0) / NULLIF(COALESCE(s.total, 0), 0), 1),
    COALESCE(s.falha, 0),
    (SELECT count(*)::int FROM donos d WHERE d.corretor_id = v.id),
    (SELECT count(*)::int FROM respostas r WHERE r.corretor_id = v.id),
    round(100.0 * (SELECT count(*) FROM respostas r WHERE r.corretor_id = v.id)
          / NULLIF((SELECT count(*) FROM donos d WHERE d.corretor_id = v.id), 0), 1),
    (SELECT round(avg(EXTRACT(epoch FROM (d.ts1 - d.cadencia_inicio_ts)) / 60.0)::numeric, 1)
       FROM donos d WHERE d.corretor_id = v.id AND d.ts1 IS NOT NULL)
  FROM visiveis v
  LEFT JOIN saidas s ON s.corretor_id = v.id
  ORDER BY 4 DESC, 3 DESC, v.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_painel_etapas(
  _de  date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  semana            date,
  etapa             text,
  empreendimento    text,
  alcancaram        integer,
  responderam       integer,
  taxa_resposta_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _esc record;
  _j   record;
BEGIN
  _esc := public._gestao_escopo();
  _j   := public._cadencia_janela(_de, _ate);

  RETURN QUERY
  WITH toques AS (
    SELECT date_trunc('week', t.ts AT TIME ZONE 'America/Sao_Paulo')::date AS sem,
           t.etapa AS et,
           COALESCE(NULLIF(btrim(l.projeto_nome), ''), 'Sem empreendimento') AS emp,
           t.lead_id
    FROM public.cadencia_tentativas t
    JOIN public.leads l ON l.id = t.lead_id
    WHERE t.ts >= _j.ini AND t.ts < _j.fim
      AND (_esc.ve_tudo
           OR COALESCE(l.corretor_id, t.corretor_id) = ANY(_esc.equipe))
  ),
  alc AS (
    SELECT sem, et, emp, count(DISTINCT lead_id)::int AS n FROM toques GROUP BY 1,2,3
  ),
  resp AS (
    SELECT date_trunc('week', e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS sem,
           e.payload ->> 'de_estado' AS et,
           COALESCE(NULLIF(btrim(l.projeto_nome), ''), 'Sem empreendimento') AS emp,
           count(*)::int AS n
    FROM public.lead_eventos e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.tipo = 'cadencia_etapa'
      AND e.payload ->> 'para_estado' = 'respondeu'
      AND e.payload ->> 'de_estado' IN ('D0','D1','D2','D3')
      AND e.created_at >= _j.ini AND e.created_at < _j.fim
      AND (_esc.ve_tudo OR l.corretor_id = ANY(_esc.equipe))
    GROUP BY 1,2,3
  ),
  chaves AS (
    SELECT sem, et, emp FROM alc
    UNION
    SELECT sem, et, emp FROM resp
  )
  SELECT k.sem, k.et, k.emp,
         COALESCE(a.n, 0), COALESCE(r.n, 0),
         round(100.0 * COALESCE(r.n, 0) / NULLIF(COALESCE(a.n, 0), 0), 1)
  FROM chaves k
  LEFT JOIN alc  a ON a.sem = k.sem AND a.et = k.et AND a.emp = k.emp
  LEFT JOIN resp r ON r.sem = k.sem AND r.et = k.et AND r.emp = k.emp
  ORDER BY k.sem DESC, k.et, k.emp;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_painel_fase0_lotes(_limite integer DEFAULT 20)
RETURNS TABLE(
  lote_id      uuid,
  executado_em timestamptz,
  modo         text,
  avaliados    integer,
  aplicados    integer,
  desfeito     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _esc record;
BEGIN
  _esc := public._gestao_escopo();

  RETURN QUERY
  SELECT g.lote_id,
         max(g.created_at),
         min(g.modo),
         count(*)::int,
         count(*) FILTER (WHERE g.aplicado)::int,
         -- Desfeito = nenhum lead aplicado do lote continua em cadência. É
         -- derivado, e não coluna nova: `cadencia_fase0_desfazer` já tira o
         -- lead de D1, e uma flag própria seria uma segunda verdade.
         bool_and(NOT g.aplicado OR NOT EXISTS (
           SELECT 1 FROM public.leads l
            WHERE l.id = g.lead_id AND l.cadencia_etapa IN ('D0','D1','D2','D3')))
  FROM public.cadencia_execucao_log g
  WHERE g.job = 'fase0' AND g.motivo = 'admissao_estoque'
  GROUP BY g.lote_id
  ORDER BY max(g.created_at) DESC
  LIMIT GREATEST(COALESCE(_limite, 20), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_equipe_v1()
 RETURNS TABLE(corretor_id uuid, nome text, carteira_ativa integer, vencidos integer, sem_proximo_passo integer, fundo_parado integer, em_jogo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT _ve_tudo AND cardinality(_equipe) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
        OR p.id = _caller
      )
  ),
  vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.proximo_followup,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END AS valor,
      (l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3')) AS em_formacao
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND (
        (l.corretor_id IS NULL AND _ve_tudo)
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR (_ve_tudo AND l.corretor_id IS NOT NULL)
      )
  ),
  marcados AS (
    SELECT
      v.corretor_id,
      v.valor,
      (v.proximo_followup IS NOT NULL AND v.proximo_followup < now()) AS vencido,
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      -- Formação fora: o passo dela é o prazo da etapa da cadência.
      (NOT COALESCE(v.em_formacao, false) AND public.lead_sem_proximo_passo(v.id)) AS sem_passo,
      (
        v.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
        AND v.movimento < now() - interval '5 days'
      ) AS fundo
    FROM vivos AS v
  ),
  agg AS (
    SELECT
      m.corretor_id,
      count(*)::integer AS carteira_ativa,
      count(*) FILTER (WHERE m.vencido)::integer AS vencidos,
      count(*) FILTER (WHERE m.sem_passo)::integer AS sem_proximo_passo,
      count(*) FILTER (WHERE m.fundo)::integer AS fundo_parado,
      COALESCE(sum(m.valor), 0)::numeric AS em_jogo
    FROM marcados AS m
    GROUP BY m.corretor_id
  ),
  linhas AS (
    SELECT
      c.id AS corretor_id,
      c.nome,
      COALESCE(a.carteira_ativa, 0) AS carteira_ativa,
      COALESCE(a.vencidos, 0) AS vencidos,
      COALESCE(a.sem_proximo_passo, 0) AS sem_proximo_passo,
      COALESCE(a.fundo_parado, 0) AS fundo_parado,
      COALESCE(a.em_jogo, 0)::numeric AS em_jogo
    FROM corretores AS c
    LEFT JOIN agg AS a ON a.corretor_id = c.id
    UNION ALL
    -- O estoque sem dono só para quem vê a operação inteira.
    SELECT NULL::uuid, 'Sem corretor'::text, a.carteira_ativa, 0, 0, 0, a.em_jogo
    FROM agg AS a
    WHERE a.corretor_id IS NULL AND _ve_tudo
  )
  SELECT
    li.corretor_id,
    li.nome,
    li.carteira_ativa,
    li.vencidos,
    li.sem_proximo_passo,
    li.fundo_parado,
    li.em_jogo
  FROM linhas AS li
  ORDER BY (li.corretor_id IS NULL), li.fundo_parado DESC, li.vencidos DESC, li.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public._carteira_classificar(_corretor uuid)
 RETURNS TABLE(lead_id uuid, nome text, telefone text, status text, temperatura text, projeto_nome text, created_at timestamp with time zone, movimento timestamp with time zone, dias_parado integer, proximo_followup timestamp with time zone, valor numeric, faixa text, posicao integer, ativa boolean, motivo text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE((c.v ->> 'teto')::int, 65)                            AS teto,
      COALESCE((c.v ->> 'cap_conversa')::int, 23)                    AS cap_conversa,
      COALESCE((c.v ->> 'cap_resgate')::int, 13)                     AS cap_resgate,
      COALESCE((c.v ->> 'conversa_dias')::int, 7)                    AS conversa_dias,
      COALESCE((c.v ->> 'devolver_sem_movimento_dias')::int, 30)     AS sem_movimento_dias,
      COALESCE((c.v ->> 'devolver_sem_proximo_passo_dias')::int, 2)  AS sem_passo_dias
    FROM (SELECT public.carteira_ativa_config() AS v) AS c
  ),
  vivos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status::text                                                       AS status,
      l.temperatura::text                                                  AS temperatura,
      COALESCE(NULLIF(l.projeto_nome, ''), pr.nome)                        AS projeto_nome,
      l.created_at,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      l.proximo_followup,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END       AS valor,
      -- A base em formação: quem a cadência está trabalhando agora.
      (l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'))                              AS em_formacao,
      l.cadencia_etapa
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.corretor_id = _corretor
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
  ),
  -- "Respondeu" é caro de calcular (interacoes + mensagens + chamadas), e só
  -- pode ser verdade para quem teve movimento na janela da conversa. Restringir
  -- o conjunto ANTES da chamada é o que mantém a RPC dentro do timeout numa
  -- carteira de 1.500 leads. Formação fica de fora: a faixa dela não depende
  -- disso.
  recentes AS (
    SELECT v.id
    FROM vivos AS v, cfg
    WHERE v.movimento >= now() - make_interval(days => cfg.conversa_dias)
      AND NOT COALESCE(v.em_formacao, false)
  ),
  resp AS (
    SELECT r.lead_id, r.aguardando
    FROM public.conversas_aguardando_resposta(ARRAY(SELECT id FROM recentes)) AS r
  ),
  marcados AS (
    SELECT
      v.*,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - v.movimento)) / 86400)::int) AS dias_parado,
      COALESCE(rs.aguardando, false)                                        AS respondeu,
      (rg.lead_id IS NOT NULL)                                              AS resgatado,
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      public.lead_sem_proximo_passo(v.id) AS sem_proximo_passo
    FROM vivos AS v
    LEFT JOIN resp AS rs ON rs.lead_id = v.id
    LEFT JOIN public.carteira_resgates AS rg
      ON rg.lead_id = v.id AND rg.corretor_id = _corretor
  ),
  -- Faixa. Fundo antes de tudo — um lead em análise parado há 80 dias vale
  -- mais que 200 leads frios novos. Formação logo depois: com a saída
  -- automática da cadência, quem ainda está em D1/D2/D3 não avançou.
  comfaixa AS (
    SELECT
      m.*,
      CASE
        WHEN m.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
          THEN 'fundo'
        WHEN COALESCE(m.em_formacao, false) THEN 'formacao'
        WHEN m.resgatado THEN 'resgate'
        WHEN m.respondeu OR NOT m.sem_proximo_passo
          THEN 'conversa'
        ELSE 'reserva'
      END AS faixa,
      cfg.teto,
      cfg.cap_conversa,
      cfg.cap_resgate,
      cfg.sem_movimento_dias,
      cfg.sem_passo_dias
    FROM marcados AS m, cfg
  ),
  -- Ordem DENTRO de cada faixa. Fundo: mais parado primeiro (é a chave da
  -- Fila Única). Conversa: quem espera há mais tempo.
  rankeado AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.faixa
        ORDER BY EXTRACT(EPOCH FROM c.movimento) ASC, c.id ASC
      )::int AS rank_faixa
    FROM comfaixa AS c
  ),
  -- Cabe na faixa? O fundo não tem cap. Formação nunca ocupa vaga dos 65 —
  -- o limite dela é de ENTRADA (carteira_vagas_entrada_v1), não de carteira.
  naFaixa AS (
    SELECT
      r.*,
      CASE r.faixa
        WHEN 'fundo'    THEN true
        WHEN 'resgate'  THEN r.rank_faixa <= r.cap_resgate
        WHEN 'conversa' THEN r.rank_faixa <= r.cap_conversa
        ELSE false
      END AS cabe_na_faixa,
      CASE r.faixa
        WHEN 'fundo'    THEN 1
        WHEN 'resgate'  THEN 2
        WHEN 'conversa' THEN 3
        ELSE 5
      END AS ordem_faixa
    FROM rankeado AS r
  ),
  final AS (
    SELECT
      n.*,
      CASE
        WHEN n.cabe_na_faixa THEN
          row_number() OVER (
            PARTITION BY n.cabe_na_faixa
            ORDER BY n.ordem_faixa ASC, n.rank_faixa ASC, n.id ASC
          )::int
        ELSE NULL
      END AS posicao
    FROM naFaixa AS n
  )
  SELECT
    f.id,
    f.nome,
    f.telefone,
    f.status,
    f.temperatura,
    f.projeto_nome,
    f.created_at,
    f.movimento,
    f.dias_parado,
    f.proximo_followup,
    f.valor,
    f.faixa,
    f.posicao,
    -- O fundo do funil NUNCA é o excedente (§4.1 do documento).
    (f.faixa = 'fundo' OR (f.posicao IS NOT NULL AND f.posicao <= f.teto)) AS ativa,
    CASE
      WHEN f.faixa = 'fundo'
        OR (f.posicao IS NOT NULL AND f.posicao <= f.teto) THEN NULL
      -- Formação não está "fora" por defeito: está no processo. O motivo diz
      -- onde, e os consumidores a separam da Reserva pela faixa.
      WHEN f.faixa = 'formacao'
        THEN 'em formação na cadência ('
             || CASE f.cadencia_etapa WHEN 'D0' THEN 'lead chegou' ELSE f.cadencia_etapa END
             || ')'
      -- (1) Fora por CAPACIDADE: o lead qualificou para uma faixa e não coube.
      WHEN f.faixa <> 'reserva' AND NOT f.cabe_na_faixa
        THEN 'faixa cheia (' || f.faixa || ')'
      WHEN f.faixa <> 'reserva'
        THEN 'acima do teto de ' || f.teto
      -- (2) Fora por ESTADO, do diagnóstico mais forte para o mais fraco.
      WHEN f.dias_parado >= f.sem_movimento_dias
        THEN 'sem movimento há ' || f.dias_parado || ' dias'
      WHEN f.sem_proximo_passo AND f.dias_parado >= f.sem_passo_dias
        THEN 'sem próximo passo definido'
      WHEN f.status IN ('novo', 'aguardando_atendimento')
        THEN 'nunca respondeu ao primeiro contato'
      ELSE 'sem conversa viva'
    END AS motivo
  FROM final AS f;
$function$;

CREATE OR REPLACE FUNCTION public.regua_devolucao_candidatos_v1()
RETURNS TABLE(lead_id uuid, corretor_id uuid, origem text, status text,
              grupo text, destino text, motivo text,
              dias_parado integer, corte_dias integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_estoque_dias'
      )::int, 30) AS estoque_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_pago_dias'
      )::int, 60) AS pago_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'carteira_ativa') ->> 'devolver_sem_proximo_passo_dias'
      )::int, 7) AS sem_passo_dias
  ),
  base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.origem::text AS origem,
      l.status::text AS status,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - t.toque)) / 86400)::int) AS dias_parado,
      GREATEST(0, (EXTRACT(EPOCH FROM (
        now() - GREATEST(t.toque, COALESCE(v.venc_max, t.toque))
      )) / 86400)::int) AS dias_sem_passo,
      public.lead_sem_proximo_passo(l.id) AS sem_passo,
      CASE
        WHEN l.origem::text IN ('facebook', 'chatbot', 'impulso_smq')
          OR l.sdr_entregue_em IS NOT NULL THEN 'pago'
        WHEN l.origem::text IN ('importacao', 'google_sheets', 'outro') THEN 'estoque'
        ELSE 'conquistado'
      END AS grupo
    FROM public.leads AS l
    CROSS JOIN LATERAL (
      SELECT COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS toque
    ) AS t
    LEFT JOIN LATERAL (
      SELECT max(tr.data_vencimento) AS venc_max
      FROM public.tarefas AS tr
      WHERE tr.lead_id = l.id
        AND tr.deleted_at IS NULL
        AND tr.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
        AND tr.data_vencimento IS NOT NULL
        AND tr.data_vencimento < now()
    ) AS v ON true
    WHERE l.corretor_id IS NOT NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- congelados: venda registrada e finalizados
      AND l.status NOT IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status,
        'perdido'::public.lead_status
      )
      -- fundo do funil nunca sai automaticamente
      AND l.status NOT IN (
        'agendado'::public.lead_status,
        'visita_realizada'::public.lead_status,
        'proposta_enviada'::public.lead_status,
        'analise_credito'::public.lead_status
      )
      -- base em formação: a cadência é a dona e tem as próprias saídas
      AND (l.cadencia_etapa IS NULL OR l.cadencia_etapa NOT IN ('D0', 'D1', 'D2', 'D3'))
      AND NOT public._lead_venda_viva(l.id)
  )
  SELECT
    b.id,
    b.corretor_id,
    b.origem,
    b.status,
    b.grupo,
    CASE WHEN b.grupo = 'pago' THEN 'roleta' ELSE 'bolsao' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN 'parado' ELSE 'sem_passo' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN b.dias_parado ELSE b.dias_sem_passo END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         ELSE c.sem_passo_dias END
  FROM base AS b, cfg AS c
  WHERE b.grupo <> 'conquistado'
    AND (
      b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
      OR (b.sem_passo AND b.dias_sem_passo >= c.sem_passo_dias)
    );
$function$;

CREATE OR REPLACE FUNCTION public.carteira_stats_por_corretor_v1()
RETURNS TABLE (
  corretor_id uuid,
  total bigint,
  ativa bigint,
  acima_do_teto bigint,
  sem_passo_vivo bigint,
  prospeccao bigint,
  parada bigint,
  fundo bigint,
  ganhos bigint,
  perdidos bigint,
  teto integer,
  dias_atendimento integer,
  dias_avancado integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
  _teto  int := GREATEST(
    COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 65), 1);
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  -- Escopo igual ao da RPC antiga: fora da gestão devolve 42501, nunca uma
  -- lista vazia. Lista vazia e "não pode ver" levam a decisões opostas.
  IF NOT (_ve_tudo OR _gestor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status::text AS st,
      (l.status IN ('agendado'::public.lead_status,
                    'visita_realizada'::public.lead_status,
                    'proposta_enviada'::public.lead_status,
                    'analise_credito'::public.lead_status)) AS eh_fundo,
      COALESCE(l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'), false) AS em_formacao,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS parado_desde
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (
        _ve_tudo
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR l.corretor_id IS NULL
      )
  ),
  classificado AS (
    SELECT
      b.corretor_id,
      b.eh_fundo,
      -- Recente pela régua da própria fase: o fundo do funil tem 30 dias,
      -- o resto tem 7. Mesmos prazos que a devolução aplica.
      (b.parado_desde > now() - make_interval(
         days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)) AS recente,
      -- Formação é prospecção: pré-resposta, fora dos 65.
      (b.st IN ('novo','aguardando_atendimento','aguardando_corretor')
       OR (b.em_formacao AND NOT b.eh_fundo)) AS eh_prospeccao,
      (b.st IN ('contrato_fechado','pos_venda')) AS eh_ganho,
      (b.st = 'perdido') AS eh_perdido,
      -- CASE curto-circuita: a checagem de próximo passo só roda para quem
      -- está em tratativa, não para a base inteira da casa.
      CASE
        WHEN b.st NOT IN ('novo','aguardando_atendimento','aguardando_corretor',
                          'contrato_fechado','pos_venda','perdido')
         AND NOT b.em_formacao
         AND b.parado_desde > now() - make_interval(
               days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)
        THEN public.lead_sem_proximo_passo(b.id)
        ELSE false
      END AS sem_passo
    FROM base AS b
  ),
  agregado AS (
    SELECT
      c.corretor_id AS dono,
      count(*)::bigint AS total,
      -- Em tratativa, SEM teto: é a matéria-prima das duas colunas seguintes.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND c.recente)::bigint AS em_tratativa,
      count(*) FILTER (WHERE c.sem_passo)::bigint AS sem_passo_vivo,
      count(*) FILTER (WHERE c.eh_prospeccao)::bigint AS prospeccao,
      -- PARADA: o que a régua de devolução leva. Fundo parado conta aqui
      -- também — é o grupo que mais custa dinheiro parado.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND NOT c.recente)::bigint AS parada,
      count(*) FILTER (WHERE c.eh_fundo)::bigint AS fundo,
      count(*) FILTER (WHERE c.eh_ganho)::bigint AS ganhos,
      count(*) FILTER (WHERE c.eh_perdido)::bigint AS perdidos
    FROM classificado AS c
    GROUP BY c.corretor_id
  )
  SELECT
    a.dono,
    a.total,
    -- O teto é por corretor; a linha do balcão (sem dono) não é limitada.
    CASE WHEN a.dono IS NULL THEN a.em_tratativa
         ELSE LEAST(a.em_tratativa, _teto::bigint) END,
    CASE WHEN a.dono IS NULL THEN 0::bigint
         ELSE GREATEST(a.em_tratativa - _teto::bigint, 0::bigint) END,
    a.sem_passo_vivo,
    a.prospeccao,
    a.parada,
    a.fundo,
    a.ganhos,
    a.perdidos,
    _teto,
    _d_ini,
    _d_av
  FROM agregado AS a;
END;
$$;

CREATE OR REPLACE FUNCTION public._cadencia_sair_por_avanco(_lead uuid, _via text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l record;
  _para text;
BEGIN
  SELECT id, cadencia_etapa, status::text AS status
    INTO _l
    FROM public.leads
   WHERE id = _lead
   FOR UPDATE;
  IF NOT FOUND OR _l.cadencia_etapa IS NULL OR _l.cadencia_etapa NOT IN ('D0','D1','D2','D3') THEN
    RETURN false;
  END IF;

  _para := CASE
             WHEN public._cadencia_status_na_janela(_l.status) THEN 'respondeu'
             ELSE public._cadencia_destino_saida(_l.status)
           END;

  UPDATE public.leads
     SET cadencia_etapa    = _para,
         cadencia_prazo_ts = NULL
   WHERE id = _lead
     AND cadencia_etapa = _l.cadencia_etapa;

  PERFORM public._cadencia_evento_saida(_lead, _l.cadencia_etapa, _para, _via, _l.status);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _via text;
BEGIN
  -- `NEW.cadencia_etapa IS NOT DISTINCT FROM OLD` deixa passar quem já está
  -- mexendo na etapa no mesmo UPDATE: o botão, a devolução à roleta e o
  -- encerramento da própria cadência decidem o destino sozinhos.
  IF OLD.cadencia_etapa IS NULL
     OR OLD.cadencia_etapa NOT IN ('D0','D1','D2','D3')
     OR NEW.cadencia_etapa IS DISTINCT FROM OLD.cadencia_etapa THEN
    RETURN NEW;
  END IF;

  -- Sair para qualquer status além da prospecção é avanço (ou perda). Voltar
  -- para `novo`/`aguardando_*` não é: é redistribuição, e quem redistribui
  -- já cuida da etapa.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public._cadencia_status_prospeccao(NEW.status::text) THEN
    _via := 'status';
  -- Próximo passo escrito direto no lead, no futuro. `proximo_followup` também
  -- é o espelho que `sync_proximo_followup` mantém a partir das tarefas —
  -- inclusive as AUTOMÁTICAS. Se o espelho aponta para uma tarefa automática,
  -- não é compromisso do corretor, e a exceção do gatilho de tarefas não pode
  -- entrar por esta porta.
  ELSIF NEW.proximo_followup IS DISTINCT FROM OLD.proximo_followup
     AND NEW.proximo_followup > now()
     AND NOT EXISTS (
       SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = NEW.id
          AND t.origem_automatica
          AND t.deleted_at IS NULL
          AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
          AND t.data_vencimento = NEW.proximo_followup) THEN
    _via := 'proximo_passo';
  ELSE
    RETURN NEW;
  END IF;

  NEW.cadencia_etapa    := public._cadencia_destino_saida(NEW.status::text);
  NEW.cadencia_prazo_ts := NULL;
  PERFORM public._cadencia_evento_saida(
    NEW.id, OLD.cadencia_etapa, NEW.cadencia_etapa, _via, NEW.status::text);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NOT COALESCE(NEW.origem_automatica, false)
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
     AND NEW.data_vencimento IS NOT NULL
     AND NEW.data_vencimento > now()
     AND EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = NEW.lead_id AND l.cadencia_etapa IN ('D0','D1','D2','D3')) THEN
    PERFORM public._cadencia_sair_por_avanco(NEW.lead_id, 'tarefa');
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NEW.deleted_at IS NULL
     AND NEW.data_inicio >= now()
     AND NEW.status::text NOT IN ('cancelado', 'realizado', 'nao_compareceu')
     AND EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = NEW.lead_id AND l.cadencia_etapa IN ('D0','D1','D2','D3')) THEN
    PERFORM public._cadencia_sair_por_avanco(NEW.lead_id, 'agendamento');
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_corrigir_avancados()
RETURNS TABLE(por_status integer, por_passo integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _r record;
  _n_status int := 0;
  _n_passo int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin corrige a cadência' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT l.id,
           NOT public._cadencia_status_na_janela(l.status::text) AS por_status
      FROM public.leads l
     WHERE l.cadencia_etapa IN ('D0','D1','D2','D3')
       AND l.deleted_at IS NULL
       AND (
         NOT public._cadencia_status_na_janela(l.status::text)
         OR EXISTS (SELECT 1 FROM public.tarefas t
                     WHERE t.lead_id = l.id
                       AND t.deleted_at IS NULL
                       AND NOT COALESCE(t.origem_automatica, false)
                       AND t.status IN ('pendente'::public.tarefa_status,
                                        'em_andamento'::public.tarefa_status)
                       AND t.data_vencimento > now())
         OR EXISTS (SELECT 1 FROM public.agendamentos a
                     WHERE a.lead_id = l.id
                       AND a.deleted_at IS NULL
                       AND a.data_inicio >= now()
                       AND a.status::text NOT IN ('cancelado', 'realizado', 'nao_compareceu'))
         OR (l.proximo_followup > now()
             AND NOT EXISTS (SELECT 1 FROM public.tarefas t
                              WHERE t.lead_id = l.id
                                AND t.origem_automatica
                                AND t.deleted_at IS NULL
                                AND t.status IN ('pendente'::public.tarefa_status,
                                                 'em_andamento'::public.tarefa_status)
                                AND t.data_vencimento = l.proximo_followup))
       )
  LOOP
    IF public._cadencia_sair_por_avanco(
         _r.id, 'correcao_' || CASE WHEN _r.por_status THEN 'status' ELSE 'passo' END) THEN
      IF _r.por_status THEN _n_status := _n_status + 1; ELSE _n_passo := _n_passo + 1; END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _n_status, _n_passo;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadencia_devolver_inativos(_modo text DEFAULT NULL)
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
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin devolve leads de corretor inativo' USING ERRCODE = '42501';
  END IF;

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa
      FROM public.leads l
     WHERE l.cadencia_etapa IN ('D0','D1','D2','D3')
       AND l.corretor_id IS NOT NULL
       AND l.deleted_at IS NULL
       AND NOT COALESCE(l.na_lixeira, false)
       AND NOT public._cadencia_dono_ativo(l.corretor_id)
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      -- O mesmo caminho da etapa vencida: solta o corretor, limpa a etapa no
      -- mesmo UPDATE e registra distribution_log e lead_eventos. O próximo
      -- dono recebe o lead em D1 pelo gatilho de atribuição.
      _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'corretor_inativo');
    END IF;
    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'inativo', _l.id, _l.corretor_id, _l.cadencia_etapa, 'roleta',
       'corretor_inativo', _m, _ok, jsonb_build_object('dono_ativo', false));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

NOTIFY pgrst, 'reload schema';
