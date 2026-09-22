-- ===========================================================================
-- CADÊNCIA D1/D2/D3 — Fatia 4: o painel do gestor, a tela da reativação e a
-- admissão do estoque pela tela
-- ===========================================================================
-- Fundação 20260921120000, motor 20260921120100, fila 20260921120200, avanço
-- na escrita 20260922120000, Fase 0 20260923120000. Desenho e histórico das
-- decisões: docs/ops/cadencia-followup-reativacao.md.
--
-- Esta fatia não muda uma regra sequer do motor. Ela só LÊ — e o porquê de
-- cada leitura está aqui, porque neste repositório o racional mora no código.
--
-- ---------------------------------------------------------------------------
-- 1) POR QUE TUDO É RPC, E NENHUM NÚMERO É SOMADO NO CLIENTE
-- ---------------------------------------------------------------------------
-- São ~55 mil leads. Trazer linha para contar na tela seria, além de lento, a
-- segunda implementação de cada indicador: a pergunta feita no SQL e a
-- pergunta feita na tela passariam a ter duas respostas, e a divergência só
-- apareceria depois de alguém tomar uma decisão errada com ela.
--
-- ---------------------------------------------------------------------------
-- 2) "CUMPRIU A CADÊNCIA SEM RETORNO" NÃO É PERDA DO CORRETOR
-- ---------------------------------------------------------------------------
-- O motor marca esse lead como `perdido` com `sem_retorno_cadencia` — tem de
-- marcar, senão a base fica com lead sem dono e sem status de saída. A regra
-- "isso não conta contra o corretor" foi declarada desde a Fatia 2 como regra
-- de RELATÓRIO, e é aqui que ela existe pela primeira vez:
--
--   * `perdas_por_falha` conta APENAS o job `vencidos` (D1/D2 vencido). É a
--     única saída que é falha de quem segurou o lead.
--   * `encerrados_no_processo` é coluna própria, cinza na tela, e não entra em
--     perda nenhuma.
--
-- Se contasse, o corretor voltaria a segurar lead para não perder — que é
-- exatamente o comportamento que a cadência existe para acabar.
--
-- ---------------------------------------------------------------------------
-- 3) A QUEM SE ATRIBUI O LEAD QUE JÁ SAIU DA CARTEIRA
-- ---------------------------------------------------------------------------
-- Quem sai da carteira fica com `corretor_id = NULL`. Por isso os indicadores
-- de PERÍODO leem `cadencia_execucao_log.corretor_id`, que é o dono no momento
-- da decisão (o log guarda o snapshot), e os indicadores de ESTOQUE ("fazer
-- hoje", "atrasados") leem `leads.corretor_id`, que é o dono agora. Para
-- "entrou em D1" e "respondeu", onde não há log, o dono é
-- `COALESCE(leads.corretor_id, corretor da primeira tentativa)` — a primeira
-- tentativa é do dono da época por construção, já que `cadencia_tentativas`
-- não é apagada quando o lead troca de mão.
--
-- ---------------------------------------------------------------------------
-- 4) ESCOPO E PAPEL
-- ---------------------------------------------------------------------------
-- Todo o painel passa por `_gestao_escopo()` (20260727113000): exige papel de
-- gestão e devolve o recorte do gestor. Não há segunda regra de escopo aqui. A
-- tela da reativação tem guarda própria (sdr + gestão), porque o SDR não é
-- gestão e precisa ver a fila dele.
--
-- Idempotente. Rollback: DROP das funções `cadencia_painel_*`,
-- `_cadencia_janela`, `_reativacao_pode_agir` e `reativacao_fila_v1`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0) A janela do período, num lugar só
-- ---------------------------------------------------------------------------
-- Dia é dia de São Paulo (convenção da casa). Sem esta função, cada RPC
-- repetiria o mesmo `AT TIME ZONE` e a primeira divergência de fuso apareceria
-- como "o painel não bate com o SQL" numa segunda-feira de madrugada.
CREATE OR REPLACE FUNCTION public._cadencia_janela(
  _de date, _ate date, OUT ini timestamptz, OUT fim timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT ((COALESCE(_de, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)))::text
            || ' 00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         ((COALESCE(_ate, (now() AT TIME ZONE 'America/Sao_Paulo')::date) + 1)::text
            || ' 00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

REVOKE ALL ON FUNCTION public._cadencia_janela(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cadencia_janela(date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Painel por corretor
-- ---------------------------------------------------------------------------
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
        AND l.cadencia_etapa IN ('D1','D2','D3')
        AND (l.cadencia_prazo_ts AT TIME ZONE 'America/Sao_Paulo')::date = _hoje),
    (SELECT count(*)::int FROM public.leads l
      WHERE l.corretor_id = v.id
        AND l.cadencia_etapa IN ('D1','D2','D3')
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

REVOKE ALL ON FUNCTION public.cadencia_painel_corretores(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_corretores(date, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_painel_corretores(date, date) IS
  'Painel do gestor por corretor. perdas_por_falha conta SÓ o job vencidos; '
  'encerrados_no_processo (cumpriu 100% sem retorno) é coluna própria e não '
  'entra em perda — regra de relatório declarada em 20260921120100.';

-- ---------------------------------------------------------------------------
-- 2) Taxa de resposta por etapa, semana e empreendimento
-- ---------------------------------------------------------------------------
-- É o indicador que responde se o D3 se paga. Denominador = leads que
-- CHEGARAM a receber um toque naquela etapa (tentativa registrada), não leads
-- que passaram pela etapa no papel: etapa marcada sem toque não é
-- oportunidade de resposta e inflaria o denominador do D3 justamente onde a
-- pergunta é mais cara.
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
      AND e.payload ->> 'de_estado' IN ('D1','D2','D3')
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

REVOKE ALL ON FUNCTION public.cadencia_painel_etapas(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_etapas(date, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Reativação: descanso, taxa de reativação e conversão do reativado
-- ---------------------------------------------------------------------------
-- "Conversão do reativado" é o lead que voltou e CHEGOU a agendado ou além.
-- Contar venda só seria legível daqui a meses; agendamento é o primeiro sinal
-- honesto de que a segunda passagem valeu o custo do discador.
CREATE OR REPLACE FUNCTION public.cadencia_painel_reativacao(
  _de  date DEFAULT NULL,
  _ate date DEFAULT NULL
)
RETURNS TABLE(
  em_descanso         integer,
  elegiveis_hoje      integer,
  em_trabalho         integer,
  reativados          integer,
  sem_retorno         integer,
  taxa_reativacao_pct numeric,
  convertidos         integer,
  conversao_pct       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _esc  record;
  _j    record;
  _reat integer;
  _fin  integer;
  _conv integer;
BEGIN
  _esc := public._gestao_escopo();
  _j   := public._cadencia_janela(_de, _ate);

  SELECT count(*) FILTER (WHERE r.status = 'reativado')::int,
         count(*) FILTER (WHERE r.status IN ('reativado','sem_retorno','arquivado'))::int
    INTO _reat, _fin
  FROM public.reativacao_fila r
  WHERE r.finalizado_em >= _j.ini AND r.finalizado_em < _j.fim;

  SELECT count(*)::int INTO _conv
  FROM public.reativacao_fila r
  JOIN public.leads l ON l.id = r.lead_id
  WHERE r.status = 'reativado'
    AND r.finalizado_em >= _j.ini AND r.finalizado_em < _j.fim
    AND l.status IN ('agendado'::public.lead_status,
                     'visita_realizada'::public.lead_status,
                     'proposta_enviada'::public.lead_status,
                     'analise_credito'::public.lead_status,
                     'contrato_fechado'::public.lead_status,
                     'pos_venda'::public.lead_status);

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM public.reativacao_fila r
      WHERE r.status = 'aguardando' AND r.elegivel_em > now()),
    (SELECT count(*)::int FROM public.reativacao_fila r
      WHERE r.status = 'aguardando' AND r.elegivel_em <= now()),
    (SELECT count(*)::int FROM public.reativacao_fila r
      WHERE r.status IN ('em_discagem','com_sdr')),
    _reat,
    (SELECT count(*)::int FROM public.reativacao_fila r
      WHERE r.status IN ('sem_retorno','arquivado')
        AND r.finalizado_em >= _j.ini AND r.finalizado_em < _j.fim),
    round(100.0 * _reat / NULLIF(_fin, 0), 1),
    _conv,
    round(100.0 * _conv / NULLIF(_reat, 0), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_painel_reativacao(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_reativacao(date, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) O motor: últimas execuções por lote
-- ---------------------------------------------------------------------------
-- Responde "o motor está funcionando?" sem abrir SQL. Um lote por linha, com
-- os motivos agregados — é o que a revisão dos casos sorteados usa.
CREATE OR REPLACE FUNCTION public.cadencia_painel_motor(_limite integer DEFAULT 20)
RETURNS TABLE(
  lote_id      uuid,
  job          text,
  modo         text,
  executado_em timestamptz,
  avaliados    integer,
  aplicados    integer,
  motivos      jsonb
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
  WITH por_motivo AS (
    SELECT h.lote_id, h.motivo, count(*)::int AS n
    FROM public.cadencia_execucao_log h
    GROUP BY h.lote_id, h.motivo
  ),
  lotes AS (
    SELECT g.lote_id,
           min(g.job)                       AS job,
           min(g.modo)                      AS modo,
           max(g.created_at)                AS executado_em,
           count(*)::int                    AS avaliados,
           count(*) FILTER (WHERE g.aplicado)::int AS aplicados
    FROM public.cadencia_execucao_log g
    GROUP BY g.lote_id
    ORDER BY max(g.created_at) DESC
    LIMIT GREATEST(COALESCE(_limite, 20), 1)
  )
  SELECT lo.lote_id, lo.job, lo.modo, lo.executado_em, lo.avaliados, lo.aplicados,
         (SELECT jsonb_object_agg(m.motivo, m.n) FROM por_motivo m WHERE m.lote_id = lo.lote_id)
  FROM lotes lo
  ORDER BY lo.executado_em DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_painel_motor(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_motor(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Fase 0 pela tela: quanto falta admitir, e o histórico dos lotes
-- ---------------------------------------------------------------------------
-- A admissão continua sendo `cadencia_fase0_admitir`, que já é admin-only e já
-- registra lote. O que faltava era ver o estoque restante e desfazer sem SQL.
-- Não vira cron: a taxa de admissão é decisão de gestão, e o volume atual
-- (~215 leads por corretor) ainda está em discussão.
CREATE OR REPLACE FUNCTION public.cadencia_painel_fase0_pendentes()
RETURNS TABLE(
  corretor_id   uuid,
  corretor_nome text,
  pendentes     integer,
  dias_medio    numeric
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
  SELECT k.corretor_id,
         COALESCE(p.nome, p.email, '(sem corretor)'),
         count(*)::int,
         round(avg(k.dias_parado)::numeric, 1)
  FROM public.cadencia_fase0_classificar() k
  LEFT JOIN public.profiles p ON p.id = k.corretor_id
  WHERE k.destino = 'cadencia'
    AND (_esc.ve_tudo OR k.corretor_id = ANY(_esc.equipe))
  GROUP BY k.corretor_id, p.nome, p.email
  ORDER BY count(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_painel_fase0_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_fase0_pendentes()
  TO authenticated, service_role;

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
            WHERE l.id = g.lead_id AND l.cadencia_etapa IN ('D1','D2','D3')))
  FROM public.cadencia_execucao_log g
  WHERE g.job = 'fase0' AND g.motivo = 'admissao_estoque'
  GROUP BY g.lote_id
  ORDER BY max(g.created_at) DESC
  LIMIT GREATEST(COALESCE(_limite, 20), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_painel_fase0_lotes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_painel_fase0_lotes(integer)
  TO authenticated, service_role;

-- Desfazer pela tela. A função já recusa quem não é admin — o que faltava era
-- o GRANT: até aqui era service_role, isto é, só pelo SQL editor.
GRANT EXECUTE ON FUNCTION public.cadencia_fase0_desfazer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) A tela da reativação (SDR)
-- ---------------------------------------------------------------------------
-- A view `v_reativacao_discador` é do DISCADOR: devolve telefone inteiro e é
-- service_role. A tela do SDR precisa do mesmo recorte sem o telefone cru e
-- com quem ainda está em descanso — em lista separada, somente leitura.
--
-- Guarda de papel explícita: sdr OU gestão. O corretor não entra, pelo motivo
-- já registrado na policy de `reativacao_fila` — o lead saiu da carteira dele
-- de propósito.
CREATE OR REPLACE FUNCTION public._reativacao_pode_agir(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _uid IS NULL
      OR public.has_role(_uid, 'sdr'::public.app_role)
      OR public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'gestor'::public.app_role)
      OR public.has_role(_uid, 'superintendente'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public._reativacao_pode_agir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._reativacao_pode_agir(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reativacao_fila_v1(_take integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid   uuid := auth.uid();
  _take_ integer := LEAST(GREATEST(COALESCE(_take, 200), 1), 500);
  _acionaveis jsonb;
  _descanso   jsonb;
BEGIN
  IF NOT public._reativacao_pode_agir(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.prioridade, x.entrou_em DESC), '[]'::jsonb)
    INTO _acionaveis
  FROM (
    SELECT r.id, r.lead_id, l.nome,
           r.empreendimento, r.faixa_renda, r.prioridade,
           r.horarios_tentados, r.tentativas_reativacao,
           r.entrou_em, r.elegivel_em, r.status, r.origem
    FROM public.reativacao_fila r
    JOIN public.leads l ON l.id = r.lead_id
    WHERE r.status IN ('aguardando','em_discagem','com_sdr')
      AND r.elegivel_em <= now()
      AND NOT COALESCE(l.opt_out, false)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.arquivado_em IS NULL
    ORDER BY r.prioridade, r.entrou_em DESC
    LIMIT _take_
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.elegivel_em), '[]'::jsonb)
    INTO _descanso
  FROM (
    SELECT r.id, r.lead_id, l.nome, r.empreendimento, r.faixa_renda,
           r.prioridade, r.entrou_em, r.elegivel_em, r.origem
    FROM public.reativacao_fila r
    JOIN public.leads l ON l.id = r.lead_id
    WHERE r.status = 'aguardando'
      AND r.elegivel_em > now()
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY r.elegivel_em
    LIMIT _take_
  ) y;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'acionaveis', _acionaveis,
    'em_descanso', _descanso);
END;
$$;

REVOKE ALL ON FUNCTION public.reativacao_fila_v1(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reativacao_fila_v1(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.reativacao_fila_v1(integer) IS
  'Tela da reativação (SDR + gestão): acionáveis (elegíveis hoje) e em '
  'descanso (somente leitura, com a data de elegibilidade). Sem telefone cru — '
  'discagem continua sendo da v_reativacao_discador.';

-- A policy de leitura passa a incluir o papel `sdr` e o superintendente: a
-- linha nasce com `sdr_id` nulo, então `sdr_id = auth.uid()` nunca casava para
-- quem ainda vai pegar a ligação.
DROP POLICY IF EXISTS "reativacao_fila leitura gestao e sdr" ON public.reativacao_fila;
CREATE POLICY "reativacao_fila leitura gestao e sdr"
  ON public.reativacao_fila FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr'::public.app_role)
    OR sdr_id = auth.uid()
  );


-- ---------------------------------------------------------------------------
-- 7) As duas ações da tela ganham guarda de papel
-- ---------------------------------------------------------------------------
-- Corpos idênticos aos de 20260921120200, com UMA linha nova cada — repetidos
-- inteiros porque CREATE OR REPLACE não sabe emendar.
CREATE OR REPLACE FUNCTION public.reativacao_marcar_reativado(
  _fila_id uuid,
  _notas   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reativacao_fila%ROWTYPE;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Guarda de papel (20260924120000): antes bastava ser membro ativo, o que
  -- deixava qualquer corretor finalizar por chamada direta uma linha da fila
  -- de reativação — fila que ele nem enxerga.
  IF NOT public._reativacao_pode_agir(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.reativacao_fila WHERE id = _fila_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'linha de reativação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _r.status IN ('reativado','arquivado') THEN
    RAISE EXCEPTION 'linha já finalizada (%)', _r.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.reativacao_fila
     SET status = 'reativado',
         sdr_id = COALESCE(_uid, sdr_id),
         sdr_notas = COALESCE(NULLIF(btrim(_notas), ''), sdr_notas),
         finalizado_em = now()
   WHERE id = _fila_id;

  -- Volta para a roleta: sem dono, aguardando corretor, ciclo + 1. A cadência
  -- recomeça em D1 quando a roleta atribuir — e como o ciclo mudou, as
  -- tentativas do ciclo anterior não contam para os novos 100%.
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET status                    = 'aguardando_corretor'::public.lead_status,
         motivo_perda_categoria    = NULL,
         motivo_perdido            = NULL,
         data_perda                = NULL,
         corretor_id               = NULL,
         classe_lead               = 'quente',
         reativado                 = true,
         cadencia_ciclo            = cadencia_ciclo + 1,
         cadencia_etapa            = NULL,
         cadencia_prazo_ts         = NULL,
         cadencia_inicio_ts        = NULL,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram   = '{}'::uuid[],
         proxima_acao              = 'Reativado pelo SDR — aguardando roleta',
         ultima_interacao          = now()
   WHERE id = _r.lead_id;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_r.lead_id, 'cadencia_etapa',
          'Lead reativado pelo SDR — devolvido à roleta da campanha.', 'reativacao',
          jsonb_build_object('de_estado', 'reativacao', 'para_estado', 'roleta',
                             'sdr_notas', _notas));

  RETURN jsonb_build_object('lead_id', _r.lead_id, 'ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reativacao_marcar_sem_retorno(_fila_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reativacao_fila%ROWTYPE;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Guarda de papel (20260924120000): antes bastava ser membro ativo, o que
  -- deixava qualquer corretor finalizar por chamada direta uma linha da fila
  -- de reativação — fila que ele nem enxerga.
  IF NOT public._reativacao_pode_agir(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.reativacao_fila WHERE id = _fila_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'linha de reativação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.reativacao_fila
     SET status = 'arquivado', finalizado_em = now(),
         sdr_id = COALESCE(_uid, sdr_id)
   WHERE id = _fila_id;

  UPDATE public.leads
     SET cadencia_etapa = 'arquivado',
         arquivado_em   = now(),
         proxima_acao   = 'Arquivado: só volta por formulário novo'
   WHERE id = _r.lead_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_r.lead_id, 'cadencia_etapa',
          'Reativação sem retorno — lead arquivado.', 'reativacao',
          jsonb_build_object('de_estado', 'reativacao', 'para_estado', 'arquivado'));

  RETURN jsonb_build_object('lead_id', _r.lead_id, 'ok', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
