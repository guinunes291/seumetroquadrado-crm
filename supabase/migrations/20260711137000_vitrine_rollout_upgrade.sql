-- Finalizador aditivo da Vitrine.
--
-- Esta migration existe para ambientes em que uma revisão intermediária das
-- migrations 132/135 já foi registrada. Ela também é segura no reset limpo:
-- todas as colunas são garantidas com IF NOT EXISTS, os dados são normalizados
-- antes dos NOT NULL/checks e as funções públicas são substituídas pela versão
-- final fail-closed.

ALTER TABLE public.vitrine_links
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS total_aberturas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_eventos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_requisicoes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_janela_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS limite_janela_requisicoes integer DEFAULT 0;

ALTER TABLE public.vitrine_link_eventos
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS capa_url text,
  ADD COLUMN IF NOT EXISTS galeria_urls text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(6,3),
  ADD COLUMN IF NOT EXISTS disponibilidade_resumo text;

-- Reconcilia os contadores com a telemetria que já existe. Os tetos são
-- saturados em vez de descartar eventos históricos: links acima do limite
-- ficam imediatamente bloqueados para novos eventos.
WITH contagens AS (
  SELECT
    evento.link_id,
    count(*)::integer AS total_eventos,
    count(*) FILTER (WHERE evento.tipo = 'abertura')::integer AS total_aberturas
  FROM public.vitrine_link_eventos AS evento
  GROUP BY evento.link_id
)
UPDATE public.vitrine_links AS link
SET
  total_aberturas = GREATEST(
    COALESCE(link.total_aberturas, 0),
    COALESCE(contagens.total_aberturas, 0),
    0
  ),
  total_eventos = LEAST(
    1000,
    GREATEST(
      COALESCE(link.total_eventos, 0),
      COALESCE(contagens.total_eventos, 0),
      0
    )
  ),
  total_requisicoes = LEAST(20000, GREATEST(COALESCE(link.total_requisicoes, 0), 0)),
  limite_janela_inicio = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN NULL
    ELSE link.limite_janela_inicio
  END,
  limite_janela_requisicoes = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN 0
    ELSE LEAST(60, GREATEST(COALESCE(link.limite_janela_requisicoes, 0), 0))
  END
FROM contagens
WHERE contagens.link_id = link.id;

-- Links sem eventos não aparecem no CTE acima, mas ainda podem vir de uma
-- revisão intermediária com NULL ou valores fora dos limites.
UPDATE public.vitrine_links AS link
SET
  total_aberturas = GREATEST(COALESCE(link.total_aberturas, 0), 0),
  total_eventos = LEAST(1000, GREATEST(COALESCE(link.total_eventos, 0), 0)),
  total_requisicoes = LEAST(20000, GREATEST(COALESCE(link.total_requisicoes, 0), 0)),
  limite_janela_inicio = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN NULL
    ELSE link.limite_janela_inicio
  END,
  limite_janela_requisicoes = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN 0
    ELSE LEAST(60, GREATEST(COALESCE(link.limite_janela_requisicoes, 0), 0))
  END;

ALTER TABLE public.vitrine_links
  ALTER COLUMN total_aberturas SET DEFAULT 0,
  ALTER COLUMN total_aberturas SET NOT NULL,
  ALTER COLUMN total_eventos SET DEFAULT 0,
  ALTER COLUMN total_eventos SET NOT NULL,
  ALTER COLUMN total_requisicoes SET DEFAULT 0,
  ALTER COLUMN total_requisicoes SET NOT NULL,
  ALTER COLUMN limite_janela_requisicoes SET DEFAULT 0,
  ALTER COLUMN limite_janela_requisicoes SET NOT NULL;

-- Chaves ausentes ou repetidas podem existir em uma revisão que criou a
-- coluna antes do índice. Cada evento legado recebe uma chave própria.
UPDATE public.vitrine_link_eventos
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;

WITH repetidas AS (
  SELECT
    evento.id,
    row_number() OVER (
      PARTITION BY evento.link_id, evento.idempotency_key
      ORDER BY evento.id
    ) AS ocorrencia
  FROM public.vitrine_link_eventos AS evento
)
UPDATE public.vitrine_link_eventos AS evento
SET idempotency_key = gen_random_uuid()
FROM repetidas
WHERE repetidas.id = evento.id
  AND repetidas.ocorrencia > 1;

