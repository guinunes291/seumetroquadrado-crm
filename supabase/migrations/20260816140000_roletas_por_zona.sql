-- ============================================================================
-- Roletas por ZONA — decisão de produto de 2026-08-16: a roleta É a zona.
--
-- Modelo simplificado da distribuição: 4 roletas (Norte, Sul, Leste, Oeste),
-- uma por zona, com os corretores de cada zona definidos MANUALMENTE pela
-- gestão (a participação na roleta é o próprio corte geográfico). O que muda:
--
--  1) SEED: 4 roletas `tipo='zona'` (zona-norte/sul/leste/oeste), participação
--     'manual', com webhook_token próprio (rota direta opcional por zona).
--     `tipo='zona'` de propósito — NUNCA 'campanha': o recálculo semanal de
--     tiers e os desvios de SLA para o motor ponderado filtram por 'campanha'
--     e não podem capturar as roletas de zona.
--  2) MAPEAMENTO zona → roleta em tabela (`zonas_roletas`), editável pela
--     gestão. Centro fica SEM linha de propósito: lead do Centro segue o
--     fluxo por origem até a operação decidir criar a quinta roleta.
--  3) ROTEAMENTO zona-primeiro: `roleta_da_zona(zona)` devolve a roleta da
--     zona apenas se ela está ATIVA e TEM participante ativo não pausado —
--     roleta ainda não montada não engole lead. O motor v3 passa a resolver
--     `_slug := COALESCE(slug explícito, roleta_da_zona, origem/canal)`.
--  4) CAMPANHAS: `distribuir_lead_ponderado` delega para a roleta da zona
--     quando ela existe (a campanha vira rótulo de origem no contexto);
--     sem zona resolvida ou sem roleta pronta, o SWRR segue como antes.
--  5) DENTRO da roleta de zona o filtro por `profiles.zonas` é PULADO:
--     participação já é o corte geográfico; filtrar de novo criaria corte
--     duplo e ruído de zona_fallback.
--  6) MEMÓRIA: distribuição por roleta de zona grava `leads.roleta_slug`,
--     então os repasses por SLA ficam dentro do MESMO time da zona.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) As 4 roletas de zona. Replay preserva token e nome já ajustados.
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, criterio_participacao, exigir_presenca, tipo, webhook_token)
VALUES
  ('zona-norte', 'Roleta Zona Norte',
   'Equipe da Zona Norte — participação manual definida pela gestão; leads com zona Norte caem aqui.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex')),
  ('zona-sul', 'Roleta Zona Sul',
   'Equipe da Zona Sul — participação manual definida pela gestão; leads com zona Sul caem aqui.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex')),
  ('zona-leste', 'Roleta Zona Leste',
   'Equipe da Zona Leste — participação manual definida pela gestão; leads com zona Leste caem aqui.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex')),
  ('zona-oeste', 'Roleta Zona Oeste',
   'Equipe da Zona Oeste — participação manual definida pela gestão; leads com zona Oeste caem aqui.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (slug) DO UPDATE
  SET tipo = 'zona',
      criterio_participacao = 'manual',
      webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token);

