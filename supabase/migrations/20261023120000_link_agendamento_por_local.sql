-- ============================================================================
-- Link de agendamento por LOCAL (stand do Mapa de Lojas ou endereço livre)
-- ============================================================================
-- Pedido do dono (15/10/2026): o corretor escolhe o local no Mapa de Lojas, de
-- forma compacta, dentro do formulário do link, e cria um link ÚNICO para
-- aquele endereço do projeto. Antes era um link só por corretor
-- (20261022120000); agora é um link por endereço:
--
--   * vários links ativos por corretor — um por endereço (mesmo endereço = o
--     mesmo link: criar de novo devolve o que já existe, nada de duplicata);
--   * cada link guarda o local escolhido (local_id = id estável do stand no
--     Mapa de Lojas, local_nome = "Construtora · Stand") além do endereço;
--   * a página pública e a confirmação mostram o nome do local;
--   * teto de 20 links ativos por corretor.
--
-- A agenda continua UMA por corretor: os horários livres de todos os links
-- dele saem da mesma agenda (ninguém está em dois stands ao mesmo tempo).
--
-- As RPCs do corretor mudam de forma (sem link_id não dá para escolher qual
-- link): saem meu_agendamento_link, salvar_meu_agendamento_link,
-- gerar_novo_agendamento_link() e desativar_meu_agendamento_link(); entram
-- meus_agendamento_links, criar_agendamento_link, atualizar_agendamento_link,
-- trocar_agendamento_link(id) e desativar_agendamento_link(id). As funções
-- públicas mantêm a assinatura.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) O local no link e a chave do endereço
-- ---------------------------------------------------------------------------
ALTER TABLE public.agendamento_links
  ADD COLUMN IF NOT EXISTS local_id text,
  ADD COLUMN IF NOT EXISTS local_nome text NOT NULL DEFAULT '';

-- Mesmo endereço, mesmo link: a chave ignora caixa e espaços repetidos. O
-- link sem endereço (o cliente informa) tem chave '' — também um só.
ALTER TABLE public.agendamento_links
  ADD COLUMN IF NOT EXISTS endereco_chave text
    GENERATED ALWAYS AS (lower(regexp_replace(btrim(endereco), '\s+', ' ', 'g'))) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'agendamento_links_local_ck'
                    AND conrelid = 'public.agendamento_links'::regclass) THEN
    ALTER TABLE public.agendamento_links
      ADD CONSTRAINT agendamento_links_local_ck CHECK (
        char_length(local_nome) <= 160
        AND (local_id IS NULL OR char_length(local_id) BETWEEN 1 AND 200)
      );
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.uq_agendamento_links_corretor_ativo;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_links_corretor_endereco_ativo
  ON public.agendamento_links (corretor_id, endereco_chave)
  WHERE revogado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Peças internas com o local
-- ---------------------------------------------------------------------------
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
    'local_id', l.local_id,
    'local_nome', l.local_nome,
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
    'local_nome', NULLIF((
      SELECT l.local_nome
        FROM public.agendamento_link_envios AS e
        JOIN public.agendamento_links AS l ON l.id = e.link_id
       WHERE e.agendamento_id = a.id
       LIMIT 1), ''),
    'corretor_nome', COALESCE(NULLIF(btrim(p.nome), ''), 'Seu corretor'),
    'corretor_whatsapp', public.normalize_phone_smq(p.telefone)
  )
  FROM public.agendamentos AS a
  LEFT JOIN public.profiles AS p ON p.id = a.corretor_id
  WHERE a.id = _agendamento_id
    AND a.deleted_at IS NULL
    AND a.status <> 'cancelado'::public.agendamento_status;
$$;

-- Limpa e valida o local vindo da tela. Devolve a linha pronta para gravar.
CREATE OR REPLACE FUNCTION public._agendamento_link_local(
  _endereco text,
  _local_id text,
  _local_nome text,
  OUT endereco text,
  OUT local_id text,
  OUT local_nome text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  endereco := regexp_replace(btrim(COALESCE(_endereco, '')), '\s+', ' ', 'g');
  local_id := NULLIF(btrim(COALESCE(_local_id, '')), '');
  local_nome := regexp_replace(btrim(COALESCE(_local_nome, '')), '\s+', ' ', 'g');
  IF char_length(endereco) > 300 OR char_length(local_nome) > 160
     OR char_length(COALESCE(local_id, '')) > 200 THEN
    RAISE EXCEPTION 'local do link inválido' USING ERRCODE = '22023';
  END IF;
  -- Stand sem endereço não existe: o local só vale junto do endereço dele.
  IF endereco = '' THEN
    local_id := NULL;
    local_nome := '';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) RPCs do corretor (authenticated, sempre sobre os próprios links)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.meu_agendamento_link();
DROP FUNCTION IF EXISTS public.salvar_meu_agendamento_link(text, time, time, integer[], integer);
DROP FUNCTION IF EXISTS public.gerar_novo_agendamento_link();
DROP FUNCTION IF EXISTS public.desativar_meu_agendamento_link();

CREATE OR REPLACE FUNCTION public.meus_agendamento_links()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public._agendamento_link_resumo(l.id) ORDER BY l.created_at DESC)
      FROM public.agendamento_links AS l
     WHERE l.corretor_id = _uid AND l.revogado_em IS NULL
  ), '[]'::jsonb);
END;
$$;

