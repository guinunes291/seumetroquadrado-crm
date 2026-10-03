-- ============================================================================
-- Comissão por tier: fim do EXECUTE para anon
-- ============================================================================
-- As funções da comissão por tier (drizzle/migrations/0015, criada no chat do
-- Lovable em 28/09) são SECURITY DEFINER e nasceram sem REVOKE — PUBLIC, e
-- portanto `anon` (a chamada SEM login à API), executa todas. Nenhuma confere
-- quem chama. Reproduzido como anon no harness, com um corretor de 4 vendas
-- aprovadas no trimestre:
--
--   corretor_vendas_trimestre(<corretor>, hoje, 0)  → 4
--   comissao_sugerida_corretor(<lead>, <corretor>)  → tier_1 | lead_empresa | 40.00 | 0
--   lead_esteira_comissao(<lead>)                   → lead_empresa
--
-- ou seja: vendas por corretor, tier e percentual de comissão de qualquer
-- corretor para quem tiver o id. ranking_tiers_corretores devolve vazio para
-- anon (filtra por auth.uid()), mas executava; leads_funil_registros_v1 recusa
-- uid nulo no corpo — perde o grant mesmo assim, como no 20261009120400: a
-- porta fica fechada na permissão, não só numa linha do corpo.
--
-- Regra (a mesma do 20261009120400): sai PUBLIC e anon; authenticated e
-- service_role ficam. Quem chama hoje: painel do gestor (vendas_total_empresa,
-- já fechada na 0013), Comissões › Tiers (ranking_tiers_corretores), sugestão
-- de comissão (comissao_sugerida_corretor) e o funil da lista de leads — todas
-- telas logadas. O trigger de vendas roda como dono e não depende de grant.
--
-- Idempotente. Espelhada em drizzle/migrations/0052 (vai para produção).
-- ============================================================================

DO $revoga$
DECLARE
  _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.comissao_sugerida_corretor(uuid,uuid,date)',
    'public.corretor_tier(uuid,date)',
    'public.corretor_vendas_trimestre(uuid,date,integer)',
    'public.lead_esteira_comissao(uuid)',
    'public.ranking_tiers_corretores()',
    'public.leads_funil_registros_v1(boolean,text,text,text,timestamptz,timestamptz,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', _fn::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _fn::regprocedure);
  END LOOP;
END;
$revoga$;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.comissao_sugerida_corretor(uuid,uuid,date)',
    'public.corretor_tier(uuid,date)',
    'public.corretor_vendas_trimestre(uuid,date,integer)',
    'public.lead_esteira_comissao(uuid)',
    'public.ranking_tiers_corretores()',
    'public.leads_funil_registros_v1(boolean,text,text,text,timestamptz,timestamptz,text,text)'
  ] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'tier anon: % continua executável por anon', _fn;
    END IF;
    IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'tier anon: authenticated perdeu o EXECUTE de %', _fn;
    END IF;
  END LOOP;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
