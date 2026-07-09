-- ============================================================================
-- Distribuição v3 — passo 3/4: CUTOVER.
--
-- Religa todos os fluxos automáticos ao motor único (_distribuir_lead_v3):
--   • processar_distribuicao_automatica v3 — drena a fila SEM o EXIT global
--     (uma roleta starved não trava as outras — bug #9) e pula leads cuja
--     exceção aberta já esgotou as tentativas automáticas;
--   • redistribuir_sla_webhook v3 e redistribuir_leads_parados v3 — o re-pick
--     passa pelo motor e portanto RESPEITA cota/presença/pausa/% trabalhado
--     (bugs #2 e #3);
--   • disparar_repasse_sla_lead e marcar_lead_perdido reescritos por cima do
--     motor com ASSINATURAS IDÊNTICAS (timer do navegador e UI intactos);
--   • transferir_leads v3 — fecha exceção aberta e mantém o log de decisão;
--   • seed de continuidade: corretores da fila atual entram nas roletas
--     marquinhos/landing marcados como "migração automática — revisar"
--     (decisão de negócio: zero interrupção na virada; o gestor poda depois);
--   • reset da cota legada re-agendado para 00:00 BRT (bug #7) enquanto o
--     contador legado ainda existir (os contadores novos derivam do log).
--
-- Os nomes legados distribuir_lead / distribuir_lead_webhook /
-- gestor_fallback_webhook / distribuir_lead_elegivel continuam existindo até
-- o passo de descomissionamento — mas nada mais os chama depois do deploy
-- do app/edge function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Orquestrador (cron a cada minuto) — mesma assinatura.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _dist int := 0;
  _falhas int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- Exceção aberta que já esgotou as tentativas automáticas: espera ação
      -- humana na fila de exceções (reprocessar/corrigir/atribuir).
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
      )
    ORDER BY l.created_at ASC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      -- SEM EXIT: a falha vira exceção e o lote continua (outras roletas /
      -- outros leads não podem ficar reféns de uma roleta travada).
      _falhas := _falhas + 1;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Repasse por SLA de minutos — mesma assinatura, re-pick via motor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redistribuir_sla_webhook()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _res jsonb;
  _qtd int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead IN
    SELECT l.id, l.corretor_id, l.corretores_que_tentaram, dc.timeout_minutos
    FROM public.leads l
    JOIN public.distribuicao_config dc
      ON dc.origem = l.origem
     AND dc.timeout_minutos IS NOT NULL
    WHERE l.via_webhook = true
      AND l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
      AND COALESCE(l.tentativas_redistribuicao, 0) < 3
      AND l.data_distribuicao < now() - (dc.timeout_minutos || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
      )
    ORDER BY l.data_distribuicao ASC
    LIMIT 50
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- Garante que o corretor atual não recebe o próprio repasse.
    UPDATE public.leads
       SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    -- Motor único: respeita cota, presença, pausa e % trabalhado da roleta
    -- do lead (antes o repasse ignorava tudo isso — bug #3).
    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', NULL, NULL, NULL, 'sla_webhook',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _lead.corretor_id));

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id;
      _qtd := _qtd + 1;
    END IF;
    -- Falha → exceção aberta pelo motor dá visibilidade ao gestor; o lead
    -- permanece com o corretor atual sem queimar tentativa.
  END LOOP;

  RETURN _qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.redistribuir_sla_webhook() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Redistribuição de parados (horas) — mesma assinatura, caps preservados
--    (≤10 por corretor por rodada, ≤50 no total, ≤3 tentativas), via motor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _res jsonb;
  _qtd int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             row_number() OVER (
               PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC
             ) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL
        AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND l.data_distribuicao IS NOT NULL
        AND COALESCE(l.tentativas_redistribuicao, 0) < 3
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.distribuicao_excecoes e
          WHERE e.lead_id = l.id
            AND e.status IN ('pendente','em_analise')
            AND e.tentativas >= _max_tent
        )
    )
    SELECT id, corretor_id, data_distribuicao, timeout_horas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    UPDATE public.leads
       SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', NULL, NULL, NULL, 'lead_parado',
      jsonb_build_object('timeout_horas', _lead.timeout_horas,
                         'corretor_anterior_parado', _lead.corretor_id));

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id;
      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Repasse imediato (timer do navegador) — ASSINATURA IDÊNTICA, via motor.
