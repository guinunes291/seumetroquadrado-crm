-- =====================================================================
-- Prateleira de Empreendimentos — fundação de dados (2026-09-02)
-- docs/revisao-projetos-foco.md, §4 (decisões 2, 13, 14, 20, 25, 28)
--
-- A bancada /projetos-foco vira uma prateleira: o corretor precisa ver o
-- produto certo, com número certo, e a gestão precisa medir o que a prateleira
-- produz. Esta migration entrega o que o front não consegue sozinho:
--
--   1. projeto_eventos — o que o corretor faz com o produto (abre book/tabela,
--      copia resumo, envia ao lead, põe na sacola, reporta erro). É a fonte das
--      métricas da decisão 28 e do sinal "mais enviados".
--   2. projetos_demanda_v1 — agregados por projeto (leads 30d, vendas, envios)
--      para todo autenticado, SEM expor linha de lead ou venda (SECURITY
--      DEFINER devolve só contagens).
--   3. projeto_foco.arte_url — arte própria do banner de campanha (decisão 14).
--   4. construtoras_parceiras.logo_url — logo no corredor da parceira (13).
--   5. preco_atualizado_em / tabela_atualizada_em — carimbo mantido por trigger
--      para o badge "Preço ou tabela atualizada" (decisão 20) não depender do
--      updated_at genérico, que muda com qualquer edição.
--   6. Correção da metragem com vírgula perdida (decisão 2) — com backup.
--
-- Tudo aditivo e idempotente. O front consome cada objeto novo com fallback:
-- sem esta migration aplicada, a prateleira abre sem demanda, sem eventos, sem
-- arte e sem badge de atualização — e nunca quebra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Eventos da prateleira
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projeto_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'book_abrir', 'tabela_abrir', 'resumo_copiar', 'enviar_lead',
    'sacola_add', 'ficha_abrir', 'reportar_erro'
  )),
  -- De onde veio o gesto: prateleira, vitrine, ficha… (texto livre curto).
  origem text NOT NULL DEFAULT 'prateleira' CHECK (char_length(origem) <= 40),
  -- Complemento opcional (o texto do "reportar erro", por exemplo).
  detalhe text CHECK (detalhe IS NULL OR char_length(detalhe) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projeto_eventos_projeto
  ON public.projeto_eventos (projeto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projeto_eventos_user
  ON public.projeto_eventos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projeto_eventos_tipo
  ON public.projeto_eventos (tipo, created_at DESC);

GRANT SELECT, INSERT ON public.projeto_eventos TO authenticated;
GRANT ALL ON public.projeto_eventos TO service_role;

ALTER TABLE public.projeto_eventos ENABLE ROW LEVEL SECURITY;

-- Cada um registra só o próprio gesto; a leitura de linha é do dono e da
-- gestão. Agregados para todos saem pela RPC abaixo.
DROP POLICY IF EXISTS "Autenticados registram os proprios eventos" ON public.projeto_eventos;
CREATE POLICY "Autenticados registram os proprios eventos"
ON public.projeto_eventos FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Dono e gestao leem eventos" ON public.projeto_eventos;
CREATE POLICY "Dono e gestao leem eventos"
ON public.projeto_eventos FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
);

COMMENT ON TABLE public.projeto_eventos IS
  'Gestos do corretor sobre um empreendimento (book, tabela, resumo, envio ao lead, sacola, reporte de erro). Fonte das métricas da prateleira.';

-- Leads por projeto são contados o tempo todo; a coluna não tinha índice.
CREATE INDEX IF NOT EXISTS idx_leads_projeto_id
  ON public.leads (projeto_id) WHERE projeto_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Demanda agregada por projeto — só contagens, para todo autenticado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.projetos_demanda_v1()
RETURNS TABLE (
  projeto_id uuid,
  leads_30d integer,
  leads_total integer,
  vendas_total integer,
  envios_7d integer,
  envios_30d integer,
  ultimo_envio timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH l AS (
    SELECT projeto_id,
           count(*) FILTER (WHERE created_at > now() - interval '30 days') AS l30,
           count(*) AS lt
    FROM public.leads
    WHERE projeto_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY projeto_id
  ),
  v AS (
    SELECT projeto_id, count(*) AS vt
    FROM public.vendas
    WHERE projeto_id IS NOT NULL AND status_venda IN ('pendente', 'aprovada')
    GROUP BY projeto_id
  ),
  e AS (
    SELECT projeto_id,
           count(*) FILTER (WHERE created_at > now() - interval '7 days') AS e7,
           count(*) FILTER (WHERE created_at > now() - interval '30 days') AS e30,
           max(created_at) AS ultimo
    FROM public.projeto_eventos
    WHERE tipo = 'enviar_lead'
    GROUP BY projeto_id
  )
  SELECT p.id,
         coalesce(l.l30, 0)::int,
         coalesce(l.lt, 0)::int,
         coalesce(v.vt, 0)::int,
         coalesce(e.e7, 0)::int,
         coalesce(e.e30, 0)::int,
         e.ultimo
  FROM public.projetos p
  LEFT JOIN l ON l.projeto_id = p.id
  LEFT JOIN v ON v.projeto_id = p.id
  LEFT JOIN e ON e.projeto_id = p.id
  WHERE p.deleted_at IS NULL
    AND p.ativo = true
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.projetos_demanda_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.projetos_demanda_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.projetos_demanda_v1() IS
  'Contagens por projeto ativo (leads 30d/total, vendas pendentes+aprovadas, envios 7d/30d). Sem PII: só agregados, para a prova social interna da prateleira.';

-- ---------------------------------------------------------------------
-- 3) Arte do banner de campanha
-- ---------------------------------------------------------------------
ALTER TABLE public.projeto_foco ADD COLUMN IF NOT EXISTS arte_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projeto_foco'::regclass
      AND conname = 'projeto_foco_arte_url_tamanho_ck'
  ) THEN
    ALTER TABLE public.projeto_foco ADD CONSTRAINT projeto_foco_arte_url_tamanho_ck
      CHECK (arte_url IS NULL OR char_length(arte_url) <= 2048);
  END IF;
