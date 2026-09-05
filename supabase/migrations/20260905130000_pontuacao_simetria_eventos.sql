-- =====================================================================
-- Pontuação diária: contadores SIMÉTRICOS, uma régua só por evento e
-- meses fechados congelados.
--
-- Auditoria do hub de Desempenho (2026-09-05) encontrou quatro contadores de
-- atividades_diarias que só subiam, ou subiam pelo evento errado:
--
--   visita ........ o agendamento sintético (lead arrastado para "Visita
--                   realizada" sem visita validada) nasce já 'realizado' por
--                   INSERT e o trigger só ouvia UPDATE → o corretor perdia a
--                   visita; soft-delete de visita validada mantinha o ponto.
--   agendamento ... qualquer tipo pontuava (follow_up, ligação, outro) e o
--                   cancelamento/exclusão não estornava; reatribuir a outro
--                   corretor deixava o ponto com o antigo.
--   documentação .. cada reentrada em analise_credito somava de novo, enquanto
--                   Relatórios contam o lead UMA vez no mês.
--   ligação ....... click-to-call gravava o eco do PABX E o "Registrar
--                   resultado" da mesma chamada → 2 ligações por chamada;
--                   interação apagada mantinha o ponto.
--
-- Régua da PONTUAÇÃO (gamificação) por evento:
--   ligação/WhatsApp = interação ativa (deleted_at IS NULL) com autor, exceto
--                      o segundo registro da MESMA chamada (eco do discador ×
--                      registro manual até 30 min depois, no mesmo lead e
--                      autor) — a duplicata é carimbada na inserção
--                      (metadata.pontuacao_ignorada), para a decisão viver na
--                      própria linha e não depender do que acontece com a irmã;
--   agendamento ...... visita ou reunião criada pelo corretor (não auto_gerado,
--                      não criado por SDR), enquanto não cancelado/apagado;
--   visita ........... agendamento de visita 'realizado' e ativo, no dia da
--                      visita (data_inicio) — sintético ou não;
--   documentação ..... primeira entrada do lead em analise_credito no mês.
--
-- Os predicados vivem em funções (pont_*_conta) usadas pelos triggers E pela
-- reconciliação — não há duas implementações. Toda mudança que faz um evento
-- deixar de contar (ou trocar de dono/dia) estorna e recredita.
--
-- Meses fechados são CONGELADOS: os triggers e a reconciliação só mexem em
-- dias do mês corrente e do anterior (pont_dia_editavel). O ranking de um mês
-- encerrado é um registro do que aconteceu; a purga semanal da lixeira
-- (expirar_lixeira_antiga apaga em cascata interações/agendamentos de leads
-- com 90+ dias) e correções tardias não reescrevem posições antigas. Vendas e
-- VGV continuam vindo só do ledger de aprovação (20260711122000), fora desta
-- janela.
--
-- A reconciliação (reconciliar_atividades_diarias) recompõe os quatro
-- contadores a partir das tabelas-fonte na janela pedida; aqui ela roda UMA
-- vez sobre todo o histórico desde o início da gamificação (2026-06-16),
-- depois de guardar um snapshot em metrics.atividades_diarias_snapshot_20260905.
--
-- Locks: roda com o sistema vivo (discador, bot, n8n escrevendo em
-- interacoes/agendamentos). Por isso os triggers são trocados com
-- CREATE OR REPLACE TRIGGER (ShareRowExclusive: só espera escritores, nunca
-- bloqueia leitura) em vez de DROP + CREATE (AccessExclusive, que já causou
-- deadlock com uma transação do app que lia interacoes). E lock_timeout
-- curto: se uma tabela estiver ocupada, a migration falha inteira e limpa
-- (é uma transação só, e idempotente) em vez de enfileirar o app atrás dela.
-- =====================================================================

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 0) bump_atividade: ignora corretor que já não existe em auth.users (a
--    exclusão de um usuário faz interacoes.autor_id virar NULL por RI e o
--    estorno tentava inserir uma linha para um id apagado → FK).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_atividade(
  _corretor uuid, _dia date,
  _lig int DEFAULT 0, _wa int DEFAULT 0, _ag int DEFAULT 0,
  _vis int DEFAULT 0, _doc int DEFAULT 0, _ven int DEFAULT 0, _vgv numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF _corretor IS NULL OR _dia IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _corretor) THEN RETURN; END IF;
  INSERT INTO public.atividades_diarias
    (corretor_id, dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia)
  VALUES (_corretor, _dia, _lig, _wa, _ag, _vis, _doc, _ven, _vgv)
  ON CONFLICT (corretor_id, dia) DO UPDATE SET
    ligacoes      = atividades_diarias.ligacoes      + EXCLUDED.ligacoes,
    whatsapps     = atividades_diarias.whatsapps     + EXCLUDED.whatsapps,
    agendamentos  = atividades_diarias.agendamentos  + EXCLUDED.agendamentos,
    visitas       = atividades_diarias.visitas       + EXCLUDED.visitas,
    documentacoes = atividades_diarias.documentacoes + EXCLUDED.documentacoes,
    vendas        = atividades_diarias.vendas        + EXCLUDED.vendas,
    vgv_dia       = atividades_diarias.vgv_dia       + EXCLUDED.vgv_dia,
    updated_at    = now();

  UPDATE public.atividades_diarias SET pontuacao_total =
      ligacoes      * public.pontos_de('ligacao')
    + whatsapps     * public.pontos_de('whatsapp')
    + agendamentos  * public.pontos_de('agendamento')
    + visitas       * public.pontos_de('visita')
    + documentacoes * public.pontos_de('documentacao')
    + vendas        * public.pontos_de('venda')
  WHERE corretor_id = _corretor AND dia = _dia;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_atividade(uuid, date, int, int, int, int, int, int, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_atividade(uuid, date, int, int, int, int, int, int, numeric) TO service_role;

-- ---------------------------------------------------------------------
-- 1) Janela editável: mês corrente e anterior (America/Sao_Paulo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pont_inicio_janela_editavel()
RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '1 month')::date;
$$;