-- ---------------------------------------------------------------------------
-- 2) zonas_roletas — mapeamento zona canônica → roleta. Editável pela gestão
--    (mesma régua de acesso de zonas_bairros). Centro de fora por decisão.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zonas_roletas (
  zona text PRIMARY KEY CHECK (zona IN ('Norte','Sul','Leste','Oeste','Centro')),
  roleta_slug text NOT NULL REFERENCES public.roletas(slug),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zonas_roletas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zonas_roletas leitura autenticada" ON public.zonas_roletas;
CREATE POLICY "zonas_roletas leitura autenticada"
  ON public.zonas_roletas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "zonas_roletas escrita gestao" ON public.zonas_roletas;
CREATE POLICY "zonas_roletas escrita gestao"
  ON public.zonas_roletas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zonas_roletas TO authenticated;
GRANT SELECT ON public.zonas_roletas TO service_role;

INSERT INTO public.zonas_roletas (zona, roleta_slug) VALUES
  ('Norte', 'zona-norte'),
  ('Sul', 'zona-sul'),
  ('Leste', 'zona-leste'),
  ('Oeste', 'zona-oeste')
ON CONFLICT (zona) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) roleta_da_zona — a roleta da zona SÓ vale se está pronta para receber:
--    ativa e com pelo menos um participante ativo não pausado. Roleta vazia
--    ou desligada devolve NULL e o lead segue o fluxo por origem (atender
--    rápido vale mais que o corte geográfico).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roleta_da_zona(_zona text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT zr.roleta_slug
  FROM public.zonas_roletas zr
  JOIN public.roletas r ON r.slug = zr.roleta_slug AND r.ativo
  WHERE zr.zona = _zona
    AND EXISTS (
      SELECT 1 FROM public.roleta_participantes rp
      WHERE rp.roleta_id = r.id
        AND rp.ativo
        AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    )
$$;

GRANT EXECUTE ON FUNCTION public.roleta_da_zona(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Motor v3 — roteamento zona-primeiro. Corpo idêntico ao de 20260813
--    fora os trechos comentados com "2026-08-16".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(_lead_id uuid, _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo, _roleta_slug text DEFAULT NULL::text, _corretor_id uuid DEFAULT NULL::uuid, _distribuido_por uuid DEFAULT NULL::uuid, _gatilho text DEFAULT 'manual'::text, _contexto_extra jsonb DEFAULT '{}'::jsonb, _registrar_excecao boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
  _vencedor_zonas text[];
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
  _zona text;
  _aptos_zona uuid[];
  _zona_fallback boolean := false;
  _divergencia_zona boolean := false;
  _roleta_tipo text;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  -- Lead na lixeira/excluído NUNCA é distribuído; exceção aberta (se houver)
  -- é arquivada para não assombrar a fila.
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead está na lixeira — distribuição bloqueada'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_na_lixeira');
  END IF;

  -- Idempotência: distribuição automática nunca rouba lead já atribuído.
  -- Fecha exceção aberta órfã — senão "Reprocessar" vira beco sem saída.
  IF _lead.corretor_id IS NOT NULL AND _tipo = 'automatica' AND _corretor_id IS NULL THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead já estava atribuído'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  _tentaram := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  _zona := public.zona_do_lead(_lead_id);
  -- Roleta por ZONA primeiro (2026-08-16): a roleta É a zona. Slug explícito
  -- continua mandando (manual/exceção/repasse de campanha); sem ele, lead com
  -- zona que tenha roleta PRONTA (ativa e com gente) vai para ela; o resto
  -- cai no mapeamento por canal/origem como sempre.
  _slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona),
                    public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem));

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome, p.zonas INTO _vencedor_nome, _vencedor_zonas
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
    -- Fora da zona: a decisão humana vale, mas o desvio fica visível no
    -- retorno (aviso na UI) e no log (auditoria).
    IF _zona IS NOT NULL AND COALESCE(array_length(_vencedor_zonas, 1), 0) > 0
       AND NOT (_zona = ANY(_vencedor_zonas)) THEN
      _divergencia_zona := true;
    END IF;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      _motivo_falha := 'origem_nao_mapeada';
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      IF _registrar_excecao THEN
        _excecao_id := public._registrar_excecao_distribuicao(
          _lead_id, _motivo_falha,
          'Origem "' || _lead.origem::text || '" sem roleta vinculada', NULL, _contexto);
      END IF;
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
    _roleta_tipo := _r.tipo;

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

    -- Fila por zona: o lead vai para corretor que atende a zona dele
    -- (corretor sem zona configurada atende todas). Se NINGUÉM apto atende
    -- a zona, cai para qualquer apto — atender rápido vale mais que o corte
    -- geográfico; o desvio fica registrado no contexto ('zona_fallback').
    -- 2026-08-16: na roleta de ZONA o filtro é PULADO — a participação já é
    -- o corte geográfico (o gestor define o time da zona); filtrar de novo
    -- por profiles.zonas criaria corte duplo.
    IF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'
       AND array_length(_aptos_ids, 1) > 0 THEN
      _aptos_zona := ARRAY(
        SELECT p.id FROM public.profiles p
         WHERE p.id = ANY(_aptos_ids)
           AND (COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas))
      );
      IF COALESCE(array_length(_aptos_zona, 1), 0) > 0 THEN
        _aptos_ids := _aptos_zona;
      ELSE
        _zona_fallback := true;
      END IF;
    END IF;

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
    'roleta_tipo', _roleta_tipo,
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'divergencia_zona', _divergencia_zona
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

    IF _registrar_excecao THEN
      _excecao_id := public._registrar_excecao_distribuicao(
        _lead_id, _motivo_falha, _motivo_log, _slug, _contexto);
    END IF;

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
         -- 2026-08-16: memória da roleta de ZONA — repasse por SLA fica no
         -- mesmo time da zona (o pino de campanha continua intocado).
         roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END,
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

  -- Cursor global informativo (integrações externas). Os contadores legados
  -- de fila_distribuicao NÃO são mais escritos: cota deriva do log.
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _vencedor, _tipo,
     CASE
       WHEN _regra = 'manual_direta' AND _divergencia_zona
         THEN 'Atribuição manual direta (corretor fora da Zona ' || _zona || ')'
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       WHEN _zona_fallback
         THEN 'Roleta ' || _slug || ' — rodízio (sem apto na Zona ' || _zona || '; fallback para qualquer apto)'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     _distribuido_por, _slug, _regra, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra,
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'aviso_zona', CASE WHEN _divergencia_zona
      THEN 'Corretor não atende a Zona ' || _zona ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Roleta ponderada (campanhas) — delega para a roleta da ZONA quando ela