--    Idempotente: revalida que o lead realmente estourou o SLA.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _res jsonb;
BEGIN
  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, dc.timeout_minutos
    INTO _lead
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.id = _lead_id
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR COALESCE(_lead.tentativas_redistribuicao, 0) >= 3
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  UPDATE public.leads
     SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
   WHERE id = _lead_id
     AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  _res := public._distribuir_lead_v3(
    _lead_id, 'redistribuicao', NULL, NULL, NULL, 'sla_webhook_imediato',
    jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                       'corretor_anterior_sla', _lead.corretor_id));

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.disparar_repasse_sla_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_repasse_sla_lead(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) marcar_lead_perdido — ASSINATURA IDÊNTICA; o repasse pós-perda usa o
--    motor (sem abrir exceção: perda sem destino é desfecho terminal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(
  _lead_id uuid,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _res jsonb;
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria, 'Sem motivo informado');
BEGIN
  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

  -- Autorização: dono do lead, ou admin/gestor.
  IF _caller IS NOT NULL
     AND _caller <> COALESCE(_atual, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.has_role(_caller,'admin')
     AND NOT public.has_role(_caller,'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _atual IS NOT NULL AND NOT (_atual = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _atual);
    UPDATE public.leads SET corretores_que_tentaram = _tentou WHERE id = _lead_id;
  END IF;

  _res := public._distribuir_lead_v3(
    _lead_id, 'redistribuicao', NULL, NULL, _caller, 'lead_perdido',
    jsonb_build_object('motivo_perda', _motivo, 'corretor_que_perdeu', _atual),
    _registrar_excecao => false);

  IF (_res->>'ok')::boolean THEN
    -- Houve contato (o corretor trabalhou e perdeu o lead), mas o repasse pula
    -- o status 'perdido' — marca o contato nas listas de oferta manualmente.
    UPDATE public.oferta_ativa_leads
       SET contatado = true,
           contatado_em = COALESCE(contatado_em, now())
     WHERE lead_id = _lead_id
       AND NOT contatado;

    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id;

    RETURN (_res->>'corretor_id')::uuid;
  ELSE
    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = NULL,
           status = 'perdido',
           na_lixeira = true,
           data_movido_lixeira = now(),
           corretores_que_tentaram = _tentou,
           motivo_perdido = _motivo,
           motivo_perda_categoria = _categoria
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller, 'lead_perdido', 'sucesso');

    RETURN NULL;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) transferir_leads — mesma assinatura; agora fecha exceção aberta (a
--    gestão assumiu a triagem) e grava a decisão com resultado/regra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l record;
  _n int := 0;
  _ativo boolean;
  _nome text;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatório';
  END IF;

  SELECT p.ativo, p.nome INTO _ativo, _nome FROM public.profiles p WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo';
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads
    WHERE id = ANY(_ids)
    FOR UPDATE
  LOOP
    UPDATE public.leads
       SET corretor_anterior_id = _l.corretor_id,
           corretor_id = _corretor,
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = 0,
           via_webhook = false,
           corretores_que_tentaram = CASE
             WHEN _corretor = ANY(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
               THEN _l.corretores_que_tentaram
             ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
           END
     WHERE id = _l.id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado)
    VALUES (_l.id, _corretor, 'manual', 'Transferência manual', _caller, 'transferencia_manual', 'sucesso');

    -- Transferência manual resolve a exceção aberta do lead (se havia).
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida',
           resolvida_em = now(),
           resolvida_por = _caller,
           resolucao = 'Transferido manualmente para ' || _nome
     WHERE lead_id = _l.id AND status IN ('pendente','em_analise');

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6b) buscar_lead_por_telefone — dedup GLOBAL por dígitos (a landing não tem
--     projeto, então buscar_lead_duplicado(projeto, tel) não serve). Usa o
--     índice funcional idx_leads_telefone_digits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_lead_por_telefone(_telefone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND length(regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g')) >= 8
    AND regexp_replace(l.telefone, '\D', '', 'g')
          = regexp_replace(_telefone, '\D', '', 'g')
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.buscar_lead_por_telefone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_lead_por_telefone(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Seed de continuidade — marquinhos/landing herdam os corretores ativos da
--    fila atual, com marca explícita de migração para o gestor revisar
--    (hoje o chatbot já distribui para todos da fila; começar vazio viraria
--    uma chuva de exceções no primeiro minuto).
-- ---------------------------------------------------------------------------
INSERT INTO public.roleta_participantes
  (roleta_id, corretor_id, ativo, limite_diario, ultimo_lead_em, incluido_por)
SELECT r.id,
       fd.corretor_id,
       fd.ativo,
       fd.max_leads_dia,
       GREATEST(fd.ultima_distribuicao, p.last_lead_assigned_at),
       NULL
FROM public.fila_distribuicao fd
JOIN public.profiles p ON p.id = fd.corretor_id
-- inclui 'plantao' também: cobre corretores adicionados à fila entre o apply
-- da fundação e o cutover (idempotente — ON CONFLICT DO NOTHING).
CROSS JOIN (SELECT id, slug FROM public.roletas WHERE slug IN ('plantao','marquinhos','landing')) r
ON CONFLICT (roleta_id, corretor_id) DO NOTHING;

INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
SELECT rp.roleta_id, rp.corretor_id, 'incluido',
       'Migração automática da virada v3 — revisar participação'
       || CASE WHEN r.slug = 'marquinhos' THEN ' (critério de venda no mês anterior não validado)' ELSE '' END,
       NULL
FROM public.roleta_participantes rp
JOIN public.roletas r ON r.id = rp.roleta_id AND r.slug IN ('plantao','marquinhos','landing')
WHERE NOT EXISTS (
  SELECT 1 FROM public.roleta_participantes_log l
  WHERE l.roleta_id = rp.roleta_id AND l.corretor_id = rp.corretor_id AND l.acao = 'incluido'
);

-- ---------------------------------------------------------------------------
-- 8) Reset da cota legada em 00:00 BRT (03:00 UTC) — o contador
--    fila_distribuicao.leads_recebidos_hoje só existe por compatibilidade,
--    mas enquanto existir precisa virar o dia junto com o resto do sistema.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-cotas-diarias') THEN
    PERFORM cron.unschedule('reset-cotas-diarias');
  END IF;
END $$;

SELECT cron.schedule(
  'reset-cotas-diarias',
  '0 3 * * *',
  $$SELECT public.resetar_cotas_diarias();$$
);

-- ---------------------------------------------------------------------------
-- 9) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int;
BEGIN
  SELECT count(DISTINCT r.slug) INTO _n
  FROM public.roleta_participantes rp
  JOIN public.roletas r ON r.id = rp.roleta_id;
  -- Com fila vazia não há participantes (ambiente novo) — só valida quando
  -- houve seed.
  IF EXISTS (SELECT 1 FROM public.fila_distribuicao) AND _n < 3 THEN
    RAISE EXCEPTION 'cutover: seed de continuidade incompleto (% roletas com participantes)', _n;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
