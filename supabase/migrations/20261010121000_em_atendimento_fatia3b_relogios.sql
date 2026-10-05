-- ============================================================================
-- REGRA DOS 65 — Fatia 3b: os relógios (cron), a virada, os alertas 60/65
-- ============================================================================
-- Desenho: docs/ops/em-atendimento-teto-65.md (§2.3 relógio, §2.5 virada e
-- alertas, §6 decisões após a medição, §9 → 3b). A Fatia 1 escreveu a regra
-- única (_em_atendimento_classificar) e só olhou; as Fatias 2, 3a e 3a.2
-- fecharam as portas. Esta fatia põe o relógio para andar:
--
--   * em_atendimento_processar(): o cron (de hora em hora) classifica a
--     carteira de todo corretor ativo e, para cada lead com ação, FAZ o que a
--     regra diz — em modo "ligado" — ou só REGISTRA o que faria — em modo
--     "sombra". Mesma consulta da simulação: ensaio e execução nunca
--     divergem (lição da Fase 0 da cadência).
--       perde_vaga / excedente  → Minha base (aguardando_retorno, com o passo)
--       porta_cadencia          → aguardando_atendimento (segue a cadência)
--       sem_toque / retorno_vencido / qualificacao_vencida
--                               → pago: roleta · estoque: Bolsão · próprio: fica
--                                 com alerta ao gestor
--       retorno_acima_maximo    → perda "retorno futuro" (volta pela reativação);
--                                 próprio: fica com alerta
--       fundo_gestor / fundo_desfecho → só alerta ao gestor (fundo nunca sai)
--     Cada movimento fica em em_atendimento_movimentos (status e dono de
--     antes) e pode ser desfeito por execução (em_atendimento_desfazer).
--   * A virada (§2.5): em_atendimento_ligar(virada_em) marca modo = ligado e
--     a data; até a data a regra continua em sombra (o corretor escolhe os
--     seus 65); no dia, a primeira rodada aplica tudo de uma vez (decisão 2
--     do §6) — a trava 60/150 segura a roleta, e o que não couber espera na
--     fila. em_atendimento_ligada() é a leitura única de "está valendo", e a
--     trava da roleta (_em_atendimento_recebe_lead) passa a usá-la.
--   * Alertas ao gestor em 60 e 65 (§2.5), a cada rodada ligada, no máximo um
--     por corretor por dia.
--   * Guarda: a régua de devolução da Fatia 4 (gestao_config.bolsao) não pode
--     estar ativa junto — seriam dois motores devolvendo o mesmo lead (§6).
--
-- Produção (05/10/2026, somente leitura — o que a primeira rodada ligada
-- faria hoje): 1.608 perdem a vaga; 8 excedentes; 2.688 saem da Minha base
-- por 5 dias sem toque (1.881 Bolsão, 802 roleta, 5 próprios com alerta);
-- 222 retornos vencidos; 267 qualificações vencidas; 208 no fundo há 10+
-- dias e 11 há 5+ (só alerta).
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config: a virada, e "ligada" como leitura única
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT '{"modo": "sombra", "virada_em": null, "trava_roleta": 60, "teto_base": 150,
           "dias_sem_toque": 5, "tolerancia_retorno_dias": 2,
           "retorno_max_dias": 30, "qualificacao_prazo_horas": 24,
           "escreveu_dias": 7, "fundo_topo_dias": 3, "fundo_gestor_dias": 5,
           "fundo_desfecho_dias": 10}'::jsonb
      || COALESCE(public.gestao_config_valor('em_atendimento'), '{}'::jsonb)
      || jsonb_build_object(
           'teto', COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65));
$$;

