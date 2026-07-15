-- Backfill de documentacao_versoes para documentos legados.
--
-- Incidente: "documentos não abrem". A migration 20260711121500 passou a mediar
-- os arquivos pelo servidor e o GET /api/documentacao só assina a URL quando
-- existe uma versão ATIVA em documentacao_versoes com object_path igual a
-- documentacoes.url. Documentos enviados ANTES dela têm url preenchida (o
-- caminho do objeto no bucket `documentacao`) mas nenhuma linha de versão —
-- resultado: 404 `private_file_not_found` ("Este documento não possui arquivo
-- privado") para todo documento antigo, para sempre.
--
-- Correção: criar a versão 1 ativa a partir do objeto REAL no Storage.
-- mime/tamanho vêm de storage.objects.metadata (com fallback de mime pela
-- extensão); o autor vem do owner do objeto, senão do corretor do
-- documento/lead. Só entram linhas que satisfazem todos os CHECKs da tabela;
-- documentos cujo objeto não existe mais no bucket ficam de fora (estão
-- genuinamente quebrados e continuarão respondendo 404, como hoje).
--
-- Idempotente: pula documentações que já têm qualquer versão registrada e
-- object_paths já usados; ON CONFLICT DO NOTHING cobre corridas.

INSERT INTO public.documentacao_versoes (
  documentacao_id,
  lead_id,
  versao,
  object_path,
  nome_original,
  mime_type,
  tamanho_bytes,
  enviado_por,
  ativa
)
SELECT
  d.id,
  d.lead_id,
  1,
  d.url,
  COALESCE(NULLIF(left(regexp_replace(d.url, '^.*/', ''), 255), ''), 'documento'),
  COALESCE(
    NULLIF(so.metadata->>'mimetype', ''),
    CASE lower(substring(d.url from '\.([a-z0-9]+)$'))
      WHEN 'pdf' THEN 'application/pdf'
      WHEN 'jpg' THEN 'image/jpeg'
      WHEN 'jpeg' THEN 'image/jpeg'
      WHEN 'png' THEN 'image/png'
      WHEN 'webp' THEN 'image/webp'
    END
  ),
  NULLIF(so.metadata->>'size', '')::bigint,
  COALESCE(
    so.owner,
    CASE
      WHEN so.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN so.owner_id::uuid
    END,
    d.corretor_id,
    l.corretor_id
  ),
  true
FROM public.documentacoes AS d
JOIN public.leads AS l ON l.id = d.lead_id
JOIN storage.objects AS so
  ON so.bucket_id = 'documentacao'
 AND so.name = d.url
WHERE d.url IS NOT NULL
  AND d.url !~* '^https?://'
  -- só documentos sem NENHUMA versão (legados pré-mediação)
  AND NOT EXISTS (
    SELECT 1 FROM public.documentacao_versoes AS v
    WHERE v.documentacao_id = d.id
  )
  -- object_path é UNIQUE globalmente
  AND NOT EXISTS (
    SELECT 1 FROM public.documentacao_versoes AS v
    WHERE v.object_path = d.url
  )
  -- respeita os CHECKs da tabela (mime permitido, tamanho 1..15MB)
  AND COALESCE(
    NULLIF(so.metadata->>'mimetype', ''),
    CASE lower(substring(d.url from '\.([a-z0-9]+)$'))
      WHEN 'pdf' THEN 'application/pdf'
      WHEN 'jpg' THEN 'image/jpeg'
      WHEN 'jpeg' THEN 'image/jpeg'
      WHEN 'png' THEN 'image/png'
      WHEN 'webp' THEN 'image/webp'
    END
  ) IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  AND NULLIF(so.metadata->>'size', '')::bigint BETWEEN 1 AND 15728640
  -- enviado_por é NOT NULL REFERENCES auth.users
  AND EXISTS (
    SELECT 1 FROM auth.users AS u
    WHERE u.id = COALESCE(
      so.owner,
      CASE
        WHEN so.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN so.owner_id::uuid
      END,
      d.corretor_id,
      l.corretor_id
    )
  )
ON CONFLICT DO NOTHING;
