-- ============================================================================
-- Auditoria julho/2026 — 5 migrações consolidadas (ordem de aplicação).
-- Cole TUDO no SQL editor do Supabase e clique em Run. Todas são idempotentes
-- (podem ser reaplicadas sem erro). Fonte: supabase/migrations/2026071012*.sql
-- ============================================================================

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

-- =====================================================================
-- Auditoria julho/2026 — Etapa 1 (A1)
-- push_outbox ganha controle de tentativa/retry para não "perder"
-- notificações. Antes, o dispatcher marcava tudo como enviado mesmo sem
-- entrega real; agora só marca sent em sucesso e reagenda o resto.
-- Aditiva e idempotente (defaults preservam o comportamento até o deploy
-- do novo handler).
-- =====================================================================

ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Índice de "prontos para tentar": pendentes cujo próximo horário já passou
-- (ou nunca foi agendado).
CREATE INDEX IF NOT EXISTS idx_push_outbox_ready
  ON public.push_outbox (next_attempt_at)
  WHERE sent_at IS NULL;

-- =====================================================================
-- Auditoria julho/2026 — Etapa 1 (A3)
-- Dedup de lead à prova de corrida. O intake (Facebook/Zapier/chatbot)
-- fazia check-then-insert: dois retries simultâneos do mesmo telefone
-- passavam ambos na checagem e criavam DOIS leads → dupla distribuição.
--
-- Estratégia (não destrutiva):
--   1) função IMMUTABLE telefone_digits() para indexar por dígitos;
--   2) view de relatório das duplicatas atuais (para limpeza humana);
--   3) índice único PARCIAL por (projeto_id, dígitos), casando a regra de
--      buscar_lead_duplicado (dedup por projeto). Criado dentro de um
--      DO-block: se a base tiver duplicatas, o índice NÃO é criado (fica só
--      o warning + a view), sem travar a migração. Numa base limpa, a
--      corrida fica fechada no banco.
--
-- Os intakes passam a tratar a violação 23505 como "duplicado" (retornam o
-- lead existente) — ver src/routes/api/public/webhooks/*, lead-intake.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.telefone_digits(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g');
$$;

-- Relatório de duplicatas ativas por (projeto, telefone) — para o gestor
-- resolver antes de ativar o índice único, se houver.
CREATE OR REPLACE VIEW public.vw_leads_telefone_duplicado AS
SELECT
  l.projeto_id,
  public.telefone_digits(l.telefone) AS telefone_digits,
  count(*) AS qtd,
  array_agg(l.id ORDER BY l.created_at DESC) AS lead_ids
FROM public.leads l
WHERE l.deleted_at IS NULL
  AND l.projeto_id IS NOT NULL
  AND length(public.telefone_digits(l.telefone)) >= 8
GROUP BY l.projeto_id, public.telefone_digits(l.telefone)
HAVING count(*) > 1;

-- Índice único parcial guardado. Só é criado se a base já estiver limpa.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo
      ON public.leads (projeto_id, public.telefone_digits(telefone))
      WHERE deleted_at IS NULL
        AND projeto_id IS NOT NULL
        AND length(public.telefone_digits(telefone)) >= 8;
    RAISE NOTICE 'uq_leads_projeto_telefone_ativo criado (base sem duplicatas).';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE WARNING 'Índice único de dedup NÃO criado: existem leads duplicados por (projeto, telefone). Resolva via public.vw_leads_telefone_duplicado e reaplique.';
  END;
END $$;

-- =====================================================================
-- Auditoria julho/2026 — Etapa 2 (M6, parcial)
-- FK de auditoria em leads.corretor_anterior_id (era uuid solto, podia
-- apontar para usuário inexistente). ON DELETE SET NULL: se o usuário some,
-- o campo vira NULL em vez de virar órfão.
--
-- Adicionada como NOT VALID + VALIDATE guardado: linhas legadas órfãs não
-- travam a migração; novas linhas passam a ser validadas.
--
-- NÃO adiciono FK em distribution_log.corretor_id de propósito: é NOT NULL num
-- log append-only de auditoria; uma FK ali ou bloquearia excluir usuários ou
-- apagaria histórico. Auditoria deve sobreviver à exclusão do ator.
-- Idempotente.
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'leads_corretor_anterior_fk'
     )
  THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_corretor_anterior_fk
      FOREIGN KEY (corretor_anterior_id) REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;

    BEGIN
      ALTER TABLE public.leads VALIDATE CONSTRAINT leads_corretor_anterior_fk;
    EXCEPTION
      WHEN foreign_key_violation THEN
        RAISE WARNING 'leads_corretor_anterior_fk criada como NOT VALID: há corretor_anterior_id órfão. Limpe e rode VALIDATE CONSTRAINT depois.';
    END;
  END IF;
END $$;

-- =====================================================================
-- Auditoria julho/2026 — Etapa 2 (M6/timezone)
-- O dedup "1 alerta por dia" usava created_at::date = now()::date em UTC.
-- Entre ~21h e a meia-noite BRT o "dia" UTC já virou, então o alerta podia
-- ser recriado uma vez perto da meia-noite. Redefine as duas funções usando
-- o dia em America/Sao_Paulo. CREATE OR REPLACE: só muda a janela de dedup,
-- o resto do corpo é idêntico à definição vigente. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gerar_alertas_tarefas_atrasadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT t.corretor_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || t.titulo,
         'Venceu em ' || to_char(t.data_vencimento, 'DD/MM/YYYY HH24:MI'),
         '/tarefas', t.id
  FROM public.tarefas t
  WHERE t.status IN ('pendente','em_andamento')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND t.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = t.id
        AND a.tipo = 'tarefa_atrasada'
        AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_alertas_leads_parados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id,
         'follow_up',
         'Lead parado: ' || l.nome,
         'Sem interação há 5+ dias. Retome o contato.',
         '/leads/' || l.id::text,
         l.id
  FROM public.leads l
  WHERE l.corretor_id IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND COALESCE(l.ultima_interacao, l.created_at) < now() - interval '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = l.id
        AND a.tipo = 'follow_up'
        AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
END;
$$;

