-- Devolver ao Marquinhos (06/11/2026, decisão do Guilherme).
--
-- Princípio "um número, uma voz": o 4099 é sempre o Marquinhos; o corretor
-- fala sempre do próprio WhatsApp. Depois do handoff o robô fica pausado e o
-- corretor pode DEVOLVER o cliente ao Marquinhos com um objetivo fechado:
--   * remarcar_visita      — o cliente pediu para remarcar;
--   * recolher_documentos  — tentar recolher a documentação;
--   * tirar_duvidas        — tirar dúvidas do cliente.
-- O Marquinhos cumpre o objetivo no 4099 e devolve o cliente com um resumo.
--
-- Fluxo (mesmo desenho da fila de avisos do Link de Proposta):
--   1. corretor chama marquinhos_devolver → linha 'pendente' com
--      envio_pendente='devolver';
--   2. o servidor do CRM reivindica (marquinhos_devolucoes_reivindicar_envio)
--      e chama o webhook do n8n; registra o resultado
--      (marquinhos_devolucao_registrar_envio). Falha tenta de novo a cada 5 min
--      até 3 vezes; depois o corretor recebe push — nada some em silêncio;
--   3. ok → 'com_marquinhos' (o robô foi despausado e falou com o cliente);
--   4. o n8n encerra pelo /api/sami/devolucao → 'concluida' + nota na timeline
--      + push ao dono do lead;
--   5. o corretor pode retomar antes (marquinhos_retomar): se o n8n ainda não
--      recebeu nada, cancela na hora; senão enfileira 'retomar' (pausar o robô).
--
-- Mensagens do robô: o n8n passa a espelhar no CRM o que o Marquinhos manda no
-- 4099 (mensagens.agente). Elas NÃO contam como resposta do corretor na fila
-- Responder — exceto as enviadas durante uma devolução, quando o robô atende a
-- pedido do próprio corretor. Entradas do cliente durante uma devolução ativa
-- também não cobram o corretor.

-- ---------------------------------------------------------------------------
-- 1) Tabela das devoluções
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marquinhos_devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- quem pediu (corretor dono ou gestão) e o dono do lead no momento do pedido
  solicitante_id uuid NOT NULL REFERENCES public.profiles(id),
  corretor_id uuid REFERENCES public.profiles(id),
  objetivo text NOT NULL
    CHECK (objetivo IN ('remarcar_visita', 'recolher_documentos', 'tirar_duvidas')),
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  -- telefone do cliente em dígitos com DDI (o n8n identifica a conversa por ele)
  telefone text NOT NULL CHECK (telefone ~ '^55[0-9]{10,11}$'),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'com_marquinhos', 'concluida', 'cancelada', 'falhou')),
  -- o que falta o n8n saber: 'devolver' (despausar e cumprir o objetivo) ou
  -- 'retomar' (pausar de novo: o corretor reassumiu)
  envio_pendente text CHECK (envio_pendente IN ('devolver', 'retomar')),
  tentativas integer NOT NULL DEFAULT 0,
  reivindicado_em timestamptz,
  ultima_tentativa_em timestamptz,
  ultimo_erro text,
  enviado_em timestamptz,
  encerrado_em timestamptz,
  -- desfecho e resumo informados pelo Marquinhos ao encerrar
  desfecho text CHECK (desfecho IN ('objetivo_cumprido', 'sem_resposta', 'precisa_corretor')),
  resultado text CHECK (resultado IS NULL OR char_length(resultado) <= 1000),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Uma devolução ativa por lead: dois pedidos simultâneos nunca colocam o
-- robô com duas missões no mesmo cliente (o índice é a autoridade).
CREATE UNIQUE INDEX IF NOT EXISTS marquinhos_devolucoes_ativa_uq
  ON public.marquinhos_devolucoes (lead_id)
  WHERE status IN ('pendente', 'com_marquinhos');
