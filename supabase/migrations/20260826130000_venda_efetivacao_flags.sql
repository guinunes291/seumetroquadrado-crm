-- Efetivação da venda: "Contrato Assinado", "Ato Pago" e "Apto para repasse".
--
-- Problema operacional: a equipe precisa CADASTRAR a venda no momento da venda,
-- mas a efetivação real (comissão, VGV, ranking, fechamento do lead) só deve
-- acontecer quando toda a esteira burocrática concluiu. Esta migração dá nome
-- aos três marcos dessa esteira e trava a aprovação gerencial neles:
--
--   1. A venda continua nascendo rascunho/pendente no momento da venda.
--   2. Gestão ou o corretor da venda vão ligando os marcos conforme acontecem
--      (via RPC atualizar_efetivacao_venda — nunca por UPDATE direto).
--   3. aprovar_venda('aprovada') passa a EXIGIR os três marcos ativos. A
--      aprovação segue sendo o único gatilho de comissão/VGV/fechamento.
--
-- Backfill: vendas já aprovadas (e canceladas, que um dia foram aprovadas)
-- entram com os três marcos ligados — elas já produziram efeitos no modelo
-- anterior. Pendentes/rascunhos existentes entram com os marcos desligados e
-- seguem o processo novo.

-- ---------------------------------------------------------------------------
-- 1) Colunas + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS contrato_assinado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_assinado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ato_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ato_pago_em timestamptz,
  ADD COLUMN IF NOT EXISTS apto_repasse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apto_repasse_em timestamptz;

COMMENT ON COLUMN public.vendas.contrato_assinado IS
  'Marco de efetivação 1/3: contrato assinado pelo cliente.';
COMMENT ON COLUMN public.vendas.ato_pago IS
  'Marco de efetivação 2/3: ato (entrada) pago.';
COMMENT ON COLUMN public.vendas.apto_repasse IS
  'Marco de efetivação 3/3: venda apta para repasse. Com os 3 marcos ativos a venda pode ser aprovada.';

UPDATE public.vendas
SET contrato_assinado = true,
    contrato_assinado_em = COALESCE(
      contrato_assinado_em, aprovado_em, status_venda_updated_at, created_at, now()
    ),
    ato_pago = true,
    ato_pago_em = COALESCE(
      ato_pago_em, aprovado_em, status_venda_updated_at, created_at, now()
    ),
    apto_repasse = true,
    apto_repasse_em = COALESCE(
      apto_repasse_em, aprovado_em, status_venda_updated_at, created_at, now()
    )
WHERE status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
  AND NOT (contrato_assinado AND ato_pago AND apto_repasse);

