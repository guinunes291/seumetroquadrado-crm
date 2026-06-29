-- Documentação — armazenamento de arquivos (Supabase Storage).
-- Cria um bucket PRIVADO para os documentos da pasta do cliente. O acesso é
-- restrito à equipe autenticada; os arquivos nunca são públicos — a UI os abre
-- por signed URLs temporárias. Idempotente (pode rodar mais de uma vez).

insert into storage.buckets (id, name, public)
values ('documentacao', 'documentacao', false)
on conflict (id) do nothing;

-- Políticas de objeto, escopadas só ao bucket 'documentacao'. Como todos os
-- usuários do CRM são da equipe (corretores/gestores), o acesso é por usuário
-- autenticado; a linha em public.documentacoes (com seu próprio RLS) é quem
-- governa quem vê qual documento na aplicação.
drop policy if exists "documentacao_objects_select" on storage.objects;
create policy "documentacao_objects_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentacao');

drop policy if exists "documentacao_objects_insert" on storage.objects;
create policy "documentacao_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentacao');

drop policy if exists "documentacao_objects_update" on storage.objects;
create policy "documentacao_objects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentacao')
  with check (bucket_id = 'documentacao');

drop policy if exists "documentacao_objects_delete" on storage.objects;
create policy "documentacao_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentacao');