--    existe e está pronta; a campanha fica registrada no contexto. Corpo
--    idêntico ao de 20260813 fora o bloco comentado com "2026-08-16".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int; _zslug text;
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

  -- Zona primeiro (2026-08-16): existindo roleta da zona do lead ativa e com
  -- participante, a distribuição é da ZONA — a campanha vira rótulo de origem
  -- no contexto. Sem zona resolvida ou roleta ainda não montada, o SWRR da
  -- campanha segue exatamente como antes.
  _zslug := public.roleta_da_zona(public.zona_do_lead(_lead_id));
  IF _zslug IS NOT NULL THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
      'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
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

  -- Fila por zona (mesma régua do motor v3): se alguém da equipe atende a
  -- zona do lead, o rodízio ponderado fica restrito a eles; se ninguém
  -- atende, a campanha segue com todos (fallback — atender > travar).
  _zona := public.zona_do_lead(_lead_id);
  IF _zona IS NOT NULL THEN
    SELECT count(*) INTO _n_zona
    FROM _dlp_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _dlp_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

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
    'tier', _tier_picked, 'roleta_slug', _roleta.slug,
    'zona', _zona
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuir_lead_ponderado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_ponderado(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int;
BEGIN
  IF to_regprocedure('public.roleta_da_zona(text)') IS NULL THEN
    RAISE EXCEPTION 'roleta_da_zona ausente';
  END IF;
  SELECT count(*) INTO _n FROM public.roletas
   WHERE tipo = 'zona'
     AND slug IN ('zona-norte','zona-sul','zona-leste','zona-oeste');
  IF _n < 4 THEN
    RAISE EXCEPTION 'seed das roletas de zona incompleto (% de 4)', _n;
  END IF;
  SELECT count(*) INTO _n FROM public.zonas_roletas
   WHERE zona IN ('Norte','Sul','Leste','Oeste');
  IF _n < 4 THEN
    RAISE EXCEPTION 'mapeamento zonas_roletas incompleto (% de 4)', _n;
  END IF;
  IF position('roleta_da_zona' IN pg_get_functiondef(
       'public._distribuir_lead_v3(uuid,public.distribuicao_tipo,text,uuid,uuid,text,jsonb,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'motor v3 sem roteamento zona-primeiro';
  END IF;
  IF position('roleta_da_zona' IN pg_get_functiondef(
       'public.distribuir_lead_ponderado(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roleta ponderada sem delegação por zona';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
