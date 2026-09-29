-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 · estrutura para o formato canônico
-- ===========================================================================
-- O formato canônico de módulo (seção 8.2 do super prompt da Academia) tem
-- mais anatomia do que o schema da Fatia 1 guarda: subtítulo, competências,
-- indicador do CRM, desafio de campo, roteiro de vídeo, guia do gerente,
-- flashcards, pendências. Esta migration abre lugar para eles sem mexer no
-- que já funciona:
--
--   academia_modulos.extras   jsonb  o que não tem coluna própria no módulo
--   academia_aulas.codigo     text   chave estável do upsert (ex.: M15-A1)
--   academia_aulas.extras     jsonb  os 10 blocos da aula, estruturados; o
--                                    texto que a tela mostra continua em
--                                    conteudo_md
--   academia_questoes.codigo  text   chave estável do upsert (ex.: M15-Q01)
--   academia_questoes.tipo    text   situacional | aplicacao | conceito |
--                                    caca_ao_erro
--   academia_questoes.fonte   text   aula ou seção que embasa a questão
--   academia_flashcards              tabela nova (frente e verso por módulo)
--   academia_conteudo_gerente        tabela nova: guia do gerente e gabarito
--                                    da prática, fora do alcance do aluno
--
-- Os códigos são opcionais (NULL no conteúdo antigo, que é chaveado por
-- modulo_id + ordem). O índice único é parcial, então o conteúdo antigo não
-- precisa de backfill.
--
-- RLS de academia_flashcards: igual à de academia_aulas. Lê quem tem conta
-- ativa, com o cartão ativo e o módulo publicado. O admin lê tudo e é o único
-- que escreve.
--
-- Reversão (desligue as flags da Academia antes):
--   DROP TABLE public.academia_conteudo_gerente;
--   DROP TABLE public.academia_flashcards;
--   ALTER TABLE public.academia_questoes DROP COLUMN fonte, DROP COLUMN tipo,
--     DROP COLUMN codigo;
--   ALTER TABLE public.academia_aulas DROP COLUMN extras, DROP COLUMN codigo;
--   ALTER TABLE public.academia_modulos DROP COLUMN extras;
-- ===========================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas no conteúdo existente
-- ---------------------------------------------------------------------
ALTER TABLE public.academia_modulos
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.academia_modulos
  DROP CONSTRAINT IF EXISTS academia_modulos_extras_objeto_chk;
ALTER TABLE public.academia_modulos
  ADD CONSTRAINT academia_modulos_extras_objeto_chk CHECK (jsonb_typeof(extras) = 'object');

ALTER TABLE public.academia_aulas
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.academia_aulas
  DROP CONSTRAINT IF EXISTS academia_aulas_extras_objeto_chk;
ALTER TABLE public.academia_aulas
  ADD CONSTRAINT academia_aulas_extras_objeto_chk CHECK (jsonb_typeof(extras) = 'object');
CREATE UNIQUE INDEX IF NOT EXISTS academia_aulas_codigo_uq
  ON public.academia_aulas (codigo) WHERE codigo IS NOT NULL;

ALTER TABLE public.academia_questoes
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS tipo   text,
  ADD COLUMN IF NOT EXISTS fonte  text;
ALTER TABLE public.academia_questoes
  DROP CONSTRAINT IF EXISTS academia_questoes_tipo_chk;
ALTER TABLE public.academia_questoes
  ADD CONSTRAINT academia_questoes_tipo_chk
  CHECK (tipo IS NULL OR tipo IN ('situacional','aplicacao','conceito','caca_ao_erro'));
CREATE UNIQUE INDEX IF NOT EXISTS academia_questoes_codigo_uq
  ON public.academia_questoes (codigo) WHERE codigo IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Flashcards
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academia_flashcards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id     uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  codigo        text NOT NULL UNIQUE,
  ordem         smallint NOT NULL,
  frente        text NOT NULL,
  verso         text NOT NULL,
  ativa         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modulo_id, ordem)
);

ALTER TABLE public.academia_flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_flashcards_ler ON public.academia_flashcards;
CREATE POLICY academia_flashcards_ler ON public.academia_flashcards FOR SELECT TO authenticated
  USING ((ativa AND public.is_active_member(auth.uid())
          AND EXISTS (SELECT 1 FROM public.academia_modulos m
                       WHERE m.id = modulo_id AND m.status = 'publicado'))
         OR public.academia_eh_admin());
DROP POLICY IF EXISTS academia_flashcards_admin_ins ON public.academia_flashcards;
CREATE POLICY academia_flashcards_admin_ins ON public.academia_flashcards FOR INSERT TO authenticated
  WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_flashcards_admin_upd ON public.academia_flashcards;
CREATE POLICY academia_flashcards_admin_upd ON public.academia_flashcards FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_flashcards_admin_del ON public.academia_flashcards;
CREATE POLICY academia_flashcards_admin_del ON public.academia_flashcards FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

-- Conteúdo: authenticated recebe o GRANT de escrita, mas a RLS só deixa o
-- admin passar (mesmo padrão de academia_aulas na fundação).
REVOKE ALL ON public.academia_flashcards FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academia_flashcards TO authenticated;
GRANT ALL ON public.academia_flashcards TO service_role;

-- ---------------------------------------------------------------------
-- 3. Material do gerente (guia do gerente, gabarito da prática)
-- ---------------------------------------------------------------------
-- Separado de academia_modulos.extras porque academia_modulos é lida por todo
-- membro ativo quando publicada: o gabarito da prática iria junto. Mesmo
-- princípio do gabarito do quiz (academia_questoes, só admin), um degrau
-- abaixo: aqui a gestão lê, porque é quem aplica a prática e o 1:1.
CREATE TABLE IF NOT EXISTS public.academia_conteudo_gerente (
  modulo_id     uuid PRIMARY KEY REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  conteudo      jsonb NOT NULL DEFAULT '{}'::jsonb
                CONSTRAINT academia_conteudo_gerente_objeto_chk CHECK (jsonb_typeof(conteudo) = 'object'),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_conteudo_gerente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_conteudo_gerente_ler ON public.academia_conteudo_gerente;
CREATE POLICY academia_conteudo_gerente_ler ON public.academia_conteudo_gerente
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
DROP POLICY IF EXISTS academia_conteudo_gerente_admin_ins ON public.academia_conteudo_gerente;
CREATE POLICY academia_conteudo_gerente_admin_ins ON public.academia_conteudo_gerente
  FOR INSERT TO authenticated WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_conteudo_gerente_admin_upd ON public.academia_conteudo_gerente;
CREATE POLICY academia_conteudo_gerente_admin_upd ON public.academia_conteudo_gerente
  FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_conteudo_gerente_admin_del ON public.academia_conteudo_gerente;
CREATE POLICY academia_conteudo_gerente_admin_del ON public.academia_conteudo_gerente
  FOR DELETE TO authenticated USING (public.academia_eh_admin());

REVOKE ALL ON public.academia_conteudo_gerente FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academia_conteudo_gerente TO authenticated;
GRANT ALL ON public.academia_conteudo_gerente TO service_role;

-- ---------------------------------------------------------------------
-- 4. Guardas da casa (tabela nova) e recarga do schema do PostgREST
-- ---------------------------------------------------------------------
SELECT * FROM public.mcp_aplicar_guardas();

NOTIFY pgrst, 'reload schema';
