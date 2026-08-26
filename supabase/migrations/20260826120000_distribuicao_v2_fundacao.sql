-- ============================================================================
-- Distribuição v2 — FUNDAÇÃO (1/2) — Política de Distribuição de Leads SMQ v1
--
-- Decisão de produto de 2026-08-26 (processo completo com diagnóstico e OK do
-- gestor em cada fase, registrado em docs/politica-distribuicao-leads-v1.md):
--
--   * Lead QUENTE (campanha/pago) vai para a fila da zona com rodízio
--     ponderado por VELOCIDADE de 1º contato (faixas A/B/C = peso 3/2/1).
--   * Lead de BASE (frio, reativado, devolvido, estoque) roda em rodízio puro
--     para todos os aptos — é o piso que garante que ninguém fica sem
--     material, sem cota artificial de lead pago.
--   * SLA de 15 minutos úteis no quente com devolução; 2 estouros no dia
--     pausam o corretor no quente até o dia seguinte (volta automática).
--   * Posse: 7 dias sem registro devolve o lead (30 em etapa avançada).
--   * Teto disjuntor de 30 leads ativos por corretor.
--
-- Esta migration é SÓ estrutura (aditiva e idempotente): campos, roleta
-- 'base', settings, tabelas de apoio e views. Nenhum comportamento muda —
-- o motor v2 (2/2) nasce atrás da flag modelo_v2_ativo=false.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles — vínculo e onboarding viram elegibilidade explícita.
--    NULL = cadastro pendente: o corretor NÃO entra na roleta v2 até a gestão
--    preencher (hoje o vínculo fixo/autônomo não existe em campo nenhum).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS modelo_contrato text,
  ADD COLUMN IF NOT EXISTS onboarding_concluido_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_modelo_contrato_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_modelo_contrato_check
      CHECK (modelo_contrato IS NULL OR modelo_contrato IN ('fixo','autonomo'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) leads — classe (quente/base) e relógio de atividade da regra de posse.
--    ultima_atividade_em nasce agora (= go-live): a régua 7/30 NÃO é
--    retroativa, decisão explícita do rollout (ninguém perde carteira sem
--    chance de reagir).
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS classe_lead text NOT NULL DEFAULT 'quente',
  ADD COLUMN IF NOT EXISTS ultima_atividade_em timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_classe_lead_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_classe_lead_check CHECK (classe_lead IN ('quente','base'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_ultima_atividade
  ON public.leads (corretor_id, ultima_atividade_em)
  WHERE corretor_id IS NOT NULL AND na_lixeira = false;

-- Qualquer interação registrada renova a posse.
CREATE OR REPLACE FUNCTION public._touch_lead_atividade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET ultima_atividade_em = GREATEST(ultima_atividade_em, COALESCE(NEW.ocorreu_em, now()))
   WHERE id = NEW.lead_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_interacao_touch_lead ON public.interacoes;
CREATE TRIGGER trg_interacao_touch_lead
  AFTER INSERT ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_lead_atividade();

-- Mudança de status ou de dono também conta como atividade (evita que um
-- lead recém-redistribuído seja devolvido de novo no mesmo dia).
CREATE OR REPLACE FUNCTION public._touch_lead_atividade_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id THEN
    NEW.ultima_atividade_em := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_touch_status ON public.leads;
CREATE TRIGGER trg_lead_touch_status
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public._touch_lead_atividade_status();

-- ---------------------------------------------------------------------------
-- 3) roleta_participantes — amostra da faixa de velocidade. As colunas
--    tier/tier_score/tier_updated_at existentes são REAPROVEITADAS: no v2 o
--    tier passa a significar faixa de velocidade (A/B/C) e tier_score guarda
--    a mediana de minutos até o 1º contato.
-- ---------------------------------------------------------------------------
ALTER TABLE public.roleta_participantes
  ADD COLUMN IF NOT EXISTS faixa_amostra int NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4) Roleta BASE — a esteira universal. Rodízio puro, presença exigida,
--    critério 'manual' (a régua de % trabalhado do plantão NÃO se aplica).
--    Seed de participantes: todo perfil ativo com role corretor e telefone.
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, ativo, criterio_participacao, exigir_presenca, tipo)
VALUES ('base', 'Roleta Base',
        'Esteira universal de leads de base (frios, reativados, devolvidos). Rodízio puro para todos os aptos — o piso do modelo v2.',
        true, 'manual', true, 'sistema')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE _roleta_id uuid;
