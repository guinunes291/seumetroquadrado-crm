-- ============================================================================
-- Distribuição v3 — passo 2/4: MOTOR ÚNICO.
--
-- Nenhum caller muda nesta migration (os motores antigos seguem no ar).
-- Define o pipeline completo:
--
--   triar_e_distribuir_lead(lead, gatilho)
--     └─ _distribuir_lead_v3(lead, tipo, roleta?, corretor?, por?, gatilho, ctx)
--          ├─ _elegibilidade_roleta(slug)  → aptos/inaptos + motivos (fonte única)
--          ├─ vencedor = participante apto há mais tempo sem receber
--          │            (roleta_participantes.ultimo_lead_em — cursor ÚNICO)
--          ├─ sucesso → distribution_log(resultado='sucesso')
--          │            + distribuicao_log_contexto (snapshot aptos/inaptos)
--          └─ falha   → distribuicao_excecoes (upsert, 1 aberta por lead)
--                       + log 'sem_corretor' + alerta aos gestores
--
-- Convenção interna: funções prefixadas com "_" não têm gate de papel e ficam
-- REVOKEd de authenticated — só são alcançáveis por dentro das funções
-- SECURITY DEFINER públicas (que validam papel) e pelo service_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Índice funcional para lookup de telefone (dedup/corretor anterior).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_telefone_digits
  ON public.leads (regexp_replace(telefone, '\D', '', 'g'))
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 1) get_dist_setting — leitura de parâmetro com default embutido (o sistema
--    nunca quebra por setting ausente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dist_setting(_chave text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT valor FROM public.distribuicao_settings WHERE chave = _chave),
    CASE _chave
      WHEN 'percentual_minimo_trabalhado' THEN '90'::jsonb
      WHEN 'statuses_aguardando'          THEN '["aguardando_atendimento"]'::jsonb
      WHEN 'statuses_encerrados'          THEN '["contrato_fechado","pos_venda","perdido"]'::jsonb
      WHEN 'max_minutos_sem_atendimento'  THEN '30'::jsonb
      WHEN 'limite_diario_default'        THEN '10'::jsonb
      WHEN 'permitir_inclusao_manual'     THEN 'true'::jsonb
      WHEN 'reprocesso_max_tentativas'    THEN '3'::jsonb
      WHEN 'cota_conta_redistribuicao'    THEN 'false'::jsonb
      ELSE NULL
    END
  );
$$;

