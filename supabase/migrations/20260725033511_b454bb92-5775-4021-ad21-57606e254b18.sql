
-- 1) Novas colunas em documentacoes
ALTER TABLE public.documentacoes
  ADD COLUMN IF NOT EXISTS arquivo_path    text,
  ADD COLUMN IF NOT EXISTS arquivo_nome    text,
  ADD COLUMN IF NOT EXISTS mime_type       text,
  ADD COLUMN IF NOT EXISTS tamanho_bytes   bigint,
  ADD COLUMN IF NOT EXISTS origem          text,
  ADD COLUMN IF NOT EXISTS recebido_em     timestamptz,
  ADD COLUMN IF NOT EXISTS message_id      text,
  ADD COLUMN IF NOT EXISTS classificado_por text,
  ADD COLUMN IF NOT EXISTS confianca_ia    numeric;

-- Dedup por webhook do WhatsApp: mesmo message_id só entra uma vez
CREATE UNIQUE INDEX IF NOT EXISTS documentacoes_message_id_uniq
  ON public.documentacoes (message_id)
  WHERE message_id IS NOT NULL;

-- 2) Normalização do vocabulário: extrato_bancario → extrato_bancario_6m.
-- Se colidir com uma linha já existente do mesmo tipo no lead, mantém a
-- mais recente (mais informativa) e apaga a antiga.
WITH renomear AS (
  SELECT d.id
  FROM public.documentacoes d
  WHERE d.tipo = 'extrato_bancario'
    AND NOT EXISTS (
      SELECT 1 FROM public.documentacoes o
      WHERE o.lead_id = d.lead_id AND o.tipo = 'extrato_bancario_6m'
    )
)
UPDATE public.documentacoes SET tipo = 'extrato_bancario_6m'
WHERE id IN (SELECT id FROM renomear);

DELETE FROM public.documentacoes
WHERE tipo = 'extrato_bancario';

-- 3) Storage: policies do bucket 'documentos-leads'.
-- Regra por prefixo {lead_id}/... reaproveitando pode_acessar_lead().
DROP POLICY IF EXISTS "docs_leads_storage_select" ON storage.objects;
CREATE POLICY "docs_leads_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-leads'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_leads_storage_insert" ON storage.objects;
CREATE POLICY "docs_leads_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-leads'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_leads_storage_update" ON storage.objects;
CREATE POLICY "docs_leads_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos-leads'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_leads_storage_delete" ON storage.objects;
CREATE POLICY "docs_leads_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-leads'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_leads_bot_storage_read" ON storage.objects;
CREATE POLICY "docs_leads_bot_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-leads'
    AND public.is_service_bot(auth.uid())
  );