BEGIN
  SELECT id INTO _roleta_id FROM public.roletas WHERE slug = 'base';

  INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_em)
  SELECT _roleta_id, p.id, true, now()
  FROM public.profiles p
  WHERE p.ativo = true
    AND COALESCE(p.telefone, '') <> ''
    AND lower(COALESCE(p.nome, '')) <> 'docs-bot'
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = p.id AND ur.role = 'corretor')
  ON CONFLICT (roleta_id, corretor_id) DO NOTHING;

  INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
  SELECT _roleta_id, rp.corretor_id, 'incluido', 'Seed da fundação v2 (roleta base universal)', NULL
  FROM public.roleta_participantes rp
  WHERE rp.roleta_id = _roleta_id
    AND NOT EXISTS (
      SELECT 1 FROM public.roleta_participantes_log l
       WHERE l.roleta_id = _roleta_id AND l.corretor_id = rp.corretor_id AND l.acao = 'incluido'
    );
END $$;

-- ---------------------------------------------------------------------------
-- 5) Parâmetros do v2 — tudo que é limiar é dado, não código. Recalibrar
--    faixa, SLA, posse ou disjuntor não exige deploy. A flag nasce DESLIGADA.
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('modelo_v2_ativo',        'false'::jsonb, 'Liga o motor v2 (quente ponderado por velocidade + base universal). Rollback = voltar para false.'),
  ('modelo_v2_sombra',       'false'::jsonb, 'Com o v2 desligado, grava em distribuicao_sombra quem receberia cada lead pelo v2 (validação sem efeito).'),
  ('sla_quente_minutos',     '15'::jsonb,    'SLA de 1º contato do lead quente, em minutos, dentro do horário comercial.'),
  ('faixa_a_max_min',        '15'::jsonb,    'Mediana (min) até este valor = faixa A (peso 3).'),
  ('faixa_b_max_min',        '60'::jsonb,    'Mediana (min) até este valor = faixa B (peso 2). Acima = faixa C (peso 1).'),
  ('amostra_minima_faixa',   '5'::jsonb,     'Leads quentes mínimos na janela para ter faixa própria; abaixo disso a faixa é B (neutra).'),
  ('janela_faixa_dias',      '14'::jsonb,    'Janela (dias) da mediana de velocidade.'),
  ('disjuntor_wip',          '30'::jsonb,    'Teto disjuntor de leads ativos por corretor; atingiu, para de receber até dar baixa.'),
  ('posse_dias_atendimento', '7'::jsonb,     'Dias sem registro que devolvem o lead nas etapas iniciais (até em_atendimento).'),
  ('posse_dias_avancado',    '30'::jsonb,    'Dias sem registro que devolvem o lead nas etapas avançadas (agendado, crédito, proposta).'),
  ('pausa_estouros_dia',     '2'::jsonb,     'Estouros de SLA no mesmo dia que pausam o corretor no quente até o dia seguinte.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) sla_estouros — cada devolução por SLA vira uma linha (auditoria, conta
--    da pausa automática e amostra de 60 min na mediana da faixa).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_estouros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  roleta_slug text,
  sla_minutos int,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_estouros_corretor
  ON public.sla_estouros (corretor_id, criado_em DESC);

ALTER TABLE public.sla_estouros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestao e o proprio veem estouros" ON public.sla_estouros;
CREATE POLICY "gestao e o proprio veem estouros"
  ON public.sla_estouros FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'superintendente'::app_role)
    OR corretor_id = auth.uid()
  );
-- Escrita só pelo motor (SECURITY DEFINER) — nenhuma policy de INSERT/UPDATE.
GRANT SELECT ON public.sla_estouros TO authenticated;
GRANT ALL ON public.sla_estouros TO service_role;

-- ---------------------------------------------------------------------------
-- 7) distribuicao_sombra — validação do v2 antes da virada: com a flag
--    desligada e a sombra ligada, cada distribuição real registra aqui quem
--    o v2 teria escolhido. Sem efeito nenhum sobre a distribuição real.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribuicao_sombra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  roleta_slug text,
  classe_lead text,
  vencedor_real uuid,
  vencedor_v2 uuid,
  faixa_v2 text,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dist_sombra_criado
  ON public.distribuicao_sombra (criado_em DESC);