CREATE INDEX IF NOT EXISTS marquinhos_devolucoes_lead_idx
  ON public.marquinhos_devolucoes (lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS marquinhos_devolucoes_fila_idx
  ON public.marquinhos_devolucoes (criado_em)
  WHERE envio_pendente IS NOT NULL;

DROP TRIGGER IF EXISTS marquinhos_devolucoes_set_updated_at ON public.marquinhos_devolucoes;
CREATE TRIGGER marquinhos_devolucoes_set_updated_at
  BEFORE UPDATE ON public.marquinhos_devolucoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

ALTER TABLE public.marquinhos_devolucoes ENABLE ROW LEVEL SECURITY;

-- Leitura espelha o acesso ao lead (corretor: os seus; gestor: a equipe).
DROP POLICY IF EXISTS marquinhos_devolucoes_select ON public.marquinhos_devolucoes;
CREATE POLICY marquinhos_devolucoes_select ON public.marquinhos_devolucoes
  FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Escrita só pelas RPCs abaixo (SECURITY DEFINER).
REVOKE ALL ON TABLE public.marquinhos_devolucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marquinhos_devolucoes TO authenticated;
GRANT ALL ON TABLE public.marquinhos_devolucoes TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.marquinhos_devolucoes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.marquinhos_devolucoes IS
  'Devolver ao Marquinhos: o corretor devolve o cliente ao robo do 4099 com um objetivo (remarcar_visita, recolher_documentos, tirar_duvidas). Fila de envio ao n8n (envio_pendente) com 3 tentativas e push no fim; uma ativa por lead.';

-- ---------------------------------------------------------------------------
-- 2) Mensagens do robô na conversa
-- ---------------------------------------------------------------------------
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS agente text;
ALTER TABLE public.mensagens DROP CONSTRAINT IF EXISTS mensagens_agente_check;
ALTER TABLE public.mensagens ADD CONSTRAINT mensagens_agente_check
  CHECK (agente IS NULL OR agente ~ '^[a-z][a-z_]{1,29}$');
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS devolucao_id uuid
  REFERENCES public.marquinhos_devolucoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.mensagens.agente IS
  'Robo que escreveu a mensagem de saida no 4099 (ex.: marquinhos, vitor). NULL = corretor (saida) ou cliente (entrada).';
COMMENT ON COLUMN public.mensagens.devolucao_id IS
  'Devolucao ao Marquinhos ativa quando a mensagem passou: saida do robo nela conta como resposta na fila Responder; entrada nela nao cobra o corretor.';

