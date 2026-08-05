-- =====================================================================
-- Construtoras parceiras em foco
--
-- "Projeto em foco" (projeto_foco) marca UM empreendimento numa campanha.
-- O que faltava era o nível de cima: quais CONSTRUTORAS a operação prioriza
-- — as que o corretor abre todo dia atrás de book e tabela. Sem isso, a
-- bancada trata Cury e uma construtora com um projeto avulso como iguais.
--
-- A lista vive no banco (e não numa constante do código) porque parceria é
-- fato comercial: entra e sai construtora sem release. `ordem` é a ordem de
-- leitura na tela, definida pela gestão, não alfabética nem por volume.
--
-- O casamento com projetos.construtora é POR NOME NORMALIZADO no app
-- (sem acento, minúsculo, por continência) — a coluna é texto livre e vem
-- de planilha de importação, então "Cury", "Cury Construtora" e
-- "CURY CONSTRUTORA S.A." precisam cair na mesma parceira.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.construtoras_parceiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  -- Ordem de exibição na bancada. Menor primeiro; empate cai no nome.
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unicidade pelo nome NORMALIZADO: impede cadastrar "Riva" e "riva " como
-- duas parceiras (a tela casaria as duas com os mesmos projetos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_construtoras_parceiras_nome
  ON public.construtoras_parceiras (lower(btrim(nome)));

CREATE INDEX IF NOT EXISTS idx_construtoras_parceiras_ordem
  ON public.construtoras_parceiras (ordem, nome);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.construtoras_parceiras TO authenticated;
GRANT ALL ON public.construtoras_parceiras TO service_role;

ALTER TABLE public.construtoras_parceiras ENABLE ROW LEVEL SECURITY;

-- Leitura é de todo o time: o corretor precisa saber quem são as parceiras.
-- Parceira inativa fica visível só para quem administra a lista.
CREATE POLICY "Autenticados leem parceiras ativas"
ON public.construtoras_parceiras FOR SELECT TO authenticated
USING (ativo OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins inserem parceiras"
ON public.construtoras_parceiras FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins atualizam parceiras"
ON public.construtoras_parceiras FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Gestores/admins excluem parceiras"
ON public.construtoras_parceiras FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_construtoras_parceiras_updated_at
BEFORE UPDATE ON public.construtoras_parceiras
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.construtoras_parceiras IS
  'Construtoras que a operação prioriza na bancada /projetos-foco. Casamento com projetos.construtora por nome normalizado no app.';
COMMENT ON COLUMN public.construtoras_parceiras.ordem IS
  'Ordem de leitura na tela, definida pela gestão (menor primeiro). Não é alfabética nem por volume de projeto.';

-- ---------------------------------------------------------------------
-- Seed: as parceiras de agosto/2026, na ordem de prioridade da operação.
-- ON CONFLICT DO NOTHING para o replay de migrations e para não sobrescrever
-- a ordem que a gestão já tiver ajustado na tela.
-- ---------------------------------------------------------------------
INSERT INTO public.construtoras_parceiras (nome, ordem) VALUES
  ('Mundo Apto', 10),
  ('Longitude',  20),
  ('Vibra',      30),
  ('Cury',       40),
  ('Direcional', 50),
  ('Riva',       60)
ON CONFLICT DO NOTHING;
