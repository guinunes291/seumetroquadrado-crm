-- Camada de Gestão (Fase A3): normalização de leads.faixa_mcmv.
--
-- A coluna é texto livre em produção ("Faixa 2", "F2", "faixa2", "2"...).
-- Em vez de UPDATE em massa ou CHECK agora (arriscado sem inventário dos
-- valores reais), as views normalizam na leitura via esta função. Um CHECK
-- NOT VALID pode ser adicionado depois do diagnóstico em produção.

CREATE OR REPLACE FUNCTION public.faixa_mcmv_norm(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN _v IS NULL OR btrim(_v) = '' THEN NULL
    -- Extrai o primeiro dígito 1-4 de variantes como "Faixa 2", "F2", "faixa_2".
    WHEN substring(lower(btrim(_v)) FROM '[1-4]') IS NOT NULL
      THEN 'faixa_' || substring(lower(btrim(_v)) FROM '[1-4]')
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.faixa_mcmv_norm(text) IS
  'Normaliza faixa MCMV livre para faixa_1..faixa_4; sem correspondência clara devolve NULL (a UI mostra "sem dado", nunca inventa faixa).';

GRANT EXECUTE ON FUNCTION public.faixa_mcmv_norm(text) TO authenticated, service_role;