CREATE OR REPLACE FUNCTION public.pont_dia_editavel(_dia date)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT _dia IS NOT NULL AND _dia >= public.pont_inicio_janela_editavel();
$$;

COMMENT ON FUNCTION public.pont_dia_editavel(date) IS
  'true para dias do mês corrente e do anterior (SP): só nesses dias os eventos alteram a pontuação diária. Meses mais antigos são congelados.';

-- ---------------------------------------------------------------------
-- 2) Predicados (régua única)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pont_interacao_conta(
  _autor uuid, _tipo public.interacao_tipo, _metadata jsonb, _deleted timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT _autor IS NOT NULL
     AND _deleted IS NULL
     AND _tipo IN ('ligacao'::public.interacao_tipo, 'whatsapp'::public.interacao_tipo)
     AND NOT COALESCE((_metadata ->> 'pontuacao_ignorada')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.pont_agendamento_conta(
  _tipo public.agendamento_tipo, _status public.agendamento_status, _auto boolean,
  _criado_por uuid, _corretor uuid, _deleted timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT _corretor IS NOT NULL
     AND _deleted IS NULL
     AND COALESCE(_auto, false) = false
     AND _tipo IN ('visita'::public.agendamento_tipo, 'reuniao'::public.agendamento_tipo)
     AND _status <> 'cancelado'::public.agendamento_status
     -- Agendado pelo SDR para o corretor não é produção de agenda do corretor
     -- (o Raio-X do SDR conta por criado_por_id) — regra de 20260904102000.
     AND NOT (
       _criado_por IS NOT NULL
       AND _criado_por IS DISTINCT FROM _corretor
       AND EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = _criado_por AND ur.role = 'sdr'::public.app_role)
     );
$$;

CREATE OR REPLACE FUNCTION public.pont_visita_conta(
  _tipo public.agendamento_tipo, _status public.agendamento_status,
  _corretor uuid, _deleted timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT _corretor IS NOT NULL
     AND _deleted IS NULL
     AND _tipo = 'visita'::public.agendamento_tipo
     AND _status = 'realizado'::public.agendamento_status;
$$;

-- Primeira entrada do lead em analise_credito no mês (America/Sao_Paulo).
-- Transições são append-only (guardas mcp_g1/g2): a decisão não muda depois.
CREATE OR REPLACE FUNCTION public.pont_documentacao_conta(
  _id uuid, _lead uuid, _corretor uuid, _para public.lead_status, _created timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT _corretor IS NOT NULL
     AND _para = 'analise_credito'::public.lead_status
     AND NOT EXISTS (
       SELECT 1 FROM public.lead_status_transitions t
       WHERE t.lead_id = _lead
         AND t.para_status = 'analise_credito'::public.lead_status
         AND t.id <> _id
         AND (t.created_at < _created OR (t.created_at = _created AND t.id < _id))
         AND date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')
           = date_trunc('month', _created AT TIME ZONE 'America/Sao_Paulo')
     );
$$;

REVOKE ALL ON FUNCTION public.pont_inicio_janela_editavel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pont_dia_editavel(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pont_interacao_conta(uuid, public.interacao_tipo, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pont_agendamento_conta(public.agendamento_tipo, public.agendamento_status, boolean, uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pont_visita_conta(public.agendamento_tipo, public.agendamento_status, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pont_documentacao_conta(uuid, uuid, uuid, public.lead_status, timestamptz) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- 3) Ligação: a duplicata da mesma chamada é carimbada NA INSERÇÃO
-- ---------------------------------------------------------------------
-- Eco do PABX (metadata.fonte = sonax_*) e registro humano da mesma ligação
-- chegam como duas linhas. A segunda delas (em até 30 min, mesmo lead e
-- autor, uma sendo eco e a outra não) recebe pontuacao_ignorada = true. A
-- decisão fica gravada na linha: apagar a primeira depois não "reativa" a
-- segunda — a chamada valeu um ponto, dado a quem chegou primeiro.
CREATE OR REPLACE FUNCTION public.interacao_marcar_mesma_chamada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _eco boolean;
BEGIN
  IF NEW.tipo <> 'ligacao'::public.interacao_tipo OR NEW.autor_id IS NULL OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE((NEW.metadata ->> 'pontuacao_ignorada')::boolean, false) THEN
    RETURN NEW;
  END IF;
  _eco := COALESCE(NEW.metadata ->> 'fonte', '') LIKE 'sonax_%';
  IF EXISTS (
    SELECT 1 FROM public.interacoes i
    WHERE i.lead_id = NEW.lead_id
      AND i.autor_id = NEW.autor_id
      AND i.tipo = 'ligacao'::public.interacao_tipo
      AND i.deleted_at IS NULL
      AND i.created_at BETWEEN COALESCE(NEW.created_at, now()) - interval '30 minutes'
                           AND COALESCE(NEW.created_at, now())
      AND (COALESCE(i.metadata ->> 'fonte', '') LIKE 'sonax_%') IS DISTINCT FROM _eco
      AND NOT COALESCE((i.metadata ->> 'pontuacao_ignorada')::boolean, false)
  ) THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('pontuacao_ignorada', true, 'pontuacao_motivo', 'mesma_chamada');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.interacao_marcar_mesma_chamada() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_interacao_mesma_chamada
  BEFORE INSERT ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.interacao_marcar_mesma_chamada();

-- ---------------------------------------------------------------------
-- 4) Triggers de pontuação: estorna o que deixou de contar, credita o que
--    passou a contar, move quando dono/dia mudou — só na janela editável.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pont_after_interacao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _antes boolean := false;
  _depois boolean := false;
  _dia_antes date;
  _dia_depois date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _antes := public.pont_interacao_conta(OLD.autor_id, OLD.tipo, OLD.metadata, OLD.deleted_at);
    _dia_antes := (COALESCE(OLD.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _depois := public.pont_interacao_conta(NEW.autor_id, NEW.tipo, NEW.metadata, NEW.deleted_at);
    _dia_depois := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  IF _antes AND _depois AND OLD.autor_id = NEW.autor_id AND OLD.tipo = NEW.tipo AND _dia_antes = _dia_depois THEN
    RETURN NEW;
  END IF;
  IF _antes AND public.pont_dia_editavel(_dia_antes) THEN
    PERFORM public.bump_atividade(OLD.autor_id, _dia_antes,
      _lig => CASE WHEN OLD.tipo = 'ligacao'::public.interacao_tipo THEN -1 ELSE 0 END,
      _wa  => CASE WHEN OLD.tipo = 'whatsapp'::public.interacao_tipo THEN -1 ELSE 0 END);
  END IF;
  IF _depois AND public.pont_dia_editavel(_dia_depois) THEN
    PERFORM public.bump_atividade(NEW.autor_id, _dia_depois,
      _lig => CASE WHEN NEW.tipo = 'ligacao'::public.interacao_tipo THEN 1 ELSE 0 END,
      _wa  => CASE WHEN NEW.tipo = 'whatsapp'::public.interacao_tipo THEN 1 ELSE 0 END);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.pont_after_interacao() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_pont_interacao
  AFTER INSERT OR UPDATE OF deleted_at, tipo, autor_id, metadata OR DELETE ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_interacao();

CREATE OR REPLACE FUNCTION public.pont_after_agendamento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _antes boolean := false;
  _depois boolean := false;
  _dia_antes date;
  _dia_depois date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _antes := public.pont_agendamento_conta(OLD.tipo, OLD.status, OLD.auto_gerado, OLD.criado_por_id, OLD.corretor_id, OLD.deleted_at);
    _dia_antes := (COALESCE(OLD.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _depois := public.pont_agendamento_conta(NEW.tipo, NEW.status, NEW.auto_gerado, NEW.criado_por_id, NEW.corretor_id, NEW.deleted_at);
    _dia_depois := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  -- O ponto é de "agendamento criado": vive no dia da criação, com o
  -- corretor dono; troca de dono move o ponto.
  IF _antes AND _depois AND OLD.corretor_id = NEW.corretor_id AND _dia_antes = _dia_depois THEN
    RETURN NEW;
  END IF;
  IF _antes AND public.pont_dia_editavel(_dia_antes) THEN
    PERFORM public.bump_atividade(OLD.corretor_id, _dia_antes, _ag => -1);
  END IF;
  IF _depois AND public.pont_dia_editavel(_dia_depois) THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia_depois, _ag => 1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.pont_after_agendamento() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_pont_agendamento
  AFTER INSERT OR UPDATE OF status, deleted_at, tipo, corretor_id, auto_gerado, criado_por_id OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_agendamento();

CREATE OR REPLACE FUNCTION public.pont_after_visita_validada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _antes boolean := false;
  _depois boolean := false;
  _dia_antes date;
  _dia_depois date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _antes := public.pont_visita_conta(OLD.tipo, OLD.status, OLD.corretor_id, OLD.deleted_at);
    _dia_antes := (OLD.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _depois := public.pont_visita_conta(NEW.tipo, NEW.status, NEW.corretor_id, NEW.deleted_at);
    _dia_depois := (NEW.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  IF _antes AND _depois AND OLD.corretor_id = NEW.corretor_id AND _dia_antes = _dia_depois THEN
    RETURN NEW;
  END IF;
  IF _antes AND public.pont_dia_editavel(_dia_antes) THEN
    PERFORM public.bump_atividade(OLD.corretor_id, _dia_antes, _vis => -1);
  END IF;
  IF _depois AND public.pont_dia_editavel(_dia_depois) THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia_depois, _vis => 1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.pont_after_visita_validada() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_pont_visita_validada
  AFTER INSERT OR UPDATE OF status, deleted_at, data_inicio, tipo, corretor_id OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_visita_validada();

-- Documentação é decidida por LEAD × MÊS, não por linha: o ponto é de quem
-- fez a 1ª transição para analise_credito do lead no mês (created_at, id —
-- a mesma ordem de pont_documentacao_conta e da reconciliação). Um trigger
-- por comando compara "quem era a 1ª antes" com "quem é a 1ª depois" e move
-- o ponto quando muda. Isso cobre, com uma regra só: entrada normal (+1),
-- reentrada no mês (nada), transição retroativa (o ponto vai para ela),
-- DELETE de uma linha só (a próxima do mês é recreditada) e o DELETE em
-- cascata quando o lead é apagado em definitivo (estorno) — o trigger por
-- linha antigo (trg_pont_transicao, 20260616130000) só sabia somar no INSERT
-- e é substituído no lugar, sob o mesmo nome, pelo novo por comando.
CREATE OR REPLACE FUNCTION public.pont_transicao_lote()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r record;
  _dia date;
BEGIN
  FOR r IN
    WITH chaves AS (
      SELECT DISTINCT l.lead_id,
             date_trunc('month', l.created_at AT TIME ZONE 'America/Sao_Paulo') AS mes
      FROM lote l
      WHERE l.para_status = 'analise_credito'::public.lead_status
        AND l.created_at IS NOT NULL
    ), atuais AS (
      SELECT c.lead_id, c.mes, t.id, t.corretor_id, t.created_at
      FROM chaves c
      JOIN public.lead_status_transitions t
        ON t.lead_id = c.lead_id
       AND t.para_status = 'analise_credito'::public.lead_status
       AND date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo') = c.mes
    ), antes AS (
      -- INSERT: o que já existia, sem as linhas do lote.
      -- DELETE: o que sobrou mais as linhas removidas.
      SELECT a.lead_id, a.mes, a.id, a.corretor_id, a.created_at
      FROM atuais a
      WHERE TG_OP = 'DELETE' OR NOT EXISTS (SELECT 1 FROM lote l WHERE l.id = a.id)
      UNION ALL
      SELECT c.lead_id, c.mes, l.id, l.corretor_id, l.created_at
      FROM chaves c
      JOIN lote l
        ON TG_OP = 'DELETE'
       AND l.lead_id = c.lead_id
       AND l.para_status = 'analise_credito'::public.lead_status
       AND date_trunc('month', l.created_at AT TIME ZONE 'America/Sao_Paulo') = c.mes
    ), primeira_antes AS (
      SELECT DISTINCT ON (lead_id, mes) lead_id, mes, id, corretor_id, created_at
      FROM antes ORDER BY lead_id, mes, created_at, id
    ), primeira_depois AS (
      SELECT DISTINCT ON (lead_id, mes) lead_id, mes, id, corretor_id, created_at
      FROM atuais ORDER BY lead_id, mes, created_at, id
    )
    SELECT pa.corretor_id AS corretor_antes, pa.created_at AS created_antes,
           pd.corretor_id AS corretor_depois, pd.created_at AS created_depois
    FROM chaves c
    LEFT JOIN primeira_antes pa ON pa.lead_id = c.lead_id AND pa.mes = c.mes
    LEFT JOIN primeira_depois pd ON pd.lead_id = c.lead_id AND pd.mes = c.mes
    WHERE pa.id IS DISTINCT FROM pd.id
  LOOP
    IF r.corretor_antes IS NOT NULL THEN
      _dia := (r.created_antes AT TIME ZONE 'America/Sao_Paulo')::date;
      IF public.pont_dia_editavel(_dia) THEN
        PERFORM public.bump_atividade(r.corretor_antes, _dia, _doc => -1);
      END IF;
    END IF;
    IF r.corretor_depois IS NOT NULL THEN
      _dia := (r.created_depois AT TIME ZONE 'America/Sao_Paulo')::date;
      IF public.pont_dia_editavel(_dia) THEN
        PERFORM public.bump_atividade(r.corretor_depois, _dia, _doc => 1);
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pont_transicao_lote() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_pont_transicao
  AFTER INSERT ON public.lead_status_transitions
  REFERENCING NEW TABLE AS lote
  FOR EACH STATEMENT EXECUTE FUNCTION public.pont_transicao_lote();
CREATE OR REPLACE TRIGGER trg_pont_transicao_del
  AFTER DELETE ON public.lead_status_transitions
  REFERENCING OLD TABLE AS lote
  FOR EACH STATEMENT EXECUTE FUNCTION public.pont_transicao_lote();
-- Só agora a função antiga fica sem trigger e pode sair.
DROP FUNCTION IF EXISTS public.pont_after_transicao();

-- ---------------------------------------------------------------------
-- 5) Reconciliação: recompõe os quatro contadores a partir das fontes
--    (janela editável por padrão; `_desde` amplia para correções únicas)
-- ---------------------------------------------------------------------
-- (uma versão sem parâmetro existiu só em ambiente de desenvolvimento; o
-- DROP evita duas assinaturas e a chamada ambígua)
DROP FUNCTION IF EXISTS public.reconciliar_atividades_diarias();

CREATE OR REPLACE FUNCTION public.reconciliar_atividades_diarias(_desde date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  _ini date := COALESCE(_desde, public.pont_inicio_janela_editavel());
  _n integer;
  _zeradas integer;
BEGIN
  -- Ninguém lança ponto enquanto a foto é tirada e gravada.
  LOCK TABLE public.atividades_diarias IN SHARE ROW EXCLUSIVE MODE;

  DROP TABLE IF EXISTS _recalc;
  CREATE TEMP TABLE _recalc ON COMMIT DROP AS
  WITH inter AS (
    SELECT i.autor_id AS corretor_id,
           (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*) FILTER (WHERE i.tipo = 'ligacao'::public.interacao_tipo)::int AS ligacoes,
           count(*) FILTER (WHERE i.tipo = 'whatsapp'::public.interacao_tipo)::int AS whatsapps
    FROM public.interacoes i
    WHERE i.created_at >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND public.pont_interacao_conta(i.autor_id, i.tipo, i.metadata, i.deleted_at)
    GROUP BY 1, 2
  ), agd AS (
    SELECT a.corretor_id,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*)::int AS agendamentos
    FROM public.agendamentos a
    WHERE a.created_at >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND public.pont_agendamento_conta(a.tipo, a.status, a.auto_gerado, a.criado_por_id, a.corretor_id, a.deleted_at)
    GROUP BY 1, 2
  ), vis AS (
    SELECT a.corretor_id,
           (a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*)::int AS visitas
    FROM public.agendamentos a
    WHERE a.data_inicio >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND public.pont_visita_conta(a.tipo, a.status, a.corretor_id, a.deleted_at)
    GROUP BY 1, 2
  ), doc AS (
    SELECT t.corretor_id,
           (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*)::int AS documentacoes
    FROM public.lead_status_transitions t
    WHERE t.created_at >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND t.para_status = 'analise_credito'::public.lead_status
      AND public.pont_documentacao_conta(t.id, t.lead_id, t.corretor_id, t.para_status, t.created_at)
    GROUP BY 1, 2
  ), chaves AS (
    SELECT corretor_id, dia FROM inter
    UNION SELECT corretor_id, dia FROM agd
    UNION SELECT corretor_id, dia FROM vis
    UNION SELECT corretor_id, dia FROM doc
  )
  SELECT c.corretor_id, c.dia,
         COALESCE(i.ligacoes, 0) AS ligacoes,
         COALESCE(i.whatsapps, 0) AS whatsapps,
         COALESCE(g.agendamentos, 0) AS agendamentos,
         COALESCE(v.visitas, 0) AS visitas,
         COALESCE(d.documentacoes, 0) AS documentacoes
  FROM chaves c
  LEFT JOIN inter i USING (corretor_id, dia)
  LEFT JOIN agd g USING (corretor_id, dia)
  LEFT JOIN vis v USING (corretor_id, dia)
  LEFT JOIN doc d USING (corretor_id, dia)
  WHERE c.dia >= _ini
    -- Só quem ainda existe em auth.users (FK de atividades_diarias).
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.corretor_id);

  INSERT INTO public.atividades_diarias
    (corretor_id, dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes)
  SELECT corretor_id, dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes
  FROM _recalc
  ON CONFLICT (corretor_id, dia) DO UPDATE SET
    ligacoes      = EXCLUDED.ligacoes,
    whatsapps     = EXCLUDED.whatsapps,
    agendamentos  = EXCLUDED.agendamentos,
    visitas       = EXCLUDED.visitas,
    documentacoes = EXCLUDED.documentacoes,
    updated_at    = now()
  WHERE (atividades_diarias.ligacoes, atividades_diarias.whatsapps, atividades_diarias.agendamentos,
         atividades_diarias.visitas, atividades_diarias.documentacoes)
        IS DISTINCT FROM
        (EXCLUDED.ligacoes, EXCLUDED.whatsapps, EXCLUDED.agendamentos, EXCLUDED.visitas, EXCLUDED.documentacoes);
  GET DIAGNOSTICS _n = ROW_COUNT;

  -- Dias da janela que tinham contador e não têm mais evento-fonte: zera
  -- (vendas/VGV ficam).
  UPDATE public.atividades_diarias a
     SET ligacoes = 0, whatsapps = 0, agendamentos = 0, visitas = 0, documentacoes = 0,
         updated_at = now()
   WHERE a.dia >= _ini
     AND (a.ligacoes <> 0 OR a.whatsapps <> 0 OR a.agendamentos <> 0 OR a.visitas <> 0 OR a.documentacoes <> 0)
     AND NOT EXISTS (SELECT 1 FROM _recalc r WHERE r.corretor_id = a.corretor_id AND r.dia = a.dia);
  GET DIAGNOSTICS _zeradas = ROW_COUNT;

  PERFORM public.recalcular_pontuacao_atividades();
  DROP TABLE IF EXISTS _recalc;
  RETURN _n + _zeradas;
END;
$$;

COMMENT ON FUNCTION public.reconciliar_atividades_diarias(date) IS
  'Recompõe ligações, WhatsApp, agendamentos, visitas e documentações de atividades_diarias a partir de interacoes/agendamentos/lead_status_transitions com os predicados pont_*_conta (a mesma régua dos triggers) e recalcula a pontuação. Janela: dias >= _desde (padrão: início do mês anterior — meses mais antigos são congelados). Vendas/VGV não são tocados (ledger de aprovação). Devolve quantas linhas mudaram. Idempotente.';

REVOKE ALL ON FUNCTION public.reconciliar_atividades_diarias(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_atividades_diarias(date) TO service_role;

-- ---------------------------------------------------------------------
-- 6) ranking_periodo_v2: contas desativadas fora; "leads recebidos" pela
--    data de distribuição (a mesma régua de metrics.performance_corretor_mensal)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_periodo_v2(_inicio date, _fim date, _limit integer DEFAULT 50)
 RETURNS TABLE(posicao bigint, corretor_id uuid, nome text, pontuacao bigint, ligacoes bigint, whatsapps bigint, agendamentos bigint, visitas bigint, documentacoes bigint, vendas bigint, vgv numeric, leads bigint, alteracoes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _ini_ts timestamptz := (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo');
  _fim_ts timestamptz := ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      -- Contas desativadas pela gestão (ativo=false, ex.: contas de teste)
      -- saem do ranking e dos totais — mesma régua de gestao_pacing.
      AND p.ativo = true
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS papel
        WHERE papel.user_id = p.id
          AND papel.role IN (
            'corretor'::public.app_role,
            'gestor'::public.app_role,
            'admin'::public.app_role
          )
      )
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_agregado AS (
    -- "Leads recebidos": pela data em que o lead chegou ao corretor
    -- (distribuição), caindo na criação quando nunca foi distribuído.
    SELECT l.corretor_id, count(*)::bigint AS leads
    FROM public.leads AS l
    WHERE COALESCE(l.data_distribuicao, l.created_at) >= _ini_ts
      AND COALESCE(l.data_distribuicao, l.created_at) < _fim_ts
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IN (SELECT id FROM escopo)
    GROUP BY l.corretor_id
  ), transicoes_agregado AS (
    SELECT t.corretor_id, count(*)::bigint AS alteracoes
    FROM public.lead_status_transitions AS t
    WHERE t.created_at >= _ini_ts
      AND t.created_at < _fim_ts
      AND t.corretor_id IN (SELECT id FROM escopo)
    GROUP BY t.corretor_id
  ), agregado AS (
    SELECT
      e.id AS corretor_id,
      e.nome,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao,
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(max(la.leads), 0)::bigint AS leads,
      COALESCE(max(ta.alteracoes), 0)::bigint AS alteracoes
    FROM escopo AS e
    LEFT JOIN public.atividades_diarias AS a
      ON a.corretor_id = e.id
     AND a.dia BETWEEN _inicio AND _fim
    LEFT JOIN leads_agregado AS la ON la.corretor_id = e.id
    LEFT JOIN transicoes_agregado AS ta ON ta.corretor_id = e.id
    GROUP BY e.id, e.nome
  ), ranqueado AS (
    SELECT
      dense_rank() OVER (
        ORDER BY a.pontuacao DESC, a.vendas DESC, a.vgv DESC
      ) AS posicao,
      a.*
    FROM agregado AS a
  )
  SELECT
    r.posicao,
    r.corretor_id,
    r.nome,
    r.pontuacao,
    r.ligacoes,
    r.whatsapps,
    r.agendamentos,
    r.visitas,
    r.documentacoes,
    r.vendas,
    r.vgv,
    r.leads,
    r.alteracoes
  FROM ranqueado AS r
  ORDER BY r.posicao, r.corretor_id
  LIMIT _take;
END;
$function$;

REVOKE ALL ON FUNCTION public.ranking_periodo_v2(date, date, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ranking_periodo_v2(date, date, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Uma vez: snapshot, carimbo das duplicatas históricas e reconciliação
--    de todo o histórico desde o início da gamificação (2026-06-16)
-- ---------------------------------------------------------------------
DO $mig$
BEGIN
  IF to_regclass('metrics.atividades_diarias_snapshot_20260905') IS NULL THEN
    CREATE TABLE metrics.atividades_diarias_snapshot_20260905 AS
      SELECT * FROM public.atividades_diarias;
    REVOKE ALL ON metrics.atividades_diarias_snapshot_20260905 FROM PUBLIC, anon, authenticated;
    COMMENT ON TABLE metrics.atividades_diarias_snapshot_20260905 IS
      'Foto de atividades_diarias antes da reconciliação da migration 20260905130000 (auditoria/rollback manual).';
  END IF;
END
$mig$;

-- Registro manual de uma chamada que o PABX já ecoou (até 30 min depois,
-- mesmo lead e autor): a segunda linha do par recebe o carimbo, como o
-- trigger passa a fazer na inserção.
UPDATE public.interacoes m
   SET metadata = COALESCE(m.metadata, '{}'::jsonb)
                  || '{"pontuacao_ignorada": true, "pontuacao_motivo": "mesma_chamada"}'::jsonb
 WHERE m.tipo = 'ligacao'::public.interacao_tipo
   AND m.autor_id IS NOT NULL
   AND NOT COALESCE((m.metadata ->> 'pontuacao_ignorada')::boolean, false)
   AND EXISTS (
     SELECT 1 FROM public.interacoes e
     WHERE e.lead_id = m.lead_id
       AND e.autor_id = m.autor_id
       AND e.tipo = 'ligacao'::public.interacao_tipo
       AND e.id <> m.id
       AND e.deleted_at IS NULL
       AND (e.created_at < m.created_at OR (e.created_at = m.created_at AND e.id < m.id))
       AND e.created_at >= m.created_at - interval '30 minutes'
       AND (COALESCE(e.metadata ->> 'fonte', '') LIKE 'sonax_%')
           IS DISTINCT FROM (COALESCE(m.metadata ->> 'fonte', '') LIKE 'sonax_%')
       AND NOT COALESCE((e.metadata ->> 'pontuacao_ignorada')::boolean, false)
   );

SELECT public.reconciliar_atividades_diarias('2026-06-16');
