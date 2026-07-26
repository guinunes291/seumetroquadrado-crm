-- Camada de Gestão: faixa_mcmv_norm v2 + calibragem pós-diagnóstico (26/07).
--
-- O inventário de produção mostrou duas famílias de texto livre em
-- leads.faixa_mcmv:
--   a) faixa explícita: "F3", "Faixa 1 (até R$3.200)", "F2/F3"…
--   b) renda em R$: "R$4.700 a R$8.000", "até 2.800", "acima de R$13.000"…
-- A v1 extraía o primeiro dígito 1-4 de qualquer lugar — acertava (a) mas
-- errava (b): "R$4.700 a R$8.000" virava faixa_4 (é F3) e "~R$13.000"
-- virava faixa_1 (está fora do MCMV). A v2 prioriza a faixa explícita e,
-- sem ela, mapeia o MAIOR valor de renda citado pelos tetos MCMV 2026:
--   F1 ≤ 2.850 · F2 ≤ 4.700 · F3 ≤ 8.000 · F4 ≤ 12.000 · acima → NULL.
-- Ambíguo/sem valor → NULL (a UI mostra "sem dado", nunca inventa faixa).

CREATE OR REPLACE FUNCTION public.faixa_mcmv_norm(_v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  _t text := lower(btrim(coalesce(_v, '')));
  _fx text;
  _tok text;
  _num numeric;
  _max numeric := NULL;
BEGIN
  IF _t = '' THEN
    RETURN NULL;
  END IF;

  -- 1) Faixa explícita vence: "f2", "faixa 3", "faixa_1", "f2/f3" (primeira citada).
  _fx := substring(_t FROM 'f(?:aixa)?[[:space:]_-]*([1-4])');
  IF _fx IS NOT NULL THEN
    RETURN 'faixa_' || _fx;
  END IF;

  -- 2) Renda: maior valor citado = teto declarado.
  -- Sufixo k ("9k", "30k"; "2,8k" com separador decimal).
  FOR _tok IN
    SELECT (regexp_matches(_t, '([0-9]+(?:[.,][0-9]{1,2})?)[[:space:]]*k\y', 'g'))[1]
  LOOP
    _num := replace(_tok, ',', '.')::numeric * 1000;
    IF _num >= 500 THEN
      _max := greatest(coalesce(_max, 0), _num);
    END IF;
  END LOOP;

  -- Valores comuns: "2.800" (milhar), "20000", "4.700,50".
  FOR _tok IN
    SELECT (regexp_matches(_t, '([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?|[0-9]+(?:,[0-9]+)?)', 'g'))[1]
  LOOP
    _num := replace(replace(_tok, '.', ''), ',', '.')::numeric;
    -- < 500 é ruído (dígitos soltos), não renda.
    IF _num >= 500 THEN
      _max := greatest(coalesce(_max, 0), _num);
    END IF;
  END LOOP;

  IF _max IS NULL THEN
    RETURN NULL;
  END IF;

  -- "acima de X" = renda estritamente maior que X → classifica na banda seguinte.
  IF _t LIKE '%acima%' THEN
    _max := _max + 1;
  END IF;

  RETURN CASE
    WHEN _max <= 2850  THEN 'faixa_1'
    WHEN _max <= 4700  THEN 'faixa_2'
    WHEN _max <= 8000  THEN 'faixa_3'
    WHEN _max <= 12000 THEN 'faixa_4'
    ELSE NULL -- fora do MCMV (Pró-Cotista/SBPE) ou valor de imóvel, não renda
  END;
END;
$$;

COMMENT ON FUNCTION public.faixa_mcmv_norm(text) IS
  'Normaliza faixa MCMV livre: faixa explícita (F1..F4/"Faixa N", primeira citada) tem prioridade; sem ela, o MAIOR valor de renda citado é mapeado pelos tetos MCMV 2026 (F1≤2.850, F2≤4.700, F3≤8.000, F4≤12.000; "acima de X" cai na banda seguinte). Sem correspondência → NULL (a UI mostra "sem dado", nunca inventa faixa). Tetos precisam de revisão quando o CCFGTS atualizar as faixas.';

-- Calibragem pós-diagnóstico (26/07): o backfill de jun/2026 cobriu o import
-- legado — coortes de mar–jun/2026 têm ~100% de transições; o buraco é a
-- coorte de jul/2026 (novo import em massa, ~4,5%). Quem decide "sem dado
-- suficiente" é a cobertura POR COORTE na MV (automática); esta chave é
-- informativa.
UPDATE public.gestao_config
SET valor = '"2026-03-01"',
    descricao = 'Informativo (a decisão real é cobertura_transicoes_pct por coorte na MV): desde quando há histórico de transições confiável. Diagnóstico 26/07: mar–jun/2026 ~100%; jul/2026 só 4,5% (import em massa sem histórico).'
WHERE chave = 'coortes_confiaveis_desde';
