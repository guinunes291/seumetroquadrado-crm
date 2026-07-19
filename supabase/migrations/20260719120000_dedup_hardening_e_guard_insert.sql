-- =====================================================================
-- Auditoria 2026-07-19 — Onda 5 (B2)
-- Endurecimento do dedup de leads + guard de fechamento no INSERT.
--
-- Problemas fechados aqui:
--   1) O índice único de dedup por (projeto, telefone) da 20260710122000 é
--      condicional — se a base tinha duplicatas quando rodou, ele NÃO foi
--      criado e a corrida de intake segue aberta. Re-tenta (idempotente).
--   2) Leads SEM projeto (landing/chatbot/cadastro manual) nunca tiveram
--      constraint de unicidade — dois cadastros simultâneos do mesmo
--      telefone criam dois leads. Novo índice único parcial + view de
--      relatório para limpeza humana (nada é apagado automaticamente).
--   3) A checagem de duplicidade do formulário "Novo lead" era só
--      client-side (check-then-insert). Nova RPC criar_lead_dedup fecha a
--      corrida com advisory lock transacional + checagem + insert atômicos,
--      espelhando EXATAMENTE a policy de INSERT (pode_atribuir_lead).
--   4) Os guards de fechamento (validar_status_lead_via_rpc e
--      proteger_fechamento_sem_venda_aprovada) só disparam em UPDATE:
--      um INSERT direto com status contrato_fechado/pos_venda contornava a
--      regra "fechamento exige venda aprovada". Nenhum caminho legítimo
--      insere lead já fechado (importação usa status 'novo'); novo trigger
--      BEFORE INSERT fecha o buraco.
-- Idempotente; seguro para replay e para produção.
-- =====================================================================

-- (1) Re-tentativa do índice por (projeto, telefone) — mesma guarda da
-- 20260710122000; vira no-op se já existe ou se ainda há duplicatas.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo
      ON public.leads (projeto_id, public.telefone_digits(telefone))
      WHERE deleted_at IS NULL
        AND projeto_id IS NOT NULL
        AND length(public.telefone_digits(telefone)) >= 8;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE WARNING 'uq_leads_projeto_telefone_ativo ainda NÃO criado: resolva public.vw_leads_telefone_duplicado e reaplique.';
  END;
END $$;

-- (2) Dedup para leads SEM projeto: relatório + índice único guardado.
CREATE OR REPLACE VIEW public.vw_leads_sem_projeto_telefone_duplicado AS
SELECT
  public.telefone_digits(l.telefone) AS telefone_digits,
  count(*) AS qtd,
  array_agg(l.id ORDER BY l.created_at DESC) AS lead_ids
FROM public.leads l
WHERE l.deleted_at IS NULL
  AND l.projeto_id IS NULL
  AND length(public.telefone_digits(l.telefone)) >= 8
GROUP BY public.telefone_digits(l.telefone)
HAVING count(*) > 1;

DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_sem_projeto_telefone_ativo
      ON public.leads (public.telefone_digits(telefone))
      WHERE deleted_at IS NULL
        AND projeto_id IS NULL
        AND length(public.telefone_digits(telefone)) >= 8;
    RAISE NOTICE 'uq_leads_sem_projeto_telefone_ativo criado.';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE WARNING 'uq_leads_sem_projeto_telefone_ativo NÃO criado: existem leads sem projeto duplicados por telefone. Resolva via public.vw_leads_sem_projeto_telefone_duplicado (mesclar_leads) e reaplique.';
  END;
END $$;

-- (3) Criação de lead com dedup atômico (formulário "Novo lead").
-- SECURITY DEFINER porque a checagem de duplicidade precisa enxergar além da
-- carteira do chamador — mas SEM vazar dados: retorna apenas o id e um rótulo
-- genérico quando o duplicado pertence a outra carteira. A autorização espelha
-- a policy de INSERT de leads (pode_atribuir_lead) e o whitelist de colunas é
-- exatamente o que o formulário envia.
CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _nome text := NULLIF(btrim(_payload->>'nome'), '');
  _telefone text := NULLIF(btrim(_payload->>'telefone'), '');
  _email text := NULLIF(lower(btrim(_payload->>'email')), '');
  _origem public.lead_origem;
  _projeto_id uuid := NULLIF(_payload->>'projeto_id', '')::uuid;
  _projeto_nome text := NULLIF(btrim(_payload->>'projeto_nome'), '');
  _observacoes text := NULLIF(btrim(_payload->>'observacoes'), '');
  _corretor_id uuid := NULLIF(_payload->>'corretor_id', '')::uuid;
  _status public.lead_status := COALESCE(
    NULLIF(_payload->>'status', '')::public.lead_status,
    'novo'::public.lead_status
  );
  _digits text;
  _dup record;
  _novo_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR _telefone IS NULL THEN
    RAISE EXCEPTION 'nome e telefone são obrigatórios' USING ERRCODE = '22023';
  END IF;
  -- Mesma barreira da policy de INSERT em leads.
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  -- Criação manual só nasce nas etapas de entrada; fechamento tem fluxo próprio.
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  -- Chave de comparação: últimos 10 dígitos (DDD + número). Um mesmo telefone
  -- digitado com e sem +55 tem telefone_digits diferentes — o índice único não
  -- pega esse caso (chave exata), então a comparação da RPC é deliberadamente
  -- mais laxa que o índice.
  _digits := right(public.telefone_digits(_telefone), 10);
  IF length(_digits) >= 8 THEN
    -- Serializa criações concorrentes do mesmo telefone (cobre inclusive o
    -- caso em que os índices únicos não puderam ser criados em produção).
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _digits));

    SELECT l.id, l.nome, l.corretor_id INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND right(public.telefone_digits(l.telefone), 10) = _digits
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
        -- Nome só quando o chamador pode ver o lead (não vaza outra carteira).
        'nome', CASE WHEN public.pode_acessar_lead(_uid, _dup.id) THEN _dup.nome ELSE NULL END,
        'na_carteira', public.pode_acessar_lead(_uid, _dup.id)
      );
    END IF;
  END IF;

  INSERT INTO public.leads (
    nome, telefone, email, origem, projeto_id, projeto_nome, observacoes,
    corretor_id, status
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _status
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_lead_dedup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lead_dedup(jsonb) TO authenticated, service_role;

-- (4) Guard de fechamento também no INSERT (a versão de UPDATE referencia OLD
-- e não serve para INSERT).
CREATE OR REPLACE FUNCTION public.proteger_fechamento_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.status IN (
      'contrato_fechado'::public.lead_status,
      'pos_venda'::public.lead_status
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.lead_id = NEW.id
        AND v.status_venda = 'aprovada'::public.status_venda
    ) THEN
    RAISE EXCEPTION 'lead só pode ser criado como fechado após aprovação da venda'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_fechamento_insert ON public.leads;
CREATE TRIGGER trg_proteger_fechamento_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status))
  EXECUTE FUNCTION public.proteger_fechamento_insert();
