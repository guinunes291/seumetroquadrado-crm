-- SDR (pré-venda) — a entrega pela roleta do SDR (e o WhatsApp "🔥 Lead do SDR
-- para você!") só acontece quando quem MARCA a visita é um SDR.
--
-- Caso real (14/09/2026, relatado pela operação): corretores passaram a
-- receber o WhatsApp de entrega do SDR em TODA visita que eles mesmos
-- marcavam pela ficha do lead ("todo lead que o corretor está agendando está
-- vindo com a mensagem de agendamento de SDR").
--
-- Causa: o trigger `trg_sdr_visita_roleta` (20260904130000/140000), que existe
-- para cobrir a visita marcada fora da RPC `agendar_visita_sdr`, olhava só
-- para o LEAD (`sdr_id IS NOT NULL` e `sdr_entregue_em IS NULL`) e ignorava
-- QUEM estava marcando. Todo lead reaquecido pelo SDR (`sdr_pegar_lead`,
-- `criar_lead_dedup`) e todo lead devolvido para a pré-venda
-- (20260914160000) mantém o `corretor_id` do dono original enquanto espera a
-- entrega. Quando esse dono marcava a visita pelo modal comum:
--   BEFORE INSERT → `_sdr_visita_roleta` → `_distribuir_lead_sdr` → a regra de
--   prioridade do dono original devolvia o lead para ele mesmo → o banco
--   gravava `sdr_entregue_em` → AFTER INSERT → `_sdr_notificar_corretor`,
-- e o corretor recebia o dossiê de entrega ("Lead do SDR para você", com o
-- nome do SDR) de um lead que já era dele e que ele mesmo acabara de agendar.
-- Pior: quando a prioridade era recusada (conflito de agenda, corretor fora da
-- roleta), o lead saía silenciosamente da mão dele para outro corretor.
--
-- O mesmo valia para o bot (edge `sami-agendar-visita`), que insere a visita
-- no nome do corretor do lead, sem `criado_por_id` e sem `auth.uid()`.
--
-- Regra desta migration (pedido da operação: a mensagem sai "apenas quando a
-- criação do agendamento é feita por alguém com cargo SDR e o lead é
-- transferido na roleta do SDR"):
--
--  1) `trg_sdr_visita_roleta` só roda a roleta quando o ATOR do agendamento
--     (criado_por_id, senão auth.uid()) tem o papel `sdr` — ou quando a visita
--     nasce no nome de um SDR puro (carteira antiga: o admin pode estar
--     agendando no lugar do SDR). Sem roleta não há entrega e, portanto, não
--     há WhatsApp: a visita do corretor fica com ele, como ele marcou.
--     Quando o lead está na base do SDR e a visita não passa pela roleta, fica
--     o evento `sdr_visita_sem_roleta` na timeline — a gestão enxerga que o
--     lead segue em pré-venda sem ter sido entregue.
--  2) `_sdr_notificar_corretor` (choke point único do WhatsApp) só dispara se
--     a entrega do SDR estiver REGISTRADA no lead: `sdr_id` preenchido,
--     `sdr_entregue_em` preenchido e `corretor_id` = destinatário. É a
--     tradução literal de "o lead foi transferido na roleta do SDR".
--  3) `sdr_reentregar_visitas_pendentes()` (reparo) passa a considerar só
--     visitas marcadas por SDR (ou no nome de um SDR puro) — antes ele varria
--     qualquer visita futura de lead com `sdr_id`, inclusive as do corretor.
--
-- Não muda nada dos caminhos oficiais do SDR (`agendar_visita_sdr`,
-- `entregar_lead_sdr`): os dois já passam por `_sdr_gate_lead`, que exige o
-- SDR dono (ou admin).

