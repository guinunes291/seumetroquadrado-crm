-- ============================================================================
-- Distribuição v3 — passo 1/4: FUNDAÇÃO DE DADOS (aditiva, zero mudança de
-- comportamento — os motores atuais continuam intactos até o cutover).
--
-- O redesenho substitui os dois motores divergentes (distribuir_lead por
-- posição vs distribuir_lead_webhook por last_lead_assigned_at) por UM motor
-- com 3 roletas como DADOS:
--   • plantao    — critério automático: presente hoje (BRT) + % trabalhado
--                  ≥ mínimo + cota diária. Recebe as origens não mapeadas
--                  para as outras roletas.
--   • marquinhos — exclusiva da origem 'chatbot'; participação MANUAL
--                  (gestor inclui/remove/pausa, tudo auditado).
--   • landing    — exclusiva da origem 'site'/webhook da landing page;
--                  participação manual configurável.
--
-- Nenhum lead pode sumir: quando a roleta não encontra corretor, o lead vai
-- para a fila de exceções (distribuicao_excecoes) com motivo + alerta.
-- Toda decisão ganha snapshot de aptos/inaptos em distribuicao_log_contexto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) roletas — as 3 roletas como dados (nunca código).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roletas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug IN ('plantao','marquinhos','landing')),
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  -- 'automatica_presenca': todo corretor da roleta participa se presente/apto.
  -- 'manual': só participa quem o gestor incluiu explicitamente.
  criterio_participacao text NOT NULL DEFAULT 'manual'
    CHECK (criterio_participacao IN ('automatica_presenca','manual')),
  -- Corretor AUSENTE nunca recebe lead desta roleta (requisito de justiça).
  exigir_presenca boolean NOT NULL DEFAULT true,
  -- Janela de funcionamento em America/Sao_Paulo. NULL = 24h.
  horario_inicio time,
  horario_fim time,
  -- Fora da janela: true = distribui mesmo assim; false = lead espera o cron.
  permitir_fora_horario boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_roletas_updated_at ON public.roletas;
CREATE TRIGGER set_roletas_updated_at
BEFORE UPDATE ON public.roletas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) roleta_participantes — quem participa de cada roleta + cursor ÚNICO do
--    rodízio (ultimo_lead_em). Substitui o cursor duplo posicao/last_lead_
--    assigned_at que divergia entre canais.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roleta_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roleta_id uuid NOT NULL REFERENCES public.roletas(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  -- Pausa temporária: participa de novo automaticamente quando expira.
  pausado_ate timestamptz,
  motivo_pausa text,
  -- NULL → usa distribuicao_settings.limite_diario_default.
  limite_diario integer CHECK (limite_diario IS NULL OR limite_diario > 0),
  -- Cursor do rodízio POR ROLETA: quem recebeu há mais tempo é o próximo.
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roleta_id, corretor_id)
);

CREATE INDEX IF NOT EXISTS idx_rp_cursor
  ON public.roleta_participantes (roleta_id, ultimo_lead_em ASC NULLS FIRST)
  WHERE ativo;

DROP TRIGGER IF EXISTS set_roleta_participantes_updated_at ON public.roleta_participantes;
CREATE TRIGGER set_roleta_participantes_updated_at
BEFORE UPDATE ON public.roleta_participantes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) roleta_participantes_log — auditoria de participação: quem incluiu,
--    removeu, pausou, reativou e quando (requisito da Roleta Marquinhos).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roleta_participantes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roleta_id uuid NOT NULL,
  corretor_id uuid NOT NULL,
  acao text NOT NULL CHECK (acao IN ('incluido','removido','pausado','reativado','limite_alterado')),
  motivo text,
  feito_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpl_roleta ON public.roleta_participantes_log (roleta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpl_corretor ON public.roleta_participantes_log (corretor_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) distribuicao_excecoes — fila de exceções: NENHUM lead pode sumir.
--    Uma exceção ABERTA por lead (índice único parcial → upsert idempotente).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribuicao_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN (
    'sem_corretor_ativo',        -- roleta sem nenhum participante ativo
    'sem_corretor_elegivel',     -- há participantes, mas nenhum apto agora
    'duplicado_incerto',         -- duplicidade sem regra clara
    'origem_nao_mapeada',        -- origem sem roleta vinculada
    'falha_tecnica',             -- erro inesperado na triagem/distribuição
    'corretor_anterior_inativo', -- cliente tinha corretor, mas está inativo
    'dados_incompletos'          -- lead sem dados mínimos (ex.: telefone)
  )),
  detalhe text,
  roleta_slug text,              -- roleta sugerida (pode ser corrigida na UI)
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_analise','resolvida','arquivada')),
  tentativas integer NOT NULL DEFAULT 1,
  ultimo_erro text,
  contexto jsonb,
  resolvida_por uuid,
  resolvida_em timestamptz,
  resolucao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_excecao_aberta
  ON public.distribuicao_excecoes (lead_id)
  WHERE status IN ('pendente','em_analise');

CREATE INDEX IF NOT EXISTS idx_excecoes_status
  ON public.distribuicao_excecoes (status, created_at DESC);