-- Invariante estrutural (vale até para service_role): venda aprovada carrega
-- os três marcos. A porta de entrada continua sendo a RPC, mas o dado nunca
-- fica incoerente mesmo que surja outro caminho de escrita.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vendas'::regclass
      AND conname = 'vendas_efetivacao_aprovada_ck'
  ) THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_efetivacao_aprovada_ck CHECK (
        status_venda <> 'aprovada'::public.status_venda
        OR (contrato_assinado AND ato_pago AND apto_repasse)
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.vendas VALIDATE CONSTRAINT vendas_efetivacao_aprovada_ck;

-- ---------------------------------------------------------------------------
-- 2) Guard: marcos só mudam pela RPC; timestamps são derivados dos flags
-- ---------------------------------------------------------------------------
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
  _via_efetivacao boolean := COALESCE(
    current_setting('app.efetivacao_venda', true) = 'on', false
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
    -- Timestamps dos marcos derivam do flag (o cadastro pode já nascer com
    -- "contrato assinado", por exemplo). Valor explícito é honrado no backfill.
    NEW.contrato_assinado_em := CASE
      WHEN NEW.contrato_assinado THEN COALESCE(NEW.contrato_assinado_em, now())
      ELSE NULL
    END;
    NEW.ato_pago_em := CASE
      WHEN NEW.ato_pago THEN COALESCE(NEW.ato_pago_em, now())
      ELSE NULL
    END;
    NEW.apto_repasse_em := CASE
      WHEN NEW.apto_repasse THEN COALESCE(NEW.apto_repasse_em, now())
      ELSE NULL
    END;
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

    IF NOT _via_efetivacao
       AND (
         NEW.contrato_assinado IS DISTINCT FROM OLD.contrato_assinado
         OR NEW.ato_pago IS DISTINCT FROM OLD.ato_pago
         OR NEW.apto_repasse IS DISTINCT FROM OLD.apto_repasse
         OR NEW.contrato_assinado_em IS DISTINCT FROM OLD.contrato_assinado_em
         OR NEW.ato_pago_em IS DISTINCT FROM OLD.ato_pago_em
         OR NEW.apto_repasse_em IS DISTINCT FROM OLD.apto_repasse_em
       ) THEN
      RAISE EXCEPTION 'use a RPC atualizar_efetivacao_venda para alterar os marcos de efetivação'
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

  -- Normalização (vale para qualquer papel): flag ligado carimba o momento;
  -- flag desligado limpa o timestamp. Timestamp explícito do chamador é
  -- honrado (backfills administrativos).
  IF NEW.contrato_assinado IS DISTINCT FROM OLD.contrato_assinado THEN
    NEW.contrato_assinado_em := CASE
      WHEN NOT NEW.contrato_assinado THEN NULL
      WHEN NEW.contrato_assinado_em IS DISTINCT FROM OLD.contrato_assinado_em
        THEN NEW.contrato_assinado_em
      ELSE now()
    END;
  END IF;
  IF NEW.ato_pago IS DISTINCT FROM OLD.ato_pago THEN
    NEW.ato_pago_em := CASE
      WHEN NOT NEW.ato_pago THEN NULL
      WHEN NEW.ato_pago_em IS DISTINCT FROM OLD.ato_pago_em THEN NEW.ato_pago_em
      ELSE now()
    END;
  END IF;
  IF NEW.apto_repasse IS DISTINCT FROM OLD.apto_repasse THEN
    NEW.apto_repasse_em := CASE
      WHEN NOT NEW.apto_repasse THEN NULL
      WHEN NEW.apto_repasse_em IS DISTINCT FROM OLD.apto_repasse_em THEN NEW.apto_repasse_em
      ELSE now()
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_mutacao_venda() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC de efetivação: gestão ou o corretor da venda ligam/desligam marcos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_efetivacao_venda(
  p_venda_id uuid,
  p_contrato_assinado boolean DEFAULT NULL,
  p_ato_pago boolean DEFAULT NULL,
  p_apto_repasse boolean DEFAULT NULL
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
  _gestao boolean;
  _mudou boolean;
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'venda fora da sua carteira'
      USING ERRCODE = '42501';
  END IF;

  _gestao := public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT _gestao
     AND _venda.corretor_id IS DISTINCT FROM _uid
     AND _venda.criado_por_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'marcos de efetivação exigem gestão ou o corretor da venda'
      USING ERRCODE = '42501';
  END IF;

  _mudou := (
    p_contrato_assinado IS NOT NULL
    AND p_contrato_assinado IS DISTINCT FROM _venda.contrato_assinado
  ) OR (
    p_ato_pago IS NOT NULL AND p_ato_pago IS DISTINCT FROM _venda.ato_pago
  ) OR (
    p_apto_repasse IS NOT NULL AND p_apto_repasse IS DISTINCT FROM _venda.apto_repasse
  );

  -- Idempotente: sem mudança real, devolve a linha sem tocar em nada.
  IF NOT _mudou THEN
    RETURN _venda;
  END IF;

  IF _venda.status_venda NOT IN (
    'rascunho'::public.status_venda,
    'pendente'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'marcos de efetivação só podem ser alterados antes da decisão da venda'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.efetivacao_venda', 'on', true);

  UPDATE public.vendas
  SET contrato_assinado = COALESCE(p_contrato_assinado, contrato_assinado),
      ato_pago = COALESCE(p_ato_pago, ato_pago),
      apto_repasse = COALESCE(p_apto_repasse, apto_repasse)
  WHERE id = p_venda_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _resultado.lead_id,
    'efetivacao_venda',
    'Marcos de efetivação da venda atualizados.',
    'atualizar_efetivacao_venda',
    jsonb_build_object(
      'venda_id', _resultado.id,
      'contrato_assinado', _resultado.contrato_assinado,
      'ato_pago', _resultado.ato_pago,
      'apto_repasse', _resultado.apto_repasse,
      'alterado_por', _uid
    )
  );

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_efetivacao_venda(uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_efetivacao_venda(uuid, boolean, boolean, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) aprovar_venda passa a exigir os três marcos para aprovar
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

    -- Efetivação: a venda fica cadastrada aguardando a esteira; a aprovação
    -- (única origem de comissão/VGV/fechamento) exige os três marcos ativos.
    IF NOT (_venda.contrato_assinado AND _venda.ato_pago AND _venda.apto_repasse) THEN
      RAISE EXCEPTION 'venda só pode ser aprovada com os 3 marcos de efetivação ativos: contrato assinado, ato pago e apto para repasse'
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