REVOKE ALL ON FUNCTION public.get_dist_setting(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dist_setting(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) _resolver_roleta_lead — canal/origem → roleta.
--    Landing tem precedência por CANAL (origem 'site' pode chegar de outros
--    lugares); o resto segue o mapeamento configurável origem → roleta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolver_roleta_lead(_canal text, _origem public.lead_origem)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _canal = 'webhook_landing' THEN 'landing'
    ELSE (SELECT dc.roleta_slug FROM public.distribuicao_config dc WHERE dc.origem = _origem)
  END;
$$;

REVOKE ALL ON FUNCTION public._resolver_roleta_lead(text, public.lead_origem) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolver_roleta_lead(text, public.lead_origem) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) _elegibilidade_roleta — FONTE ÚNICA de aptidão, usada pelo motor E pela
--    UI (via wrapper com gate). Uma linha por participante da roleta, com
--    motivos de inaptidão legíveis e auditáveis.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._elegibilidade_roleta(_slug text)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric AS pct_min,
           (public.get_dist_setting('limite_diario_default') #>> '{}')::int            AS lim_default,
           (public.get_dist_setting('cota_conta_redistribuicao') #>> '{}')::boolean    AS conta_redist,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_aguardando'))) AS st_aguardando,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_encerrados'))) AS st_encerrados,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt
  ),
  r AS (
    SELECT * FROM public.roletas WHERE slug = _slug
  ),
  base AS (
    SELECT rp.corretor_id,
           p.nome,
           rp.ativo AS participante_ativo,
           (rp.pausado_ate IS NOT NULL AND rp.pausado_ate > now()) AS pausado,
           rp.motivo_pausa,
           rp.ultimo_lead_em,
           rp.incluido_por,
           rp.incluido_em,
           COALESCE(rp.limite_diario, cfg.lim_default) AS limite,
           p.ativo AS perfil_ativo,
           (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
           (p.presente AND p.presente_em IS NOT NULL
             AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje_brt) AS presente_hoje,
           EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role
           ) AS eh_corretor,
           r.exigir_presenca,
           r.criterio_participacao,
           cfg.pct_min,
           cfg.st_aguardando,
           cfg.st_encerrados,
           cfg.conta_redist,
           cfg.hoje_brt
    FROM public.roleta_participantes rp
    JOIN r ON r.id = rp.roleta_id
    JOIN public.profiles p ON p.id = rp.corretor_id
    CROSS JOIN cfg
    WHERE lower(coalesce(p.nome, '')) <> 'docs-bot'
  ),
  carteira AS (
    SELECT b.corretor_id,
           count(l.id)::int AS total,
           (count(l.id) FILTER (WHERE l.status::text = ANY(b.st_aguardando)))::int AS aguardando
    FROM base b
    LEFT JOIN public.leads l
      ON l.corretor_id = b.corretor_id
     AND l.deleted_at IS NULL
     AND l.na_lixeira = false
     AND NOT (l.status::text = ANY(b.st_encerrados))
    GROUP BY b.corretor_id
  ),
  recebidos AS (
    -- Contadores derivados do LOG (fonte auditável) em dia/mês BRT — nada de
    -- contador mutável com cron de reset.
    SELECT b.corretor_id,
           (count(dl.id) FILTER (
              WHERE (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = b.hoje_brt))::int AS hoje_n,
           count(dl.id)::int AS mes_n
    FROM base b
    LEFT JOIN public.distribution_log dl
      ON dl.corretor_id = b.corretor_id
     AND dl.resultado = 'sucesso'
     AND dl.roleta_slug = _slug
     AND (dl.tipo IN ('automatica','inicial')
          OR (b.conta_redist AND dl.tipo = 'redistribuicao'))
     AND dl.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY b.corretor_id
  )
  SELECT
    b.corretor_id,
    b.nome,
    -- apto = passa em TODOS os critérios da roleta
    ( b.participante_ativo
      AND NOT b.pausado
      AND b.perfil_ativo
      AND b.eh_corretor
      AND b.tem_telefone
      AND (NOT b.exigir_presenca OR b.presente_hoje)
      AND rec.hoje_n < b.limite
      AND (b.criterio_participacao <> 'automatica_presenca'
           OR c.total = 0
           OR round(100.0 * (c.total - c.aguardando) / c.total, 1) >= b.pct_min)
    ) AS apto,
    array_remove(ARRAY[
      CASE WHEN NOT b.participante_ativo THEN 'participacao_inativa' END,
      CASE WHEN b.pausado THEN 'pausado' END,
      CASE WHEN NOT b.perfil_ativo THEN 'perfil_inativo' END,
      CASE WHEN NOT b.eh_corretor THEN 'sem_role_corretor' END,
      CASE WHEN NOT b.tem_telefone THEN 'sem_telefone' END,
      CASE WHEN b.exigir_presenca AND NOT b.presente_hoje THEN 'ausente_hoje' END,
      CASE WHEN rec.hoje_n >= b.limite THEN 'cota_diaria_atingida' END,
      CASE WHEN b.criterio_participacao = 'automatica_presenca'
                AND c.total > 0
                AND round(100.0 * (c.total - c.aguardando) / c.total, 1) < b.pct_min
           THEN 'pct_trabalhado_abaixo_minimo' END
    ], NULL) AS motivos,
    CASE WHEN c.total = 0 THEN 100
         ELSE round(100.0 * (c.total - c.aguardando) / c.total, 1) END AS pct_trabalhado,
    c.total AS carteira_total,
    c.aguardando,
    rec.hoje_n AS recebidos_hoje,
    rec.mes_n AS recebidos_mes,
    b.limite AS limite_diario,
    b.presente_hoje AS presente,
    b.pausado,
    b.motivo_pausa,
    b.participante_ativo,
    b.ultimo_lead_em,
    b.incluido_por,
    b.incluido_em
  FROM base b
  JOIN carteira c ON c.corretor_id = b.corretor_id
  JOIN recebidos rec ON rec.corretor_id = b.corretor_id;
$$;

REVOKE ALL ON FUNCTION public._elegibilidade_roleta(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._elegibilidade_roleta(text) TO service_role;

-- Wrapper com gate: gestão vê tudo; corretor vê só a própria linha.
CREATE OR REPLACE FUNCTION public.elegibilidade_roleta(_slug text)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _gestao boolean;
BEGIN
  _gestao := _caller IS NULL
    OR public.has_role(_caller, 'admin')
    OR public.has_role(_caller, 'gestor')
    OR public.has_role(_caller, 'superintendente');

  RETURN QUERY
  SELECT e.*
  FROM public._elegibilidade_roleta(_slug) e
  WHERE _gestao OR e.corretor_id = _caller;
END;
$$;

REVOKE ALL ON FUNCTION public.elegibilidade_roleta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elegibilidade_roleta(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) _alertar_gestores_distribuicao — alerta in-app deduplicado por ref_id
--    não lido (nunca spamma o mesmo problema).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._alertar_gestores_distribuicao(
  _titulo text,
  _mensagem text,
  _ref uuid,
  _link text DEFAULT '/distribuicao'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT DISTINCT ur.user_id, 'distribuicao'::alerta_tipo, _titulo, _mensagem, _link, _ref
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role, 'gestor'::app_role)
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.user_id = ur.user_id
        AND a.tipo = 'distribuicao'::alerta_tipo
        AND a.ref_id = _ref
        AND a.lida = false
    );
$$;

REVOKE ALL ON FUNCTION public._alertar_gestores_distribuicao(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._alertar_gestores_distribuicao(text, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) _registrar_excecao_distribuicao — upsert na fila de exceções (1 aberta
--    por lead; reincidência incrementa tentativas) + alerta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._registrar_excecao_distribuicao(
  _lead_id uuid,
  _motivo text,
  _detalhe text,
  _roleta_slug text,
  _contexto jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _lead_nome text;
BEGIN
  INSERT INTO public.distribuicao_excecoes (lead_id, motivo, detalhe, ultimo_erro, roleta_slug, contexto)
  VALUES (_lead_id, _motivo, _detalhe, _detalhe, _roleta_slug, _contexto)
  ON CONFLICT (lead_id) WHERE status IN ('pendente','em_analise')
  DO UPDATE SET
    tentativas = public.distribuicao_excecoes.tentativas + 1,
    motivo = EXCLUDED.motivo,
    detalhe = EXCLUDED.detalhe,
    ultimo_erro = EXCLUDED.ultimo_erro,
    roleta_slug = COALESCE(EXCLUDED.roleta_slug, public.distribuicao_excecoes.roleta_slug),
    contexto = COALESCE(EXCLUDED.contexto, public.distribuicao_excecoes.contexto),
    updated_at = now()
  RETURNING id INTO _id;

  SELECT nome INTO _lead_nome FROM public.leads WHERE id = _lead_id;

  PERFORM public._alertar_gestores_distribuicao(
    'Lead na fila de exceções: ' || coalesce(_lead_nome, '(sem nome)'),
    coalesce(_detalhe, _motivo),
    _lead_id,
    '/distribuicao?tab=excecoes'
  );

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public._registrar_excecao_distribuicao(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._registrar_excecao_distribuicao(uuid, text, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) _distribuir_lead_v3 — O MOTOR. Sem gate (interno); o wrapper público e
--    a triagem validam papel. Idempotente e à prova de concorrência:
--    FOR UPDATE no lead + FOR UPDATE SKIP LOCKED no cursor da roleta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _roleta_slug text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _distribuido_por uuid DEFAULT NULL,
  _gatilho text DEFAULT 'manual',
  _contexto_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
  _tentaram uuid[];
  _aptos_ids uuid[];
  _aptos_json jsonb;
  _inaptos_json jsonb;
  _n_ativos int;
  _agora_brt time;
  _dentro_horario boolean;
  _contexto jsonb;
  _log_id uuid;
  _motivo_falha text;
  _motivo_log text;
  _excecao_id uuid;
  _conta_cota boolean;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  -- Idempotência: distribuição automática nunca rouba lead já atribuído.
  IF _lead.corretor_id IS NOT NULL AND _tipo = 'automatica' AND _corretor_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  _tentaram := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  _slug := COALESCE(_roleta_slug, public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem));

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome INTO _vencedor_nome
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      _motivo_falha := 'origem_nao_mapeada';
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      _excecao_id := public._registrar_excecao_distribuicao(
        _lead_id, _motivo_falha,
        'Origem "' || _lead.origem::text || '" sem roleta vinculada', NULL, _contexto);
      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
      VALUES
        (_lead_id, NULL, _tipo, 'Origem sem roleta vinculada — lead na fila de exceções',
         _distribuido_por, NULL, 'triagem', 'excecao')
      RETURNING id INTO _log_id;
      INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);
      RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha);
    END IF;

    SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roleta % inexistente', _slug;
    END IF;

    -- Janela de funcionamento (BRT). Fora da janela sem permissão: o lead
    -- espera o cron — sem exceção e sem log (evita 1 registro por minuto).
    IF _r.horario_inicio IS NOT NULL AND _r.horario_fim IS NOT NULL THEN
      _agora_brt := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
      IF _r.horario_inicio <= _r.horario_fim THEN
        _dentro_horario := _agora_brt BETWEEN _r.horario_inicio AND _r.horario_fim;
      ELSE
        _dentro_horario := (_agora_brt >= _r.horario_inicio OR _agora_brt <= _r.horario_fim);
      END IF;
      IF NOT _dentro_horario AND NOT _r.permitir_fora_horario
         AND _tipo IN ('automatica','redistribuicao') AND auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'fora_do_horario', 'roleta', _slug);
      END IF;
    END IF;

    -- Snapshot de elegibilidade (fonte única) — vira contexto auditável.
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'ultimo_lead_em', e.ultimo_lead_em)
        ORDER BY e.ultimo_lead_em ASC NULLS FIRST)
        FILTER (WHERE e.apto), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'motivos', to_jsonb(e.motivos), 'pct_trabalhado', e.pct_trabalhado,
          'recebidos_hoje', e.recebidos_hoje, 'limite_diario', e.limite_diario)
        ORDER BY e.nome)
        FILTER (WHERE NOT e.apto), '[]'::jsonb),
      COALESCE(array_agg(e.corretor_id) FILTER (WHERE e.apto), ARRAY[]::uuid[]),
      count(*) FILTER (WHERE e.participante_ativo AND NOT e.pausado)
    INTO _aptos_json, _inaptos_json, _aptos_ids, _n_ativos
    FROM public._elegibilidade_roleta(_slug) e;

    IF NOT _r.ativo THEN
      _aptos_ids := ARRAY[]::uuid[];
      _n_ativos := 0;
    END IF;

    -- Exclui quem já teve o lead (redistribuição nunca devolve ao mesmo).
    _aptos_ids := ARRAY(SELECT unnest(_aptos_ids) EXCEPT SELECT unnest(_tentaram));

    -- Vencedor: apto há mais tempo sem receber NESTA roleta (cursor único),
    -- com lock no cursor para concorrência entre webhook/cron/manual.
    SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
    FROM public.roleta_participantes rp
    JOIN public.profiles p ON p.id = rp.corretor_id
    WHERE rp.roleta_id = _r.id
      AND rp.corretor_id = ANY(_aptos_ids)
    ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
    FOR UPDATE OF rp SKIP LOCKED
    LIMIT 1;

    _regra := 'rodizio_menos_recente';
  END IF;

  _contexto := jsonb_build_object(
    'roleta', _slug,
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram)
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF COALESCE(_n_ativos, 0) = 0 THEN
      _motivo_falha := 'sem_corretor_ativo';
      _motivo_log := 'Roleta ' || _slug || ' sem participante ativo — lead na fila de exceções';
    ELSE
      _motivo_falha := 'sem_corretor_elegivel';
      _motivo_log := 'Roleta ' || _slug || ' sem corretor apto no momento — lead na fila de exceções';
    END IF;

    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, _motivo_falha, _motivo_log, _slug, _contexto);

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, _slug, _regra, 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha, 'roleta', _slug);
  END IF;

  -- ----------------------------- vencedor ----------------------------------
  _contexto := _contexto || jsonb_build_object(
    'vencedor', jsonb_build_object('corretor_id', _vencedor, 'nome', _vencedor_nome));

  UPDATE public.leads
     SET corretor_anterior_id = CASE
           WHEN corretor_id IS NOT NULL AND corretor_id <> _vencedor THEN corretor_id
           ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(_tentaram) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor) END
   WHERE id = _lead_id;

  -- Cursor único da roleta (se o corretor participa dela).
  IF _slug IS NOT NULL THEN
    UPDATE public.roleta_participantes rp
       SET ultimo_lead_em = now()
      FROM public.roletas r
     WHERE r.id = rp.roleta_id AND r.slug = _slug AND rp.corretor_id = _vencedor;
  END IF;

  -- Compat até o descomissionamento: mantém os cursores/contadores legados
  -- em sincronia para dashboards antigos e para o motor legado não colidir.
  _conta_cota := _tipo IN ('automatica','inicial')
                 OR ((public.get_dist_setting('cota_conta_redistribuicao') #>> '{}')::boolean
                     AND _tipo = 'redistribuicao');
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;
  UPDATE public.fila_distribuicao
     SET leads_recebidos_hoje = leads_recebidos_hoje + (CASE WHEN _conta_cota THEN 1 ELSE 0 END),
         ultima_distribuicao = now()
   WHERE corretor_id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _vencedor, _tipo,
     CASE
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     _distribuido_por, _slug, _regra, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  -- Distribuiu → fecha exceção aberta do lead (se havia).
  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida',
         resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Lead distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra
  );
