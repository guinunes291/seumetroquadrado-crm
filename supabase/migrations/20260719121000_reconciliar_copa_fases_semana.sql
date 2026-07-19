-- =====================================================================
-- Auditoria 2026-07-19 — reconciliação de replay (Copa).
-- Em produção copa_fases.semana_inicio/semana_fim são INTEGER (confirmado
-- pelo types.ts gerado do banco vivo em 2026-07-18), mas a cadeia de
-- migrations termina com TEXT (a 20260615200000 alterou para text e nenhum
-- arquivo posterior desfez — histórico reescrito). O app trata as semanas
-- como número (src/features/ranking/copa-page.tsx, src/lib/copa.ts).
-- Converge o replay para o estado real de produção; em produção é no-op.
-- =====================================================================
-- Nota: patches do histórico reescrito chegaram a gravar datas ("03/06") no
-- campo texto — valor que jamais existiu em produção (coluna int). Strings
-- não numéricas caem para a ordem da fase (só acontece em replay).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'copa_fases'
      AND column_name = 'semana_inicio' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.copa_fases
      ALTER COLUMN semana_inicio TYPE integer
      USING CASE WHEN semana_inicio ~ '^\d+$' THEN semana_inicio::integer ELSE ordem END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'copa_fases'
      AND column_name = 'semana_fim' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.copa_fases
      ALTER COLUMN semana_fim TYPE integer
      USING CASE WHEN semana_fim ~ '^\d+$' THEN semana_fim::integer ELSE ordem END;
  END IF;
END $$;
