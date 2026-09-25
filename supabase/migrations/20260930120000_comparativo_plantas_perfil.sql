-- Comparativo de empreendimentos em PDF para o cliente (24/09/2026).
-- POR QUÊ: o "Comparar" da sacola/Vitrine era uma tabela de 6 linhas, sem foto,
-- sem planta e sem nada do cliente. O PDF novo precisa de (1) PLANTAS, que
-- vivem só dentro dos books (PDF no Drive) e (2) um PERFIL do cliente além de
-- renda/FGTS/entrada/zona para dizer por que cada projeto combina com ele.
-- O QUE MUDA:
--   • projetos.plantas (jsonb): páginas de planta recortadas do book e revisadas
--     por uma pessoa — [{url, legenda, pagina}], no máx. 12 (igual à galeria).
--   • bucket público "projetos-plantas": as imagens das plantas. Leitura pública
--     (vão no PDF que o cliente recebe, como a capa); escrita só admin, a mesma
--     regra da RLS de UPDATE em projetos.
--   • leads: dorms_desejados, precisa_vaga, prioridades, nota_perfil_cliente.
--     Todos opcionais — lead sem perfil continua gerando o PDF, sem a seção.
--   • projeto_eventos.tipo aceita 'comparativo_pdf'.
-- Rollback: drop das colunas novas + delete do bucket (sem dado derivado).

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS plantas jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_plantas_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_plantas_ck
      CHECK (jsonb_typeof(plantas) = 'array' AND jsonb_array_length(plantas) <= 12);
  END IF;
END;
$$;

COMMENT ON COLUMN public.projetos.plantas IS
  'Plantas extraídas do book e revisadas: [{url, legenda, pagina}], no máx. 12. Vão no comparativo em PDF do cliente.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dorms_desejados smallint,
  ADD COLUMN IF NOT EXISTS precisa_vaga boolean,
  ADD COLUMN IF NOT EXISTS prioridades text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS nota_perfil_cliente text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_dorms_desejados_ck'
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_dorms_desejados_ck
      CHECK (dorms_desejados IS NULL OR dorms_desejados BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_nota_perfil_cliente_ck'
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_nota_perfil_cliente_ck
      CHECK (nota_perfil_cliente IS NULL OR char_length(nota_perfil_cliente) <= 1200);
  END IF;
END;
$$;

COMMENT ON COLUMN public.leads.dorms_desejados IS 'Quartos que o cliente procura (4 = 4 ou mais).';
COMMENT ON COLUMN public.leads.precisa_vaga IS 'Cliente precisa de vaga de garagem. NULL = não perguntado.';
COMMENT ON COLUMN public.leads.prioridades IS 'Vocabulário fixo do front (lazer_completo, perto_metro, pet, ...).';
COMMENT ON COLUMN public.leads.nota_perfil_cliente IS 'Texto do corretor sobre o cliente; vai no comparativo em PDF.';

insert into storage.buckets (id, name, public)
values ('projetos-plantas', 'projetos-plantas', true)
on conflict (id) do nothing;

drop policy if exists "projetos_plantas_select" on storage.objects;
create policy "projetos_plantas_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'projetos-plantas');

drop policy if exists "projetos_plantas_insert" on storage.objects;
create policy "projetos_plantas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'projetos-plantas' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "projetos_plantas_update" on storage.objects;
create policy "projetos_plantas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'projetos-plantas' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'projetos-plantas' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "projetos_plantas_delete" on storage.objects;
create policy "projetos_plantas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'projetos-plantas' and public.has_role(auth.uid(), 'admin'));

-- Evento da prateleira para medir uso do comparativo (um por projeto do PDF).
DO $$
BEGIN
  IF to_regclass('public.projeto_eventos') IS NOT NULL THEN
    ALTER TABLE public.projeto_eventos DROP CONSTRAINT IF EXISTS projeto_eventos_tipo_check;
    ALTER TABLE public.projeto_eventos ADD CONSTRAINT projeto_eventos_tipo_check
      CHECK (tipo IN (
        'book_abrir', 'tabela_abrir', 'resumo_copiar', 'enviar_lead',
        'sacola_add', 'ficha_abrir', 'reportar_erro', 'comparativo_pdf'
      ));
  END IF;
END;
$$;
