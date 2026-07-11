-- Integridade comercial: aprovação gerencial, máquina de estados e ledgers.
--
-- Esta migração mantém as tabelas/URLs existentes, mas muda a fonte de verdade:
-- uma venda só gera comissão, VGV e pontos depois de aprovada. Os efeitos são
-- append-only, idempotentes e reversíveis. O backfill preserva vendas legadas e
-- reconcilia `atividades_diarias` sem depender dos antigos triggers de INSERT.

-- ---------------------------------------------------------------------------
-- 1) Estado auditável da venda e unicidade por lead
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.status_venda AS ENUM (
    'rascunho', 'pendente', 'aprovada', 'rejeitada', 'cancelada'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS status_venda public.status_venda,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_decisao text,
  ADD COLUMN IF NOT EXISTS status_venda_updated_at timestamptz;

-- Impede que uma venda seja inserida entre a reconciliação de duplicatas e a
-- criação do índice parcial. O lock dura somente a transação da migration.
LOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;

-- Vendas existentes já produziram efeitos no modelo anterior; por isso entram
-- como aprovadas. Distratos entram cancelados e serão estornados no ledger.
UPDATE public.vendas
SET status_venda = CASE
      WHEN distrato THEN 'cancelada'::public.status_venda
      ELSE 'aprovada'::public.status_venda
    END,
    aprovado_em = CASE
      WHEN aprovado_em IS NOT NULL THEN aprovado_em
      ELSE data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo'
    END,
    motivo_decisao = CASE
      WHEN distrato THEN COALESCE(
        NULLIF(btrim(motivo_decisao), ''),
        NULLIF(btrim(motivo_distrato), ''),
        'Distrato legado'
      )
      ELSE motivo_decisao
    END,
    status_venda_updated_at = COALESCE(status_venda_updated_at, updated_at, created_at, now())
WHERE status_venda IS NULL;

-- Completa uma eventual execução parcial sem reclassificar decisões já feitas.
UPDATE public.vendas
SET aprovado_em = CASE
      WHEN status_venda IN (
        'aprovada'::public.status_venda,
        'cancelada'::public.status_venda
      ) THEN COALESCE(
        aprovado_em,
        data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      ELSE aprovado_em
    END,
    motivo_decisao = CASE
      WHEN status_venda = 'cancelada'::public.status_venda
        THEN COALESCE(
          NULLIF(btrim(motivo_decisao), ''),
          NULLIF(btrim(motivo_distrato), ''),
          'Cancelamento legado'
        )
      ELSE motivo_decisao
    END,
    status_venda_updated_at = COALESCE(status_venda_updated_at, updated_at, created_at, now())
WHERE status_venda_updated_at IS NULL
   OR (
     status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
     AND aprovado_em IS NULL
   )
   OR (
     status_venda = 'cancelada'::public.status_venda
     AND NULLIF(btrim(motivo_decisao), '') IS NULL
   );

-- Duplicatas legadas são preservadas para auditoria, mas somente a venda mais
-- recente permanece ativa. O inventário permite revisão humana pós-rollout.
CREATE TABLE IF NOT EXISTS public.venda_integridade_conflitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  venda_preservada_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  venda_conflitante_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venda_integridade_conflitos_venda_uk UNIQUE (venda_conflitante_id),
  CONSTRAINT venda_integridade_conflitos_distintas_ck
    CHECK (venda_preservada_id <> venda_conflitante_id)
);

ALTER TABLE public.venda_integridade_conflitos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venda_integridade_conflitos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venda_integridade_conflitos TO authenticated;
GRANT ALL ON public.venda_integridade_conflitos TO service_role;

WITH ranked AS (
  SELECT
    v.id,
    v.lead_id,
    first_value(v.id) OVER (
      PARTITION BY v.lead_id
      ORDER BY v.data_assinatura DESC, v.created_at DESC, v.id DESC
    ) AS venda_preservada_id,
    row_number() OVER (
      PARTITION BY v.lead_id
      ORDER BY v.data_assinatura DESC, v.created_at DESC, v.id DESC
    ) AS rn
  FROM public.vendas AS v
  WHERE v.lead_id IS NOT NULL
    AND v.status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda,
      'aprovada'::public.status_venda
    )
)
INSERT INTO public.venda_integridade_conflitos (
  lead_id, venda_preservada_id, venda_conflitante_id, motivo
)
SELECT
  r.lead_id,
  r.venda_preservada_id,
  r.id,
  'Duplicata ativa encontrada no rollout; registro preservado como cancelado.'
FROM ranked AS r
WHERE r.rn > 1
ON CONFLICT (venda_conflitante_id) DO NOTHING;

UPDATE public.vendas AS v
SET status_venda = 'cancelada'::public.status_venda,
    motivo_decisao = COALESCE(
      NULLIF(btrim(v.motivo_decisao), ''),
      'Duplicata ativa encontrada no rollout; venda mais recente preservada.'
    ),
    status_venda_updated_at = now()
