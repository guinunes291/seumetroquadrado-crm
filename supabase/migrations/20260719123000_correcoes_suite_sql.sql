-- =====================================================================
-- Auditoria 2026-07-19 — correções dos bugs confirmados pela suíte SQL
-- (tests/db, rodando contra Postgres real).
--
--  1) distribuir_lead_ponderado ROUBAVA lead já atribuído (sem guarda de
--     idempotência) e, sem lock, duas chamadas concorrentes duplicavam o
--     distribution_log e avançavam o cursor SWRR duas vezes.
--  2) O espelho leads.proximo_followup voltava a exibir follow-up em lead
--     encerrado (contrato_fechado/pos_venda/perdido) quando sobrava tarefa
--     aberta de tipo não-contato (visita/documentacao/outro), ou quando
--     alguém criava tarefa num lead já perdido.
--  3) Os índices únicos de dedup por telefone contavam leads NA LIXEIRA
--     como ativos: cliente retornante (lead antigo na lixeira) não podia
--     ser cadastrado de novo. Lixeira sai da chave (o restore de um lead
--     que conflite volta a ser barrado pelo índice — conflito explícito
--     para o gestor mesclar).
-- Idempotente.
-- =====================================================================

-- (1) Motor ponderado: lock do lead + idempotência + lock do cursor.
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  -- Trava o lead: serializa chamadas concorrentes para o MESMO lead e
  -- garante a leitura consistente de corretor_id.
  SELECT id, corretor_id, status INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  -- Idempotência: lead já atribuído não é redistribuído por este motor
  -- (transferência é fluxo próprio, transferir_leads).
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  -- Serializa o cursor SWRR da roleta entre chamadas de leads DIFERENTES:
  -- sem isto, dois inserts simultâneos avançavam o current-weight duas
  -- vezes antes de qualquer escolha, distorcendo o rodízio e o log.
  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _dlp_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _dlp_elegiveis;

  INSERT INTO _dlp_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  SELECT sum(peso) INTO _sum_pesos FROM _dlp_elegiveis;
  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_disponivel');
  END IF;

  -- SWRR: current += peso para todos elegíveis
  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  -- Escolhe o maior current_weight
  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  -- Subtrai soma dos pesos do escolhido, marca cursor
  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  -- Atribui o lead (status intocado se o lead já avançou no funil — a
  -- atribuição inicial não pode regredir etapa).
  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'em_atendimento'::public.lead_status
           ELSE status
         END,
         data_distribuicao = COALESCE(data_distribuicao, now())
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;

  INSERT INTO public.distribution_log(
    lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado
  )
  VALUES (
    _lead_id, _picked, 'automatica', 'roleta_ponderada',
    _roleta.slug, 'roleta:'||_roleta.slug||':tier'||_tier_picked, 'sucesso'
  );

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked,
    'tier', _tier_picked, 'roleta_slug', _roleta.slug
  );
END;
$function$;

-- (2) Espelho de follow-up: lead encerrado não exibe próximo follow-up.
CREATE OR REPLACE FUNCTION public.sync_proximo_followup(_lead_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.leads l
     SET proximo_followup = alvo.valor
    FROM (
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM public.leads li
           WHERE li.id = _lead_id
             AND li.status IN ('contrato_fechado'::public.lead_status,
                               'pos_venda'::public.lead_status,
                               'perdido'::public.lead_status)
        ) THEN NULL
        ELSE (
          SELECT min(t.data_vencimento)
            FROM public.tarefas t
           WHERE t.lead_id = _lead_id
             AND t.status IN ('pendente','em_andamento')
             AND t.deleted_at IS NULL
             AND t.data_vencimento IS NOT NULL
        )
      END AS valor
    ) alvo
   WHERE l.id = _lead_id
     AND l.proximo_followup IS DISTINCT FROM alvo.valor;
$function$;

-- Reaplica o espelho para leads encerrados que ficaram com resíduo.
UPDATE public.leads
   SET proximo_followup = NULL
 WHERE status IN ('contrato_fechado'::public.lead_status,
                  'pos_venda'::public.lead_status,
                  'perdido'::public.lead_status)
   AND proximo_followup IS NOT NULL;

-- (3) Lixeira fora da chave de dedup (ambos os índices).
DROP INDEX IF EXISTS public.uq_leads_projeto_telefone_ativo;
DO $$
BEGIN
  BEGIN
    -- Chave: últimos 10 dígitos (DDD+número) — "+55 11 9..." e "11 9..."
    -- passam a colidir (antes o DDI fazia parte da chave e escapava).
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo
      ON public.leads (projeto_id, right(public.telefone_digits(telefone), 10))
      WHERE deleted_at IS NULL
        AND na_lixeira = false
        AND projeto_id IS NOT NULL
        AND length(public.telefone_digits(telefone)) >= 8;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'uq_leads_projeto_telefone_ativo não recriado: duplicatas ativas (vw_leads_telefone_duplicado).';
  END;
END $$;

DROP INDEX IF EXISTS public.uq_leads_sem_projeto_telefone_ativo;
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_sem_projeto_telefone_ativo
      ON public.leads (right(public.telefone_digits(telefone), 10))
      WHERE deleted_at IS NULL
        AND na_lixeira = false
        AND projeto_id IS NULL
        AND length(public.telefone_digits(telefone)) >= 8;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'uq_leads_sem_projeto_telefone_ativo não recriado: duplicatas ativas (vw_leads_sem_projeto_telefone_duplicado).';
  END;
END $$;

-- Alinha a checagem da RPC de criação: lead na lixeira não conta como
-- duplicata ativa (mesma regra dos índices).
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
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  _digits := right(public.telefone_digits(_telefone), 10);
  IF length(_digits) >= 8 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _digits));

    SELECT l.id, l.nome, l.corretor_id INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND right(public.telefone_digits(l.telefone), 10) = _digits
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
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