ALTER TABLE public.vitrine_link_eventos
  ALTER COLUMN idempotency_key SET NOT NULL;

-- Um nome novo evita confiar em um índice homônimo, porém incompleto, de uma
-- revisão intermediária. O ON CONFLICT da função final pode usar qualquer um
-- dos índices únicos equivalentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vitrine_eventos_idempotencia_rollout
  ON public.vitrine_link_eventos (link_id, idempotency_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_link_eventos'::regclass
      AND conname = 'uq_vitrine_eventos_idempotencia_rollout'
  ) THEN
    ALTER TABLE public.vitrine_link_eventos
      ADD CONSTRAINT uq_vitrine_eventos_idempotencia_rollout
      UNIQUE USING INDEX uq_vitrine_eventos_idempotencia_rollout;
  END IF;
END;
$$;

-- Normaliza a galeria sem apagar projetos: NULL vira lista vazia; itens nulos,
-- vazios ou maiores que 2 KiB são ignorados; espaços externos são removidos e
-- a ordem original dos primeiros doze itens válidos é preservada.
UPDATE public.projetos AS projeto
SET galeria_urls = COALESCE(
  (
    SELECT array_agg(normalizada.url ORDER BY normalizada.ordem)
    FROM (
      SELECT btrim(item.url) AS url, item.ordem
      FROM unnest(COALESCE(projeto.galeria_urls, '{}'::text[]))
        WITH ORDINALITY AS item(url, ordem)
      WHERE item.url IS NOT NULL
        AND char_length(btrim(item.url)) BETWEEN 1 AND 2048
      ORDER BY item.ordem
      LIMIT 12
    ) AS normalizada
  ),
  '{}'::text[]
);

ALTER TABLE public.projetos
  ALTER COLUMN galeria_urls SET DEFAULT '{}'::text[],
  ALTER COLUMN galeria_urls SET NOT NULL;

CREATE OR REPLACE FUNCTION public.vitrine_galeria_urls_validas(_urls text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT
    _urls IS NOT NULL
    AND cardinality(_urls) <= 12
    AND array_position(_urls, NULL) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(_urls) AS item(url)
      WHERE item.url <> btrim(item.url)
        OR char_length(item.url) NOT BETWEEN 1 AND 2048
    );
$$;