DROP TRIGGER IF EXISTS set_distribuicao_excecoes_updated_at ON public.distribuicao_excecoes;
CREATE TRIGGER set_distribuicao_excecoes_updated_at
BEFORE UPDATE ON public.distribuicao_excecoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) distribuicao_settings — parâmetros da distribuição (antes hardcoded).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribuicao_settings (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_por uuid
);

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('percentual_minimo_trabalhado', '90'::jsonb,
   'Roleta plantão: % mínimo de leads trabalhados para o corretor estar apto'),
  ('statuses_aguardando', '["aguardando_atendimento"]'::jsonb,
   'Statuses que contam como lead AGUARDANDO (não trabalhado)'),
  ('statuses_encerrados', '["contrato_fechado","pos_venda","perdido"]'::jsonb,
   'Statuses fora da carteira ativa (não entram no cálculo do % trabalhado)'),
  ('max_minutos_sem_atendimento', '30'::jsonb,
   'Minutos para considerar um lead "sem atendimento" nos alertas/painel'),
  ('limite_diario_default', '10'::jsonb,
   'Cota diária de leads por corretor quando o participante não tem limite próprio'),
  ('permitir_inclusao_manual', 'true'::jsonb,
   'Gestores podem incluir corretores na roleta Marquinhos'),
  ('reprocesso_max_tentativas', '3'::jsonb,
   'Máximo de tentativas automáticas de distribuição/redistribuição por lead'),
  ('cota_conta_redistribuicao', 'false'::jsonb,
   'Redistribuições/repasse de SLA contam na cota diária do corretor?')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) distribution_log — vira log de DECISÃO (não só de sucesso):
--    corretor_id NULL = tentativa sem vencedor; resultado + roleta + regra.
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribution_log ALTER COLUMN corretor_id DROP NOT NULL;
ALTER TABLE public.distribution_log ADD COLUMN IF NOT EXISTS roleta_slug text;
ALTER TABLE public.distribution_log ADD COLUMN IF NOT EXISTS regra_aplicada text;
ALTER TABLE public.distribution_log ADD COLUMN IF NOT EXISTS resultado text NOT NULL DEFAULT 'sucesso';

-- Constraint separada (idempotente) para permitir re-apply.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'distribution_log_resultado_check'
  ) THEN
    ALTER TABLE public.distribution_log
      ADD CONSTRAINT distribution_log_resultado_check
      CHECK (resultado IN ('sucesso','sem_corretor','erro','excecao'));
  END IF;
END $$;

-- Contadores dia/mês do corretor derivam do log (fim do contador mutável).
CREATE INDEX IF NOT EXISTS idx_dlog_corretor_sucesso
  ON public.distribution_log (corretor_id, created_at DESC)
  WHERE resultado = 'sucesso';

-- ---------------------------------------------------------------------------
-- 7) distribuicao_log_contexto — snapshot da decisão (aptos/inaptos com
--    motivos). Tabela 1:1 separada para o corretor NÃO enxergar, via RLS,
--    os percentuais/motivos dos colegas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribuicao_log_contexto (
  log_id uuid PRIMARY KEY REFERENCES public.distribution_log(id) ON DELETE CASCADE,
  contexto jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8) Mapeamento origem → roleta (editável na UI de configurações).
--    Preserva timeout_horas/timeout_minutos/sla_minutos existentes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribuicao_config ADD COLUMN IF NOT EXISTS roleta_slug text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'distribuicao_config_roleta_slug_fkey'
  ) THEN
    ALTER TABLE public.distribuicao_config
      ADD CONSTRAINT distribuicao_config_roleta_slug_fkey
      FOREIGN KEY (roleta_slug) REFERENCES public.roletas(slug);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9) leads.canal_entrada — canal REAL de chegada (origem é atributo do lead,
--    não do canal; o bug do SLA de 20260705100000 nasceu dessa confusão).
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS canal_entrada text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_canal_entrada_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_canal_entrada_check
      CHECK (canal_entrada IS NULL OR canal_entrada IN
        ('edge_facebook','webhook_chatbot','webhook_landing','manual','importacao','api_publica'));
  END IF;
END $$;

-- Staging da landing passa a apontar para o lead real criado a partir dela.
ALTER TABLE public.leads_landing ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 10) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.roletas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roleta_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roleta_participantes_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuicao_excecoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuicao_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuicao_log_contexto ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.roletas, public.roleta_participantes,
               public.roleta_participantes_log, public.distribuicao_excecoes,
               public.distribuicao_settings, public.distribuicao_log_contexto
  TO authenticated;
GRANT ALL ON public.roletas, public.roleta_participantes,
            public.roleta_participantes_log, public.distribuicao_excecoes,
            public.distribuicao_settings, public.distribuicao_log_contexto
  TO service_role;

-- roletas: todos os autenticados leem (o corretor vê a config da roleta em que
-- está); só admin altera diretamente (gestor age via RPCs SECURITY DEFINER).
DROP POLICY IF EXISTS "authenticated leem roletas" ON public.roletas;
CREATE POLICY "authenticated leem roletas"
  ON public.roletas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin gerencia roletas" ON public.roletas;