FROM public.venda_integridade_conflitos AS c
WHERE c.venda_conflitante_id = v.id
  AND v.status_venda IN (
    'rascunho'::public.status_venda,
    'pendente'::public.status_venda,
    'aprovada'::public.status_venda
  );

-- Um lead legado fechado sem venda atualmente aprovada não pode continuar
-- inflando relatórios que usam a etapa atual. Reabre para tratamento e deixa
-- evento explícito; leads com outra venda aprovada permanecem fechados.
WITH reabertos AS (
  UPDATE public.leads AS l
  SET status = 'em_atendimento'::public.lead_status,
      proxima_acao = 'Revisar fechamento sem venda aprovada',
      proximo_followup = now() + interval '1 day',
      ultima_interacao = now()
  WHERE l.deleted_at IS NULL
    AND l.status IN (
      'contrato_fechado'::public.lead_status,
      'pos_venda'::public.lead_status
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.lead_id = l.id
        AND v.status_venda = 'aprovada'::public.status_venda
    )
  RETURNING l.id
)
INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
SELECT
  r.id,
  'fechamento_reaberto',
  'Fechamento legado reaberto por ausência de venda aprovada.',
  'migration_sales_integrity',
  jsonb_build_object('migration', '20260711122000')
FROM reabertos AS r;

ALTER TABLE public.vendas
  ALTER COLUMN status_venda SET DEFAULT 'pendente'::public.status_venda,
  ALTER COLUMN status_venda SET NOT NULL,
  ALTER COLUMN status_venda_updated_at SET DEFAULT now(),
  ALTER COLUMN status_venda_updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vendas'::regclass
      AND conname = 'vendas_status_decisao_ck'
  ) THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_status_decisao_ck CHECK (
        (status_venda <> 'aprovada'::public.status_venda OR aprovado_em IS NOT NULL)
        AND (
          status_venda NOT IN (
            'rejeitada'::public.status_venda,
            'cancelada'::public.status_venda
          )
          OR NULLIF(btrim(motivo_decisao), '') IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.vendas VALIDATE CONSTRAINT vendas_status_decisao_ck;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_lead_ativa
  ON public.vendas (lead_id)
  WHERE lead_id IS NOT NULL
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda,
      'aprovada'::public.status_venda
    );

CREATE INDEX IF NOT EXISTS idx_vendas_status_data
  ON public.vendas (status_venda, data_assinatura DESC);

DROP POLICY IF EXISTS "venda_integridade_conflitos_select_gestao"
  ON public.venda_integridade_conflitos;
CREATE POLICY "venda_integridade_conflitos_select_gestao"
  ON public.venda_integridade_conflitos FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Ledgers append-only de comissão e métricas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes(id) ON DELETE RESTRICT,
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  beneficiario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiario_tipo text NOT NULL,
  evento text NOT NULL CHECK (evento IN ('credito', 'estorno')),
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissao_ledger_evento_uk UNIQUE (comissao_id, evento)
);

CREATE INDEX IF NOT EXISTS idx_comissao_ledger_venda_created
  ON public.comissao_ledger (venda_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comissao_ledger_beneficiario_created
  ON public.comissao_ledger (beneficiario_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.venda_metricas_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  evento text NOT NULL CHECK (evento IN ('credito', 'estorno')),
  dia date NOT NULL,
  vendas_delta integer NOT NULL CHECK (
    (evento = 'credito' AND vendas_delta = 1)
    OR (evento = 'estorno' AND vendas_delta = -1)
  ),
  vgv_delta numeric(14,2) NOT NULL CHECK (
    (evento = 'credito' AND vgv_delta >= 0)
    OR (evento = 'estorno' AND vgv_delta <= 0)
  ),
  origem text NOT NULL CHECK (origem IN ('legado', 'aprovacao', 'cancelamento')),
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venda_metricas_ledger_evento_uk UNIQUE (venda_id, evento)
);

CREATE INDEX IF NOT EXISTS idx_venda_metricas_ledger_corretor_dia
  ON public.venda_metricas_ledger (corretor_id, dia);

ALTER TABLE public.comissao_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_metricas_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.comissao_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.venda_metricas_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comissao_ledger TO authenticated;
GRANT SELECT ON public.venda_metricas_ledger TO authenticated;
GRANT ALL ON public.comissao_ledger TO service_role;
GRANT ALL ON public.venda_metricas_ledger TO service_role;

DROP POLICY IF EXISTS "comissao_ledger_select_escopo" ON public.comissao_ledger;
CREATE POLICY "comissao_ledger_select_escopo"
  ON public.comissao_ledger FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.vendas AS v
        WHERE v.id = comissao_ledger.venda_id
          AND v.lead_id IS NOT NULL
          AND public.pode_acessar_lead(auth.uid(), v.lead_id)
      )
    )
  );

DROP POLICY IF EXISTS "venda_metricas_ledger_select_escopo"
  ON public.venda_metricas_ledger;
CREATE POLICY "venda_metricas_ledger_select_escopo"
  ON public.venda_metricas_ledger FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = venda_metricas_ledger.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  );