REVOKE ALL ON FUNCTION public.vitrine_galeria_urls_validas(text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vitrine_galeria_urls_validas(text[])
  TO authenticated, service_role;

-- Constraints com nomes exclusivos deste finalizador não dependem dos nomes
-- automáticos (ou do conteúdo) usados por uma revisão anterior.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_aberturas_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_aberturas_rollout_ck
      CHECK (total_aberturas >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_eventos_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_eventos_rollout_ck
      CHECK (total_eventos BETWEEN 0 AND 1000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_requisicoes_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_requisicoes_rollout_ck
      CHECK (total_requisicoes BETWEEN 0 AND 20000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_janela_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_janela_rollout_ck
      CHECK (
        limite_janela_requisicoes BETWEEN 0 AND 60
        AND (limite_janela_inicio IS NOT NULL OR limite_janela_requisicoes = 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_galeria_urls_rollout_ck'
  ) THEN
    ALTER TABLE public.projetos
      ADD CONSTRAINT projetos_galeria_urls_rollout_ck
      CHECK (public.vitrine_galeria_urls_validas(galeria_urls)) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_aberturas_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_eventos_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_requisicoes_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_janela_rollout_ck;
ALTER TABLE public.projetos
  VALIDATE CONSTRAINT projetos_galeria_urls_rollout_ck;

-- Limite distribuído aplicado antes de servir payload ou registrar evento.
CREATE OR REPLACE FUNCTION public.consumir_vitrine_requisicao(
  _token_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link public.vitrine_links%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO _link
  FROM public.vitrine_links
  WHERE token_hash = lower(_token_hash)
    AND revogado_em IS NULL
    AND expira_em > _agora
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _link.total_requisicoes >= 20000 THEN RETURN 'exhausted'; END IF;

  IF _link.limite_janela_inicio IS NULL
     OR _link.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _link.limite_janela_inicio;
    _quantidade := _link.limite_janela_requisicoes + 1;
  END IF;

  IF _quantidade > 60 THEN RETURN 'rate_limited'; END IF;

  UPDATE public.vitrine_links
  SET limite_janela_inicio = _inicio,
      limite_janela_requisicoes = _quantidade,
      total_requisicoes = total_requisicoes + 1
  WHERE id = _link.id;

  RETURN 'allowed';
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_vitrine_requisicao(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_vitrine_requisicao(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_vitrine_evento(
  _token_hash text,
  _idempotency_key uuid,
  _tipo public.vitrine_evento_tipo,
  _projeto_id uuid DEFAULT NULL,
  _cta_tipo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link_id uuid;
  _total_eventos integer;
  _inseridos integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$'
     OR _idempotency_key IS NULL OR _tipo IS NULL THEN
    RETURN false;
  END IF;

  SELECT link.id, link.total_eventos
  INTO _link_id, _total_eventos
  FROM public.vitrine_links AS link
  WHERE link.token_hash = lower(_token_hash)
    AND link.revogado_em IS NULL
    AND link.expira_em > clock_timestamp()
  FOR UPDATE;

  IF _link_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vitrine_link_eventos AS evento
    WHERE evento.link_id = _link_id
      AND evento.idempotency_key = _idempotency_key
  ) THEN
    RETURN true;
  END IF;

  IF _total_eventos >= 1000 THEN RETURN false; END IF;

  IF (
    SELECT count(*)
    FROM public.vitrine_link_eventos AS evento
    WHERE evento.link_id = _link_id
      AND evento.created_at >= clock_timestamp() - interval '1 minute'
  ) >= 120 THEN
    RETURN false;
  END IF;

  IF _tipo = 'abertura' THEN
    IF _projeto_id IS NOT NULL OR _cta_tipo IS NOT NULL THEN RETURN false; END IF;
  ELSE
    IF _projeto_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.vitrine_link_projetos AS item
      WHERE item.link_id = _link_id
        AND item.projeto_id = _projeto_id
    ) THEN
      RETURN false;
    END IF;

    IF _tipo = 'projeto_visto' AND _cta_tipo IS NOT NULL THEN RETURN false; END IF;
    IF _tipo = 'cta_clicado'
       AND _cta_tipo NOT IN ('book', 'tabela_precos', 'contato') THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.vitrine_link_eventos (
    link_id, projeto_id, tipo, cta_tipo, idempotency_key
  ) VALUES (
    _link_id, _projeto_id, _tipo, _cta_tipo, _idempotency_key
  )
  ON CONFLICT (link_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS _inseridos = ROW_COUNT;

  IF _inseridos = 0 THEN RETURN true; END IF;

  UPDATE public.vitrine_links
  SET
    total_eventos = total_eventos + 1,
    ultimo_acesso_em = CASE WHEN _tipo = 'abertura' THEN clock_timestamp()
      ELSE ultimo_acesso_em END,
    total_aberturas = total_aberturas
      + CASE WHEN _tipo = 'abertura' THEN 1 ELSE 0 END
  WHERE id = _link_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.limpar_vitrine_eventos_expirados(
  _antes timestamptz DEFAULT now() - interval '90 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _removidos integer;
BEGIN
  IF _antes > now() - interval '30 days' THEN
    RAISE EXCEPTION 'janela minima de retencao e 30 dias' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.vitrine_link_eventos AS evento
  USING public.vitrine_links AS link
  WHERE evento.link_id = link.id
    AND evento.created_at < _antes
    AND (link.revogado_em IS NOT NULL OR link.expira_em < now());
  GET DIAGNOSTICS _removidos = ROW_COUNT;

  RETURN _removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.consumir_vitrine_requisicao(text) IS
  'Reserva distribuída de requisição pública; somente o backend service_role executa.';
COMMENT ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) IS 'Evento público idempotente, limitado e sem PII; somente service_role executa.';
COMMENT ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz) IS
  'Retenção de telemetria de links expirados/revogados; somente service_role executa.';
