-- ===========================================================================
-- app_flags — infraestrutura de feature flag do CRM.
--
-- POR QUE EXISTE: o repo não tinha NENHUMA infra de flag (nem tabela, nem
-- helper em src/lib). Toda tela nova só podia ser desligada com deploy, o que
-- num sistema no ar significa esperar build+publish para apagar um incêndio.
--
-- DESENHO: chave/valor booleano, leitura para qualquer autenticado (a UI
-- precisa ler a flag antes de renderizar) e escrita só para admin. Genérica de
-- propósito: a próxima tela usa a mesma tabela em vez de criar a sua.
--
-- NÃO é controle de acesso: quem pode VER cada tela continua sendo decidido
-- pelo papel (user_roles + guard da rota). A flag responde "esta tela está
-- ligada?", nunca "quem pode abri-la?".
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.app_flags (
  chave          text PRIMARY KEY,
  ativo          boolean NOT NULL DEFAULT false,
  descricao      text,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

COMMENT ON TABLE public.app_flags IS
  'Feature flags do CRM. Ligar/desligar tela sem deploy. Escrita só admin.';

ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer conta autenticada. A flag não é segredo — o segredo é o
-- papel, e esse continua em user_roles.
DROP POLICY IF EXISTS app_flags_select ON public.app_flags;
CREATE POLICY app_flags_select ON public.app_flags
  FOR SELECT TO authenticated USING (true);

-- Escrita: só admin. Sem policy de INSERT/DELETE de propósito — flag nova
-- nasce por migration, para que exista registro em código do que foi criado.
DROP POLICY IF EXISTS app_flags_update_admin ON public.app_flags;
CREATE POLICY app_flags_update_admin ON public.app_flags
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.app_flags TO authenticated;
GRANT UPDATE (ativo, atualizado_em, atualizado_por) ON public.app_flags TO authenticated;

-- Flag da tela Higiene do Funil. Nasce LIGADA: a tela da Fatia 1 é 100%
-- leitura (só SELECT em views) e já está atrás do guard de papel GESTAO.
-- Para desligar sem deploy:
--   UPDATE public.app_flags SET ativo = false, atualizado_em = now()
--    WHERE chave = 'higiene_funil';
INSERT INTO public.app_flags (chave, ativo, descricao)
VALUES ('higiene_funil', true,
        'Tela /higiene-funil (fila de leads parados e pastas travadas).')
ON CONFLICT (chave) DO NOTHING;
