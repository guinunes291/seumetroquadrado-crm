-- ============================================================================
-- Link de agendamento do corretor (estilo "Calendly")
-- ============================================================================
-- O QUE É. Cada corretor tem UM link fixo (/agendar/<slug>) para mandar no
-- WhatsApp ou pôr na bio. O cliente escolhe um dia e horário livres da agenda
-- do corretor, informa nome, telefone, e-mail e CPF, e o sistema cria — numa
-- transação só — o lead na carteira do corretor em Agendado e a visita na
-- agenda dele. O cliente sai com o evento para o calendário (lembretes 1 dia
-- e 5 horas antes, montados na aplicação).
--
-- QUEM CHAMA O QUÊ.
--   * Corretor (authenticated): meu_agendamento_link, salvar_meu_agendamento_link,
--     gerar_novo_agendamento_link e desativar_meu_agendamento_link.
--   * Página pública (service_role, via /api/public/agendamento): as tabelas são
--     fechadas para anon/authenticated e o servidor chama só as funções
--     estreitas consumir_agendamento_link_requisicao,
--     obter_agendamento_link_publico, agendar_pelo_link e
--     obter_agendamento_comprovante.
--
-- O SLUG É PÚBLICO DE PROPÓSITO. Diferente da vitrine (token por lead, só o
-- hash no banco), este link é feito para circular (bio, status). Fica em claro
-- para o corretor copiar a qualquer hora; 96 bits aleatórios impedem enumerar
-- os links dos outros corretores. Se cair em spam, "Gerar novo link" revoga o
-- antigo na hora. O comprovante do cliente (baixar o .ics de novo) é outro
-- segredo, guardado só como SHA-256.
--
-- O LEAD. Segue as portas do registro mãe (docs/ops/registro-mae.md):
--   * pessoa nova (telefone sem mãe) → lead novo do corretor, origem
--     agendamento_self_service; o gatilho de sempre cria a mãe;
--   * o corretor já tem registro vivo da pessoa → reaproveita. O formulário só
--     PREENCHE campos vazios: nada que vem de uma página pública sobrescreve a
--     ficha. O que diverge vai na descrição da visita, para o corretor conferir;
--   * a pessoa existe com outro corretor → registro filho deste corretor, com
--     a mesma regra de criar_registro_filho (herda os dados da mãe). Se o
--     outro já está em Visita realizada ou além, recusa (decisão #2 do dono) —
--     com mensagem genérica, para a página não virar oráculo de "quem é cliente".
--
-- A ETAPA. A matriz de transicionar_lead não leva Aguardando atendimento a
-- Agendado nem para a gestão: o caminho da visita marcada por terceiros é o do
-- SDR (_sdr_visita_roleta) — atualização sob app.transicionar_lead, que o
-- gatilho grava em lead_status_transitions, evento transicao_lead e as tarefas
-- de confirmação D-1 e D-0, aqui para o próprio corretor. O lead entra na
-- cadência ao nascer e sai dela pelo agendamento ("respondeu"), como qualquer
-- compromisso marcado.
--
-- A VISITA nasce com criado_por_id = corretor: é produção dele (pontuação) e
-- não cai na esteira "marquinhos" da comissão (lead_esteira_comissao), que
-- trata visita sem autor como do robô.
--
-- REGIÃO. A guarda de zona isenta a captação própria (corretor = auth.uid()).
-- O link É captação própria, mas roda como service_role; por isso a criação
-- liga app.zona_override só durante o insert do lead, como os motores fazem.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamento_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  -- Pré-preenchido pelo corretor; vazio = o cliente informa.
  endereco text NOT NULL DEFAULT '',
  -- Primeiro e último horário de INÍCIO oferecidos, de 30 em 30 minutos.
  hora_inicio time NOT NULL DEFAULT '09:00',
  hora_fim time NOT NULL DEFAULT '18:00',
  -- 0 = domingo … 6 = sábado (extract(dow)).
  dias_semana smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  duracao_minutos smallint NOT NULL DEFAULT 60,
  revogado_em timestamptz,
  limite_janela_inicio timestamptz,
  limite_janela_requisicoes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agendamento_links_slug_ck CHECK (slug ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT agendamento_links_endereco_ck CHECK (char_length(endereco) <= 300),
  CONSTRAINT agendamento_links_horario_ck CHECK (
    hora_inicio <= hora_fim
    AND date_part('second', hora_inicio) = 0
    AND date_part('minute', hora_inicio) IN (0, 30)
    AND date_part('second', hora_fim) = 0
    AND date_part('minute', hora_fim) IN (0, 30)
  ),
  CONSTRAINT agendamento_links_dias_ck CHECK (
    cardinality(dias_semana) BETWEEN 1 AND 7
    AND array_position(dias_semana, NULL) IS NULL
    AND dias_semana <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  CONSTRAINT agendamento_links_duracao_ck CHECK (duracao_minutos IN (30, 60, 90, 120)),
  CONSTRAINT agendamento_links_limite_ck CHECK (limite_janela_requisicoes BETWEEN 0 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_links_slug
  ON public.agendamento_links (slug);
-- Um link ativo por corretor: trocar o link revoga o anterior.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_links_corretor_ativo
  ON public.agendamento_links (corretor_id)
  WHERE revogado_em IS NULL;

-- Um envio por agendamento feito pelo link. Sem PII: os dados do cliente
-- ficam no lead (com a RLS de sempre); aqui só o vínculo, a idempotência e o
-- hash do comprovante.
CREATE TABLE IF NOT EXISTS public.agendamento_link_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.agendamento_links(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  lead_novo boolean NOT NULL DEFAULT false,
  comprovante_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agendamento_link_envios_hash_ck CHECK (comprovante_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_link_envios_idempotencia
  ON public.agendamento_link_envios (link_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_link_envios_comprovante
  ON public.agendamento_link_envios (comprovante_hash);
CREATE INDEX IF NOT EXISTS idx_agendamento_link_envios_link_created
  ON public.agendamento_link_envios (link_id, created_at DESC);

ALTER TABLE public.agendamento_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_link_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_link_envios FORCE ROW LEVEL SECURITY;

-- O navegador nunca lê estas tabelas: o corretor usa as RPCs abaixo e a
-- página pública passa pelo servidor.
REVOKE ALL ON public.agendamento_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.agendamento_link_envios FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agendamento_links TO service_role;
GRANT ALL ON public.agendamento_link_envios TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Peças internas
-- ---------------------------------------------------------------------------

-- CPF pelos dígitos verificadores (mesma regra de isValidCPF no app).
CREATE OR REPLACE FUNCTION public._cpf_valido(_cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _d text := regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g');
  _soma integer;
  _dv integer;
BEGIN
  IF length(_d) <> 11 OR _d ~ '^(\d)\1{10}$' THEN
    RETURN false;
  END IF;
  FOR _pos IN 9..10 LOOP
    _soma := 0;
    FOR i IN 1.._pos LOOP
      _soma := _soma + substr(_d, i, 1)::integer * (_pos + 2 - i);
    END LOOP;
    _dv := (_soma * 10) % 11;
    IF _dv = 10 THEN _dv := 0; END IF;
    IF _dv <> substr(_d, _pos + 1, 1)::integer THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- Quem pode ter (e manter vivo) um link: corretor com conta ativa. Corretor
-- desligado → o link dele para de abrir, sem precisar revogar.
CREATE OR REPLACE FUNCTION public._agendamento_link_corretor_apto(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _uid IS NOT NULL
     AND public.is_active_member(_uid)
     AND public.has_role(_uid, 'corretor'::public.app_role);
$$;

-- 16 caracteres base64url = 96 bits.
CREATE OR REPLACE FUNCTION public._agendamento_link_novo_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, public
AS $$
  SELECT translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$$;

-- Horários livres do link: dias da semana e faixa do corretor, de 30 em 30
-- minutos, a partir de 2 horas de antecedência e até 30 dias à frente, menos o
-- que choca com a agenda dele (visita, reunião ou "outro" ainda de pé; ligação
-- e follow-up não ocupam o corretor, e "remarcado" é o horário antigo que já
-- saiu da agenda). Tudo no fuso de São Paulo, onde a visita acontece.
CREATE OR REPLACE FUNCTION public._agendamento_link_livres(_link_id uuid, _dia date DEFAULT NULL)
RETURNS TABLE (inicio timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH l AS (
    SELECT * FROM public.agendamento_links WHERE id = _link_id AND revogado_em IS NULL
  ),
  dias AS (
    SELECT d::date AS dia
      FROM generate_series(
             (now() AT TIME ZONE 'America/Sao_Paulo')::date,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30,
             interval '1 day') AS d
     WHERE _dia IS NULL OR d::date = _dia
  ),
  candidatos AS (
    SELECT ((dias.dia + l.hora_inicio + make_interval(mins => 30 * n))
              AT TIME ZONE 'America/Sao_Paulo') AS inicio,
           l.corretor_id,
           l.duracao_minutos
      FROM l
     CROSS JOIN dias
     CROSS JOIN LATERAL generate_series(
       0, (extract(epoch FROM (l.hora_fim - l.hora_inicio)) / 1800)::integer) AS n
     WHERE extract(dow FROM dias.dia)::smallint = ANY (l.dias_semana)
  )
  SELECT c.inicio
    FROM candidatos AS c
   WHERE c.inicio >= now() + interval '2 hours'
     AND NOT EXISTS (
       SELECT 1
         FROM public.agendamentos AS a
        WHERE a.corretor_id = c.corretor_id
          AND a.deleted_at IS NULL
          AND a.status IN ('agendado'::public.agendamento_status,
                           'confirmado'::public.agendamento_status)
          AND a.tipo IN ('visita'::public.agendamento_tipo,
                         'reuniao'::public.agendamento_tipo,
                         'outro'::public.agendamento_tipo)
          AND a.data_inicio < c.inicio + make_interval(mins => c.duracao_minutos)
          AND a.data_fim > c.inicio
     )
   ORDER BY c.inicio;
$$;

CREATE OR REPLACE FUNCTION public._agendamento_link_resumo(_link_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'slug', l.slug,
    'endereco', l.endereco,
    'hora_inicio', to_char(l.hora_inicio, 'HH24:MI'),
    'hora_fim', to_char(l.hora_fim, 'HH24:MI'),
    'dias_semana', to_jsonb(l.dias_semana),
    'duracao_minutos', l.duracao_minutos,
    'created_at', l.created_at,
    'total_agendamentos', (SELECT count(*) FROM public.agendamento_link_envios e
                            WHERE e.link_id = l.id),
    'ultimo_agendamento_em', (SELECT max(e.created_at) FROM public.agendamento_link_envios e
                               WHERE e.link_id = l.id)
  )
  FROM public.agendamento_links AS l
  WHERE l.id = _link_id;
$$;

-- O que a página do cliente mostra depois de agendar (e o .ics usa). Lê a
-- visita como está AGORA: se o corretor remarcar, o comprovante acompanha.
CREATE OR REPLACE FUNCTION public._agendamento_link_confirmacao(_agendamento_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'agendamento_id', a.id,
    'inicio', a.data_inicio,
    'fim', a.data_fim,
    'endereco', COALESCE(a.local, ''),
    'corretor_nome', COALESCE(NULLIF(btrim(p.nome), ''), 'Seu corretor'),
    'corretor_whatsapp', public.normalize_phone_smq(p.telefone)
  )
  FROM public.agendamentos AS a
  LEFT JOIN public.profiles AS p ON p.id = a.corretor_id
  WHERE a.id = _agendamento_id
    AND a.deleted_at IS NULL
    AND a.status <> 'cancelado'::public.agendamento_status;
$$;

-- ---------------------------------------------------------------------------
-- 3) RPCs do corretor (authenticated, sempre sobre o próprio link)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_agendamento_link()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO _id FROM public.agendamento_links
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  IF _id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public._agendamento_link_resumo(_id);
END;
$$;

-- Cria o link na primeira vez; depois, só ajusta a configuração (o endereço
-- do cliente não muda).
CREATE OR REPLACE FUNCTION public.salvar_meu_agendamento_link(
  _endereco text,
  _hora_inicio time,
  _hora_fim time,
  _dias_semana integer[],
  _duracao_minutos integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _end text := regexp_replace(btrim(COALESCE(_endereco, '')), '\s+', ' ', 'g');
  _dias smallint[];
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  IF char_length(_end) > 300 THEN
    RAISE EXCEPTION 'endereço passa de 300 caracteres' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT d::smallint ORDER BY d::smallint) INTO _dias FROM unnest(_dias_semana) AS d;

  -- Dois cliques, duas abas: um link só.
  PERFORM pg_advisory_xact_lock(hashtext('agendamento_link:' || _uid::text));

  UPDATE public.agendamento_links
     SET endereco = _end,
         hora_inicio = _hora_inicio,
         hora_fim = _hora_fim,
         dias_semana = _dias,
         duracao_minutos = _duracao_minutos::smallint,
         updated_at = now()
   WHERE corretor_id = _uid AND revogado_em IS NULL
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    INSERT INTO public.agendamento_links (
      corretor_id, slug, endereco, hora_inicio, hora_fim, dias_semana, duracao_minutos
    ) VALUES (
      _uid, public._agendamento_link_novo_slug(), _end, _hora_inicio, _hora_fim, _dias,
      _duracao_minutos::smallint
    )
    RETURNING id INTO _id;
  END IF;

  RETURN public._agendamento_link_resumo(_id);
EXCEPTION
  WHEN check_violation OR not_null_violation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'configuração do link inválida' USING ERRCODE = '22023';
END;
$$;

-- Revoga o link atual (o endereço antigo para de abrir na hora) e cria outro
-- com a mesma configuração. É a saída para link que caiu em spam.
CREATE OR REPLACE FUNCTION public.gerar_novo_agendamento_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _antigo public.agendamento_links%ROWTYPE;
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('agendamento_link:' || _uid::text));

  UPDATE public.agendamento_links
     SET revogado_em = now(), updated_at = now()
   WHERE corretor_id = _uid AND revogado_em IS NULL
  RETURNING * INTO _antigo;

  IF _antigo.id IS NULL THEN
    INSERT INTO public.agendamento_links (corretor_id, slug)
    VALUES (_uid, public._agendamento_link_novo_slug())
    RETURNING id INTO _id;
  ELSE
    INSERT INTO public.agendamento_links (
      corretor_id, slug, endereco, hora_inicio, hora_fim, dias_semana, duracao_minutos
    ) VALUES (
      _uid, public._agendamento_link_novo_slug(), _antigo.endereco, _antigo.hora_inicio,
      _antigo.hora_fim, _antigo.dias_semana, _antigo.duracao_minutos
    )
    RETURNING id INTO _id;
  END IF;

  RETURN public._agendamento_link_resumo(_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_meu_agendamento_link()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  UPDATE public.agendamento_links
     SET revogado_em = now(), updated_at = now()
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) RPCs da página pública (service_role, chamadas pelo servidor)
-- ---------------------------------------------------------------------------

-- Limite distribuído por link, ANTES de qualquer leitura ou escrita: 120
-- requisições por minuto. O lock da linha serializa instâncias serverless.
CREATE OR REPLACE FUNCTION public.consumir_agendamento_link_requisicao(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link public.agendamento_links%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  IF _slug IS NULL OR _slug !~ '^[A-Za-z0-9_-]{16}$' THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO _link
    FROM public.agendamento_links
   WHERE slug = _slug AND revogado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public._agendamento_link_corretor_apto(_link.corretor_id) THEN
    RETURN 'not_found';
  END IF;

  IF _link.limite_janela_inicio IS NULL
     OR _link.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _link.limite_janela_inicio;
    _quantidade := _link.limite_janela_requisicoes + 1;
  END IF;

  IF _quantidade > 120 THEN
    RETURN 'rate_limited';
  END IF;

  UPDATE public.agendamento_links
     SET limite_janela_inicio = _inicio,
         limite_janela_requisicoes = _quantidade
   WHERE id = _link.id;
  RETURN 'allowed';
END;
$$;

-- Projeção pública fechada: o nome do corretor, o endereço (se pré-preenchido)
-- e os horários livres. Nada sobre os clientes nem sobre o que ocupa a agenda.
CREATE OR REPLACE FUNCTION public.obter_agendamento_link_publico(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.agendamento_links%ROWTYPE;
  _nome text;
  _disp jsonb;
BEGIN
  SELECT * INTO _l
    FROM public.agendamento_links
   WHERE slug = _slug AND revogado_em IS NULL;
  IF NOT FOUND OR NOT public._agendamento_link_corretor_apto(_l.corretor_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.nome), ''), 'Seu corretor') INTO _nome
    FROM public.profiles AS p WHERE p.id = _l.corretor_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', d.dia, 'horarios', d.horarios)
                            ORDER BY d.dia), '[]'::jsonb)
    INTO _disp
    FROM (
      SELECT (x.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             jsonb_agg(to_char(x.inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
                       ORDER BY x.inicio) AS horarios
        FROM public._agendamento_link_livres(_l.id) AS x
       GROUP BY 1
    ) AS d;

  RETURN jsonb_build_object(
    'corretor_nome', COALESCE(_nome, 'Seu corretor'),
    'endereco', NULLIF(btrim(_l.endereco), ''),
    'duracao_minutos', _l.duracao_minutos,
    'disponibilidade', _disp
  );
END;
$$;

-- O agendamento em si. Tudo numa transação: lead, visita, etapa, tarefas,
-- linha do tempo, aviso ao corretor e o envio. Erro de negócio volta como
-- {ok:false, motivo} (sem exceção), para a rota responder sem log de PII.
CREATE OR REPLACE FUNCTION public.agendar_pelo_link(
  _slug text,
  _idempotency_key uuid,
  _nome text,
  _telefone text,
  _email text,
  _cpf text,
  _data date,
  _horario time,
  _endereco text,
  _comprovante_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.agendamento_links%ROWTYPE;
  _envio public.agendamento_link_envios%ROWTYPE;
  _cliente public.clientes%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _r public.leads;
  _vals jsonb;
  _adicional boolean;
  _lead_novo boolean := false;
  _nome_l text := regexp_replace(btrim(COALESCE(_nome, '')), '\s+', ' ', 'g');
  _email_l text := lower(btrim(COALESCE(_email, '')));
  _tel text := regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g');
  _cpf_d text := regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g');
  _hash text := lower(COALESCE(_comprovante_hash, ''));
  _tel_fmt text;
  _cpf_fmt text;
  _chave text;
  _endereco_final text;
  _inicio timestamptz;
  _fim timestamptz;
  _status_ant public.lead_status;
  _ag_id uuid;
  _d1 timestamptz;
  _d0 timestamptz;
  _quando text;
  _divergencias text[] := '{}';
  _prev_zona text := COALESCE(current_setting('app.zona_override', true), '');
  _prev_trans text := COALESCE(current_setting('app.transicionar_lead', true), '');
BEGIN
  -- 0) Última fronteira da entrada (a rota já validou com o mesmo critério).
  IF _slug IS NULL OR _slug !~ '^[A-Za-z0-9_-]{16}$'
     OR _idempotency_key IS NULL OR _data IS NULL OR _horario IS NULL
     OR char_length(_nome_l) NOT BETWEEN 5 AND 120 OR position(' ' IN _nome_l) = 0
     OR char_length(_email_l) > 160 OR _email_l !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(_tel) NOT IN (10, 11)
     OR NOT public._cpf_valido(_cpf_d)
     OR _hash !~ '^[0-9a-f]{64}$'
     OR char_length(COALESCE(_endereco, '')) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input');
  END IF;

  -- 1) O link (lock: serializa os envios do mesmo corretor — dois clientes
  --    não pegam o mesmo horário).
  SELECT * INTO _l
    FROM public.agendamento_links
   WHERE slug = _slug AND revogado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public._agendamento_link_corretor_apto(_l.corretor_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;

  -- 2) Reenvio (rede ruim, duplo toque): devolve o mesmo agendamento e troca
  --    o comprovante pelo desta resposta.
  SELECT * INTO _envio
    FROM public.agendamento_link_envios
   WHERE link_id = _l.id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    UPDATE public.agendamento_link_envios SET comprovante_hash = _hash WHERE id = _envio.id;
    RETURN COALESCE(public._agendamento_link_confirmacao(_envio.agendamento_id),
                    jsonb_build_object('ok', false, 'motivo', 'not_found'));
  END IF;

  -- 3) Teto de envios por link: segura robô e brincadeira sem travar o uso
  --    real (um corretor não recebe 10 visitas por hora pelo link).
  IF (SELECT count(*) FROM public.agendamento_link_envios e
       WHERE e.link_id = _l.id AND e.created_at > now() - interval '1 hour') >= 10
     OR (SELECT count(*) FROM public.agendamento_link_envios e
          WHERE e.link_id = _l.id AND e.created_at > now() - interval '1 day') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_link');
  END IF;

  -- 4) Endereço: o do corretor manda; o do cliente só vale se o link não tem.
  _endereco_final := COALESCE(
    NULLIF(btrim(_l.endereco), ''),
    NULLIF(regexp_replace(btrim(COALESCE(_endereco, '')), '\s+', ' ', 'g'), ''));
  IF _endereco_final IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'endereco_obrigatorio');
  END IF;

  -- 5) Horário: precisa ser um dos livres AGORA (sob o lock do link).
  _inicio := (_data + _horario) AT TIME ZONE 'America/Sao_Paulo';
  _fim := _inicio + make_interval(mins => _l.duracao_minutos);
  IF NOT EXISTS (
    SELECT 1 FROM public._agendamento_link_livres(_l.id, _data) AS x WHERE x.inicio = _inicio
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.agendamentos AS a
       WHERE a.corretor_id = _l.corretor_id
         AND a.deleted_at IS NULL
         AND a.status IN ('agendado'::public.agendamento_status,
                          'confirmado'::public.agendamento_status)
         AND a.tipo IN ('visita'::public.agendamento_tipo, 'reuniao'::public.agendamento_tipo,
                        'outro'::public.agendamento_tipo)
         AND a.data_inicio < _fim AND a.data_fim > _inicio
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'horario_indisponivel');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'horario_invalido');
  END IF;

  -- 6) O lead, pelas portas do registro mãe.
  _tel_fmt := CASE length(_tel)
    WHEN 11 THEN format('(%s) %s-%s', substr(_tel, 1, 2), substr(_tel, 3, 5), substr(_tel, 8, 4))
    ELSE format('(%s) %s-%s', substr(_tel, 1, 2), substr(_tel, 3, 4), substr(_tel, 7, 4))
  END;
  _cpf_fmt := format('%s.%s.%s-%s', substr(_cpf_d, 1, 3), substr(_cpf_d, 4, 3),
                     substr(_cpf_d, 7, 3), substr(_cpf_d, 10, 2));

  -- A chave da mãe sai do telefone NORMALIZADO, como no gatilho
  -- (sync_lead_telefone_e164 → trg_zz_cliente_vincular): normalize_phone_smq
  -- põe o 9º dígito em número de 10 dígitos, e a chave crua não acharia a mãe.
  -- Mesmo lock do gatilho: dois envios com o mesmo telefone (em links
  -- diferentes) não criam duas mães nem dois registros.
  _chave := public.cliente_chave_telefone(COALESCE(public.normalize_phone_smq(_tel), _tel));
  PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));
  SELECT * INTO _cliente FROM public.clientes WHERE chave_telefone = _chave;

  PERFORM set_config('app.zona_override', 'on', true);

  IF _cliente.id IS NOT NULL THEN
    SELECT l.* INTO _lead
      FROM public.leads AS l
     WHERE l.cliente_id = _cliente.id
       AND l.corretor_id = _l.corretor_id
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND l.status::text <> 'perdido'
     ORDER BY l.updated_at DESC
     LIMIT 1;

    IF _lead.id IS NULL THEN
      IF public._cliente_lead_avancado(_cliente.id, _l.corretor_id) IS NOT NULL THEN
        PERFORM set_config('app.zona_override', _prev_zona, true);
        RETURN jsonb_build_object('ok', false, 'motivo', 'nao_permitido');
      END IF;

      -- Registro filho: a mesma regra de criar_registro_filho (herda os dados
      -- da mãe); o formulário completa só o que a mãe não tem.
      PERFORM pg_advisory_xact_lock(hashtext('cliente_filho:' || _cliente.id::text));
      _adicional := EXISTS (
        SELECT 1 FROM public.leads AS l
         WHERE l.cliente_id = _cliente.id
           AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
      );
      SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _vals
        FROM jsonb_each(_cliente.dados) AS e
       WHERE e.key = ANY (public._cliente_campos());
      _r := jsonb_populate_record(NULL::public.leads, _vals);

      INSERT INTO public.leads (
        cliente_id, registro_adicional, corretor_id, status, origem,
        data_distribuicao, timestamp_recebimento,
        nome, telefone, email, cpf,
        projeto_nome,
        renda_informada, renda_estimada, tipo_renda, faixa_mcmv,
        usa_fgts, tem_fgts, fgts_valor, entrada_disponivel, decisor,
        zona, bairro, dorms_desejados, precisa_vaga, prioridades,
        objecoes, resumo_qualificacao, construtora, consentimento_lgpd,
        opt_out
      ) VALUES (
        _cliente.id, _adicional, _l.corretor_id, 'aguardando_atendimento'::public.lead_status,
        'agendamento_self_service'::public.lead_origem,
        now(), now(),
        COALESCE(_r.nome, _cliente.nome, _nome_l),
        COALESCE(_cliente.telefone, _cliente.telefone_e164, _tel_fmt),
        COALESCE(_r.email, _cliente.email, _email_l),
        COALESCE(_r.cpf, _cliente.cpf, _cpf_fmt),
        _r.projeto_nome,
        _r.renda_informada, _r.renda_estimada, _r.tipo_renda, _r.faixa_mcmv,
        COALESCE(_r.usa_fgts, false), _r.tem_fgts, _r.fgts_valor, _r.entrada_disponivel, _r.decisor,
        _r.zona, _r.bairro, _r.dorms_desejados, _r.precisa_vaga, COALESCE(_r.prioridades, '{}'),
        COALESCE(_r.objecoes, '{}'), _r.resumo_qualificacao, _r.construtora,
        COALESCE(_r.consentimento_lgpd, true),
        _cliente.opt_out
      )
      RETURNING * INTO _lead;

      INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, autor_id, campo, valor_novo)
      VALUES (_cliente.id, _lead.id, _l.corretor_id, NULL, '_registro_filho',
              jsonb_build_object('adicional', _adicional, 'via', 'link_agendamento',
                                 'campos_herdados', (SELECT count(*) FROM jsonb_object_keys(_vals))));
      _lead_novo := true;
    ELSE
      -- Registro do próprio corretor: só completa o que está vazio.
      UPDATE public.leads
         SET email = COALESCE(NULLIF(btrim(email), ''), _email_l),
             cpf = COALESCE(NULLIF(btrim(cpf), ''), _cpf_fmt),
             consentimento_lgpd = COALESCE(consentimento_lgpd, true)
       WHERE id = _lead.id
      RETURNING * INTO _lead;
    END IF;
  ELSE
    -- Pessoa nova: o gatilho trg_zz_cliente_vincular cria a mãe.
    INSERT INTO public.leads (
      nome, telefone, email, cpf, origem, corretor_id, status,
      data_distribuicao, timestamp_recebimento, consentimento_lgpd
    ) VALUES (
      _nome_l, _tel_fmt, _email_l, _cpf_fmt, 'agendamento_self_service'::public.lead_origem,
      _l.corretor_id, 'aguardando_atendimento'::public.lead_status,
      now(), now(), true
    )
    RETURNING * INTO _lead;
    _lead_novo := true;
  END IF;

  PERFORM set_config('app.zona_override', _prev_zona, true);

  -- O que o cliente digitou e a ficha já tinha diferente: vai para a visita,
  -- para o corretor conferir (o CPF só aparece quando diverge).
  IF lower(btrim(_lead.nome)) <> lower(_nome_l) THEN
    _divergencias := _divergencias || ('Nome informado: ' || _nome_l);
  END IF;
  IF COALESCE(lower(btrim(_lead.email)), '') <> _email_l THEN
    _divergencias := _divergencias || ('E-mail informado: ' || _email_l);
  END IF;
  IF regexp_replace(COALESCE(_lead.cpf, ''), '\D', '', 'g') <> _cpf_d THEN
    _divergencias := _divergencias || ('CPF informado: ' || _cpf_fmt);
  END IF;

  -- 7) A visita.
  INSERT INTO public.agendamentos (
    lead_id, corretor_id, criado_por_id, tipo, status, titulo, descricao, local,
    data_inicio, data_fim, timezone
  ) VALUES (
    _lead.id, _l.corretor_id, _l.corretor_id,
    'visita'::public.agendamento_tipo, 'agendado'::public.agendamento_status,
    'Visita — ' || _lead.nome,
    concat_ws(E'\n',
      'Agendada pelo próprio cliente no seu link de agendamento.',
      CASE WHEN cardinality(_divergencias) > 0
           THEN E'Dados diferentes da ficha (confira com o cliente):\n'
                || array_to_string(_divergencias, E'\n') END),
    _endereco_final, _inicio, _fim, 'America/Sao_Paulo'
  )
  RETURNING id INTO _ag_id;

  -- 8) A etapa: o caminho da visita marcada por terceiros (_sdr_visita_roleta).
  _d1 := GREATEST(_inicio - interval '1 day', now() + interval '1 hour');
  _d0 := GREATEST(_inicio - interval '3 hours', now() + interval '30 minutes');
  SELECT status INTO _status_ant FROM public.leads WHERE id = _lead.id;
  IF _status_ant IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status,
                     'aguardando_atendimento'::public.lead_status,
                     'em_atendimento'::public.lead_status,
                     'aguardando_retorno'::public.lead_status,
                     'qualificacao_corretor'::public.lead_status,
                     'qualificado'::public.lead_status) THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status = 'agendado'::public.lead_status,
           proxima_acao = 'Confirmar a visita com o cliente (D-1 e no dia)',
           proximo_followup = LEAST(_d1, _inicio),
           ultima_interacao = now()
     WHERE id = _lead.id;
    PERFORM set_config('app.transicionar_lead', _prev_trans, true);
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead.id, 'transicao_lead',
      'Lead movido de ' || _status_ant::text || ' para agendado.',
      'link_agendamento',
      jsonb_build_object('de_status', _status_ant, 'para_status', 'agendado',
                         'motivo', 'Visita agendada pelo cliente no link de agendamento',
                         'alterado_por', NULL, 'agendamento_id', _ag_id));
  ELSE
    -- Já agendado ou além: não regride a etapa, só registra o contato.
    UPDATE public.leads SET ultima_interacao = now() WHERE id = _lead.id;
  END IF;

  -- 9) Confirmações D-1 e D-0 para o corretor (as mesmas do SDR).
  IF _d1 < _inicio AND NOT EXISTS (
    SELECT 1 FROM public.tarefas t
     WHERE t.lead_id = _lead.id AND t.corretor_id = _l.corretor_id AND t.deleted_at IS NULL
       AND t.status = 'pendente'::public.tarefa_status AND t.titulo LIKE 'Confirmar visita de %(D-1)'
  ) THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_l.corretor_id, _lead.id, 'Confirmar visita de ' || _lead.nome || ' (D-1)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade,
       'pendente'::public.tarefa_status, _d1, true, _l.corretor_id);
  END IF;
  IF _d0 < _inicio AND _d0 > _d1 AND NOT EXISTS (
    SELECT 1 FROM public.tarefas t
     WHERE t.lead_id = _lead.id AND t.corretor_id = _l.corretor_id AND t.deleted_at IS NULL
       AND t.status = 'pendente'::public.tarefa_status AND t.titulo LIKE 'Confirmar visita de %(D-0)'
  ) THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento, origem_automatica, criado_por)
    VALUES
      (_l.corretor_id, _lead.id, 'Confirmar visita de ' || _lead.nome || ' hoje (D-0)',
       'whatsapp'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade,
       'pendente'::public.tarefa_status, _d0, true, _l.corretor_id);
  END IF;

  -- 10) Linha do tempo e aviso no celular do corretor. A tag do push é a do
  --     "Novo lead recebido": a notificação mais completa substitui a outra.
  _quando := to_char(_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead.id, NULL, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'Sistema: visita agendada pelo cliente',
          'O cliente agendou uma visita pelo link de agendamento para ' || _quando
            || ' em ' || _endereco_final || '.',
          jsonb_build_object('fonte', 'link_agendamento', 'agendamento_id', _ag_id,
                             'lead_novo', _lead_novo));
  PERFORM public.enqueue_push(
    _l.corretor_id,
    'Visita agendada pelo seu link',
    _lead.nome || ' · ' || to_char(_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    '/leads/' || _lead.id::text,
    'lead-' || _lead.id::text);

  -- 11) O envio (idempotência, comprovante e o contador do link).
  INSERT INTO public.agendamento_link_envios (
    link_id, idempotency_key, lead_id, agendamento_id, lead_novo, comprovante_hash
  ) VALUES (
    _l.id, _idempotency_key, _lead.id, _ag_id, _lead_novo, _hash
  );

  RETURN public._agendamento_link_confirmacao(_ag_id);