END;
$$;

REVOKE ALL ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb) TO service_role;

-- Wrapper público com gate (UI de gestão / service role).
CREATE OR REPLACE FUNCTION public.distribuir_lead_v3(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _roleta_slug text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _gatilho text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public._distribuir_lead_v3(_lead_id, _tipo, _roleta_slug, _corretor_id, _caller, _gatilho, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) triar_e_distribuir_lead — triagem de ENTRADA (requisito 3):
--    origem → dedup → corretor anterior (só registra: decisão = sempre nova
--    roleta) → dados mínimos → motor. Erro inesperado vira exceção
--    'falha_tecnica': NENHUM lead se perde.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.triar_e_distribuir_lead(
  _lead_id uuid,
  _gatilho text DEFAULT 'cron'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _lead record;
  _tel text;
  _dup_id uuid;
  _dup_corretor uuid;
  _ant_ativo boolean;
  _ctx_extra jsonb := '{}'::jsonb;
  _excecao_id uuid;
  _log_id uuid;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  -- Dados mínimos: sem telefone não há atendimento possível.
  IF _lead.telefone IS NULL OR btrim(_lead.telefone) = '' THEN
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'dados_incompletos', 'Lead sem telefone', NULL,
      jsonb_build_object('gatilho', _gatilho));
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES (_lead_id, NULL, 'automatica', 'Lead sem telefone — fila de exceções',
            NULL, 'triagem', 'excecao')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_build_object('gatilho', _gatilho, 'motivo', 'dados_incompletos'));
    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', 'dados_incompletos');
  END IF;

  -- Duplicidade / corretor anterior — REGISTRADOS no contexto da decisão.
  -- Regra de negócio (decisão da diretoria): cliente retornante SEMPRE roda
  -- nova roleta; o histórico fica no log para auditoria.
  _tel := regexp_replace(_lead.telefone, '\D', '', 'g');
  IF length(_tel) >= 8 THEN
    SELECT l.id, l.corretor_id INTO _dup_id, _dup_corretor
    FROM public.leads l
    WHERE l.id <> _lead.id
      AND l.deleted_at IS NULL
      AND regexp_replace(l.telefone, '\D', '', 'g') = _tel
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF _dup_corretor IS NOT NULL THEN
    SELECT p.ativo INTO _ant_ativo FROM public.profiles p WHERE p.id = _dup_corretor;
  END IF;

  _ctx_extra := jsonb_build_object(
    'dedup', CASE WHEN _dup_id IS NULL THEN NULL
                  ELSE jsonb_build_object('duplicado_id', _dup_id) END,
    'corretor_anterior', CASE WHEN _dup_corretor IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'corretor_id', _dup_corretor,
                    'ativo', COALESCE(_ant_ativo, false),
                    'politica', 'sempre_nova_roleta') END
  );

  RETURN public._distribuir_lead_v3(_lead_id, 'automatica', NULL, NULL, _caller, _gatilho, _ctx_extra);