CREATE OR REPLACE FUNCTION public.bloquear_mutacao_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'ledger imutável: registre um evento compensatório'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_mutacao_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comissao_ledger_imutavel ON public.comissao_ledger;
CREATE TRIGGER trg_comissao_ledger_imutavel
  BEFORE UPDATE OR DELETE ON public.comissao_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_ledger();

DROP TRIGGER IF EXISTS trg_venda_metricas_ledger_imutavel ON public.venda_metricas_ledger;
CREATE TRIGGER trg_venda_metricas_ledger_imutavel
  BEFORE UPDATE OR DELETE ON public.venda_metricas_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_ledger();

-- Registra o estado legado no ledger. Cancelamentos recebem crédito e estorno,
-- preservando a história sem contabilizar saldo atual.
INSERT INTO public.venda_metricas_ledger (
  venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
  origem, idempotency_key, criado_por
)
SELECT
  v.id,
  v.corretor_id,
  'credito',
  (v.aprovado_em AT TIME ZONE 'America/Sao_Paulo')::date,
  1,
  GREATEST(v.valor_venda, 0),
  'legado',
  'venda:' || v.id::text || ':metricas:credito',
  v.aprovado_por
FROM public.vendas AS v
WHERE v.corretor_id IS NOT NULL
  AND v.status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.venda_metricas_ledger (
  venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
  origem, idempotency_key, criado_por
)
SELECT
  v.id,
  v.corretor_id,
  'estorno',
  credito.dia,
  -1,
  -GREATEST(v.valor_venda, 0),
  'legado',
  'venda:' || v.id::text || ':metricas:estorno',
  v.aprovado_por
FROM public.vendas AS v
JOIN public.venda_metricas_ledger AS credito
  ON credito.venda_id = v.id AND credito.evento = 'credito'
WHERE v.corretor_id IS NOT NULL
  AND v.status_venda = 'cancelada'::public.status_venda
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.comissao_ledger (
  comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
  idempotency_key, criado_por, metadata
)
SELECT
  c.id,
  c.venda_id,
  c.beneficiario_id,
  c.tipo,
  'credito',
  GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
  'venda:' || c.venda_id::text || ':comissao:' || c.id::text || ':credito',
  v.aprovado_por,
  jsonb_build_object('origem', 'legado')
FROM public.comissoes AS c
JOIN public.vendas AS v ON v.id = c.venda_id
WHERE c.venda_id IS NOT NULL
  AND v.status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.comissao_ledger (
  comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
  idempotency_key, criado_por, metadata
)
SELECT
  c.id,
  c.venda_id,
  c.beneficiario_id,
  c.tipo,
  'estorno',
  GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
  'venda:' || c.venda_id::text || ':comissao:' || c.id::text || ':estorno',
  v.aprovado_por,
  jsonb_build_object('origem', 'legado')
FROM public.comissoes AS c
JOIN public.vendas AS v ON v.id = c.venda_id
WHERE c.venda_id IS NOT NULL
  AND (
    v.status_venda = 'cancelada'::public.status_venda
    OR c.status = 'cancelada'
  )
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE public.comissoes AS c
SET status = 'cancelada', updated_at = now()
FROM public.vendas AS v
WHERE v.id = c.venda_id
  AND v.status_venda IN ('rejeitada'::public.status_venda, 'cancelada'::public.status_venda)
  AND c.status <> 'cancelada';

-- Reconcilia somente as parcelas de venda/VGV. As demais atividades diárias
-- permanecem intactas; pontuação é recalculada com a configuração vigente.
INSERT INTO public.atividades_diarias (corretor_id, dia, vendas, vgv_dia)
SELECT
  l.corretor_id,
  l.dia,
  COALESCE(sum(l.vendas_delta), 0)::integer,
  COALESCE(sum(l.vgv_delta), 0)
FROM public.venda_metricas_ledger AS l
GROUP BY l.corretor_id, l.dia
ON CONFLICT (corretor_id, dia) DO UPDATE SET
  vendas = EXCLUDED.vendas,
  vgv_dia = EXCLUDED.vgv_dia,
  updated_at = now();

UPDATE public.atividades_diarias AS a
SET vendas = 0,
    vgv_dia = 0,
    updated_at = now()
WHERE (a.vendas <> 0 OR a.vgv_dia <> 0)
  AND NOT EXISTS (
    SELECT 1
    FROM public.venda_metricas_ledger AS l
    WHERE l.corretor_id = a.corretor_id AND l.dia = a.dia
  );

UPDATE public.atividades_diarias
SET pontuacao_total =
      ligacoes * public.pontos_de('ligacao')
    + whatsapps * public.pontos_de('whatsapp')
    + agendamentos * public.pontos_de('agendamento')
    + visitas * public.pontos_de('visita')
    + documentacoes * public.pontos_de('documentacao')
    + vendas * public.pontos_de('venda'),
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Efeitos de aprovação e estorno
-- ---------------------------------------------------------------------------
-- Nenhum efeito comercial nasce mais no INSERT da venda.
DROP TRIGGER IF EXISTS trg_gerar_comissoes_v2 ON public.vendas;
DROP TRIGGER IF EXISTS trg_comissoes_distrato ON public.vendas;
DROP TRIGGER IF EXISTS trg_pont_venda ON public.vendas;