-- Cria o link do local. Se o corretor já tem link ativo para o mesmo
-- endereço, devolve esse (ja_existia = true) sem mexer nele: o link já
-- divulgado continua valendo.
CREATE OR REPLACE FUNCTION public.criar_agendamento_link(
  _endereco text,
  _local_id text,
  _local_nome text,
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
  _loc record;
  _dias smallint[];
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  _loc := public._agendamento_link_local(_endereco, _local_id, _local_nome);
  SELECT array_agg(DISTINCT d::smallint ORDER BY d::smallint) INTO _dias FROM unnest(_dias_semana) AS d;

  -- Dois cliques, duas abas: um link por endereço.
  PERFORM pg_advisory_xact_lock(hashtext('agendamento_link:' || _uid::text));

  SELECT l.id INTO _id
    FROM public.agendamento_links AS l
   WHERE l.corretor_id = _uid AND l.revogado_em IS NULL
     AND l.endereco_chave = lower(_loc.endereco);
  IF _id IS NOT NULL THEN
    RETURN public._agendamento_link_resumo(_id) || jsonb_build_object('ja_existia', true);
  END IF;

  IF (SELECT count(*) FROM public.agendamento_links AS l
       WHERE l.corretor_id = _uid AND l.revogado_em IS NULL) >= 20 THEN
    RAISE EXCEPTION 'limite de 20 links ativos: desative um antes de criar outro'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.agendamento_links (
    corretor_id, slug, endereco, local_id, local_nome,
    hora_inicio, hora_fim, dias_semana, duracao_minutos
  ) VALUES (
    _uid, public._agendamento_link_novo_slug(), _loc.endereco, _loc.local_id, _loc.local_nome,
    _hora_inicio, _hora_fim, _dias, _duracao_minutos::smallint
  )
  RETURNING id INTO _id;

  RETURN public._agendamento_link_resumo(_id) || jsonb_build_object('ja_existia', false);
EXCEPTION
  WHEN check_violation OR not_null_violation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'configuração do link inválida' USING ERRCODE = '22023';
END;
$$;

-- Ajusta um link do próprio corretor (o endereço divulgado não muda de slug).
-- Trocar para um endereço que já tem outro link ativo é recusado (23505).
CREATE OR REPLACE FUNCTION public.atualizar_agendamento_link(
  _link_id uuid,
  _endereco text,
  _local_id text,
  _local_nome text,
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
  _loc record;
  _dias smallint[];
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de agendamento é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  _loc := public._agendamento_link_local(_endereco, _local_id, _local_nome);
  SELECT array_agg(DISTINCT d::smallint ORDER BY d::smallint) INTO _dias FROM unnest(_dias_semana) AS d;
  PERFORM pg_advisory_xact_lock(hashtext('agendamento_link:' || _uid::text));

  UPDATE public.agendamento_links
     SET endereco = _loc.endereco,
         local_id = _loc.local_id,
         local_nome = _loc.local_nome,
         hora_inicio = _hora_inicio,
         hora_fim = _hora_fim,
         dias_semana = _dias,
         duracao_minutos = _duracao_minutos::smallint,
         updated_at = now()
   WHERE id = _link_id AND corretor_id = _uid AND revogado_em IS NULL
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'link não encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN public._agendamento_link_resumo(_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'já existe um link seu para este endereço' USING ERRCODE = '23505';
  WHEN check_violation OR not_null_violation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'configuração do link inválida' USING ERRCODE = '22023';
END;
$$;

-- Revoga o link (o endereço antigo para de abrir na hora) e cria outro com a
-- mesma configuração e o mesmo local. A saída para link que caiu em spam.
CREATE OR REPLACE FUNCTION public.trocar_agendamento_link(_link_id uuid)
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
   WHERE id = _link_id AND corretor_id = _uid AND revogado_em IS NULL
  RETURNING * INTO _antigo;
  IF _antigo.id IS NULL THEN
    RAISE EXCEPTION 'link não encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.agendamento_links (
    corretor_id, slug, endereco, local_id, local_nome,
    hora_inicio, hora_fim, dias_semana, duracao_minutos
  ) VALUES (
    _uid, public._agendamento_link_novo_slug(), _antigo.endereco, _antigo.local_id,
    _antigo.local_nome, _antigo.hora_inicio, _antigo.hora_fim, _antigo.dias_semana,
    _antigo.duracao_minutos
  )
  RETURNING id INTO _id;

  RETURN public._agendamento_link_resumo(_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_agendamento_link(_link_id uuid)
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
   WHERE id = _link_id AND corretor_id = _uid AND revogado_em IS NULL;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Página pública: o nome do local
-- ---------------------------------------------------------------------------
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
    'local_nome', NULLIF(btrim(_l.local_nome), ''),
    'duracao_minutos', _l.duracao_minutos,
    'disponibilidade', _disp
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._agendamento_link_local(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_resumo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agendamento_link_confirmacao(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.meus_agendamento_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_agendamento_link(text, text, text, time, time, integer[], integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_agendamento_link(
  uuid, text, text, text, time, time, integer[], integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trocar_agendamento_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desativar_agendamento_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_agendamento_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_agendamento_link(text, text, text, time, time, integer[], integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_agendamento_link(
  uuid, text, text, text, time, time, integer[], integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trocar_agendamento_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desativar_agendamento_link(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.obter_agendamento_link_publico(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_agendamento_link_publico(text) TO service_role;

COMMENT ON TABLE public.agendamento_links IS
  'Links de agendamento do corretor (/agendar/<slug>), um por endereço/local. Slug público de propósito; revogável.';