EXCEPTION WHEN OTHERS THEN
  -- Falha técnica: o lead vai para a fila de exceções em vez de sumir.
  _excecao_id := public._registrar_excecao_distribuicao(
    _lead_id, 'falha_tecnica', SQLERRM, NULL,
    jsonb_build_object('gatilho', _gatilho, 'sqlstate', SQLSTATE));
  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES (_lead_id, NULL, 'automatica', 'Falha técnica na distribuição: ' || SQLERRM,
          NULL, 'triagem', 'erro');
  RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', 'falha_tecnica', 'erro', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.triar_e_distribuir_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triar_e_distribuir_lead(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) gerenciar_participante_roleta — TODA mutação de participação passa aqui
--    (a tabela não tem policy de escrita): auditoria atômica e obrigatória.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerenciar_participante_roleta(
  _slug text,
  _corretor_id uuid,
  _acao text,
  _motivo text DEFAULT NULL,
  _limite integer DEFAULT NULL,
  _pausado_ate timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _roleta_id uuid;
  _eh_admin boolean;
BEGIN
  _eh_admin := _caller IS NOT NULL AND public.has_role(_caller, 'admin');
  IF _caller IS NOT NULL AND NOT _eh_admin AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO _roleta_id FROM public.roletas WHERE slug = _slug;
  IF _roleta_id IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  IF _acao = 'incluir' THEN
    -- Config pode restringir a inclusão manual na Marquinhos a admins.
    IF _slug = 'marquinhos' AND NOT _eh_admin
       AND NOT (public.get_dist_setting('permitir_inclusao_manual') #>> '{}')::boolean THEN
      RAISE EXCEPTION 'inclusao manual desabilitada para gestores';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
      WHERE p.id = _corretor_id AND p.ativo = true
    ) THEN
      RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor';
    END IF;

    INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, limite_diario, incluido_por)
    VALUES (_roleta_id, _corretor_id, true, _limite, _caller)
    ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
      ativo = true,
      pausado_ate = NULL,
      motivo_pausa = NULL,
      limite_diario = COALESCE(EXCLUDED.limite_diario, public.roleta_participantes.limite_diario),
      incluido_por = _caller,
      incluido_em = now();
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'incluido', _motivo, _caller);

  ELSIF _acao = 'remover' THEN
    UPDATE public.roleta_participantes
       SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'removido', _motivo, _caller);

  ELSIF _acao = 'pausar' THEN
    IF _pausado_ate IS NULL OR _pausado_ate <= now() THEN
      RAISE EXCEPTION 'pausa exige data futura (_pausado_ate)';
    END IF;
    UPDATE public.roleta_participantes
       SET pausado_ate = _pausado_ate, motivo_pausa = _motivo
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'pausado',
            COALESCE(_motivo,'') || ' (até ' || to_char(_pausado_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
            _caller);

  ELSIF _acao = 'reativar' THEN
    UPDATE public.roleta_participantes
       SET ativo = true, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'reativado', _motivo, _caller);

  ELSIF _acao = 'limite' THEN
    UPDATE public.roleta_participantes
       SET limite_diario = _limite
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'limite_alterado',
            'Limite diário: ' || COALESCE(_limite::text, 'padrão'), _caller);

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.gerenciar_participante_roleta(text, uuid, text, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_participante_roleta(text, uuid, text, text, integer, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) resolver_excecao / reprocessar_excecao — ações da fila de exceções,
--    sempre com registro de quem agiu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_excecao(
  _excecao_id uuid,
  _acao text,
  _params jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _e record;
  _res jsonb;
BEGIN
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin') AND NOT public.has_role(_caller, 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _e FROM public.distribuicao_excecoes WHERE id = _excecao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'excecao nao encontrada';
  END IF;
  IF _e.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'excecao ja resolvida/arquivada';
  END IF;

  IF _acao = 'corrigir_origem' THEN
    IF _params->>'origem' IS NULL THEN RAISE EXCEPTION 'origem obrigatoria'; END IF;
    UPDATE public.leads
       SET origem = (_params->>'origem')::public.lead_origem
     WHERE id = _e.lead_id;
    _res := public.triar_e_distribuir_lead(_e.lead_id, 'excecao_corrigir_origem');

  ELSIF _acao = 'escolher_roleta' THEN
    IF _params->>'roleta_slug' IS NULL THEN RAISE EXCEPTION 'roleta_slug obrigatoria'; END IF;
    _res := public._distribuir_lead_v3(
      _e.lead_id, 'automatica', _params->>'roleta_slug', NULL, _caller, 'excecao_roleta_forcada', '{}'::jsonb);

  ELSIF _acao = 'atribuir_manual' THEN
    IF _params->>'corretor_id' IS NULL THEN RAISE EXCEPTION 'corretor_id obrigatorio'; END IF;
    _res := public._distribuir_lead_v3(
      _e.lead_id, 'manual', NULL, (_params->>'corretor_id')::uuid, _caller, 'excecao_manual', '{}'::jsonb);

  ELSIF _acao = 'reprocessar' THEN
    _res := public.triar_e_distribuir_lead(_e.lead_id, 'excecao_reprocesso');

  ELSIF _acao = 'em_analise' THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'em_analise' WHERE id = _excecao_id;
    RETURN jsonb_build_object('ok', true, 'status', 'em_analise');

  ELSIF _acao = 'arquivar' THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada',
           resolvida_por = _caller,
           resolvida_em = now(),
           resolucao = COALESCE(_params->>'motivo', 'Arquivada manualmente')
     WHERE id = _excecao_id;
    RETURN jsonb_build_object('ok', true, 'status', 'arquivada');

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  -- Se o motor resolveu a exceção, garante o autor da ação registrado.
  UPDATE public.distribuicao_excecoes
     SET resolvida_por = COALESCE(resolvida_por, _caller)
   WHERE id = _excecao_id AND status = 'resolvida';

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_excecao(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_excecao(uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reprocessar_excecao(_excecao_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.resolver_excecao(_excecao_id, 'reprocessar', '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.reprocessar_excecao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocessar_excecao(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10) atualizar_distribuicao_setting — admin altera parâmetro com trilha no
--     audit_log (quem, quando, de → para).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_distribuicao_setting(_chave text, _valor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antigo jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT valor INTO _antigo FROM public.distribuicao_settings WHERE chave = _chave;

  INSERT INTO public.distribuicao_settings (chave, valor, updated_por)
  VALUES (_chave, _valor, _caller)
  ON CONFLICT (chave) DO UPDATE SET
    valor = EXCLUDED.valor,
    updated_por = _caller,
    updated_at = now();

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('distribuicao_settings', gen_random_uuid(), 'UPDATE', _caller,
          jsonb_build_object('chave', _chave, 'valor', _antigo),
          jsonb_build_object('chave', _chave, 'valor', _valor));

  RETURN jsonb_build_object('ok', true, 'chave', _chave, 'valor', _valor);
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_distribuicao_setting(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_distribuicao_setting(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11) minha_elegibilidade — o corretor vê o PRÓPRIO status (apto/inapto e
--     por quê) em cada roleta, sem enxergar dados dos colegas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minha_elegibilidade()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _out jsonb := '[]'::jsonb;
  _r record;
  _linha record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  FOR _r IN SELECT slug, nome FROM public.roletas ORDER BY slug LOOP
    SELECT * INTO _linha FROM public._elegibilidade_roleta(_r.slug) e WHERE e.corretor_id = _uid;
    IF FOUND THEN
      _out := _out || jsonb_build_object(
        'roleta_slug', _r.slug,
        'roleta_nome', _r.nome,
        'participante', true,
        'apto', _linha.apto,
        'motivos', to_jsonb(_linha.motivos),
        'pct_trabalhado', _linha.pct_trabalhado,
        'carteira_total', _linha.carteira_total,
        'aguardando', _linha.aguardando,
        'recebidos_hoje', _linha.recebidos_hoje,
        'recebidos_mes', _linha.recebidos_mes,
        'limite_diario', _linha.limite_diario,
        'pausado', _linha.pausado,
        'motivo_pausa', _linha.motivo_pausa
      );
    ELSE
      _out := _out || jsonb_build_object(
        'roleta_slug', _r.slug,
        'roleta_nome', _r.nome,
        'participante', false,
        'apto', false,
        'motivos', to_jsonb(ARRAY['nao_participante'])
      );
    END IF;
  END LOOP;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.minha_elegibilidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_elegibilidade() TO authenticated;

-- ---------------------------------------------------------------------------
-- 12) vendas_mes_anterior — critério exibido na Roleta Marquinhos (a inclusão
--     continua manual; o sistema NUNCA inclui sozinho).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_mes_anterior()
RETURNS TABLE (corretor_id uuid, qtd bigint, total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor')
     AND NOT public.has_role(_caller, 'superintendente') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT v.corretor_id, count(*)::bigint, COALESCE(sum(v.valor_venda), 0)
  FROM public.vendas v
  WHERE v.distrato = false
    AND v.corretor_id IS NOT NULL
    AND v.data_assinatura >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month')::date
    AND v.data_assinatura <  (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'))::date
  GROUP BY v.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_mes_anterior() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_mes_anterior() TO authenticated;

-- ---------------------------------------------------------------------------
-- 13) painel_distribuicao_resumo — cards do dashboard da página de
--     distribuição, calculados no servidor (nada de relógio de navegador).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_distribuicao_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _max_min int := (public.get_dist_setting('max_minutos_sem_atendimento') #>> '{}')::int;
  _out jsonb;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor')
     AND NOT public.has_role(_caller, 'superintendente') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'distribuidos_hoje', (
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.resultado = 'sucesso'
        AND (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = _hoje
    ),
    'aguardando_distribuicao', (
      SELECT count(*) FROM public.leads l
      WHERE l.corretor_id IS NULL
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.status IN ('novo','aguardando_atendimento')
    ),
    'excecoes_pendentes', (
      SELECT count(*) FROM public.distribuicao_excecoes e
      WHERE e.status IN ('pendente','em_analise')
    ),
    'aptos_plantao', (
      SELECT count(*) FROM public._elegibilidade_roleta('plantao') e WHERE e.apto
    ),
    'aptos_marquinhos', (
      SELECT count(*) FROM public._elegibilidade_roleta('marquinhos') e WHERE e.apto
    ),
    'aptos_landing', (
      SELECT count(*) FROM public._elegibilidade_roleta('landing') e WHERE e.apto
    ),
    'sem_atendimento', (
      SELECT count(*) FROM public.leads l
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND COALESCE(l.data_distribuicao, l.created_at) < now() - (_max_min || ' minutes')::interval
    ),
    'parados_timeout', (
      SELECT count(*) FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND COALESCE(l.data_distribuicao, l.created_at)
              < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
    ),
    'pct_medio_trabalhado', (
      SELECT COALESCE(round(avg(e.pct_trabalhado), 1), 100)
      FROM public._elegibilidade_roleta('plantao') e
      WHERE e.participante_ativo
    ),
    'erros_24h', (
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.resultado IN ('sem_corretor','erro','excecao')
        AND dl.created_at > now() - interval '24 hours'
    ),
    'atualizado_em', now()
  ) INTO _out;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.painel_distribuicao_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_distribuicao_resumo() TO authenticated;

-- ---------------------------------------------------------------------------
-- 14) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'motor _distribuir_lead_v3 ausente';
  END IF;
  IF to_regprocedure('public.triar_e_distribuir_lead(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'triar_e_distribuir_lead ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