-- Fechar o lead deixa de contar venda por transição; a aprovação abaixo passa a
-- ser a única origem de `vendas` e `vgv_dia`.
CREATE OR REPLACE FUNCTION public.pont_after_transicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.corretor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.para_status = 'visita_realizada'::public.lead_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vis => 1);
  ELSIF NEW.para_status = 'analise_credito'::public.lead_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _doc => 1);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pont_after_transicao() FROM PUBLIC, anon, authenticated;

-- Reescreve o gerador existente no schema V2. Ele é deliberadamente inerte
-- enquanto a venda não está aprovada.
CREATE OR REPLACE FUNCTION public.gerar_comissoes_para_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _v public.vendas%ROWTYPE;
  _corretor_nome text;
  _gerente_id uuid;
  _gerente_nome text;
  _super_id uuid;
  _super_nome text;
BEGIN
  SELECT * INTO _v
  FROM public.vendas
  WHERE id = _venda_id
  FOR UPDATE;

  IF NOT FOUND OR _v.status_venda <> 'aprovada'::public.status_venda THEN
    RETURN;
  END IF;

  SELECT p.nome INTO _corretor_nome
  FROM public.profiles AS p
  WHERE p.id = _v.corretor_id;

  SELECT e.gestor_id INTO _gerente_id
  FROM public.profiles AS p
  JOIN public.equipes AS e ON e.id = p.equipe_id
  WHERE p.id = _v.corretor_id;

  IF _gerente_id IS NOT NULL THEN
    SELECT p.nome INTO _gerente_nome
    FROM public.profiles AS p
    WHERE p.id = _gerente_id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta
  ) = 1 THEN
    SELECT ur.user_id INTO _super_id
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta;

    SELECT p.nome INTO _super_nome
    FROM public.profiles AS p
    WHERE p.id = _super_id;
  END IF;

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _v.corretor_id, _corretor_nome, 'corretor', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_corretor, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), _v.valor_venda
  WHERE (_v.corretor_id IS NOT NULL OR COALESCE(_v.percentual_corretor, 0) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'corretor'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _gerente_id, _gerente_nome, 'gerente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_gerente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_gerente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'gerente'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _super_id, _super_nome, 'superintendente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_superintendente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_superintendente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'superintendente'
    );

  INSERT INTO public.comissao_ledger (
    comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
    idempotency_key, criado_por, metadata
  )
  SELECT
    c.id,
    _v.id,
    c.beneficiario_id,
    c.tipo,
    'credito',
    GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
    'venda:' || _v.id::text || ':comissao:' || c.id::text || ':credito',
    _v.aprovado_por,
    jsonb_build_object('status_venda', _v.status_venda::text)
  FROM public.comissoes AS c
  WHERE c.venda_id = _v.id
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_comissoes_para_venda(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_mutacao_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _via_rpc boolean := COALESCE(
    current_setting('app.aprovar_venda', true) = 'on', false
  );
  _legacy_distrato boolean := false;
  _gestao boolean := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'authenticated'
       AND NEW.status_venda NOT IN (
         'rascunho'::public.status_venda, 'pendente'::public.status_venda
       ) THEN
      RAISE EXCEPTION 'venda deve iniciar como rascunho ou pendente'
        USING ERRCODE = '42501';
    END IF;
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
    NEW.motivo_decisao := NULL;
    NEW.status_venda_updated_at := now();
    RETURN NEW;
  END IF;

  IF auth.role() = 'authenticated' THEN
    IF NEW.lead_id IS DISTINCT FROM OLD.lead_id
       OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
       OR NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id THEN
      RAISE EXCEPTION 'vínculos da venda são imutáveis'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status_venda = 'aprovada'::public.status_venda
       AND (
         NEW.valor_venda IS DISTINCT FROM OLD.valor_venda
         OR NEW.data_assinatura IS DISTINCT FROM OLD.data_assinatura
         OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id
         OR NEW.projeto_nome IS DISTINCT FROM OLD.projeto_nome
         OR NEW.percentual_comissao IS DISTINCT FROM OLD.percentual_comissao
         OR NEW.percentual_corretor IS DISTINCT FROM OLD.percentual_corretor
         OR NEW.percentual_gerente IS DISTINCT FROM OLD.percentual_gerente
         OR NEW.percentual_superintendente IS DISTINCT FROM OLD.percentual_superintendente
       ) THEN
      RAISE EXCEPTION 'venda aprovada é imutável; cancele e registre uma correção'
        USING ERRCODE = '42501';
    END IF;

    -- Compatibilidade temporária com o botão legado de distrato. Somente gestão
    -- pode usá-lo e o trigger converte a ação em cancelamento auditado.
    IF NEW.distrato AND NOT OLD.distrato
       AND OLD.status_venda = 'aprovada'::public.status_venda
       AND NEW.status_venda = OLD.status_venda THEN
      IF NOT _gestao THEN
        RAISE EXCEPTION 'somente gestão pode cancelar venda'
          USING ERRCODE = '42501';
      END IF;
      NEW.status_venda := 'cancelada'::public.status_venda;
      NEW.motivo_decisao := COALESCE(
        NULLIF(btrim(NEW.motivo_distrato), ''), 'Distrato registrado no fluxo legado'
      );
      NEW.data_distrato := COALESCE(NEW.data_distrato, current_date);
      _legacy_distrato := true;
    ELSIF NEW.distrato IS DISTINCT FROM OLD.distrato
          AND NOT _via_rpc THEN
      RAISE EXCEPTION 'use a RPC aprovar_venda para alterar o distrato'
        USING ERRCODE = '42501';
    ELSIF NEW.status_venda IS DISTINCT FROM OLD.status_venda AND NOT _via_rpc THEN
      RAISE EXCEPTION 'use a RPC aprovar_venda para alterar o estado da venda'
        USING ERRCODE = '42501';
    END IF;

    IF NOT _via_rpc AND NOT _legacy_distrato
       AND (
         NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por
         OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
         OR NEW.motivo_decisao IS DISTINCT FROM OLD.motivo_decisao
         OR NEW.status_venda_updated_at IS DISTINCT FROM OLD.status_venda_updated_at
         OR NEW.data_distrato IS DISTINCT FROM OLD.data_distrato
         OR NEW.motivo_distrato IS DISTINCT FROM OLD.motivo_distrato
       ) THEN
      RAISE EXCEPTION 'campos de decisão da venda são controlados pela RPC'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status_venda = 'cancelada'::public.status_venda
       AND NOT NEW.distrato THEN
      RAISE EXCEPTION 'cancelamento de venda não pode ser desfeito'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status_venda IS DISTINCT FROM OLD.status_venda THEN
    NEW.status_venda_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_mutacao_venda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_mutacao_venda ON public.vendas;
CREATE TRIGGER trg_validar_mutacao_venda
  BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.validar_mutacao_venda();

CREATE OR REPLACE FUNCTION public.validar_mutacao_comissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated'
     OR current_setting('app.commercial_effects', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.venda_id IS DISTINCT FROM OLD.venda_id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.beneficiario_id IS DISTINCT FROM OLD.beneficiario_id
     OR NEW.beneficiario_nome IS DISTINCT FROM OLD.beneficiario_nome
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.valor_base IS DISTINCT FROM OLD.valor_base
     OR NEW.percentual IS DISTINCT FROM OLD.percentual
     OR NEW.valor_comissao IS DISTINCT FROM OLD.valor_comissao
     OR NEW.percentual_desconto IS DISTINCT FROM OLD.percentual_desconto
     OR NEW.valor_liquido IS DISTINCT FROM OLD.valor_liquido
     OR NEW.contrato_vgv IS DISTINCT FROM OLD.contrato_vgv THEN
    RAISE EXCEPTION 'valores da comissão são controlados pelo ledger'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'pendente' AND NEW.status = 'paga' AND NEW.data_pagamento IS NOT NULL)
       OR (OLD.status = 'paga' AND NEW.status = 'pendente' AND NEW.data_pagamento IS NULL)
     ) THEN
    RAISE EXCEPTION 'transição de comissão inválida'
      USING ERRCODE = '22023';
  END IF;

  IF (NEW.status = 'paga' AND NEW.data_pagamento IS NULL)
     OR (NEW.status = 'pendente' AND NEW.data_pagamento IS NOT NULL) THEN
    RAISE EXCEPTION 'status e data de pagamento são inconsistentes'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_mutacao_comissao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_mutacao_comissao ON public.comissoes;