END;
$$;

-- Comprovante: baixa o .ics de novo pelo hash (o token bruto só existe no
-- navegador do cliente). Vale até um dia depois do fim da visita.
CREATE OR REPLACE FUNCTION public.obter_agendamento_comprovante(_comprovante_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public._agendamento_link_confirmacao(e.agendamento_id)
    FROM public.agendamento_link_envios AS e
    JOIN public.agendamentos AS a ON a.id = e.agendamento_id
   WHERE e.comprovante_hash = lower(_comprovante_hash)
     AND lower(_comprovante_hash) ~ '^[0-9a-f]{64}$'
     AND a.data_fim > now() - interval '1 day';
$$;

-- ---------------------------------------------------------------------------
-- 5) Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._cpf_valido(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_corretor_apto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_novo_slug() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_livres(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_resumo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_confirmacao(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.meu_agendamento_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_meu_agendamento_link(text, time, time, integer[], integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_novo_agendamento_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desativar_meu_agendamento_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_agendamento_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_meu_agendamento_link(text, time, time, integer[], integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_novo_agendamento_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.desativar_meu_agendamento_link() TO authenticated;

REVOKE ALL ON FUNCTION public.consumir_agendamento_link_requisicao(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obter_agendamento_link_publico(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agendar_pelo_link(
  text, uuid, text, text, text, text, date, time, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obter_agendamento_comprovante(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_agendamento_link_requisicao(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.obter_agendamento_link_publico(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agendar_pelo_link(
  text, uuid, text, text, text, text, date, time, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.obter_agendamento_comprovante(text) TO service_role;

COMMENT ON TABLE public.agendamento_links IS
  'Link fixo de agendamento do corretor (/agendar/<slug>). Slug público de propósito; revogável.';
COMMENT ON TABLE public.agendamento_link_envios IS
  'Agendamentos feitos pelo link: idempotência, hash do comprovante (.ics) e vínculo lead/visita. Sem PII.';
