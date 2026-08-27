-- Módulo Follow-Up — a régua de 13 toques.
--
-- A operação mediu que o cliente responde por volta da 13ª tentativa de
-- contato. Esta migration cria a infraestrutura da régua:
--   1. Contador de toques DERIVADO do histórico (interacoes + mensagens +
--      chamadas de saída, com colapso de sessão) — retroativo por construção.
--   2. Fila do dia (followup_fila_v1) — leads do corretor com toque de hoje,
--      vencido ou sem próximo toque agendado, com nº da tentativa e o sinal
--      "respondeu".
--   3. Esgotamento (leads.followup_esgotado_em) — a 13ª sem resposta NÃO
--      auto-perde o lead (regra assentada em 2026-07-17: leads sem contato
--      não são auto-perdidos); marca para decisão humana: reativar régua ou
--      descartar com motivo.
--   4. Badge (nav_pendencias v3 ganha o contador `followups`).
--   5. SLA duro opcional: follow-up vencido há N dias devolve o lead à base
--      (mesmo handoff throttled do devolver_leads_posse_expirada), atrás de
--      flag opt-in do gestor.
--   6. KPIs: MV metrics.followup_tentativa_mensal (a curva de resposta por
--      nº da tentativa — o dado que valida a tese dos 13) + RPCs de gestão
--      e self-serve.
--
-- A cadência (dias/canal por toque, temperatura × etapa) é CONFIGURAÇÃO,
-- não código: vive em gestao_config chave `regua_followup`, parseada por
-- src/lib/regua-followup.ts. O agendamento do próximo toque é uma tarefa
-- comum (garantirFollowUpAberto no app) — o espelho tarefas ↔
-- leads.proximo_followup segue intocado.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT em tudo.
-- Rollback: dropar as funções/MV desta migration e a coluna
-- followup_esgotado_em; nav_pendencias volta pela definição de 20260729181713.

-- ---------------------------------------------------------------------------
-- 1. Esgotamento da régua
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_esgotado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_followup_esgotado
  ON public.leads (corretor_id, followup_esgotado_em)
  WHERE followup_esgotado_em IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Contador de toques (derivado, retroativo)