CREATE TRIGGER trg_validar_mutacao_comissao
  BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_mutacao_comissao();

CREATE OR REPLACE FUNCTION public.aplicar_efeitos_status_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ledger_id uuid;
  _dia date;
BEGIN
  IF NEW.status_venda = OLD.status_venda THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.commercial_effects', 'on', true);
  PERFORM set_config('app.transicionar_lead', 'on', true);

  IF NEW.status_venda = 'aprovada'::public.status_venda THEN
    PERFORM public.gerar_comissoes_para_venda(NEW.id);

    _dia := (NEW.aprovado_em AT TIME ZONE 'America/Sao_Paulo')::date;
    INSERT INTO public.venda_metricas_ledger (
      venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
      origem, idempotency_key, criado_por
    )
    VALUES (
      NEW.id, NEW.corretor_id, 'credito', _dia, 1, NEW.valor_venda,
      'aprovacao', 'venda:' || NEW.id::text || ':metricas:credito', NEW.aprovado_por
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO _ledger_id;

    IF _ledger_id IS NOT NULL THEN
      PERFORM public.bump_atividade(
        NEW.corretor_id, _dia, _ven => 1, _vgv => NEW.valor_venda
      );
    END IF;

    UPDATE public.leads
    SET status = 'contrato_fechado'::public.lead_status,
        proxima_acao = NULL,
        proximo_followup = NULL,
        ultima_interacao = now()
    WHERE id = NEW.lead_id
      AND status NOT IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status
      );

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (
      NEW.lead_id,
      'venda_aprovada',
      'Venda aprovada pela gestão.',
      'aprovar_venda',
      jsonb_build_object('venda_id', NEW.id, 'valor_venda', NEW.valor_venda)
    );

  ELSIF OLD.status_venda = 'aprovada'::public.status_venda
        AND NEW.status_venda = 'cancelada'::public.status_venda THEN
    -- Garante crédito antes do estorno inclusive para comissões adicionadas por
    -- service_role depois da aprovação.
    INSERT INTO public.comissao_ledger (
      comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
      idempotency_key, criado_por, metadata
    )
    SELECT
      c.id, NEW.id, c.beneficiario_id, c.tipo, 'credito',
      GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
      'venda:' || NEW.id::text || ':comissao:' || c.id::text || ':credito',
      NEW.aprovado_por, jsonb_build_object('origem', 'recuperacao')
    FROM public.comissoes AS c
    WHERE c.venda_id = NEW.id
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.comissao_ledger (
      comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
      idempotency_key, criado_por, metadata
    )
    SELECT
      c.id, NEW.id, c.beneficiario_id, c.tipo, 'estorno',
      GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
      'venda:' || NEW.id::text || ':comissao:' || c.id::text || ':estorno',
      auth.uid(), jsonb_build_object('motivo', NEW.motivo_decisao)
    FROM public.comissoes AS c
    WHERE c.venda_id = NEW.id
    ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.comissoes
    SET status = 'cancelada', updated_at = now()
    WHERE venda_id = NEW.id AND status <> 'cancelada';

    SELECT l.dia INTO _dia
    FROM public.venda_metricas_ledger AS l
    WHERE l.venda_id = NEW.id AND l.evento = 'credito';

    IF _dia IS NULL THEN
      RAISE EXCEPTION 'crédito de métricas ausente para venda aprovada %', NEW.id
        USING ERRCODE = '55000';
    END IF;

    _ledger_id := NULL;
    INSERT INTO public.venda_metricas_ledger (
      venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
      origem, idempotency_key, criado_por
    )
    VALUES (
      NEW.id, NEW.corretor_id, 'estorno', _dia, -1, -NEW.valor_venda,
      'cancelamento', 'venda:' || NEW.id::text || ':metricas:estorno', auth.uid()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO _ledger_id;

    IF _ledger_id IS NOT NULL THEN
      PERFORM public.bump_atividade(
        NEW.corretor_id, _dia, _ven => -1, _vgv => -NEW.valor_venda
      );
    END IF;

    UPDATE public.leads
    SET status = 'em_atendimento'::public.lead_status,
        proxima_acao = 'Revisar venda cancelada',
        proximo_followup = now(),
        ultima_interacao = now()
    WHERE id = NEW.lead_id
      AND status IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status
      );

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (
      NEW.lead_id,
      'venda_cancelada',
      NEW.motivo_decisao,
      'aprovar_venda',
      jsonb_build_object('venda_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_efeitos_status_venda()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aplicar_efeitos_status_venda ON public.vendas;
CREATE TRIGGER trg_aplicar_efeitos_status_venda
  AFTER UPDATE OF status_venda ON public.vendas
  FOR EACH ROW
  WHEN (OLD.status_venda IS DISTINCT FROM NEW.status_venda)
  EXECUTE FUNCTION public.aplicar_efeitos_status_venda();

-- ---------------------------------------------------------------------------
-- 4) RPC gerencial de aprovação/cancelamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprovar_venda(
  p_venda_id uuid,
  p_decisao public.status_venda,
  p_motivo text DEFAULT NULL
)
RETURNS public.vendas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _venda public.vendas%ROWTYPE;
  _resultado public.vendas%ROWTYPE;
  _uid uuid := auth.uid();
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'aprovação de venda exige papel de gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_decisao IS NULL THEN
    RAISE EXCEPTION 'decisão é obrigatória'
      USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _venda
  FROM public.vendas
  WHERE id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF _venda.lead_id IS NULL
     OR NOT public.pode_acessar_lead(_uid, _venda.lead_id) THEN
    RAISE EXCEPTION 'venda fora do escopo da gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_decisao NOT IN (
    'aprovada'::public.status_venda,
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'decisão deve ser aprovada, rejeitada ou cancelada'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = _venda.status_venda THEN
    RETURN _venda;
  END IF;

  IF _venda.status_venda IN (
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'venda em estado terminal não pode ser reaberta'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao IN (
    'aprovada'::public.status_venda,
    'rejeitada'::public.status_venda
  ) AND _venda.status_venda NOT IN (
    'rascunho'::public.status_venda,
    'pendente'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'transição de estado da venda inválida'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = 'cancelada'::public.status_venda
     AND _venda.status_venda <> 'aprovada'::public.status_venda THEN
    RAISE EXCEPTION 'somente venda aprovada pode ser cancelada'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao IN (
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório para rejeitar ou cancelar'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = 'aprovada'::public.status_venda THEN
    IF _venda.lead_id IS NULL OR _venda.corretor_id IS NULL
       OR _venda.valor_venda <= 0
       OR _venda.data_assinatura > current_date THEN
      RAISE EXCEPTION 'venda incompleta ou inválida para aprovação'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.leads AS l
      WHERE l.id = _venda.lead_id
        AND l.corretor_id = _venda.corretor_id
        AND l.deleted_at IS NULL
        AND l.status <> 'perdido'::public.lead_status
    ) THEN
      RAISE EXCEPTION 'venda não corresponde à carteira atual do lead'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.aprovar_venda', 'on', true);

  UPDATE public.vendas
  SET status_venda = p_decisao,
      aprovado_por = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda THEN _uid
        ELSE aprovado_por
      END,
      aprovado_em = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda THEN now()
        ELSE aprovado_em
      END,
      motivo_decisao = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda
          THEN NULLIF(btrim(p_motivo), '')
        ELSE btrim(p_motivo)
      END,
      distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN true
        ELSE distrato
      END,
      data_distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN current_date
        ELSE data_distrato
      END,
      motivo_distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN btrim(p_motivo)
        ELSE motivo_distrato
      END
  WHERE id = p_venda_id
  RETURNING * INTO _resultado;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_venda(uuid, public.status_venda, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_venda(uuid, public.status_venda, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Máquina de estados transacional do lead
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(
  p_de public.lead_status,
  p_para public.lead_status,
  p_gestao boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificado','agendado','perdido'])
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','agendado','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','visita_realizada','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','proposta_enviada','contrato_fechado','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = 'pos_venda'
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno'])
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.transicao_lead_permitida(
  public.lead_status, public.lead_status, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transicionar_lead(
  p_lead_id uuid,
  p_novo_status public.lead_status,
  p_motivo text DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _resultado public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _gestao boolean;
  _acao_final text;
  _followup_final timestamptz;
BEGIN
  IF NOT _service_role AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
  END IF;

  IF p_novo_status IS NULL THEN
    RAISE EXCEPTION 'novo status é obrigatório'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT _service_role AND NOT public.pode_acessar_lead(_uid, p_lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  _gestao := _service_role
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT public.transicao_lead_permitida(_lead.status, p_novo_status, _gestao) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status = 'perdido'::public.lead_status
     AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório ao perder um lead'
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'contrato_fechado'::public.lead_status,
    'pos_venda'::public.lead_status
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.vendas AS v
    WHERE v.lead_id = p_lead_id
      AND v.status_venda = 'aprovada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda'
      USING ERRCODE = '23514';
  END IF;

  IF p_novo_status IN (
    'contrato_fechado'::public.lead_status,
    'pos_venda'::public.lead_status
  ) AND NOT _gestao THEN
    RAISE EXCEPTION 'fechamento e pós-venda exigem papel de gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_proxima_acao IS NOT NULL AND char_length(btrim(p_proxima_acao)) > 500 THEN
    RAISE EXCEPTION 'próxima ação excede 500 caracteres'
      USING ERRCODE = '22023';
  END IF;

  IF p_proximo_followup IS NOT NULL
     AND p_proximo_followup <= now()
     AND p_novo_status NOT IN (
       'contrato_fechado'::public.lead_status,
       'pos_venda'::public.lead_status,
       'perdido'::public.lead_status
     ) THEN
    RAISE EXCEPTION 'follow-up deve estar no futuro'
      USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  _acao_final := COALESCE(NULLIF(btrim(p_proxima_acao), ''), _lead.proxima_acao);
  _followup_final := COALESCE(p_proximo_followup, _lead.proximo_followup);

  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND (_followup_final IS NULL OR _followup_final <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'em_atendimento'::public.lead_status,
    'aguardando_retorno'::public.lead_status,
    'qualificado'::public.lead_status,
    'agendado'::public.lead_status,
    'visita_realizada'::public.lead_status,
    'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status
  ) AND _acao_final IS NULL AND _followup_final IS NULL THEN
    RAISE EXCEPTION 'informe próxima ação ou follow-up'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);

  UPDATE public.leads
  SET status = p_novo_status,
      motivo_perdido = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN btrim(p_motivo)
        WHEN _lead.status = 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perdido
      END,
      motivo_perda_categoria = CASE
        WHEN _lead.status = 'perdido'::public.lead_status
             AND p_novo_status <> 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perda_categoria
      END,
      proxima_acao = CASE
        WHEN p_novo_status IN (
          'contrato_fechado'::public.lead_status,
          'pos_venda'::public.lead_status,
          'perdido'::public.lead_status
        ) THEN NULL
        ELSE _acao_final
      END,
      proximo_followup = CASE
        WHEN p_novo_status IN (
          'contrato_fechado'::public.lead_status,
          'pos_venda'::public.lead_status,
          'perdido'::public.lead_status
        ) THEN NULL
        ELSE _followup_final
      END,
      ultima_interacao = now()
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    p_lead_id,
    'transicao_lead',
    'Lead movido de ' || _lead.status::text || ' para ' || p_novo_status::text || '.',
    'transicionar_lead',
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _lead.status,
      'para_status', p_novo_status,
      'motivo', NULLIF(btrim(p_motivo), ''),
      'proxima_acao', _resultado.proxima_acao,
      'proximo_followup', _resultado.proximo_followup,
      'alterado_por', _uid
    ))
  );

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) TO authenticated;

-- Defesa transversal: nem UPDATE direto, nem função legada pode fechar um lead
-- sem que exista uma venda aprovada no mesmo transaction snapshot.
CREATE OR REPLACE FUNCTION public.proteger_fechamento_sem_venda_aprovada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IN (
      'contrato_fechado'::public.lead_status,
      'pos_venda'::public.lead_status
    )
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.lead_id = NEW.id
        AND v.status_venda = 'aprovada'::public.status_venda
    ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_fechamento_sem_venda_aprovada()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proteger_fechamento_sem_venda_aprovada ON public.leads;
CREATE TRIGGER trg_proteger_fechamento_sem_venda_aprovada
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.proteger_fechamento_sem_venda_aprovada();

-- ---------------------------------------------------------------------------
-- 6) RLS fail-closed de vendas e comissões
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vendas_select" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_auth" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_integridade" ON public.vendas;

CREATE POLICY "vendas_select_integridade"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
  );

CREATE POLICY "vendas_insert_integridade"
  ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND criado_por_id = auth.uid()
    AND lead_id IS NOT NULL
    AND corretor_id IS NOT NULL
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda
    )
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND EXISTS (
      SELECT 1
      FROM public.leads AS l
      WHERE l.id = vendas.lead_id
        AND l.corretor_id = vendas.corretor_id
    )
  );

