-- Higiene operacional da página de Leads (docs/revisao-pagina-leads.md):
--
-- 1) `import_batch_id` em leads — toda importação de planilha passa a carimbar
--    o lote; permite auditar ("de onde veio este lead?") e reverter uma
--    importação inteira no futuro. Nullable de propósito: leads antigos e
--    canais que não são import ficam NULL.
--
-- 2) Desativa as contas de TESTE com e-mail descartável que poluem os selects
--    de corretor (filtro, transferência) e seriam elegíveis na roleta se
--    marcadas presentes. Lista fechada por e-mail exato — nada de heurística.
--    (`docs-bot@seumetroquadrado.com.br` fica ativo de propósito: é conta de
--    serviço do fluxo de documentação.)

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_leads_import_batch
  ON public.leads (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

UPDATE public.profiles
SET ativo = false
WHERE ativo = true
  AND email IN (
    'jimmy8727@uorak.com',     -- "Edson teste junior"
    'wotive3034@dysonc.com',   -- "Leticia amaral braga" (teste)
    'micaela5065@uorak.com',   -- "Leticia amaral braga" (teste)
    'gekneyalma@tozya.com',    -- "Meu metro De Login"
    'giped90616@ezimb.com'     -- "Meu metro De Login"
  );

NOTIFY pgrst, 'reload schema';