-- ---------------------------------------------------------------------------
-- "Toque" = contato ATIVO do corretor. O predicado de saída humana é o mesmo
-- do tempo_primeira_resposta_humana (20260809190000): interação de saída com
-- autor humano, fora de nota/mudança de status. Mensagens simuladas contam
-- (são envios reais do corretor via wa.me); chamada com falha de discagem
-- não conta, não-atendida conta (tentativa é tentativa).
-- Colapso de sessão: eventos a menos de 10 minutos um do outro (ex.: o
-- click2call grava `chamadas` E o corretor registra a interação) são o MESMO
-- toque.
CREATE OR REPLACE FUNCTION public.followup_toques_do_lead(_lead_id uuid)
RETURNS TABLE (quando timestamptz, canal text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH eventos AS (
    SELECT i.ocorreu_em AS quando,
           CASE WHEN i.tipo = 'ligacao' THEN 'ligacao' ELSE 'whatsapp' END AS canal
    FROM public.interacoes i
    WHERE i.lead_id = _lead_id
      AND i.direcao = 'saida'
      AND i.autor_id IS NOT NULL
      AND i.tipo NOT IN ('nota','mudanca_status')
      AND i.deleted_at IS NULL
    UNION ALL
    SELECT m.criado_em, 'whatsapp'
    FROM public.mensagens m
    WHERE m.lead_id = _lead_id
      AND m.direcao = 'saida'
      AND m.corretor_id IS NOT NULL
      AND m.status <> 'falha'
    UNION ALL
    SELECT c.criado_em, 'ligacao'
    FROM public.chamadas c
    WHERE c.lead_id = _lead_id
      AND c.direcao = 'saida'
      AND c.status <> 'falha'
  ),
  ordenados AS (
    SELECT quando, canal,
           lag(quando) OVER (ORDER BY quando) AS anterior
    FROM eventos
  )
  SELECT quando, canal
  FROM ordenados
  WHERE anterior IS NULL OR quando - anterior >= interval '10 minutes'
  ORDER BY quando;
$$;

CREATE OR REPLACE FUNCTION public.followup_tentativas(_lead_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.followup_toques_do_lead(_lead_id);
$$;

REVOKE ALL ON FUNCTION public.followup_toques_do_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.followup_tentativas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.followup_toques_do_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.followup_tentativas(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Fila do dia
-- ---------------------------------------------------------------------------
-- Leads do corretor no funil (não-terminais, fora da lixeira, régua não
-- esgotada) cujo próximo toque é hoje/vencido — ou que NÃO têm próximo toque
-- agendado (entram na régua agora). `respondeu` = a última interação do lead
-- é de ENTRADA (o cliente falou por último) — destaque na fila, decisão do
-- corretor. Mesmo guard do atendimento_inbox: o gestor pode olhar a fila de
-- um corretor do time.
CREATE OR REPLACE FUNCTION public.followup_fila_v1(
  _corretor uuid DEFAULT NULL,
  _take int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := COALESCE(_corretor, auth.uid());
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _itens jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _target <> _uid AND NOT public.pode_acessar_corretor(_uid, _target) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _take := LEAST(GREATEST(COALESCE(_take, 200), 1), 500);

  SELECT COALESCE(jsonb_agg(item ORDER BY ordem), '[]'::jsonb) INTO _itens
  FROM (
    SELECT
      row_number() OVER (
        ORDER BY (l.proximo_followup IS NULL), l.proximo_followup ASC, l.created_at ASC
      ) AS ordem,
      jsonb_build_object(
        'id', l.id,
        'nome', l.nome,
        'telefone', l.telefone,
        'email', l.email,
        'status', l.status,
        'temperatura', l.temperatura,
        'origem', l.origem,
        'projeto_id', l.projeto_id,
        'projeto_nome', p.nome,
        'corretor_id', l.corretor_id,
        'created_at', l.created_at,
        'ultima_interacao', l.ultima_interacao,
        'proxima_acao', l.proxima_acao,
        'proximo_followup', l.proximo_followup,
        'renda_informada', l.renda_informada,
        'entrada_disponivel', l.entrada_disponivel,
        'usa_fgts', l.usa_fgts,
        'observacoes', l.observacoes,
        'minutos_vencido',
          CASE WHEN l.proximo_followup IS NOT NULL AND l.proximo_followup < now()
               THEN floor(extract(epoch FROM (now() - l.proximo_followup)) / 60)::int
               ELSE 0 END,
        'tentativas', public.followup_tentativas(l.id),
        'respondeu', COALESCE(ult.direcao = 'entrada', false)
      ) AS item
    FROM public.leads l
    LEFT JOIN public.projetos p ON p.id = l.projeto_id
    LEFT JOIN LATERAL (
      SELECT i.direcao
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.deleted_at IS NULL
        AND i.tipo NOT IN ('nota','mudanca_status')
      ORDER BY i.ocorreu_em DESC
      LIMIT 1
    ) ult ON true
    WHERE l.corretor_id = _target
      AND l.na_lixeira = false
      AND l.deleted_at IS NULL
      AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
      AND l.followup_esgotado_em IS NULL
      AND (
        l.proximo_followup IS NULL
        OR (l.proximo_followup AT TIME ZONE 'America/Sao_Paulo')::date <= _hoje
      )
    LIMIT _take
  ) fila;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'corretor_id', _target,
    'itens', _itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.followup_fila_v1(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.followup_fila_v1(uuid, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Esgotar / reativar a régua (decisão humana)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_followup_esgotado(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET followup_esgotado_em = now()
   WHERE id = _lead_id AND followup_esgotado_em IS NULL;

  -- Sem próximo toque: cancela as tarefas de contato abertas (mesmos tipos
  -- que o trigger de fechamento cancela) — o espelho proximo_followup zera.
  UPDATE public.tarefas
     SET status = 'cancelada'
   WHERE lead_id = _lead_id
     AND status IN ('pendente','em_andamento')
     AND deleted_at IS NULL
     AND tipo IN ('follow_up','ligacao','whatsapp','email');

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, auth.uid(), 'nota', 'interna',
          'Régua de follow-up esgotada',
          'Régua esgotada sem resposta — aguardando decisão: reativar ou descartar.',
          jsonb_build_object('fonte','followup_regua','acao','esgotado'));
END;
$$;

CREATE OR REPLACE FUNCTION public.reativar_followup(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET followup_esgotado_em = NULL
   WHERE id = _lead_id AND followup_esgotado_em IS NOT NULL;

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead_id, auth.uid(), 'nota', 'interna',
          'Régua de follow-up reativada',
          'Lead devolvido à régua de follow-up para novo ciclo de toques.',
          jsonb_build_object('fonte','followup_regua','acao','reativado'));
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_followup_esgotado(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reativar_followup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_followup_esgotado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reativar_followup(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. nav_pendencias v3 — contador `followups` (toques de hoje + vencidos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nav_pendencias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tudo boolean := false;
  _escopo uuid[];
  _atendimento int := 0;
  _tarefas int := 0;
  _agenda int := 0;
  _aprov int := 0;
  _followups int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RETURN jsonb_build_object('atendimento',0,'tarefas_vencidas',0,'agenda_hoje',0,'aprovacoes',0,'followups',0);
  END IF;

  _tudo := public.ve_carteira_completa(_uid);
  IF NOT _tudo THEN
    SELECT array_agg(DISTINCT c) INTO _escopo
    FROM (
      SELECT _uid AS c
      UNION
      SELECT public.corretores_do_gestor(_uid)
    ) s
    WHERE c IS NOT NULL;
    _escopo := COALESCE(_escopo, ARRAY[_uid]);
  END IF;

  SELECT count(*) INTO _atendimento
  FROM public.leads l
  WHERE l.status = 'aguardando_atendimento'
    AND l.na_lixeira = false
    AND (_tudo OR l.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _tarefas
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _agenda
  FROM public.agendamentos a
  WHERE a.status = 'agendado'
    AND a.deleted_at IS NULL
    AND (a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
        = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR a.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _aprov
  FROM public.vendas v
  WHERE v.status_venda = 'pendente'
    AND (_tudo OR v.corretor_id = ANY(_escopo));

  -- Follow-ups do DIA: tarefas de contato abertas com vencimento até hoje
  -- (BRT) — vencidas inclusas. É o número que o corretor precisa zerar.
  SELECT count(*) INTO _followups
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
        <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  RETURN jsonb_build_object(
    'atendimento', _atendimento,
    'tarefas_vencidas', _tarefas,
    'agenda_hoje', _agenda,
    'aprovacoes', _aprov,
    'followups', _followups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nav_pendencias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nav_pendencias() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Config da régua (gestao_config) — cadência é configuração, não código
-- ---------------------------------------------------------------------------
INSERT INTO public.gestao_config (chave, valor, descricao)
VALUES (
  'regua_followup',
  jsonb_build_object(
    'max_toques', 13,
    'gaps', jsonb_build_object(
      'quente', to_jsonb(ARRAY[0,1,1,2,2,3,3,4,5,5,7,7,10]),
      'morno',  to_jsonb(ARRAY[0,2,2,3,3,4,5,5,7,7,10,10,14]),
      'frio',   to_jsonb(ARRAY[0,3,4,5,7,7,10,10,14,14,21,21,30])
    ),
    'ligacao_nos_toques', to_jsonb(ARRAY[3,7,11]),
    'mult_etapa', jsonb_build_object('agendado', 0.5, 'visita_realizada', 0.5, 'analise_credito', 0.5),
    'sla_devolucao_dias', 3,
    'devolucao_ativa', false
  ),
  'Régua de follow-up (13 toques): dias entre toques por temperatura, toques por ligação, multiplicador por etapa, SLA de devolução e flag da devolução automática. Parseada por src/lib/regua-followup.ts.'
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. SLA duro: follow-up vencido devolve o lead à base (opt-in)
-- ---------------------------------------------------------------------------
-- Mesmo handoff throttled do devolver_leads_posse_expirada: corretor perde a
-- posse, lead volta à roleta base via cron de distribuição. Desligada por
-- padrão (devolucao_ativa=false) — redistribuir carteira automaticamente é
-- decisão do gestor, não default de deploy.
CREATE OR REPLACE FUNCTION public.devolver_leads_followup_vencido()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record; _qtd int := 0; _log_id uuid;
  _cfg jsonb := public.gestao_config_valor('regua_followup');
  _dias int;
BEGIN
  IF COALESCE((_cfg ->> 'devolucao_ativa')::boolean, false) IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;
  _dias := GREATEST(COALESCE((_cfg ->> 'sla_devolucao_dias')::int, 3), 1);

  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.status, l.proximo_followup,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.proximo_followup ASC) AS rn
      FROM public.leads l
      WHERE l.corretor_id IS NOT NULL
        AND l.na_lixeira = false
        AND l.deleted_at IS NULL
        AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
        AND l.followup_esgotado_em IS NULL
        AND l.proximo_followup IS NOT NULL
        AND l.proximo_followup < now() - (_dias || ' days')::interval
    )
    SELECT id, corretor_id, status, proximo_followup
    FROM candidatos
    WHERE rn <= 10          -- máx. 10 devoluções por corretor por rodada
    ORDER BY proximo_followup ASC
    LIMIT 50                -- e 50 no total — devolução gradual, sem tsunami
  LOOP
    UPDATE public.leads
       SET corretor_anterior_id = corretor_id,
           corretor_id = NULL,
           classe_lead = 'base',
           status = 'aguardando_atendimento',
           tentativas_redistribuicao = 0,
           corretores_que_tentaram = ARRAY[corretor_id]
     WHERE id = _lead.id AND corretor_id = _lead.corretor_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead.id, NULL, 'redistribuicao',
       'Follow-up vencido há mais de ' || _dias || ' dias — devolvido para a base',
       'base', 'followup_vencido', 'sucesso')
    RETURNING id INTO _log_id;

    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_build_object(
      'gatilho', 'followup_vencido',
      'corretor_anterior', _lead.corretor_id,
      'status_no_momento', _lead.status,
      'followup_vencido_em', _lead.proximo_followup,
      'sla_dias', _dias));

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $$;

REVOKE ALL ON FUNCTION public.devolver_leads_followup_vencido() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_leads_followup_vencido() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('followup-devolver-vencidos')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup-devolver-vencidos');
END $$;
SELECT cron.schedule('followup-devolver-vencidos', '15 12 * * *',
  $$ SELECT public.devolver_leads_followup_vencido(); $$);

-- ---------------------------------------------------------------------------
-- 8. KPIs — a curva de resposta por nº da tentativa
-- ---------------------------------------------------------------------------
-- Grão: mês (BRT) × corretor × nº da tentativa. `respondidos` = houve entrada
-- do cliente em até 7 dias após o toque; `avancaram` = o lead transicionou
-- para agendado+ em até 7 dias. Toques colapsados com a MESMA janela de
-- sessão de followup_toques_do_lead — as duas contagens nunca divergem.
DROP MATERIALIZED VIEW IF EXISTS metrics.followup_tentativa_mensal;
CREATE MATERIALIZED VIEW metrics.followup_tentativa_mensal AS
WITH eventos AS (
  SELECT i.lead_id, i.ocorreu_em AS quando, i.autor_id AS corretor_id
  FROM public.interacoes i
  WHERE i.direcao = 'saida'
    AND i.autor_id IS NOT NULL
    AND i.tipo NOT IN ('nota','mudanca_status')
    AND i.deleted_at IS NULL
  UNION ALL
  SELECT m.lead_id, m.criado_em, m.corretor_id
  FROM public.mensagens m
  WHERE m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha'
  UNION ALL
  SELECT c.lead_id, c.criado_em, c.corretor_id
  FROM public.chamadas c
  WHERE c.direcao = 'saida' AND c.lead_id IS NOT NULL AND c.status <> 'falha'
),
colapsados AS (
  SELECT lead_id, quando, corretor_id,
         lag(quando) OVER (PARTITION BY lead_id ORDER BY quando) AS anterior
  FROM eventos
),
toques AS (
  SELECT lead_id, quando, corretor_id,
         row_number() OVER (PARTITION BY lead_id ORDER BY quando) AS tentativa
  FROM colapsados
  WHERE anterior IS NULL OR quando - anterior >= interval '10 minutes'
),
avaliados AS (
  SELECT t.lead_id, t.quando, t.corretor_id,
         LEAST(t.tentativa, 20) AS tentativa,
         EXISTS (
           SELECT 1 FROM public.interacoes r
           WHERE r.lead_id = t.lead_id
             AND r.direcao = 'entrada'
             AND r.deleted_at IS NULL
             AND r.ocorreu_em > t.quando
             AND r.ocorreu_em <= t.quando + interval '7 days'
         ) AS respondeu,
         EXISTS (
           SELECT 1 FROM public.lead_status_transitions s
           WHERE s.lead_id = t.lead_id
             AND s.para_status IN ('agendado','visita_realizada','analise_credito','contrato_fechado')
             AND s.created_at > t.quando
             AND s.created_at <= t.quando + interval '7 days'
         ) AS avancou
  FROM toques t
  WHERE t.corretor_id IS NOT NULL
)
SELECT
  (date_trunc('month', a.quando AT TIME ZONE 'America/Sao_Paulo'))::date AS mes,
  a.corretor_id,
  a.tentativa,
  count(*)::int AS enviados,
  count(*) FILTER (WHERE a.respondeu)::int AS respondidos,
  count(*) FILTER (WHERE a.avancou)::int AS avancaram,
  ((date_trunc('month', a.quando AT TIME ZONE 'America/Sao_Paulo'))::date)::text
    || '|' || a.corretor_id::text || '|' || a.tentativa::text AS chave
FROM avaliados a
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS followup_tentativa_mensal_chave
  ON metrics.followup_tentativa_mensal (chave);
CREATE INDEX IF NOT EXISTS followup_tentativa_mensal_corretor
  ON metrics.followup_tentativa_mensal (corretor_id, mes);

-- refresh_all passa a incluir a nova MV (lista fixa — recriada por inteiro).
CREATE OR REPLACE FUNCTION metrics.refresh_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, metrics, public
AS $$
DECLARE
  _mv text;
BEGIN
  FOREACH _mv IN ARRAY ARRAY[
    'funil_coorte_mensal',
    'tempo_etapa_mensal',
    'performance_corretor_mensal',
    'motivos_perda_mensal',
    'followup_tentativa_mensal'
  ] LOOP
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY metrics.%I', _mv);
    EXCEPTION WHEN OTHERS THEN
      -- 1ª carga (MV nunca populada) não aceita CONCURRENTLY.
      EXECUTE format('REFRESH MATERIALIZED VIEW metrics.%I', _mv);
    END;
    INSERT INTO metrics.atualizacoes (objeto, atualizado_em)
    VALUES (_mv, now())
    ON CONFLICT (objeto) DO UPDATE SET atualizado_em = EXCLUDED.atualizado_em;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION metrics.refresh_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION metrics.refresh_all() TO service_role;

-- Primeira carga (a MV nasce populada e carimbada).
SELECT metrics.refresh_all();

-- RPC de gestão: curva agregada no escopo do caller.
CREATE OR REPLACE FUNCTION public.gestao_followup_tentativas(
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE (tentativa int, enviados bigint, respondidos bigint, avancaram bigint, atualizado_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, metrics
AS $$
DECLARE
  _esc record;
BEGIN
  _esc := public._gestao_escopo();

  RETURN QUERY
  SELECT f.tentativa,
         sum(f.enviados)::bigint,
         sum(f.respondidos)::bigint,
         sum(f.avancaram)::bigint,
         (SELECT a.atualizado_em FROM metrics.atualizacoes a
           WHERE a.objeto = 'followup_tentativa_mensal')
  FROM metrics.followup_tentativa_mensal f
  WHERE (_de IS NULL OR f.mes >= date_trunc('month', _de)::date)
    AND (_ate IS NULL OR f.mes <= date_trunc('month', _ate)::date)
    AND (_corretor IS NULL OR f.corretor_id = _corretor)
    AND (_esc.ve_tudo OR f.corretor_id = ANY(_esc.equipe))
  GROUP BY f.tentativa
  ORDER BY f.tentativa;
END;
$$;

-- Self-serve: o corretor lê a PRÓPRIA curva (auto-escopo, sem gate de gestão).
CREATE OR REPLACE FUNCTION public.meu_followup_tentativas(_meses int DEFAULT 6)
RETURNS TABLE (tentativa int, enviados bigint, respondidos bigint, avancaram bigint, atualizado_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, metrics
AS $$
DECLARE
  _uid uuid := auth.uid();
  _desde date;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _desde := (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
             - (LEAST(GREATEST(COALESCE(_meses,6),1),24) - 1) * interval '1 month')::date;

  RETURN QUERY
  SELECT f.tentativa,
         sum(f.enviados)::bigint,
         sum(f.respondidos)::bigint,
         sum(f.avancaram)::bigint,
         (SELECT a.atualizado_em FROM metrics.atualizacoes a
           WHERE a.objeto = 'followup_tentativa_mensal')
  FROM metrics.followup_tentativa_mensal f
  WHERE f.corretor_id = _uid
    AND f.mes >= _desde
  GROUP BY f.tentativa
  ORDER BY f.tentativa;
END;
$$;

-- Cobertura por corretor (gestão): fila de hoje, vencidos e esgotados — ao
-- vivo (não-MV), para a seção de gestão do módulo.
CREATE OR REPLACE FUNCTION public.gestao_followup_cobertura()
RETURNS TABLE (
  corretor_id uuid,
  corretor_nome text,
  fila_hoje bigint,
  vencidos bigint,
  esgotados bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _esc record;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  _esc := public._gestao_escopo();

  RETURN QUERY
  SELECT
    pr.id,
    pr.nome,
    count(*) FILTER (
      WHERE l.followup_esgotado_em IS NULL
        AND (l.proximo_followup IS NULL
             OR (l.proximo_followup AT TIME ZONE 'America/Sao_Paulo')::date <= _hoje)
    )::bigint AS fila_hoje,
    count(*) FILTER (
      WHERE l.followup_esgotado_em IS NULL
        AND l.proximo_followup IS NOT NULL
        AND l.proximo_followup < now()
    )::bigint AS vencidos,
    count(*) FILTER (WHERE l.followup_esgotado_em IS NOT NULL)::bigint AS esgotados
  FROM public.profiles pr
  JOIN public.leads l
    ON l.corretor_id = pr.id
   AND l.na_lixeira = false
   AND l.deleted_at IS NULL
   AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
  WHERE pr.ativo = true
    AND (_esc.ve_tudo OR pr.id = ANY(_esc.equipe))
  GROUP BY pr.id, pr.nome
  ORDER BY vencidos DESC, fila_hoje DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_followup_tentativas(date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meu_followup_tentativas(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gestao_followup_cobertura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_followup_tentativas(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_followup_tentativas(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestao_followup_cobertura() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sanidade: falha o replay se a régua não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.followup_fila_v1(uuid,int)') IS NULL THEN
    RAISE EXCEPTION 'followup_regua: fila ausente';
  END IF;
  IF to_regprocedure('public.followup_tentativas(uuid)') IS NULL THEN
    RAISE EXCEPTION 'followup_regua: contador ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
      AND column_name = 'followup_esgotado_em'
  ) THEN
    RAISE EXCEPTION 'followup_regua: coluna followup_esgotado_em ausente';
  END IF;
  IF (public.nav_pendencias() ? 'followups') IS DISTINCT FROM true THEN
    -- Sem sessão o retorno é o objeto zerado — a chave tem de existir mesmo assim.
    RAISE EXCEPTION 'followup_regua: nav_pendencias sem o contador followups';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'metrics' AND matviewname = 'followup_tentativa_mensal'
  ) THEN
    RAISE EXCEPTION 'followup_regua: MV followup_tentativa_mensal ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gestao_config WHERE chave = 'regua_followup') THEN
    RAISE EXCEPTION 'followup_regua: config regua_followup ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