-- ---------------------------------------------------------------------------
-- 1) Quem pode acionar a entrega do SDR ao marcar uma visita
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sdr_visita_marcada_por_sdr(_ator uuid, _corretor_agenda uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    -- Quem marcou tem cargo de SDR (o caso normal: SDR usando o modal comum).
    (_ator IS NOT NULL AND public.has_role(_ator, 'sdr'::public.app_role))
    -- …ou a visita nasce no nome de um SDR puro (carteira antiga do SDR;
    -- cobre o admin agendando no lugar dele). SDR que também é corretor
    -- atende como corretor, então não conta.
    OR (_corretor_agenda IS NOT NULL
        AND public.has_role(_corretor_agenda, 'sdr'::public.app_role)
        AND NOT public.has_role(_corretor_agenda, 'corretor'::public.app_role));
$$;

COMMENT ON FUNCTION public._sdr_visita_marcada_por_sdr(uuid, uuid) IS
  'true quando a visita está sendo marcada por um SDR (ator com papel sdr) ou no nome de um SDR puro. Só nesse caso a visita aciona a roleta de entrega do SDR e o WhatsApp ao corretor.';

REVOKE ALL ON FUNCTION public._sdr_visita_marcada_por_sdr(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sdr_visita_marcada_por_sdr(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Trigger do modal comum: roleta só para visita marcada por SDR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sdr_visita_roleta_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _v uuid;
  _ator uuid := COALESCE(NEW.criado_por_id, auth.uid());
  _prev text := COALESCE(current_setting('app.sdr_motor', true), '');
BEGIN
  IF NEW.tipo = 'visita'::public.agendamento_tipo
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                        'remarcado'::public.agendamento_status)
     AND NEW.data_inicio > now() THEN
    IF public._sdr_visita_marcada_por_sdr(_ator, NEW.corretor_id) THEN
      _v := public._sdr_visita_roleta(NEW.lead_id, NEW.corretor_id, NEW.data_inicio, NEW.data_fim, 'agendamento_visita');
      PERFORM set_config('app.sdr_motor', _prev, true);
      IF _v IS NOT NULL THEN
        IF NULLIF(btrim(NEW.local), '') IS NULL THEN
          RAISE EXCEPTION 'informe o endereço da visita (campo Local): o corretor recebe a mensagem com endereço e horário'
            USING ERRCODE = '22023';
        END IF;
        NEW.corretor_id := _v;
        NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
        -- O aviso sai no AFTER INSERT, quando a visita já existe para a mensagem.
        PERFORM set_config('app.sdr_visita_lead', NEW.lead_id::text, true);
      END IF;
    ELSIF public._sdr_ativo()
          AND EXISTS (SELECT 1 FROM public.leads l
                       WHERE l.id = NEW.lead_id
                         AND l.sdr_id IS NOT NULL
                         AND l.sdr_entregue_em IS NULL
                         AND l.deleted_at IS NULL) THEN
      -- Lead ainda em pré-venda, mas quem marcou não é SDR: a visita fica com
      -- quem marcou, sem roleta e sem WhatsApp de entrega. Registrado para a
      -- gestão enxergar o lead que segue na base do SDR.
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (
        NEW.lead_id, 'sdr_visita_sem_roleta',
        'Visita marcada por quem não é SDR: sem roleta e sem WhatsApp de entrega. O lead segue na base do SDR.',
        'sdr_motor',
        jsonb_strip_nulls(jsonb_build_object(
          'ator', _ator, 'corretor_id', NEW.corretor_id, 'gatilho', 'agendamento_visita',
          'data_inicio', NEW.data_inicio)));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- ---------------------------------------------------------------------------
-- 3) WhatsApp só com a entrega do SDR registrada no lead
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sdr_notificar_corretor(_lead_id uuid, _corretor_id uuid, _gatilho text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _url text;
  _token uuid;
  _req bigint;
  _motivo text;
BEGIN
  -- Guarda de último nível: a mensagem de entrega só existe se a entrega do
  -- SDR está gravada no lead e o destinatário é o dono atual. Qualquer caminho
  -- que chame isto sem entrega (visita do corretor, chamada solta) não manda
  -- WhatsApp nenhum.
  IF NOT EXISTS (
    SELECT 1 FROM public.leads l
     WHERE l.id = _lead_id
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NOT NULL
       AND l.corretor_id = _corretor_id
  ) THEN
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (
      _lead_id, 'sdr_aviso_corretor',
      'WhatsApp de entrega NÃO enviado (entrega_sdr_nao_registrada)',
      'sdr_motor',
      jsonb_strip_nulls(jsonb_build_object('corretor_id', _corretor_id, 'gatilho', _gatilho,
                                           'enviado', false, 'motivo', 'entrega_sdr_nao_registrada')));
    RAISE WARNING 'sdr_notificar_corretor lead=% corretor=%: entrega_sdr_nao_registrada', _lead_id, _corretor_id;
    RETURN false;
  END IF;

  _url := NULLIF(btrim(COALESCE(public.get_dist_setting('sdr_aviso_corretor_url') #>> '{}', '')), '');

  IF _url IS NULL THEN
    _motivo := 'sem_url';
  ELSE
    INSERT INTO public.sdr_avisos_corretor (lead_id, corretor_id, gatilho)
    VALUES (_lead_id, _corretor_id, _gatilho)
    RETURNING token INTO _token;
    BEGIN
      SELECT net.http_post(
        url := _url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('token', _token)
      ) INTO _req;
      UPDATE public.sdr_avisos_corretor SET request_id = _req WHERE token = _token;
    EXCEPTION WHEN OTHERS THEN
      _motivo := 'http_post_falhou: ' || SQLERRM;
    END;
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_aviso_corretor',
    CASE WHEN _motivo IS NULL THEN 'WhatsApp de entrega enfileirado para o corretor'
         ELSE 'WhatsApp de entrega NÃO enviado (' || _motivo || ')' END,
    'sdr_motor',
    jsonb_strip_nulls(jsonb_build_object('corretor_id', _corretor_id, 'gatilho', _gatilho,
                                         'enviado', _motivo IS NULL, 'motivo', _motivo,
                                         'token', _token, 'request_id', _req))
  );
  IF _motivo IS NOT NULL THEN
    RAISE WARNING 'sdr_notificar_corretor lead=% corretor=%: %', _lead_id, _corretor_id, _motivo;
  END IF;
  RETURN _motivo IS NULL;
END; $$;

REVOKE ALL ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Reparo: só visita marcada por SDR (ou no nome de um SDR puro)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdr_reentregar_visitas_pendentes()
RETURNS TABLE (
  agendamento_id uuid, lead_id uuid, lead_nome text, data_inicio timestamptz,
  corretor_id uuid, corretor_nome text, regra text, erro text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _v uuid;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'sdr'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _a IN
    SELECT a.id, a.lead_id, l.nome, a.corretor_id, a.data_inicio, a.data_fim
    FROM public.agendamentos a
    JOIN public.leads l ON l.id = a.lead_id
    WHERE a.tipo = 'visita'::public.agendamento_tipo
      AND a.deleted_at IS NULL
      AND a.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                       'remarcado'::public.agendamento_status)
      AND a.data_inicio > now()
      AND l.deleted_at IS NULL AND NOT l.na_lixeira
      AND l.sdr_entregue_em IS NULL
      AND (l.sdr_id IS NOT NULL
           OR (a.corretor_id IS NOT NULL
               AND public.has_role(a.corretor_id, 'sdr'::public.app_role)
               AND NOT public.has_role(a.corretor_id, 'corretor'::public.app_role)))
      -- Só visita que o SDR marcou: a que o corretor marcou no lead dele
      -- continua com ele (regra de 15/09/2026).
      AND public._sdr_visita_marcada_por_sdr(a.criado_por_id, a.corretor_id)
    ORDER BY a.data_inicio
  LOOP
    BEGIN
      PERFORM set_config('app.sdr_motor', '', true);
      _v := public._sdr_visita_roleta(_a.lead_id, _a.corretor_id, _a.data_inicio, _a.data_fim, 'reparo_visita_sdr');
      IF _v IS NULL THEN CONTINUE; END IF;
      UPDATE public.agendamentos SET corretor_id = _v WHERE id = _a.id;
      PERFORM public._sdr_notificar_corretor(_a.lead_id, _v, 'reparo_visita_sdr');
      agendamento_id := _a.id; lead_id := _a.lead_id; lead_nome := _a.nome; data_inicio := _a.data_inicio;
      corretor_id := _v; erro := NULL;
      SELECT p.nome INTO corretor_nome FROM public.profiles p WHERE p.id = _v;
      SELECT dl.regra_aplicada INTO regra FROM public.distribution_log dl
       WHERE dl.lead_id = _a.lead_id AND dl.resultado = 'sucesso' ORDER BY dl.created_at DESC LIMIT 1;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      agendamento_id := _a.id; lead_id := _a.lead_id; lead_nome := _a.nome; data_inicio := _a.data_inicio;
      corretor_id := NULL; corretor_nome := NULL; regra := NULL; erro := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  PERFORM set_config('app.sdr_motor', '', true);
END; $$;

-- ---------------------------------------------------------------------------
-- 5) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sdr_visita_roleta') THEN
    RAISE EXCEPTION 'sdr_entrega_so_quando_sdr_agenda: trigger trg_sdr_visita_roleta ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sdr_visita_aviso') THEN
    RAISE EXCEPTION 'sdr_entrega_so_quando_sdr_agenda: trigger trg_sdr_visita_aviso ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_sdr_visita_roleta_fn'
      AND p.prosrc LIKE '%_sdr_visita_marcada_por_sdr%'
  ) THEN
    RAISE EXCEPTION 'sdr_entrega_so_quando_sdr_agenda: trigger da visita ainda roda a roleta para qualquer ator';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_sdr_notificar_corretor'
      AND p.prosrc LIKE '%entrega_sdr_nao_registrada%'
  ) THEN
    RAISE EXCEPTION 'sdr_entrega_so_quando_sdr_agenda: _sdr_notificar_corretor sem a guarda de entrega';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sdr_reentregar_visitas_pendentes'
      AND p.prosrc LIKE '%_sdr_visita_marcada_por_sdr%'
  ) THEN
    RAISE EXCEPTION 'sdr_entrega_so_quando_sdr_agenda: reparo ainda varre visita de corretor';
  END IF;
END $$;
