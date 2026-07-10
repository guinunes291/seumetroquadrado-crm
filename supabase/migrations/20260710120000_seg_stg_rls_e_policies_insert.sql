-- =====================================================================
-- Auditoria julho/2026 — Etapa 1 (segurança de banco)
-- C2: habilita RLS nas tabelas de staging (PII crua sem proteção).
-- C3: restringe o INSERT de vendas e analises_credito (estava aberto a
--     qualquer autenticado, permitindo fabricar venda/análise para
--     outro corretor — inflando comissão, ranking e elegibilidade de
--     roleta).
-- Idempotente: pode ser reaplicada sem erro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- C2 — staging com PII: RLS ligado + acesso removido de anon/authenticated.
-- service_role (usado pelo importador) continua ignorando RLS.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stg_leads', 'stg_agendamentos', 'stg_visitas', 'stg_analises'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- Sem policies + RLS ligado = 0 linhas para anon/authenticated.
      -- O REVOKE é defesa extra (fecha o acesso via PostgREST). service_role
      -- (usado pelo importador) tem BYPASSRLS, então o import segue funcionando.
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- C3 — vendas: um único INSERT restrito. Remove a policy aberta
-- ("vendas_insert_auth", WITH CHECK auth.uid() IS NOT NULL) e a variante
-- antiga, garantindo que não sobre nenhuma policy permissiva por OR.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.vendas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "vendas_insert_auth" ON public.vendas';
    EXECUTE 'DROP POLICY IF EXISTS "vendas_insert" ON public.vendas';
    EXECUTE 'DROP POLICY IF EXISTS "vendas_insert_own_or_gestor" ON public.vendas';
    EXECUTE $pol$
      CREATE POLICY "vendas_insert_own_or_gestor" ON public.vendas
      FOR INSERT TO authenticated
      WITH CHECK (
        criado_por_id = auth.uid()
        AND (
          corretor_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'gestor')
          OR public.has_role(auth.uid(), 'superintendente')
        )
      )
    $pol$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- C3 — analises_credito: mesmo endurecimento. A tabela não tem
-- criado_por_id, então o vínculo é por corretor_id.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.analises_credito') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "analises_insert_auth" ON public.analises_credito';
    EXECUTE 'DROP POLICY IF EXISTS "analises_insert" ON public.analises_credito';
    EXECUTE 'DROP POLICY IF EXISTS "analises_insert_own_or_gestor" ON public.analises_credito';
    EXECUTE $pol$
      CREATE POLICY "analises_insert_own_or_gestor" ON public.analises_credito
      FOR INSERT TO authenticated
      WITH CHECK (
        corretor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gestor')
        OR public.has_role(auth.uid(), 'superintendente')
      )
    $pol$;
  END IF;
END $$;