ALTER TABLE public.distribuicao_sombra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestao ve sombra" ON public.distribuicao_sombra;
CREATE POLICY "gestao ve sombra"
  ON public.distribuicao_sombra FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'superintendente'::app_role)
  );
GRANT SELECT ON public.distribuicao_sombra TO authenticated;
GRANT ALL ON public.distribuicao_sombra TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Helpers de régua — minutos úteis (08:00-19:00 BRT) e WIP do corretor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._minutos_uteis_entre(_de timestamptz, _ate timestamptz)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Soma, dia a dia, a sobreposição do intervalo com a janela comercial
  -- 08:00-19:00 de America/Sao_Paulo. Intervalo invertido = 0.
  SELECT COALESCE((
    SELECT sum(
      GREATEST(0, EXTRACT(EPOCH FROM (
        LEAST((_ate AT TIME ZONE 'America/Sao_Paulo'), d + time '19:00')
        - GREATEST((_de AT TIME ZONE 'America/Sao_Paulo'), d + time '08:00')
      )) / 60)
    )::int
    FROM generate_series(
      date_trunc('day', _de AT TIME ZONE 'America/Sao_Paulo'),
      date_trunc('day', _ate AT TIME ZONE 'America/Sao_Paulo'),
      interval '1 day'
    ) AS d
    WHERE _ate > _de
  ), 0)
$$;

CREATE OR REPLACE FUNCTION public._wip_corretor(_corretor_id uuid)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.leads l
  WHERE l.corretor_id = _corretor_id
    AND l.na_lixeira = false
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
$$;

