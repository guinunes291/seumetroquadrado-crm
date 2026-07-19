
-- 1) Bot de serviço substitui UUIDs hardcoded nas policies
CREATE TABLE IF NOT EXISTS public.service_bots (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_bots TO authenticated;
GRANT ALL ON public.service_bots TO service_role;
ALTER TABLE public.service_bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins gerenciam bots" ON public.service_bots;
CREATE POLICY "admins gerenciam bots" ON public.service_bots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.is_service_bot(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT EXISTS(SELECT 1 FROM public.service_bots WHERE user_id = _uid) $$;
REVOKE ALL ON FUNCTION public.is_service_bot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_bot(uuid) TO authenticated, service_role;

-- Seed do bot legado: o UUID é de um usuário real de produção; em ambiente
-- limpo (replay) o usuário não existe e o seed é um no-op.
INSERT INTO public.service_bots(user_id, descricao)
SELECT '03c77162-cacc-4708-93b5-40ab5389f4e4','Bot legado de leitura de leads e documentacao'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '03c77162-cacc-4708-93b5-40ab5389f4e4')
ON CONFLICT (user_id) DO NOTHING;

-- 2) Trocar policies com UUID fixo por checagem de bot de servico
DROP POLICY IF EXISTS "leads_bot_select_all" ON public.leads;
CREATE POLICY "leads_bot_select_all" ON public.leads FOR SELECT TO authenticated
  USING (public.is_service_bot(auth.uid()));

DROP POLICY IF EXISTS "docs_bot_select_all" ON public.documentacoes;
CREATE POLICY "docs_bot_select_all" ON public.documentacoes FOR SELECT TO authenticated
  USING (public.is_service_bot(auth.uid()));

DROP POLICY IF EXISTS "docs_bot_storage_read" ON storage.objects;
CREATE POLICY "docs_bot_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentacao' AND public.is_service_bot(auth.uid()));

-- 3) Restringir SELECT em distribuicao_config e fila_distribuicao a gestao/dono
DROP POLICY IF EXISTS "Todos autenticados podem ler config" ON public.distribuicao_config;
CREATE POLICY "Gestao le distribuicao_config" ON public.distribuicao_config FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'gestor'::public.app_role)
    OR public.has_role(auth.uid(),'superintendente'::public.app_role)
  );

DROP POLICY IF EXISTS "Todos autenticados veem a fila" ON public.fila_distribuicao;
CREATE POLICY "Gestao ou dono le fila_distribuicao" ON public.fila_distribuicao FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'gestor'::public.app_role)
    OR public.has_role(auth.uid(),'superintendente'::public.app_role)
  );

-- 4) Policies CRUD do bucket privado 'documentacao' ligadas ao escopo do lead
--    (o object_path começa com o lead_id: '{lead_id}/...'; ignora entradas com nome invalido)
DROP POLICY IF EXISTS "docs_storage_select_carteira" ON storage.objects;
CREATE POLICY "docs_storage_select_carteira" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentacao'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_storage_insert_carteira" ON storage.objects;
CREATE POLICY "docs_storage_insert_carteira" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentacao'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_storage_update_carteira" ON storage.objects;
CREATE POLICY "docs_storage_update_carteira" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentacao'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'documentacao'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "docs_storage_delete_carteira" ON storage.objects;
CREATE POLICY "docs_storage_delete_carteira" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentacao'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.pode_acessar_lead(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