CREATE POLICY "vendas_update_integridade"
  ON public.vendas FOR UPDATE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
      OR (
        corretor_id = auth.uid()
        AND status_venda IN (
          'rascunho'::public.status_venda,
          'pendente'::public.status_venda
        )
      )
    )
  )
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
      OR (
        corretor_id = auth.uid()
        AND status_venda IN (
          'rascunho'::public.status_venda,
          'pendente'::public.status_venda
        )
      )
    )
  );

CREATE POLICY "vendas_delete_integridade"
  ON public.vendas FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'rejeitada'::public.status_venda
    )
  );

DROP POLICY IF EXISTS "comissoes_select" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_manage" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_select_own_or_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_insert_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_update_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_delete_admin" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_select_integridade" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_update_integridade" ON public.comissoes;

REVOKE INSERT, DELETE ON public.comissoes FROM authenticated;

CREATE POLICY "comissoes_select_integridade"
  ON public.comissoes FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.vendas AS v
        WHERE v.id = comissoes.venda_id
          AND v.lead_id IS NOT NULL
          AND public.pode_acessar_lead(auth.uid(), v.lead_id)
      )
    )
  );

CREATE POLICY "comissoes_update_integridade"
  ON public.comissoes FOR UPDATE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
    )
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = comissoes.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  )
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
    )
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = comissoes.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  );