REVOKE ALL ON FUNCTION public._minutos_uteis_entre(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._minutos_uteis_entre(timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._wip_corretor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._wip_corretor(uuid) TO authenticated, service_role;

-- Régua extra de elegibilidade do v2 (soma-se à fonte única do v3):
-- onboarding concluído, vínculo definido e WIP abaixo do disjuntor.
CREATE OR REPLACE FUNCTION public._apto_extra_v2(_corretor_id uuid)
RETURNS TABLE (apto boolean, motivos text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _wip int;
  _disjuntor int := COALESCE((public.get_dist_setting('disjuntor_wip') #>> '{}')::int, 30);
  _m text[] := ARRAY[]::text[];
BEGIN
  SELECT modelo_contrato, onboarding_concluido_em INTO _p
  FROM public.profiles WHERE id = _corretor_id;

  IF _p.modelo_contrato IS NULL THEN
    _m := array_append(_m, 'sem_modelo_contrato');
  END IF;
  IF _p.onboarding_concluido_em IS NULL THEN
    _m := array_append(_m, 'onboarding_pendente');
  END IF;

  _wip := public._wip_corretor(_corretor_id);
  IF _wip >= _disjuntor THEN
    _m := array_append(_m, 'disjuntor_wip_' || _wip);
  END IF;

  RETURN QUERY SELECT COALESCE(array_length(_m, 1), 0) = 0, _m;
END; $$;

REVOKE ALL ON FUNCTION public._apto_extra_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apto_extra_v2(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Views do painel semanal (métricas de DECISÃO). security_invoker: quem
--    consulta enxerga só o que a RLS das tabelas-base permite.
-- ---------------------------------------------------------------------------

-- Velocidade de 1º contato por corretor (janela = janela_faixa_dias).
-- Amostras: (a) atribuições com 1ª interação do corretor no lead;
--           (b) devoluções por SLA valendo 60 minutos cada.
CREATE OR REPLACE VIEW public.v_velocidade_corretor
WITH (security_invoker = true) AS
WITH janela AS (
  SELECT (now() - (COALESCE((public.get_dist_setting('janela_faixa_dias') #>> '{}')::int, 14)
          || ' days')::interval) AS inicio
),
contatos AS (
  SELECT dl.corretor_id,
         public._minutos_uteis_entre(dl.created_at, i.primeiro_contato) AS minutos
  FROM public.distribution_log dl
  CROSS JOIN janela j
  JOIN LATERAL (
    SELECT min(i.ocorreu_em) AS primeiro_contato
    FROM public.interacoes i
    WHERE i.lead_id = dl.lead_id
      AND i.autor_id = dl.corretor_id
      AND i.ocorreu_em >= dl.created_at
  ) i ON i.primeiro_contato IS NOT NULL
  WHERE dl.resultado = 'sucesso'
    AND dl.corretor_id IS NOT NULL
    AND dl.created_at >= j.inicio
),
estouros AS (
  SELECT e.corretor_id, 60 AS minutos
  FROM public.sla_estouros e
  CROSS JOIN janela j
  WHERE e.criado_em >= j.inicio
),
amostras AS (
  SELECT * FROM contatos UNION ALL SELECT * FROM estouros
)
SELECT a.corretor_id,
       p.nome,
       count(*)::int AS amostra,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutos) AS mediana_min,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY a.minutos) AS p90_min
FROM amostras a
JOIN public.profiles p ON p.id = a.corretor_id
GROUP BY a.corretor_id, p.nome;

-- Leads ativos (WIP) por corretor, contra o disjuntor.
CREATE OR REPLACE VIEW public.v_wip_corretor
WITH (security_invoker = true) AS
SELECT p.id AS corretor_id, p.nome,
       public._wip_corretor(p.id) AS leads_ativos,
       COALESCE((public.get_dist_setting('disjuntor_wip') #>> '{}')::int, 30) AS disjuntor
FROM public.profiles p
WHERE p.ativo = true;

-- Leads parados: o que a régua de posse 7/30 vai devolver.
CREATE OR REPLACE VIEW public.v_leads_parados
WITH (security_invoker = true) AS
SELECT l.id AS lead_id, l.nome, l.corretor_id, p.nome AS corretor_nome,
       l.status, l.classe_lead, l.ultima_atividade_em,
       CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
            THEN COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30)
            ELSE COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7)
       END AS regra_dias,
       EXTRACT(EPOCH FROM (now() - l.ultima_atividade_em))::bigint / 86400 AS dias_sem_registro
FROM public.leads l
JOIN public.profiles p ON p.id = l.corretor_id
WHERE l.corretor_id IS NOT NULL
  AND l.na_lixeira = false
  AND l.deleted_at IS NULL
  AND l.status NOT IN ('contrato_fechado','pos_venda','perdido');

-- Contato efetivo: o cliente respondeu (interação de entrada) depois do 1º
-- contato do corretor, na janela da faixa.
CREATE OR REPLACE VIEW public.v_contato_efetivo
WITH (security_invoker = true) AS
WITH janela AS (
  SELECT (now() - (COALESCE((public.get_dist_setting('janela_faixa_dias') #>> '{}')::int, 14)
          || ' days')::interval) AS inicio
),
primeiros AS (
  SELECT dl.lead_id, dl.corretor_id, min(i.ocorreu_em) AS primeiro_contato
  FROM public.distribution_log dl
  CROSS JOIN janela j
  JOIN public.interacoes i
    ON i.lead_id = dl.lead_id AND i.autor_id = dl.corretor_id AND i.ocorreu_em >= dl.created_at
  WHERE dl.resultado = 'sucesso' AND dl.corretor_id IS NOT NULL AND dl.created_at >= j.inicio
  GROUP BY dl.lead_id, dl.corretor_id
)
SELECT pr.corretor_id, p.nome,
       count(*)::int AS primeiros_contatos,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.interacoes r
         WHERE r.lead_id = pr.lead_id
           AND r.direcao = 'entrada'
           AND r.ocorreu_em > pr.primeiro_contato
       ))::int AS com_resposta
FROM primeiros pr
JOIN public.profiles p ON p.id = pr.corretor_id
GROUP BY pr.corretor_id, p.nome;

GRANT SELECT ON public.v_velocidade_corretor, public.v_wip_corretor,
                public.v_leads_parados, public.v_contato_efetivo TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='leads' AND column_name='classe_lead') THEN
    RAISE EXCEPTION 'leads.classe_lead ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'base') THEN
    RAISE EXCEPTION 'roleta base ausente';
  END IF;
  IF COALESCE((public.get_dist_setting('modelo_v2_ativo') #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'modelo_v2_ativo precisa nascer DESLIGADO';
  END IF;
  IF to_regprocedure('public._apto_extra_v2(uuid)') IS NULL THEN
    RAISE EXCEPTION '_apto_extra_v2 ausente';
  END IF;
  IF to_regprocedure('public._minutos_uteis_entre(timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION '_minutos_uteis_entre ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