-- ---------------------------------------------------------------------------
-- 3) Fila Responder: a regra única ganha as mensagens do robô
--    (redefinição completa de 20260830150000; o resto da regra é o mesmo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversas_aguardando_resposta(_lead_ids uuid[])
RETURNS TABLE (lead_id uuid, aguardando boolean, ultima_entrada timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH alvo AS (
    SELECT DISTINCT a.id FROM unnest(_lead_ids) AS a(id) WHERE a.id IS NOT NULL
  ),
  eventos AS (
    SELECT i.lead_id, i.direcao::text AS dir, i.ocorreu_em AS em
    FROM public.interacoes i
    JOIN alvo ON alvo.id = i.lead_id
    WHERE i.deleted_at IS NULL
      AND i.tipo NOT IN ('nota','mudanca_status')
      AND ((i.direcao = 'entrada' AND i.autor_id IS NULL)
        OR (i.direcao = 'saida' AND i.autor_id IS NOT NULL))
    UNION ALL
    SELECT m.lead_id, m.direcao, m.recebida_em
    FROM public.mensagens m
    JOIN alvo ON alvo.id = m.lead_id
    LEFT JOIN public.marquinhos_devolucoes d ON d.id = m.devolucao_id
    WHERE (m.direcao = 'entrada'
           -- o cliente falando com o Marquinhos a pedido do corretor não
           -- cobra o corretor enquanto a devolução está ativa
           AND NOT (d.id IS NOT NULL AND d.status IN ('pendente', 'com_marquinhos')))
       OR (m.direcao = 'saida' AND m.corretor_id IS NOT NULL AND m.status <> 'falha')
       -- resposta do robô durante uma devolução = resposta dada
       OR (m.direcao = 'saida' AND m.devolucao_id IS NOT NULL AND m.status <> 'falha')
    UNION ALL
    SELECT c.lead_id, 'saida', c.criado_em
    FROM public.chamadas c
    JOIN alvo ON alvo.id = c.lead_id
    WHERE c.direcao = 'saida' AND c.status <> 'falha'
  ),
  marcos AS (
    SELECT e.lead_id,
           max(e.em) FILTER (WHERE e.dir = 'entrada') AS ult_entrada,
           max(e.em) FILTER (WHERE e.dir = 'saida') AS ult_saida
    FROM eventos e
    GROUP BY e.lead_id
  )
  SELECT
    m.lead_id,
    (m.ult_entrada IS NOT NULL
       AND m.ult_entrada > COALESCE(m.ult_saida, '-infinity'::timestamptz)
       AND m.ult_entrada > COALESCE(ct.tratada_em, '-infinity'::timestamptz)),
    m.ult_entrada
  FROM marcos m
  LEFT JOIN public.conversas_tratadas ct ON ct.lead_id = m.lead_id
$$;
REVOKE ALL ON FUNCTION public.conversas_aguardando_resposta(uuid[])
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC do corretor: devolver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marquinhos_devolver(
  _lead_id uuid,
  _objetivo text,
  _observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _l record;
  _tel text;
  _obs text := nullif(btrim(coalesce(_observacao, '')), '');
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Entre no CRM para devolver o cliente ao Marquinhos.' USING ERRCODE = '42501';
  END IF;
  IF _objetivo IS NULL OR _objetivo NOT IN ('remarcar_visita', 'recolher_documentos', 'tirar_duvidas') THEN
    RAISE EXCEPTION 'Escolha o objetivo da devolução.' USING ERRCODE = '22023';
  END IF;
  IF _obs IS NOT NULL AND char_length(_obs) > 500 THEN
    RAISE EXCEPTION 'O recado para o Marquinhos passa de 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.opt_out, l.deleted_at, l.telefone, l.telefone_e164
    INTO _l
    FROM public.leads l
   WHERE l.id = _lead_id
   FOR UPDATE;
  IF NOT FOUND OR _l.deleted_at IS NOT NULL OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = '22023';
  END IF;
  -- Só quem responde pelo cliente devolve: o corretor dono ou a gestão
  -- (gestor já vem recortado pela equipe em pode_acessar_lead). SDR e
  -- acessos compartilhados leem, mas não mandam o robô falar.
  IF NOT (_l.corretor_id = _uid
          OR public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'superintendente'::public.app_role)
          OR public.has_role(_uid, 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'Só o corretor responsável pelo cliente pode devolvê-lo ao Marquinhos.' USING ERRCODE = '42501';
  END IF;
  IF _l.corretor_id IS NULL THEN
    RAISE EXCEPTION 'Este cliente ainda não tem corretor: ele já está com a distribuição.' USING ERRCODE = '22023';
  END IF;
  IF _l.opt_out THEN
    RAISE EXCEPTION 'O cliente pediu para não receber mensagens (opt-out).' USING ERRCODE = '22023';
  END IF;
  IF _l.status = 'perdido'::public.lead_status THEN
    RAISE EXCEPTION 'Cliente perdido: reative antes de devolver ao Marquinhos.' USING ERRCODE = '22023';
  END IF;

  _tel := regexp_replace(coalesce(nullif(_l.telefone_e164, ''), _l.telefone, ''), '\D', '', 'g');
  IF length(_tel) IN (10, 11) THEN
    _tel := '55' || _tel;
  END IF;
  IF _tel !~ '^55[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'O telefone do cliente não é um WhatsApp válido do Brasil.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.marquinhos_devolucoes
      (lead_id, solicitante_id, corretor_id, objetivo, observacao, telefone, envio_pendente)
    VALUES
      (_lead_id, _uid, _l.corretor_id, _objetivo, _obs, _tel, 'devolver')
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este cliente já está com o Marquinhos. Retome o atendimento antes de pedir outro objetivo.'
      USING ERRCODE = '23505';
  END;
  RETURN _id;
END $function$;

REVOKE ALL ON FUNCTION public.marquinhos_devolver(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marquinhos_devolver(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPC do corretor: retomar o atendimento (parar o robô)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marquinhos_retomar(_devolucao_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _d public.marquinhos_devolucoes%ROWTYPE;
  _dono uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Entre no CRM para retomar o atendimento.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _d FROM public.marquinhos_devolucoes WHERE id = _devolucao_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_acessar_lead(_uid, _d.lead_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada.' USING ERRCODE = '22023';
  END IF;
  SELECT corretor_id INTO _dono FROM public.leads WHERE id = _d.lead_id;
  IF NOT (_dono = _uid OR _d.solicitante_id = _uid
          OR public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'superintendente'::public.app_role)
          OR public.has_role(_uid, 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'Só o corretor responsável pelo cliente pode retomar o atendimento.' USING ERRCODE = '42501';
  END IF;
  IF _d.status NOT IN ('pendente', 'com_marquinhos') THEN
    RETURN _d.status;  -- já encerrada: nada a fazer (idempotente)
  END IF;

  -- O n8n nunca recebeu o pedido (nem está recebendo agora): cancela na hora.
  IF _d.status = 'pendente' AND _d.tentativas = 0 AND _d.reivindicado_em IS NULL THEN
    UPDATE public.marquinhos_devolucoes
       SET status = 'cancelada', envio_pendente = NULL, encerrado_em = now()
     WHERE id = _d.id;
    RETURN 'cancelada';
  END IF;

  -- Já chegou (ou está chegando) ao n8n: precisa pausar o robô de novo. A
  -- devolução continua ativa até o n8n confirmar a pausa.
  UPDATE public.marquinhos_devolucoes
     SET envio_pendente = 'retomar', tentativas = 0, ultima_tentativa_em = NULL, ultimo_erro = NULL
   WHERE id = _d.id;
  RETURN 'retomando';
END $function$;

REVOKE ALL ON FUNCTION public.marquinhos_retomar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marquinhos_retomar(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Fila de envio ao n8n (service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marquinhos_devolucoes_reivindicar_envio(_limite integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  acao text,
  lead_id uuid,
  telefone text,
  objetivo text,
  observacao text,
  cliente_nome text,
  corretor_nome text,
  tentativa integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT d.id
      FROM public.marquinhos_devolucoes d
     WHERE d.envio_pendente IS NOT NULL
       AND d.tentativas < 3
       -- reivindicada por um despacho que caiu: libera em 2 min
       AND (d.reivindicado_em IS NULL OR d.reivindicado_em < now() - interval '2 minutes')
       -- falhou: espera 5 min (a próxima varredura do cron)
       AND (d.ultima_tentativa_em IS NULL OR d.ultima_tentativa_em < now() - interval '5 minutes')
     ORDER BY d.criado_em
     LIMIT least(greatest(_limite, 1), 50)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.marquinhos_devolucoes d
     SET reivindicado_em = now(), ultima_tentativa_em = now(), tentativas = d.tentativas + 1
    FROM alvo
   WHERE d.id = alvo.id
  RETURNING d.id, d.envio_pendente, d.lead_id, d.telefone, d.objetivo, d.observacao,
            (SELECT l.nome FROM public.leads l WHERE l.id = d.lead_id),
            (SELECT p.nome FROM public.profiles p WHERE p.id = coalesce(d.corretor_id, d.solicitante_id)),
            d.tentativas;
END $function$;

CREATE OR REPLACE FUNCTION public.marquinhos_devolucao_registrar_envio(
  _id uuid,
  _acao text,
  _ok boolean,
  _erro text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _d public.marquinhos_devolucoes%ROWTYPE;
  _cliente text;
  _msg text;
  _erro_txt text := left(coalesce(nullif(btrim(coalesce(_erro, '')), ''), 'sem detalhe'), 400);
BEGIN
  SELECT * INTO _d FROM public.marquinhos_devolucoes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'ignorado'; END IF;
  SELECT coalesce(nullif(split_part(btrim(nome), ' ', 1), ''), 'cliente') INTO _cliente
    FROM public.leads WHERE id = _d.lead_id;

  IF _acao = 'devolver' THEN
    IF _d.status <> 'pendente' THEN
      UPDATE public.marquinhos_devolucoes SET reivindicado_em = NULL WHERE id = _id;
      RETURN 'ignorado';
    END IF;
    IF _ok THEN
      -- Se o corretor pediu para retomar enquanto o envio estava no ar, a
      -- pausa continua na fila: o robô foi despausado e precisa parar.
      UPDATE public.marquinhos_devolucoes
         SET status = 'com_marquinhos', enviado_em = now(), reivindicado_em = NULL, ultimo_erro = NULL,
             envio_pendente = CASE WHEN envio_pendente = 'retomar' THEN 'retomar' END,
             tentativas = CASE WHEN envio_pendente = 'retomar' THEN 0 ELSE tentativas END,
             ultima_tentativa_em = CASE WHEN envio_pendente = 'retomar' THEN NULL ELSE ultima_tentativa_em END
       WHERE id = _id;
      RETURN 'com_marquinhos';
    END IF;
    IF _d.envio_pendente = 'devolver' AND _d.tentativas < 3 THEN
      UPDATE public.marquinhos_devolucoes
         SET reivindicado_em = NULL, ultimo_erro = left('tentativa ' || _d.tentativas || ': ' || _erro_txt, 500)
       WHERE id = _id;
      RETURN 'nova_tentativa';
    END IF;
    -- Esgotou (ou o corretor desistiu no meio): o cliente continua com o corretor.
    UPDATE public.marquinhos_devolucoes
       SET status = CASE WHEN _d.envio_pendente = 'retomar' THEN 'cancelada' ELSE 'falhou' END,
           envio_pendente = NULL, reivindicado_em = NULL, encerrado_em = now(),
           ultimo_erro = left('não chegou ao Marquinhos: ' || _erro_txt, 500)
     WHERE id = _id;
    IF _d.envio_pendente = 'devolver' THEN
      INSERT INTO public.push_outbox (user_id, title, body, url, tag)
      VALUES (_d.solicitante_id, 'Marquinhos não assumiu',
              'Não consegui devolver ' || _cliente || ' ao Marquinhos. O atendimento continua com você.',
              '/leads/' || _d.lead_id, 'devolucao-' || _d.id);
    END IF;
    RETURN 'falhou';
  END IF;

  IF _acao = 'retomar' THEN
    IF _d.status NOT IN ('pendente', 'com_marquinhos') OR _d.envio_pendente IS DISTINCT FROM 'retomar' THEN
      UPDATE public.marquinhos_devolucoes SET reivindicado_em = NULL WHERE id = _id;
      RETURN 'ignorado';
    END IF;
    IF _ok THEN
      UPDATE public.marquinhos_devolucoes
         SET status = 'cancelada', envio_pendente = NULL, reivindicado_em = NULL,
             encerrado_em = now(), ultimo_erro = NULL
       WHERE id = _id;
      RETURN 'cancelada';
    END IF;
    IF _d.tentativas < 3 THEN
      UPDATE public.marquinhos_devolucoes
         SET reivindicado_em = NULL, ultimo_erro = left('pausa, tentativa ' || _d.tentativas || ': ' || _erro_txt, 500)
       WHERE id = _id;
      RETURN 'nova_tentativa';
    END IF;
    -- Não conseguiu pausar: a verdade é que o robô continua atendendo. O
    -- status não mente e o corretor é avisado para pedir ajuda.
    UPDATE public.marquinhos_devolucoes
       SET envio_pendente = NULL, reivindicado_em = NULL,
           ultimo_erro = left('não consegui pausar o Marquinhos: ' || _erro_txt, 500)
     WHERE id = _id;
    _msg := 'Não consegui parar o Marquinhos com ' || _cliente || '. Ele continua atendendo: avise o gestor.';
    INSERT INTO public.push_outbox (user_id, title, body, url, tag)
    VALUES (_d.solicitante_id, 'Marquinhos continua atendendo', _msg,
            '/leads/' || _d.lead_id, 'devolucao-' || _d.id);
    RETURN 'falhou_pausa';
  END IF;

  RAISE EXCEPTION 'Ação inválida: %', _acao USING ERRCODE = '22023';
END $function$;

-- ---------------------------------------------------------------------------
-- 7) Encerramento pelo Marquinhos (n8n → /api/sami/devolucao, service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marquinhos_devolucao_encerrar(
  _id uuid,
  _desfecho text,
  _resultado text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _d public.marquinhos_devolucoes%ROWTYPE;
  _dono uuid;
  _cliente text;
  _res text := left(nullif(btrim(coalesce(_resultado, '')), ''), 1000);
  _rotulo text;
  _titulo text;
BEGIN
  IF _desfecho IS NULL OR _desfecho NOT IN ('objetivo_cumprido', 'sem_resposta', 'precisa_corretor') THEN
    RAISE EXCEPTION 'Desfecho inválido.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _d FROM public.marquinhos_devolucoes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolução não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF _d.status NOT IN ('pendente', 'com_marquinhos') THEN
    RETURN 'ignorado';  -- replay do n8n ou corretor já retomou
  END IF;

  UPDATE public.marquinhos_devolucoes
     SET status = 'concluida', desfecho = _desfecho, resultado = _res,
         envio_pendente = NULL, reivindicado_em = NULL, encerrado_em = now(),
         enviado_em = coalesce(enviado_em, now())
   WHERE id = _id;

  _rotulo := CASE _d.objetivo
    WHEN 'remarcar_visita' THEN 'remarcar a visita'
    WHEN 'recolher_documentos' THEN 'recolher a documentação'
    ELSE 'tirar dúvidas' END;
  _titulo := CASE _desfecho
    WHEN 'objetivo_cumprido' THEN 'Marquinhos concluiu: ' || _rotulo
    WHEN 'sem_resposta' THEN 'Marquinhos sem resposta do cliente: ' || _rotulo
    ELSE 'Marquinhos devolveu: precisa de você' END;

  -- Timeline: nota sem autor (é o robô), fora da fila Responder e da pontuação.
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_d.lead_id, NULL, 'nota', 'interna', _titulo,
          coalesce(_res, 'Sem resumo.'),
          jsonb_build_object('fonte', 'marquinhos_devolucao', 'devolucao_id', _d.id,
                             'objetivo', _d.objetivo, 'desfecho', _desfecho));

  SELECT corretor_id, coalesce(nullif(split_part(btrim(nome), ' ', 1), ''), 'cliente')
    INTO _dono, _cliente
    FROM public.leads WHERE id = _d.lead_id;
  INSERT INTO public.push_outbox (user_id, title, body, url, tag)
  VALUES (coalesce(_dono, _d.solicitante_id), _titulo || ' (' || _cliente || ')',
          coalesce(left(_res, 300), 'Abra o cliente para ver a conversa.'),
          '/leads/' || _d.lead_id, 'devolucao-' || _d.id);
  RETURN 'concluida';
END $function$;

-- Devolução ativa do lead para o n8n carimbar as mensagens do robô.
CREATE OR REPLACE FUNCTION public.marquinhos_devolucao_ativa(_lead_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT d.id FROM public.marquinhos_devolucoes d
   WHERE d.lead_id = _lead_id AND d.status IN ('pendente', 'com_marquinhos')
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.marquinhos_devolucoes_reivindicar_envio(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marquinhos_devolucao_registrar_envio(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marquinhos_devolucao_encerrar(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marquinhos_devolucao_ativa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marquinhos_devolucoes_reivindicar_envio(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.marquinhos_devolucao_registrar_envio(uuid, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marquinhos_devolucao_encerrar(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marquinhos_devolucao_ativa(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