END;
$$;

COMMENT ON COLUMN public.projeto_foco.arte_url IS
  'Arte própria do banner da campanha (HTTPS). Sem arte, a prateleira usa a capa do projeto.';

-- ---------------------------------------------------------------------
-- 4) Logo da construtora parceira
-- ---------------------------------------------------------------------
ALTER TABLE public.construtoras_parceiras ADD COLUMN IF NOT EXISTS logo_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.construtoras_parceiras'::regclass
      AND conname = 'construtoras_parceiras_logo_url_tamanho_ck'
  ) THEN
    ALTER TABLE public.construtoras_parceiras ADD CONSTRAINT construtoras_parceiras_logo_url_tamanho_ck
      CHECK (logo_url IS NULL OR char_length(logo_url) <= 2048);
  END IF;
END;
$$;

COMMENT ON COLUMN public.construtoras_parceiras.logo_url IS
  'Logo da construtora (HTTPS) para o corredor e o card da prateleira. Sem logo, a UI usa a inicial.';

-- ---------------------------------------------------------------------
-- 5) Carimbos de atualização de preço e tabela (badge "atualizado")
-- ---------------------------------------------------------------------
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS preco_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS tabela_atualizada_em timestamptz;

CREATE OR REPLACE FUNCTION public.tg_projetos_marca_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.preco_a_partir IS DISTINCT FROM OLD.preco_a_partir
       OR NEW.sob_consulta IS DISTINCT FROM OLD.sob_consulta THEN
      NEW.preco_atualizado_em := now();
    END IF;
    IF NEW.tabela_precos_url IS DISTINCT FROM OLD.tabela_precos_url THEN
      NEW.tabela_atualizada_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projetos_marca_atualizacao ON public.projetos;
CREATE TRIGGER trg_projetos_marca_atualizacao
BEFORE UPDATE ON public.projetos
FOR EACH ROW EXECUTE FUNCTION public.tg_projetos_marca_atualizacao();

COMMENT ON COLUMN public.projetos.preco_atualizado_em IS
  'Última mudança de preco_a_partir/sob_consulta (trigger). Alimenta o badge "Preço atualizado".';
COMMENT ON COLUMN public.projetos.tabela_atualizada_em IS
  'Última mudança de tabela_precos_url (trigger). Alimenta o badge "Tabela atualizada".';

-- ---------------------------------------------------------------------
-- 6) Metragem com vírgula perdida — correção com backup
--
-- Regra aprovada (decisão 2): valor acima de 150 m² em projeto abaixo de
-- R$ 600 mil (ou sem preço) é dividido por 10, desde que o resultado caia
-- entre 12 e 250 m² e a faixa não fique invertida. Idempotente: depois de
-- corrigido (≤ 150) a condição não dispara mais. Espelha saneiaMetragem em
-- src/lib/projetos-saneamento.ts.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projetos_metragem_backup_20260902 (
  projeto_id uuid PRIMARY KEY REFERENCES public.projetos(id) ON DELETE CASCADE,
  metragem_min numeric,
  metragem_max numeric,
  preco_a_partir numeric,
  corrigido_em timestamptz NOT NULL DEFAULT now()
);
-- Sem policy: só service_role lê (é histórico para reverter, não dado de tela).
ALTER TABLE public.projetos_metragem_backup_20260902 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.projetos_metragem_backup_20260902 TO service_role;

WITH candidatos AS (
  SELECT p.id, p.metragem_min, p.metragem_max, p.preco_a_partir,
         CASE WHEN p.metragem_min > 150 THEN round(p.metragem_min / 10.0, 1) ELSE p.metragem_min END AS novo_min,
         CASE WHEN p.metragem_max > 150 THEN round(p.metragem_max / 10.0, 1) ELSE p.metragem_max END AS novo_max
  FROM public.projetos p
  WHERE p.deleted_at IS NULL
    AND (p.preco_a_partir IS NULL OR p.preco_a_partir < 600000)
    AND (coalesce(p.metragem_min, 0) > 150 OR coalesce(p.metragem_max, 0) > 150)
),
validos AS (
  SELECT * FROM candidatos
  WHERE (novo_min IS NULL OR novo_min BETWEEN 12 AND 250)
    AND (novo_max IS NULL OR novo_max BETWEEN 12 AND 250)
    AND (novo_min IS NULL OR novo_max IS NULL OR novo_min <= novo_max)
),
backup AS (
  INSERT INTO public.projetos_metragem_backup_20260902 (projeto_id, metragem_min, metragem_max, preco_a_partir)
  SELECT id, metragem_min, metragem_max, preco_a_partir FROM validos
  ON CONFLICT (projeto_id) DO NOTHING
  RETURNING projeto_id
)
UPDATE public.projetos p
SET metragem_min = v.novo_min,
    metragem_max = v.novo_max
FROM validos v
WHERE p.id = v.id;

COMMENT ON TABLE public.projetos_metragem_backup_20260902 IS
  'Valores originais de metragem antes da correção de vírgula perdida (2026-09-02). Para reverter: UPDATE projetos SET metragem_min/max FROM este backup.';
