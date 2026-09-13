-- =====================================================================
-- Portal do Empreendimento — materiais de venda estruturados (2026-09-13)
-- docs/portal-empreendimento.md
--
-- A ficha do empreendimento (/projetos/$projetoId) vira a página de produto
-- do corretor, no espírito dos portais de construtora (book, tabela, plantas,
-- vídeo, tour, memorial, artes — tudo num lugar só). Hoje o projeto guarda
-- UM book e UMA tabela (projetos.book_url / tabela_precos_url) e o resto se
-- perde em pastas do Drive e grupos de WhatsApp.
--
-- Esta migration entrega:
--
--   1. projeto_materiais — N materiais por projeto, tipados (book, tabela,
--      planta, video, tour, memorial, apresentacao, arte, outro), com título,
--      URL, descrição curta e ordem definida pela gestão. As colunas antigas
--      de book/tabela CONTINUAM valendo (Materiais em massa e a prateleira
--      leem delas); o app funde as duas fontes na leitura e nunca duplica.
--   2. projeto_eventos.tipo ganha 'material_abrir' — o corretor abriu uma
--      planta/vídeo/tour pela ficha. Book e tabela seguem com os tipos
--      próprios (book_abrir/tabela_abrir), para as métricas da prateleira
--      não mudarem de significado.
--
-- Tudo aditivo e idempotente. Sem esta migration aplicada, a ficha abre com
-- book e tabela das colunas antigas e esconde a gestão de materiais.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Materiais de venda por projeto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projeto_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  -- Tipo fechado: a página agrupa e ordena por ele, e o card da prateleira
  -- decide o ícone. Novo tipo = nova migration + rótulo em lib/projeto-materiais.
  tipo text NOT NULL CHECK (tipo IN (
    'book', 'tabela', 'planta', 'video', 'tour', 'memorial', 'apresentacao', 'arte', 'outro'
  )),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  -- Só http(s): o corretor abre no navegador; caminho de rede ou "ftp" não serve.
  url text NOT NULL CHECK (url ~* '^https?://' AND char_length(url) <= 2048),
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 300),
  -- Ordem de leitura dentro do tipo, definida pela gestão (menor primeiro).
  ordem integer NOT NULL DEFAULT 0,
  -- Inativo = fora da ficha do corretor, mas preservado para a gestão
  -- (tabela vencida que volta na próxima campanha, por exemplo).
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projeto_materiais_projeto
  ON public.projeto_materiais (projeto_id, ativo, tipo, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_materiais TO authenticated;
GRANT ALL ON public.projeto_materiais TO service_role;

ALTER TABLE public.projeto_materiais ENABLE ROW LEVEL SECURITY;

-- Leitura é de todo o time: material de venda é munição do corretor.
-- Material inativo fica visível só para quem administra a lista.
DROP POLICY IF EXISTS "Autenticados leem materiais ativos" ON public.projeto_materiais;
CREATE POLICY "Autenticados leem materiais ativos"
ON public.projeto_materiais FOR SELECT TO authenticated
USING (ativo OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- Escrita é de gestão (mesmo recorte do Materiais em massa: admin | gestor).
DROP POLICY IF EXISTS "Gestores/admins inserem materiais" ON public.projeto_materiais;
CREATE POLICY "Gestores/admins inserem materiais"
ON public.projeto_materiais FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS "Gestores/admins atualizam materiais" ON public.projeto_materiais;
CREATE POLICY "Gestores/admins atualizam materiais"
ON public.projeto_materiais FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS "Gestores/admins excluem materiais" ON public.projeto_materiais;
CREATE POLICY "Gestores/admins excluem materiais"
ON public.projeto_materiais FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

DROP TRIGGER IF EXISTS trg_projeto_materiais_updated_at ON public.projeto_materiais;
CREATE TRIGGER trg_projeto_materiais_updated_at
BEFORE UPDATE ON public.projeto_materiais
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.projeto_materiais IS
  'Materiais de venda do empreendimento (book, tabela, planta, vídeo, tour, memorial, apresentação, arte). Complementa projetos.book_url/tabela_precos_url; o app funde as duas fontes na ficha.';
COMMENT ON COLUMN public.projeto_materiais.tipo IS
  'book | tabela | planta | video | tour | memorial | apresentacao | arte | outro — agrupa e ordena a ficha; rótulos em src/lib/projeto-materiais.ts.';
COMMENT ON COLUMN public.projeto_materiais.ordem IS
  'Ordem de leitura dentro do tipo, definida pela gestão (menor primeiro).';

-- ---------------------------------------------------------------------
-- 2) projeto_eventos: o gesto "abriu um material" (planta, vídeo, tour…)
-- ---------------------------------------------------------------------
-- O CHECK nasceu inline na migration 20260902120000 (nome gerado
-- projeto_eventos_tipo_check). Recria com a lista estendida; procura pela
-- definição e não só pelo nome, para o replay do harness e um banco onde o
-- nome tenha divergido caírem no mesmo lugar.
DO $$
DECLARE
  c record;
BEGIN
  IF to_regclass('public.projeto_eventos') IS NULL THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.projeto_eventos'::regclass
      AND contype = 'c'
      AND (conname = 'projeto_eventos_tipo_check'
           OR pg_get_constraintdef(oid) LIKE '%tipo = ANY%')
  LOOP
    EXECUTE format('ALTER TABLE public.projeto_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.projeto_eventos
    ADD CONSTRAINT projeto_eventos_tipo_check CHECK (tipo IN (
      'book_abrir', 'tabela_abrir', 'resumo_copiar', 'enviar_lead',
      'sacola_add', 'ficha_abrir', 'reportar_erro', 'material_abrir'
    ));
END
$$;
