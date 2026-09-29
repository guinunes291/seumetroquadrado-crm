-- ===========================================================================
-- ACADEMIA SMQ · mínimo de 3 colegas para existir comparação
-- Decisão do dono em 29/09/2026. O antes/depois da calibração mostrou o R04
-- comparando 1 corretor com 1 colega só ("1 de 2") e o R08 sem colega nenhum.
-- A referência de cada corretor passa a exigir pelo menos 3 colegas com a
-- amostra mínima da regra; abaixo disso fica nula e a regra não recomenda.
-- Volta sozinha quando mais gente atingir a amostra.
--
-- Só troca o corpo de academia_calcular_indicadores. CREATE OR REPLACE mantém
-- dono e permissões. Idempotente.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.academia_calcular_indicadores(_data_ref date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ref   date := COALESCE(_data_ref, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_fim   timestamptz := LEAST(now(), ((v_ref + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'));
  r       record;
  v_n     integer;
  v_total integer := 0;
BEGIN
  -- Sem sessão (pg_cron, service_role) roda; com sessão, só admin.
  IF auth.uid() IS NOT NULL AND NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM public.academia_regras_recomendacao WHERE ativa ORDER BY codigo LOOP
    -- Mediana do time = empresa inteira SEM o próprio corretor, só entre quem
    -- tem amostra mínima (decisão do dono na Fatia 0). Com menos de 3 colegas
    -- nessa condição não há referência (decisão do dono, 29/09/2026): a
    -- "mediana" de 1 ou 2 pessoas é duelo, não régua. Referência nula, o
    -- gerador de recomendações não dispara.
    WITH v AS MATERIALIZED (
      SELECT * FROM public._academia_indicador(r.indicador,
                      v_fim - make_interval(days => r.janela_dias), v_fim)
    )
    INSERT INTO public.academia_indicadores
      (corretor_id, indicador, data_ref, janela_dias, valor, amostra, referencia_time, calculado_em)
    SELECT p.corretor_id, r.indicador, v_ref, r.janela_dias,
           meu.o_valor, COALESCE(meu.o_amostra, 0),
           (SELECT CASE WHEN count(*) >= 3
                        THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY o.o_valor)
                   END
              FROM v o
             WHERE o.o_corretor <> p.corretor_id
               AND o.o_amostra >= r.amostra_minima
               AND o.o_valor IS NOT NULL),
           now()
      FROM public.academia_participantes p
      LEFT JOIN v meu ON meu.o_corretor = p.corretor_id
     WHERE p.participa
    ON CONFLICT (corretor_id, indicador, data_ref) DO UPDATE
      SET janela_dias     = excluded.janela_dias,
          valor           = excluded.valor,
          amostra         = excluded.amostra,
          referencia_time = excluded.referencia_time,
          calculado_em    = excluded.calculado_em;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END $$;

COMMENT ON FUNCTION public.academia_calcular_indicadores(date) IS
  'Academia: grava academia_indicadores do dia para cada participante e regra ativa. Referência = mediana dos colegas com amostra mínima, exigindo pelo menos 3. Só lê o funil.';

NOTIFY pgrst, 'reload schema';
