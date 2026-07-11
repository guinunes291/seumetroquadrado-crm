-- Arquivos de documentacao passam a ser mediados pelo servidor.
-- O navegador continua podendo editar o checklist via RLS, mas nao recebe
-- permissao direta em storage.objects. Cada upload cria uma versao imutavel e
-- o campo documentacoes.url aponta somente para a versao corrente.

CREATE TABLE IF NOT EXISTS public.documentacao_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documentacao_id uuid NOT NULL REFERENCES public.documentacoes(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  versao integer NOT NULL CHECK (versao > 0),
  object_path text NOT NULL UNIQUE CHECK (object_path <> ''),
  nome_original text NOT NULL CHECK (char_length(nome_original) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 15728640),
  enviado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ativa boolean NOT NULL DEFAULT true,
  removido_em timestamptz,
  removido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentacao_versoes_numero_unico UNIQUE (documentacao_id, versao),
  CONSTRAINT documentacao_versoes_remocao_consistente CHECK (
    (removido_em IS NULL AND removido_por IS NULL)
    OR (removido_em IS NOT NULL AND removido_por IS NOT NULL AND ativa = false)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_versao_ativa
  ON public.documentacao_versoes (documentacao_id)
  WHERE ativa;
CREATE INDEX IF NOT EXISTS idx_documentacao_versoes_lead_created
  ON public.documentacao_versoes (lead_id, created_at DESC);

ALTER TABLE public.documentacao_versoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documentacao_versoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.documentacao_versoes TO service_role;

-- Exclusão precisa remover objetos e registrar versões pelo handler servidor;
-- apagar só a linha pelo browser destruiria a trilha e deixaria blobs órfãos.
REVOKE DELETE ON public.documentacoes FROM authenticated;

-- Chamada exclusivamente com service role pelo handler servidor, depois que o
-- JWT do usuario e a carteira foram validados com o cliente RLS desse usuario.
CREATE OR REPLACE FUNCTION public.registrar_documentacao_upload(
  _documentacao_id uuid,
  _lead_id uuid,
  _object_path text,
  _nome_original text,
  _mime_type text,
  _tamanho_bytes bigint,
  _ator_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _versao integer;
BEGIN
  IF _ator_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _ator_id) THEN
    RAISE EXCEPTION 'ator invalido' USING ERRCODE = '22023';
  END IF;
  IF _mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     OR _tamanho_bytes NOT BETWEEN 1 AND 15728640
     OR char_length(COALESCE(_nome_original, '')) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'arquivo invalido' USING ERRCODE = '22023';
  END IF;

  -- Serializa uploads concorrentes do mesmo item de checklist.
  PERFORM 1
  FROM public.documentacoes AS d
  WHERE d.id = _documentacao_id AND d.lead_id = _lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documentacao nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.documentacao_versoes
  SET ativa = false
  WHERE documentacao_id = _documentacao_id AND ativa;

  SELECT COALESCE(max(v.versao), 0) + 1
  INTO _versao
  FROM public.documentacao_versoes AS v
  WHERE v.documentacao_id = _documentacao_id;

  INSERT INTO public.documentacao_versoes (
    documentacao_id, lead_id, versao, object_path, nome_original,
    mime_type, tamanho_bytes, enviado_por
  ) VALUES (
    _documentacao_id, _lead_id, _versao, _object_path, left(_nome_original, 255),
    _mime_type, _tamanho_bytes, _ator_id
  );

  UPDATE public.documentacoes
  SET url = _object_path,
      status = CASE WHEN status = 'pendente' THEN 'recebido' ELSE status END
  WHERE id = _documentacao_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id,
    'documentacao_upload',
    'Nova versao de documento recebida',
    _ator_id::text,
    jsonb_build_object(
      'documentacao_id', _documentacao_id,
      'versao', _versao,
      'mime_type', _mime_type,
      'tamanho_bytes', _tamanho_bytes
    )
  );

  RETURN _versao;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_documentacao_remocao(
  _documentacao_id uuid,
  _ator_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead_id uuid;
  _object_path text;
BEGIN
  IF _ator_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _ator_id) THEN
    RAISE EXCEPTION 'ator invalido' USING ERRCODE = '22023';
  END IF;

  -- Nunca confia apenas em documentacoes.url: essa coluna existia antes da
  -- mediação server-side e pode conter valor legado/manipulado. Só uma versão
  -- ativa pertencente ao mesmo item pode virar caminho de remoção.
  SELECT d.lead_id, v.object_path
  INTO _lead_id, _object_path
  FROM public.documentacoes AS d
  JOIN public.documentacao_versoes AS v
    ON v.documentacao_id = d.id
   AND v.lead_id = d.lead_id
   AND v.ativa
   AND v.object_path = d.url
  WHERE d.id = _documentacao_id
  FOR UPDATE OF d, v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'documentacao nao possui arquivo privado' USING ERRCODE = '22023';
  END IF;

  UPDATE public.documentacao_versoes
  SET ativa = false, removido_em = now(), removido_por = _ator_id
  WHERE documentacao_id = _documentacao_id AND object_path = _object_path AND ativa;

  UPDATE public.documentacoes SET url = NULL WHERE id = _documentacao_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id,
    'documentacao_remocao',
    'Arquivo de documento removido',
    _ator_id::text,
    jsonb_build_object('documentacao_id', _documentacao_id)
  );

  RETURN _object_path;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_documentacao_upload(
  uuid, uuid, text, text, text, bigint, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_documentacao_upload(
  uuid, uuid, text, text, text, bigint, uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.registrar_documentacao_remocao(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_documentacao_remocao(uuid, uuid)
  TO service_role;