-- "Está valendo": modo ligado e a virada já passou (ou não foi marcada).
CREATE OR REPLACE FUNCTION public.em_atendimento_ligada()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(c.v ->> 'modo', 'sombra') = 'ligado'
     AND (NULLIF(c.v ->> 'virada_em', '') IS NULL
          OR (c.v ->> 'virada_em')::timestamptz <= now())
  FROM (SELECT public.em_atendimento_config() AS v) AS c;
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_ligada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_ligada() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.em_atendimento_ligar(_virada_em timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT ((_uid IS NULL AND auth.role() IS NULL)
          OR COALESCE(auth.role() = 'service_role', false)
          OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'apenas admin liga a regra dos 65' USING ERRCODE = '42501';
  END IF;
  -- Dois motores devolvendo o mesmo lead, não (§6).
  IF COALESCE(public.gestao_config_valor('bolsao') ->> 'modo', 'sombra') = 'ativo' THEN
    RAISE EXCEPTION 'a régua de devolução (gestao_config.bolsao.modo = ativo) está ligada: desligue-a antes da regra dos 65'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE((public.gestao_config_valor('regua_followup') ->> 'devolucao_ativa')::boolean, false) THEN
    RAISE EXCEPTION 'a devolução por follow-up vencido (regua_followup.devolucao_ativa) está ligada: desligue-a antes da regra dos 65'
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.gestao_config
     SET valor = valor || jsonb_build_object(
                   'modo', 'ligado',
                   'virada_em', COALESCE(_virada_em, now()),
                   'ligado_em', now(),
                   'ligado_por', _uid),
         atualizado_em = now(),
         atualizado_por = _uid
   WHERE chave = 'em_atendimento';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gestao_config.em_atendimento não existe (migration 20261009120600)' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.em_atendimento_config();
END;
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_ligar(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_ligar(timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.em_atendimento_desligar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT ((_uid IS NULL AND auth.role() IS NULL)
          OR COALESCE(auth.role() = 'service_role', false)
          OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'apenas admin desliga a regra dos 65' USING ERRCODE = '42501';
  END IF;
  UPDATE public.gestao_config
     SET valor = (valor - 'virada_em') || jsonb_build_object('modo', 'sombra', 'desligado_em', now(), 'desligado_por', _uid),
         atualizado_em = now(),
         atualizado_por = _uid
   WHERE chave = 'em_atendimento';
  RETURN public.em_atendimento_config();
END;
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_desligar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_desligar() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) O registro de cada rodada e de cada movimento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.em_atendimento_execucoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modo         text NOT NULL CHECK (modo IN ('sombra', 'ligado')),
  gatilho      text NOT NULL DEFAULT 'cron',
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,
  avaliados    integer NOT NULL DEFAULT 0,
  aplicados    integer NOT NULL DEFAULT 0,
  alertas      integer NOT NULL DEFAULT 0,
  erros        integer NOT NULL DEFAULT 0,
  resumo       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.em_atendimento_movimentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id    uuid NOT NULL REFERENCES public.em_atendimento_execucoes(id) ON DELETE CASCADE,
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id    uuid,
  camada         text,
  grupo          text,
  acao           text NOT NULL,
  destino        text,
  motivo         text,
  modo           text NOT NULL,
  aplicado       boolean NOT NULL DEFAULT false,
  status_antes   text,
  corretor_antes uuid,
  erro           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  desfeito_em    timestamptz
);
CREATE INDEX IF NOT EXISTS em_atendimento_movimentos_execucao_idx ON public.em_atendimento_movimentos (execucao_id);
CREATE INDEX IF NOT EXISTS em_atendimento_movimentos_lead_idx ON public.em_atendimento_movimentos (lead_id, created_at DESC);
ALTER TABLE public.em_atendimento_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.em_atendimento_movimentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.em_atendimento_execucoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.em_atendimento_movimentos FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.em_atendimento_movimentos IS
  'Regra dos 65, Fatia 3b: cada lead que a rodada moveu (ligado) ou moveria '
  '(sombra), com status e dono de antes para o desfazer por execução.';

-- ---------------------------------------------------------------------------
-- 3) Alertas com janela (um por pessoa, por assunto, por dia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._em_atendimento_alertar(
  _user uuid, _titulo text, _mensagem text, _ref uuid, _link text,
  _janela interval DEFAULT interval '24 hours'
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF _user IS NULL THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.alertas AS a
     WHERE a.user_id = _user AND a.ref_id = _ref AND a.titulo = _titulo
       AND a.created_at >= now() - _janela
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  VALUES (_user, 'distribuicao'::public.alerta_tipo, _titulo, _mensagem, _link, _ref);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._em_atendimento_alertar(uuid, text, text, uuid, text, interval) FROM PUBLIC, anon, authenticated;

-- Gestão = admin + gestor, como _alertar_gestores_distribuicao.
CREATE OR REPLACE FUNCTION public._em_atendimento_alertar_gestores(
  _titulo text, _mensagem text, _ref uuid, _link text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _u uuid;
  _n integer := 0;
BEGIN
  FOR _u IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles AS ur
     WHERE ur.role IN ('admin'::public.app_role, 'gestor'::public.app_role)
  LOOP
    IF public._em_atendimento_alertar(_u, _titulo, _mensagem, _ref, _link) THEN
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public._em_atendimento_alertar_gestores(text, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Soltar o lead: roleta (pago) ou Bolsão (estoque)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._em_atendimento_soltar(
  _lead uuid, _corretor uuid, _destino text, _acao text, _motivo text, _nome text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ok boolean;
  _log_id uuid;
  _status_antes text;
BEGIN
  IF _destino NOT IN ('roleta', 'bolsao') THEN
    RETURN false;
  END IF;
  -- Cliente de lote de prospecção veio do Bolsão e volta para lá, pelo
  -- caminho que o lote já conhece (status e classe de antes).
  IF EXISTS (SELECT 1 FROM public.leads AS l
              WHERE l.id = _lead AND l.corretor_id = _corretor AND l.prospeccao_lote_id IS NOT NULL) THEN
    RETURN public._prospeccao_devolver_bolsao(_lead, _corretor, 'regra_65_' || _acao);
  END IF;
  SELECT l.status::text INTO _status_antes FROM public.leads AS l WHERE l.id = _lead;
  -- Mesma regra de _cadencia_devolver_roleta: tudo no MESMO UPDATE que solta
  -- o corretor (nenhum instante com lead sem dono e estado pela metade).
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id      = corretor_id,
         corretor_id               = NULL,
         status                    = CASE WHEN _destino = 'roleta'
                                          THEN 'aguardando_corretor'::public.lead_status
                                          ELSE 'aguardando_atendimento'::public.lead_status END,
         classe_lead               = CASE WHEN _destino = 'bolsao' THEN 'base' ELSE classe_lead END,
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
     'Regra dos 65 (' || _acao || '): ' || _motivo || ' — '
       || CASE WHEN _destino = 'roleta' THEN 'volta à roleta' ELSE 'vai ao Bolsão' END,
     CASE WHEN _destino = 'roleta' THEN 'roleta' ELSE 'base' END,
     'regra_65_' || _acao, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, jsonb_build_object(
    'gatilho', 'regra_65', 'acao', _acao, 'destino', _destino,
    'corretor_anterior', _corretor, 'status_no_momento', _status_antes));
  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead, 'em_atendimento_regra',
          'Regra dos 65: ' || _motivo || ' — o lead '
            || CASE WHEN _destino = 'roleta' THEN 'voltou à roleta.' ELSE 'foi ao Bolsão.' END,
          'regra_65',
          jsonb_build_object('acao', _acao, 'destino', _destino, 'motivo', _motivo,
                             'corretor_anterior', _corretor, 'de_status', _status_antes));
  PERFORM public._em_atendimento_alertar(
    _corretor,
    'Lead saiu da sua base: ' || COALESCE(_nome, 'cliente'),
    _motivo || '. '
      || CASE WHEN _destino = 'roleta' THEN 'O lead voltou à roleta.' ELSE 'O lead foi ao Bolsão.' END
      || ' Na Minha base, 5 dias sem toque o lead sai (regra dos 65).',
    _lead, '/leads/' || _lead);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._em_atendimento_soltar(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Aplicar uma ação da regra a um lead (modo ligado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._em_atendimento_aplicar(
  _lead uuid, _corretor uuid, _acao text, _destino text, _motivo text,
  _nome text, _proximo_followup timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
  _corretor_nome text;
  _n integer;
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead FOR UPDATE;
  -- Mudou de mão (ou sumiu) entre a classificação e a escrita: nada a fazer.
  IF NOT FOUND OR _l.corretor_id IS DISTINCT FROM _corretor
     OR _l.deleted_at IS NOT NULL OR COALESCE(_l.na_lixeira, false) THEN
    RETURN false;
  END IF;
  SELECT p.nome INTO _corretor_nome FROM public.profiles AS p WHERE p.id = _corretor;

  IF _acao IN ('perde_vaga', 'excedente') THEN
    IF _l.status <> 'em_atendimento'::public.lead_status THEN RETURN false; END IF;
    -- Desce para a Minha base levando a data do passo (proximo_followup é
    -- espelho das tarefas: nada a mexer).
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads SET status = 'aguardando_retorno'::public.lead_status WHERE id = _lead;
    PERFORM set_config('app.transicionar_lead', 'off', true);
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead, 'em_atendimento_regra',
            'Regra dos 65: ' || _motivo || ' — perdeu a vaga e desceu para a Minha base.',
            'regra_65',
            jsonb_build_object('acao', _acao, 'motivo', _motivo,
                               'de_status', 'em_atendimento', 'para_status', 'aguardando_retorno'));
    PERFORM public._em_atendimento_alertar(
      _corretor, 'Perdeu a vaga dos 65: ' || COALESCE(_nome, 'cliente'),
      _motivo || '. O lead desceu para a Minha base; registre um contato para disputar a vaga de novo.',
      _lead, '/leads/' || _lead);
    RETURN true;

  ELSIF _acao = 'porta_cadencia' THEN
    IF _l.status <> 'em_atendimento'::public.lead_status THEN RETURN false; END IF;
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads SET status = 'aguardando_atendimento'::public.lead_status WHERE id = _lead;
    PERFORM set_config('app.transicionar_lead', 'off', true);
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead, 'em_atendimento_regra',
            'Regra dos 65: em cadência sem resposta do cliente — volta para Aguardando atendimento e segue a cadência.',
            'regra_65',
            jsonb_build_object('acao', _acao, 'de_status', 'em_atendimento', 'para_status', 'aguardando_atendimento'));
    RETURN true;

  ELSIF _acao IN ('sem_toque', 'retorno_vencido', 'qualificacao_vencida') THEN
    IF _destino IN ('roleta', 'bolsao') THEN
      RETURN public._em_atendimento_soltar(_lead, _corretor, _destino, _acao, _motivo, _nome);
    END IF;
    -- Lead próprio: fica, com alerta ao gestor.
    _n := public._em_atendimento_alertar_gestores(
      'Lead próprio parado: ' || COALESCE(_nome, 'cliente'),
      _motivo || ' — lead próprio de ' || COALESCE(_corretor_nome, 'corretor')
        || ' fica com ele (regra dos 65); combine o próximo passo.',
      _lead, '/leads/' || _lead);
    RETURN _n > 0;

  ELSIF _acao = 'retorno_acima_maximo' THEN
    IF _destino = 'reativacao' THEN
      -- Perda "retorno futuro", como o desfecho da Fatia 2: volta pela reativação.
      PERFORM set_config('app.transicionar_lead', 'on', true);
      UPDATE public.leads
         SET status = 'perdido'::public.lead_status,
             motivo_perdido = 'Retorno futuro: ' || _motivo,
             motivo_perda_categoria = 'retorno_futuro',
             proxima_acao = NULL,
             proximo_followup = NULL
       WHERE id = _lead;
      PERFORM set_config('app.transicionar_lead', 'off', true);
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_lead, 'transicao_lead',
              'Lead movido de ' || _l.status::text || ' para perdido.',
              'regra_65',
              jsonb_build_object('de_status', _l.status, 'para_status', 'perdido',
                                 'motivo', 'Retorno futuro: ' || _motivo,
                                 'motivo_categoria', 'retorno_futuro'));
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_lead, 'retorno_futuro',
              'Regra dos 65: ' || _motivo || ' — perda "retorno futuro", volta pela reativação.',
              'regra_65',
              jsonb_build_object('retorno_em', _proximo_followup, 'desfecho', 'regra_65',
                                 'corretor_anterior', _corretor));
      PERFORM public._em_atendimento_alertar(
        _corretor, 'Retorno futuro: ' || COALESCE(_nome, 'cliente'),
        _motivo || '. Virou perda "retorno futuro" e volta pela reativação na data (regra dos 65).',
        _lead, '/leads/' || _lead);
      RETURN true;
    END IF;
    _n := public._em_atendimento_alertar_gestores(
      'Retorno além de 30 dias (lead próprio): ' || COALESCE(_nome, 'cliente'),
      _motivo || ' — lead próprio de ' || COALESCE(_corretor_nome, 'corretor') || ' fica com ele.',
      _lead, '/leads/' || _lead);
    RETURN _n > 0;

  ELSIF _acao = 'fundo_gestor' THEN
    _n := public._em_atendimento_alertar_gestores(
      'Fundo do funil parado: ' || COALESCE(_nome, 'cliente'),
      _motivo || ' com ' || COALESCE(_corretor_nome, 'corretor')
        || '. O fundo nunca sai por robô: acompanhe o desfecho.',
      _lead, '/leads/' || _lead);
    RETURN _n > 0;

  ELSIF _acao = 'fundo_desfecho' THEN
    _n := public._em_atendimento_alertar_gestores(
      'Dê o desfecho: ' || COALESCE(_nome, 'cliente'),
      _motivo || ' com ' || COALESCE(_corretor_nome, 'corretor')
        || '. Passou de 10 dias: o gestor dá o desfecho (regra dos 65).',
      _lead, '/leads/' || _lead);
    RETURN _n > 0;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public._em_atendimento_aplicar(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) A rodada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_processar(_modo text DEFAULT NULL, _limite integer DEFAULT NULL)
RETURNS TABLE(execucao_id uuid, modo text, acao text, destino text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg jsonb := public.em_atendimento_config();
  _uid uuid := auth.uid();
  _m text;
  _exec uuid := gen_random_uuid();
  _r record;
  _p record;
  _ok boolean;
  _erro text;
  _n_aval integer := 0;
  _n_apl integer := 0;
  _n_alert integer := 0;
  _n_err integer := 0;
  _teto integer := (_cfg ->> 'teto')::int;
  _trava integer := (_cfg ->> 'trava_roleta')::int;
  _ocup integer;
  _corretores uuid[];
  _ultima timestamptz;
BEGIN
  -- Sem contexto (pg_cron, psql, service_role) ou admin — como higiene_processar.
  IF NOT ((_uid IS NULL AND auth.role() IS NULL)
          OR COALESCE(auth.role() = 'service_role', false)
          OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para rodar a regra dos 65' USING ERRCODE = '42501';
  END IF;
  _m := lower(COALESCE(_modo, CASE WHEN public.em_atendimento_ligada() THEN 'ligado' ELSE 'sombra' END));
  IF _m NOT IN ('sombra', 'ligado') THEN
    RAISE EXCEPTION 'modo inválido: % (use sombra ou ligado)', _m USING ERRCODE = '22023';
  END IF;
  -- Duas rodadas ao mesmo tempo, não.
  IF NOT pg_try_advisory_xact_lock(hashtext('em_atendimento_processar')) THEN
    RETURN;
  END IF;
  -- Em sombra o cron (de hora em hora) só registra uma vez por dia, e só a
  -- última fotografia fica — o painel lê o "ontem" sem acumular milhares de
  -- linhas por hora.
  IF _m = 'sombra' AND _modo IS NULL THEN
    SELECT max(e.iniciado_em) INTO _ultima FROM public.em_atendimento_execucoes AS e WHERE e.modo = 'sombra';
    IF _ultima IS NOT NULL AND _ultima > now() - interval '20 hours' THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.em_atendimento_execucoes (id, modo, gatilho)
  VALUES (_exec, _m, CASE WHEN _uid IS NULL THEN 'cron' ELSE 'manual' END);

  _corretores := ARRAY(
    SELECT p.id FROM public.profiles AS p
     WHERE p.ativo AND p.status_conta = 'ativa'::public.status_conta
       AND public.has_role(p.id, 'corretor'::public.app_role));

  FOR _r IN
    SELECT c.*
      FROM public._em_atendimento_classificar(_corretores) AS c
     WHERE c.acao IN ('perde_vaga', 'excedente', 'porta_cadencia',
                      'sem_toque', 'retorno_vencido', 'qualificacao_vencida',
                      'retorno_acima_maximo', 'fundo_gestor', 'fundo_desfecho')
     ORDER BY c.corretor_id, c.camada, c.posicao NULLS LAST, c.lead_id
     LIMIT COALESCE(_limite, 2147483647)
  LOOP
    _n_aval := _n_aval + 1;
    _ok := false;
    _erro := NULL;
    IF _m = 'ligado' THEN
      BEGIN
        _ok := public._em_atendimento_aplicar(
          _r.lead_id, _r.corretor_id, _r.acao, _r.destino, _r.motivo, _r.nome, _r.proximo_followup);
      EXCEPTION WHEN OTHERS THEN
        _erro := SQLSTATE || ': ' || SQLERRM;
        _n_err := _n_err + 1;
      END;
    END IF;
    INSERT INTO public.em_atendimento_movimentos
      (execucao_id, lead_id, corretor_id, camada, grupo, acao, destino, motivo, modo,
       aplicado, status_antes, corretor_antes, erro)
    VALUES
      (_exec, _r.lead_id, _r.corretor_id, _r.camada, _r.grupo, _r.acao, _r.destino, _r.motivo, _m,
       _ok, _r.status, _r.corretor_id, _erro);
    IF _ok THEN _n_apl := _n_apl + 1; END IF;
  END LOOP;

  -- Alertas 60/65 ao gestor (§2.5): um por corretor por dia, só com a regra valendo.
  IF _m = 'ligado' THEN
    FOR _p IN
      SELECT p.id, p.nome FROM public.profiles AS p WHERE p.id = ANY(_corretores)
    LOOP
      _ocup := public.em_atendimento_ocupacao(_p.id);
      IF _ocup >= _teto THEN
        _n_alert := _n_alert + public._em_atendimento_alertar_gestores(
          'Regra dos 65: ' || COALESCE(_p.nome, 'corretor') || ' está lotado (' || _ocup || '/' || _teto || ')',
          'Em atendimento no teto: só entra lead novo pela troca "entra um, sai um".',
          _p.id, '/painel-gestor');
      ELSIF _ocup >= _trava THEN
        _n_alert := _n_alert + public._em_atendimento_alertar_gestores(
          'Regra dos 65: ' || COALESCE(_p.nome, 'corretor') || ' chegou a ' || _ocup || '/' || _teto,
          'A roleta parou de entregar lead novo a este corretor (trava em ' || _trava || ').',
          _p.id, '/painel-gestor');
      END IF;
    END LOOP;
  END IF;

  UPDATE public.em_atendimento_execucoes AS e
     SET terminado_em = now(),
         avaliados = _n_aval,
         aplicados = _n_apl,
         alertas = _n_alert,
         erros = _n_err,
         resumo = COALESCE((
           SELECT jsonb_object_agg(x.acao, x.n)
             FROM (SELECT mv.acao, count(*)::int AS n
                     FROM public.em_atendimento_movimentos AS mv
                    WHERE mv.execucao_id = _exec GROUP BY mv.acao) AS x), '{}'::jsonb)
   WHERE e.id = _exec;

  -- Só a última fotografia da sombra fica.
  IF _m = 'sombra' THEN
    DELETE FROM public.em_atendimento_execucoes AS e WHERE e.modo = 'sombra' AND e.id <> _exec;
  END IF;

  RETURN QUERY
  SELECT _exec, _m, mv.acao, mv.destino, count(*)::int, count(*) FILTER (WHERE mv.aplicado)::int
    FROM public.em_atendimento_movimentos AS mv
   WHERE mv.execucao_id = _exec
   GROUP BY mv.acao, mv.destino
   ORDER BY mv.acao, mv.destino;
END;
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_processar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_processar(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Desfazer uma rodada (emergência): devolve dono e status de antes a quem
--    ainda está como a rodada deixou.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_desfazer(_execucao uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r record;
  _n integer := 0;
  _ok boolean;
BEGIN
  IF NOT ((_uid IS NULL AND auth.role() IS NULL)
          OR COALESCE(auth.role() = 'service_role', false)
          OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'apenas admin desfaz uma rodada da regra dos 65' USING ERRCODE = '42501';
  END IF;
  -- [ZONA] devolução ao dono anterior: a guarda de região não se aplica.
  PERFORM set_config('app.zona_override', 'on', true);
  PERFORM set_config('app.transicionar_lead', 'on', true);
  FOR _r IN
    SELECT * FROM public.em_atendimento_movimentos
     WHERE execucao_id = _execucao AND aplicado AND desfeito_em IS NULL
       AND acao IN ('perde_vaga', 'excedente', 'porta_cadencia',
                    'sem_toque', 'retorno_vencido', 'qualificacao_vencida', 'retorno_acima_maximo')
  LOOP
    _ok := false;
    IF _r.acao IN ('perde_vaga', 'excedente', 'porta_cadencia') THEN
      UPDATE public.leads
         SET status = _r.status_antes::public.lead_status
       WHERE id = _r.lead_id AND corretor_id = _r.corretor_antes
         AND status = CASE WHEN _r.acao = 'porta_cadencia'
                           THEN 'aguardando_atendimento'::public.lead_status
                           ELSE 'aguardando_retorno'::public.lead_status END;
      _ok := FOUND;
    ELSIF _r.destino IN ('roleta', 'bolsao') THEN
      UPDATE public.leads
         SET corretor_id = _r.corretor_antes,
             status = _r.status_antes::public.lead_status,
             corretores_que_tentaram = ARRAY[]::uuid[]
       WHERE id = _r.lead_id AND corretor_id IS NULL;
      _ok := FOUND;
    ELSIF _r.acao = 'retorno_acima_maximo' AND _r.destino = 'reativacao' THEN
      UPDATE public.leads
         SET status = _r.status_antes::public.lead_status,
             motivo_perdido = NULL,
             motivo_perda_categoria = NULL
       WHERE id = _r.lead_id AND corretor_id = _r.corretor_antes
         AND status = 'perdido'::public.lead_status AND motivo_perda_categoria = 'retorno_futuro';
      _ok := FOUND;
    END IF;
    IF _ok THEN
      UPDATE public.em_atendimento_movimentos SET desfeito_em = now() WHERE id = _r.id;
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_r.lead_id, 'em_atendimento_regra',
              'Regra dos 65: movimento desfeito pela gestão (rodada ' || _execucao || ').',
              'regra_65', jsonb_build_object('acao', _r.acao, 'desfeito', true, 'execucao', _execucao));
      _n := _n + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.transicionar_lead', 'off', true);
  PERFORM set_config('app.zona_override', 'off', true);
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_desfazer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_desfazer(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) O que o painel lê: as últimas rodadas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.em_atendimento_execucoes_v1(_limite integer DEFAULT 10)
RETURNS TABLE(
  id uuid, modo text, gatilho text, iniciado_em timestamptz, terminado_em timestamptz,
  avaliados integer, aplicados integer, alertas integer, erros integer, resumo jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT e.id, e.modo, e.gatilho, e.iniciado_em, e.terminado_em,
         e.avaliados, e.aplicados, e.alertas, e.erros, e.resumo
    FROM public.em_atendimento_execucoes AS e
   WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
   ORDER BY e.iniciado_em DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limite, 10), 100));
$$;
REVOKE ALL ON FUNCTION public.em_atendimento_execucoes_v1(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.em_atendimento_execucoes_v1(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) A trava da roleta lê "ligada" (modo ligado E virada passada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._em_atendimento_recebe_lead(_corretor uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg jsonb := public.em_atendimento_config();
BEGIN
  -- Fatia 3b: "ligada" = modo ligado E virada já passou (em_atendimento_ligada).
  IF _corretor IS NULL OR NOT public.em_atendimento_ligada() THEN
    RETURN true;
  END IF;
  RETURN public.em_atendimento_ocupacao(_corretor) < (_cfg ->> 'trava_roleta')::int
     AND public.em_atendimento_minha_base(_corretor) < (_cfg ->> 'teto_base')::int;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10) O cron: de hora em hora (sombra registra uma vez por dia; ligado aplica)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'em-atendimento-processar';
    PERFORM cron.schedule('em-atendimento-processar', '41 * * * *',
      $cron$SELECT public.em_atendimento_processar();$cron$);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 11) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (public.em_atendimento_config() ->> 'modo') = 'ligado' AND NOT public.em_atendimento_ligada()
     AND NULLIF(public.em_atendimento_config() ->> 'virada_em', '') IS NULL THEN
    RAISE EXCEPTION 'fatia3b: em_atendimento_ligada inconsistente';
  END IF;
  IF has_function_privilege('anon', 'public.em_atendimento_processar(text, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._em_atendimento_aplicar(uuid, uuid, text, text, text, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._em_atendimento_soltar(uuid, uuid, text, text, text, text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.em_atendimento_movimentos', 'SELECT') THEN
    RAISE EXCEPTION 'fatia3b: EXECUTE/SELECT indevido';
  END IF;
  IF to_regprocedure('public.em_atendimento_ligar(timestamptz)') IS NULL
     OR to_regprocedure('public.em_atendimento_desfazer(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fatia3b: função ausente';
  END IF;
END $$;