CREATE POLICY "admin gerencia roletas"
  ON public.roletas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- roleta_participantes: gestão vê tudo; corretor vê só a própria linha.
-- SEM policy de escrita — mutação apenas via RPC gerenciar_participante_roleta
-- (que grava a auditoria atomicamente).
DROP POLICY IF EXISTS "gestao ve participantes" ON public.roleta_participantes;
CREATE POLICY "gestao ve participantes"
  ON public.roleta_participantes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'superintendente')
    OR corretor_id = auth.uid()
  );

DROP POLICY IF EXISTS "gestao ve log de participantes" ON public.roleta_participantes_log;
CREATE POLICY "gestao ve log de participantes"
  ON public.roleta_participantes_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'superintendente')
    OR corretor_id = auth.uid()
  );

-- exceções: só gestão (corretor não gerencia distribuição).
DROP POLICY IF EXISTS "gestao ve excecoes" ON public.distribuicao_excecoes;
CREATE POLICY "gestao ve excecoes"
  ON public.distribuicao_excecoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'superintendente')
  );

-- settings: gestão lê; escrita só via RPC admin (atualizar_distribuicao_setting).
DROP POLICY IF EXISTS "gestao le settings distribuicao" ON public.distribuicao_settings;
CREATE POLICY "gestao le settings distribuicao"
  ON public.distribuicao_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'superintendente')
  );

-- contexto de decisão: só gestão (contém % e motivos de TODOS os corretores).
DROP POLICY IF EXISTS "gestao ve contexto de decisao" ON public.distribuicao_log_contexto;
CREATE POLICY "gestao ve contexto de decisao"
  ON public.distribuicao_log_contexto FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'superintendente')
  );

-- ---------------------------------------------------------------------------
-- 11) SEEDS
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, criterio_participacao, exigir_presenca) VALUES
  ('plantao', 'Roleta Plantão',
   'Distribuição principal (estoque da base) para corretores presentes no plantão com % de leads trabalhados acima do mínimo.',
   'automatica_presenca', true),
  ('marquinhos', 'Roleta Marquinhos',
   'Exclusiva para leads com origem Chatbot/Marquinhos. Participação manual: o gestor inclui corretores com venda no mês anterior.',
   'manual', true),
  ('landing', 'Roleta Landing Page',
   'Exclusiva para leads com origem Landing Page (site). Participação configurada pelo gestor.',
   'manual', true)
ON CONFLICT (slug) DO NOTHING;

-- Participantes da roleta PLANTÃO ← fila_distribuicao atual (a fila já foi
-- higienizada em 20260705175503: só role=corretor, sem docs-bot). O cursor
-- nasce fundindo os dois cursores antigos para não reiniciar o rodízio.
INSERT INTO public.roleta_participantes
  (roleta_id, corretor_id, ativo, limite_diario, ultimo_lead_em, incluido_por)
SELECT r.id,
       fd.corretor_id,
       fd.ativo,
       fd.max_leads_dia,
       -- GREATEST ignora NULLs; NULL+NULL → NULL (novato entra na frente).
       GREATEST(fd.ultima_distribuicao, p.last_lead_assigned_at),
       NULL
FROM public.fila_distribuicao fd
JOIN public.profiles p ON p.id = fd.corretor_id
CROSS JOIN (SELECT id FROM public.roletas WHERE slug = 'plantao') r
ON CONFLICT (roleta_id, corretor_id) DO NOTHING;

INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
SELECT rp.roleta_id, rp.corretor_id, 'incluido',
       'Migração automática da fila de distribuição (distribuição v3)', NULL
FROM public.roleta_participantes rp
JOIN public.roletas r ON r.id = rp.roleta_id AND r.slug = 'plantao'
WHERE NOT EXISTS (
  SELECT 1 FROM public.roleta_participantes_log l
  WHERE l.roleta_id = rp.roleta_id AND l.corretor_id = rp.corretor_id AND l.acao = 'incluido'
);

-- Mapeamento origem → roleta. Garante uma linha por origem do enum e então
-- vincula: chatbot → marquinhos; site → landing; demais → plantão.
INSERT INTO public.distribuicao_config (origem)
SELECT e.enumlabel::public.lead_origem
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid AND t.typname = 'lead_origem'
ON CONFLICT (origem) DO NOTHING;

UPDATE public.distribuicao_config SET roleta_slug = 'marquinhos' WHERE origem = 'chatbot' AND roleta_slug IS NULL;
UPDATE public.distribuicao_config SET roleta_slug = 'landing'    WHERE origem = 'site'    AND roleta_slug IS NULL;
UPDATE public.distribuicao_config SET roleta_slug = 'plantao'    WHERE roleta_slug IS NULL;

-- ---------------------------------------------------------------------------
-- 12) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.roletas;
  IF _n <> 3 THEN
    RAISE EXCEPTION 'distribuicao_v3_fundacao: esperava 3 roletas, achei %', _n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_excecao_aberta'
  ) THEN
    RAISE EXCEPTION 'distribuicao_v3_fundacao: índice uq_excecao_aberta ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