-- Critério comercial da roleta: uma proposta pendente nunca qualifica o
-- corretor como vendedor do mês anterior.
CREATE OR REPLACE FUNCTION public.vendas_mes_anterior()
RETURNS TABLE (corretor_id uuid, qtd bigint, total numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.is_active_member(_caller)
       OR NOT (
         public.has_role(_caller, 'admin'::public.app_role)
         OR public.has_role(_caller, 'gestor'::public.app_role)
         OR public.has_role(_caller, 'superintendente'::public.app_role)
       ) THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v.corretor_id,
    count(*)::bigint,
    COALESCE(sum(v.valor_venda), 0)
  FROM public.vendas AS v
  WHERE v.status_venda = 'aprovada'::public.status_venda
    AND v.distrato = false
    AND v.corretor_id IS NOT NULL
    AND v.data_assinatura >= (
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month'
    )::date
    AND v.data_assinatura < (
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
    )::date
  GROUP BY v.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_mes_anterior() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_mes_anterior() TO authenticated, service_role;

COMMENT ON COLUMN public.vendas.status_venda IS
  'Estado gerencial. Comissão, VGV, ranking e meta só mudam em aprovada.';
COMMENT ON TABLE public.comissao_ledger IS
  'Ledger append-only e idempotente de créditos e estornos de comissão.';
COMMENT ON TABLE public.venda_metricas_ledger IS
  'Ledger append-only que materializa venda/VGV em atividades_diarias após aprovação.';
