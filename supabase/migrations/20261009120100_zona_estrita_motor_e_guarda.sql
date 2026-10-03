-- ============================================================================
-- ZONA ESTRITA — parte 2/2: nenhum caminho entrega lead fora da região
-- ============================================================================
-- Decisão do dono (03/10/2026): "Um corretor deve receber leads de qualquer
-- origem apenas da sua região de atuação." A parte 1 (20261009120000) deu ao
-- lead UMA zona e ao corretor UMA região. Esta parte faz TODOS os caminhos de
-- entrega respeitarem a regra, em duas camadas:
--
--   CAMADA 1 — cada motor escolhe dentro da região (não tenta violar):
--     * _distribuir_lead_v3: lead com zona vai SEMPRE para a roleta da zona
--       dele. Acabaram os três desvios que mandavam lead para outra zona:
--         - roleta da zona "não pronta" → Plantão (fluxo por origem);
--         - ninguém da zona apto → "qualquer apto" (zona_fallback);
--         - slug explícito (token de zona, pino antigo, roleta escolhida na
--           exceção) passando por cima da zona do próprio lead.
--       Sem ninguém da zona apto, o lead ESPERA (fila de exceções + alerta à
--       gestão + cron a cada minuto) — nunca vai para outra zona.
--     * distribuir_lead_ponderado: campanha comum delega para a zona; campanha
--       de EQUIPE FIXA sorteia só entre quem da equipe atende a zona e, sem
--       ninguém, entrega para o time da zona.
--     * esteira 'base' (v2), repasse por SLA, leads parados, Escoar estoque,
--       SDR (prioridade do corretor original e roleta de agendados), Oferta
--       Ativa, Discador e lote de prospecção — todos filtram pela região.
--
--   CAMADA 2 — guarda no banco (trigger em leads.corretor_id): qualquer
--     escrita que dê a um CORRETOR um lead de zona que ele não atende é
--     recusada (SQLSTATE SMQZ1, mensagem legível). Cobre o que não passa por
--     motor nenhum: transferência manual, criação/importação com corretor
--     escolhido, PATCH direto pela API, função legada e o que existir só em
--     produção (redistribuir_duplicado_campanha não está no repositório).
--
-- O que NÃO é bloqueado (de propósito):
--   * lead SEM zona (não dá para saber de onde é) — segue o fluxo por origem;
--   * captação própria: o corretor criando o PRÓPRIO lead;
--   * dono que não é corretor (gestor/admin assumindo);
--   * EXCEÇÃO DA GESTÃO com motivo escrito (política v1 §6: indicação, cliente
--     que pede corretor específico): transferir_leads e "atribuir manual" da
--     fila de exceções aceitam forcar_fora_da_zona + motivo; o desvio fica no
--     distribution_log com o motivo;
--   * os "desfazer" de emergência (higiene, régua, fase 0), que só devolvem
--     o lead ao dono anterior.
--
-- ROLLBACK: distribuicao_settings.zona_estrita = false (1 UPDATE, ou pela
-- tela Configurações). Com a chave desligada, motores e guarda voltam ao
-- comportamento anterior linha a linha; a região única (parte 1) continua.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Interruptor, rótulo e mensagem
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao)
VALUES ('zona_estrita', 'true'::jsonb,
        'Corretor só recebe lead da própria região (participação nas roletas de zona). '
        || 'false = volta aos desvios antigos (lead de zona podia ir para outra zona).')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public._zona_estrita()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_dist_setting('zona_estrita') #>> '{}')::boolean, true)
$$;

REVOKE ALL ON FUNCTION public._zona_estrita() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._zona_estrita() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rotulo_zona(_zona text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN _zona IN ('Centro', 'Grande SP') THEN _zona ELSE 'Zona ' || _zona END
$$;

CREATE OR REPLACE FUNCTION public._msg_fora_da_regiao(_zona text, _corretor uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'Fora da região: o lead é da ' || public._rotulo_zona(_zona) || ' e '
         || COALESCE((SELECT p.nome FROM public.profiles p WHERE p.id = _corretor), 'o corretor')
         || ' não atende essa zona. Escolha um corretor da zona'
         || ' (ou registre a exceção da gestão com motivo).'
$$;

-- Fila de exceções: motivos novos (o lead que espera o time da zona).
ALTER TABLE public.distribuicao_excecoes DROP CONSTRAINT IF EXISTS distribuicao_excecoes_motivo_check;
ALTER TABLE public.distribuicao_excecoes
  ADD CONSTRAINT distribuicao_excecoes_motivo_check
  CHECK (motivo IN ('sem_corretor_ativo', 'sem_corretor_elegivel', 'duplicado_incerto',
                    'origem_nao_mapeada', 'falha_tecnica', 'corretor_anterior_inativo',
                    'dados_incompletos', 'sem_corretor_na_zona', 'zona_sem_time',
                    'zona_sem_roleta'));

-- ---------------------------------------------------------------------------
-- 1) CAMADA 2 — a guarda. BEFORE INSERT/UPDATE OF corretor_id; o nome "zz"
--    a põe DEPOIS dos demais BEFORE (autolink do projeto, zona materializada,
--    guarda de posse do SDR) — ela avalia a linha como vai ficar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_leads_guarda_zona()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _zona text;
BEGIN
  IF NEW.corretor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.corretor_id IS NOT DISTINCT FROM OLD.corretor_id THEN
    RETURN NEW;
  END IF;
  -- Exceção da gestão registrada por uma RPC (motivo já validado e logado).
  IF COALESCE(current_setting('app.zona_override', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public._zona_estrita() THEN
    RETURN NEW;
  END IF;
  -- Captação própria: o corretor cadastrando o próprio cliente.
  IF TG_OP = 'INSERT' AND NEW.corretor_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  -- A regra é do CORRETOR; gestor/admin assumindo lead não entra nela.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = NEW.corretor_id AND ur.role = 'corretor'::public.app_role) THEN
    RETURN NEW;
  END IF;

  _zona := public._zona_do_lead_campos(NEW.zona, NEW.bairro, NEW.projeto_id);
  IF public.corretor_atende_zona(NEW.corretor_id, _zona) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'SMQZ1',
    MESSAGE = public._msg_fora_da_regiao(_zona, NEW.corretor_id),
    DETAIL = jsonb_build_object('lead_id', NEW.id, 'zona', _zona,
                                'corretor_id', NEW.corretor_id)::text,
    HINT = 'Região do corretor = roletas de zona em que ele participa (Central de Distribuição).';
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_guarda_zona_corretor ON public.leads;
CREATE TRIGGER trg_zz_guarda_zona_corretor
  BEFORE INSERT OR UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_guarda_zona();

-- Função legada sem NENHUMA checagem de permissão e com o EXECUTE padrão
-- (PUBLIC, inclusive anon): qualquer um podia dar qualquer lead a qualquer
-- corretor. Ninguém mais a chama (src/ e functions/ conferidos).
REVOKE ALL ON FUNCTION public.atribuir_lead_a_corretor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_lead_a_corretor(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) CAMADA 1 — o motor. Corpo vigente (20260826121000) + ramos marcados
--    [ZONA]. Com zona_estrita=false o caminho é o anterior, linha a linha.
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
  _origem_fallback text;
  -- [V2]
  _v2 boolean := public._modelo_v2_ativo();
  _sombra boolean := COALESCE((public.get_dist_setting('modelo_v2_sombra') #>> '{}')::boolean, false);
  _classe text;
  _inaptos_v2 jsonb := '[]'::jsonb;
  _sum_pesos int;
  _faixa_vencedor text;
  _sombra_vencedor uuid;
  _sombra_faixa text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zslug_lead text;
  _roleta_pedida text;
  _fora_regiao jsonb := '[]'::jsonb;
  _motivo_fora text;
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
  _classe := COALESCE(_lead.classe_lead, 'quente');
  IF _zona IS NOT NULL THEN
    SELECT zr.roleta_slug INTO _zslug_lead FROM public.zonas_roletas zr WHERE zr.zona = _zona;
  END IF;

  -- Resolução da roleta. [V2] Lead de BASE vai direto para a esteira 'base'.
  -- [ZONA] Lead COM zona vai para a roleta da zona dele — sempre: pronta ou
  -- não, e por cima de slug explícito (token de zona, pino antigo, roleta
  -- escolhida na exceção, campanha delegada), que fica registrado como
  -- roleta_pedida. Sem ninguém da zona apto, o lead espera — nunca troca de
  -- zona. Lead SEM zona segue a precedência de sempre: slug explícito;
  -- triagem por canal/origem com fallback de prontidão do Plantão.
  IF _v2 AND _corretor_id IS NULL AND _roleta_slug IS NULL AND _classe = 'base' THEN
    _slug := 'base';
  ELSIF _estrita AND _zona IS NOT NULL AND _corretor_id IS NULL THEN
    IF _roleta_slug = 'base' THEN
      _slug := 'base';
    ELSE
      _slug := _zslug_lead;
      IF _roleta_slug IS DISTINCT FROM _zslug_lead THEN
        _roleta_pedida := _roleta_slug;
      END IF;
    END IF;
  ELSE
    _slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona));
    IF _slug IS NULL THEN
      _slug := public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem);
      IF _slug IS NOT NULL AND _slug <> 'plantao'
         AND NOT public._roleta_pronta(_slug)
         AND public._roleta_pronta('plantao') THEN
        _origem_fallback := _slug;
        _slug := 'plantao';
      END IF;
    END IF;
  END IF;

  -- [V2] Devolução por SLA: o estouro do dono anterior conta (uma vez por
  -- lead) e alimenta a pausa automática — mesmo se este repasse falhar.
  IF _v2 AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _slug);
  END IF;

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
    IF _estrita THEN
      -- [ZONA] Fora da região só como EXCEÇÃO DA GESTÃO: pedida
      -- explicitamente (forcar_fora_da_zona) e com motivo escrito.
      IF _zona IS NOT NULL
         AND public.has_role(_corretor_id, 'corretor'::public.app_role)
         AND NOT public.corretor_atende_zona(_corretor_id, _zona) THEN
        _motivo_fora := NULLIF(btrim(COALESCE(_contexto_extra->>'motivo_fora_da_zona', '')), '');
        IF COALESCE(_contexto_extra->>'forcar_fora_da_zona', 'false') <> 'true'
           OR char_length(COALESCE(_motivo_fora, '')) < 5 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'SMQZ1',
            MESSAGE = public._msg_fora_da_regiao(_zona, _corretor_id);
        END IF;
        _divergencia_zona := true;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(array_length(_vencedor_zonas, 1), 0) > 0
       AND NOT (_zona = ANY(_vencedor_zonas)) THEN
      -- Comportamento anterior (zona_estrita=false): só avisa.
      _divergencia_zona := true;
    END IF;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      IF _estrita AND _zona IS NOT NULL THEN
        _motivo_falha := 'zona_sem_roleta';
        _motivo_log := public._rotulo_zona(_zona) || ' sem roleta vinculada (zonas_roletas) — lead na fila de exceções';
      ELSE
        _motivo_falha := 'origem_nao_mapeada';
        _motivo_log := 'Origem sem roleta vinculada — lead na fila de exceções';
      END IF;
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada, 'zona', _zona, 'zona_estrita', _estrita
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      IF _registrar_excecao THEN
        _excecao_id := public._registrar_excecao_distribuicao(
          _lead_id, _motivo_falha,
          CASE WHEN _motivo_falha = 'zona_sem_roleta' THEN _motivo_log
               ELSE 'Origem "' || _lead.origem::text || '" sem roleta vinculada' END,
          NULL, _contexto);
      END IF;
      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
      VALUES
        (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, NULL, 'triagem', 'excecao')
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

    -- [V2] Régua extra de elegibilidade: onboarding concluído, vínculo
    -- (fixo/autônomo) definido e WIP abaixo do disjuntor. Quem cai aqui fica
    -- auditado em 'inaptos_v2' no contexto da decisão.
    IF _v2 AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      SELECT
        COALESCE(array_agg(x.corretor_id) FILTER (WHERE x.apto), ARRAY[]::uuid[]),
        COALESCE(jsonb_agg(jsonb_build_object(
            'corretor_id', x.corretor_id, 'motivos', to_jsonb(x.motivos)))
          FILTER (WHERE NOT x.apto), '[]'::jsonb)
      INTO _aptos_ids, _inaptos_v2
      FROM (
        SELECT u.corretor_id, e.apto, e.motivos
        FROM unnest(_aptos_ids) AS u(corretor_id)
        CROSS JOIN LATERAL public._apto_extra_v2(u.corretor_id) e
      ) x;
    END IF;

    IF _estrita THEN
      -- [ZONA] Filtro de região SEM fallback, em qualquer roleta (na roleta
      -- da zona é redundante; na base e nas de origem é o que segura o lead
      -- dentro da zona). Quem foi cortado fica auditado em 'fora_da_regiao'.
      IF _zona IS NOT NULL AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        SELECT
          COALESCE(array_agg(u) FILTER (WHERE public.corretor_atende_zona(u, _zona)), ARRAY[]::uuid[]),
          COALESCE(jsonb_agg(u) FILTER (WHERE NOT public.corretor_atende_zona(u, _zona)), '[]'::jsonb)
        INTO _aptos_zona, _fora_regiao
        FROM unnest(_aptos_ids) AS u;
        _aptos_ids := _aptos_zona;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'
       AND array_length(_aptos_ids, 1) > 0 THEN
      -- Comportamento anterior (zona_estrita=false): filtro por
      -- profiles.zonas com fallback para qualquer apto.
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

    IF _v2 AND _classe = 'quente' AND _slug <> 'base' THEN
      -- [V2] QUENTE: smooth weighted round-robin por faixa de velocidade
      -- (tier A/B/C = peso 3/2/1). Advisory lock serializa o cursor SWRR;
      -- desempate: cursor maior, depois há mais tempo sem receber, depois id.
      PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _r.id::text));

      SELECT sum(CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END)
        INTO _sum_pesos
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

      IF COALESCE(_sum_pesos, 0) > 0 THEN
        UPDATE public.roleta_participantes rp
           SET wrr_current = rp.wrr_current
               + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
         WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

        SELECT rp.corretor_id, p.nome, rp.tier
          INTO _vencedor, _vencedor_nome, _faixa_vencedor
        FROM public.roleta_participantes rp
        JOIN public.profiles p ON p.id = rp.corretor_id
        WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
        ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
        LIMIT 1;

        UPDATE public.roleta_participantes
           SET wrr_current = wrr_current - _sum_pesos
         WHERE roleta_id = _r.id AND corretor_id = _vencedor;
      END IF;

      _regra := 'ponderado_velocidade' ||
                COALESCE(':faixa' || _faixa_vencedor, '');
    ELSE
      -- Rodízio por cursor: apto há mais tempo sem receber NESTA roleta,
      -- com lock no cursor para concorrência entre webhook/cron/manual.
      -- [V2] É também a mecânica da esteira BASE (rodízio puro, o piso).
      SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
      FROM public.roleta_participantes rp
      JOIN public.profiles p ON p.id = rp.corretor_id
      WHERE rp.roleta_id = _r.id
        AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      FOR UPDATE OF rp SKIP LOCKED
      LIMIT 1;

      _regra := CASE WHEN _v2 THEN 'rodizio_base' ELSE 'rodizio_menos_recente' END;
    END IF;
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
    'divergencia_zona', _divergencia_zona,
    'origem_fallback', _origem_fallback,
    'modelo_v2', _v2,
    'classe_lead', _classe,
    'inaptos_v2', _inaptos_v2,
    'faixa_vencedor', _faixa_vencedor,
    'zona_estrita', _estrita,
    'roleta_pedida', _roleta_pedida,
    'fora_da_regiao', _fora_regiao,
    'motivo_fora_da_zona', _motivo_fora
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF _estrita AND _zona IS NOT NULL AND _roleta_tipo = 'zona' AND COALESCE(_n_ativos, 0) = 0 THEN
      -- [ZONA] Time da zona não montado (ou roleta desligada): o lead ESPERA
      -- aqui (alerta à gestão) — desligar a roleta não manda o lead para
      -- outra zona.
      _motivo_falha := 'zona_sem_time';
      _motivo_log := public._rotulo_zona(_zona) || CASE
                       WHEN NOT _r.ativo THEN ' com a roleta ' || _slug || ' desativada'
                       ELSE ' sem time montado (roleta ' || _slug || ' sem participante ativo)' END
                     || ' — o lead espera o time da zona; ajuste na Central de Distribuição';
    ELSIF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da zona apto agora: espera — não vai para outra zona.
      _motivo_falha := 'sem_corretor_na_zona';
      _motivo_log := 'Ninguém da ' || public._rotulo_zona(_zona) || ' apto agora (roleta ' || _slug
                     || ': ausência, cota, pausa ou já teve o lead) — o lead espera o time da zona';
    ELSIF COALESCE(_n_ativos, 0) = 0 THEN
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

    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha,
                              'roleta', _slug, 'zona', _zona);
  END IF;

  -- ----------------------------- vencedor ----------------------------------
  _contexto := _contexto || jsonb_build_object(
    'vencedor', jsonb_build_object('corretor_id', _vencedor, 'nome', _vencedor_nome));

  -- [ZONA] Exceção da gestão (manual forçada com motivo): a guarda de
  -- leads.corretor_id é avisada só durante este UPDATE.
  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'on', true);
  END IF;

  UPDATE public.leads
     SET corretor_anterior_id = CASE
           WHEN corretor_id IS NOT NULL AND corretor_id <> _vencedor THEN corretor_id
           ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         -- Memória da roleta de ZONA — repasse por SLA fica no mesmo time
         -- da zona (o pino de campanha continua intocado).
         roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(_tentaram) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor) END
   WHERE id = _lead_id;

  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'off', true);
  END IF;

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
       WHEN _regra = 'manual_direta' AND _divergencia_zona AND _motivo_fora IS NOT NULL
         THEN 'Atribuição manual FORA DA REGIÃO (corretor não atende a ' || public._rotulo_zona(_zona)
              || ') — exceção da gestão: ' || _motivo_fora
       WHEN _regra = 'manual_direta' AND _divergencia_zona
         THEN 'Atribuição manual direta (corretor fora da Zona ' || _zona || ')'
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       WHEN _regra LIKE 'ponderado_velocidade%'
         THEN 'Roleta ' || _slug || ' — ponderado por velocidade (faixa ' || COALESCE(_faixa_vencedor, 'B') || ')'
       WHEN _regra = 'rodizio_base'
         THEN 'Roleta ' || _slug || ' — rodízio universal (há mais tempo sem receber)'
       WHEN _origem_fallback IS NOT NULL
         THEN 'Roleta ' || _slug || ' — rodízio (roleta ' || _origem_fallback || ' inativa/sem time; caiu no Plantão)'
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

  -- [V2] Modo SOMBRA: com o v2 desligado, registra quem o v2 teria escolhido
  -- na MESMA roleta (régua extra + argmax de wrr_current + peso da faixa),
  -- sem tocar cursor nenhum. Nunca pode derrubar a distribuição real.
  IF NOT _v2 AND _sombra AND _regra <> 'manual_direta'
     AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
    BEGIN
      SELECT rp.corretor_id, rp.tier
        INTO _sombra_vencedor, _sombra_faixa
      FROM public.roleta_participantes rp
      JOIN LATERAL public._apto_extra_v2(rp.corretor_id) e ON e.apto
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY (rp.wrr_current + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END) DESC,
               rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
      LIMIT 1;

      INSERT INTO public.distribuicao_sombra
        (lead_id, roleta_slug, classe_lead, vencedor_real, vencedor_v2, faixa_v2, contexto)
      VALUES
        (_lead_id, _slug, _classe, _vencedor, _sombra_vencedor, _sombra_faixa,
         jsonb_build_object('gatilho', _gatilho,
                            'seria_fila_base', _classe = 'base'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra,
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'aviso_zona', CASE WHEN _divergencia_zona
      THEN 'Corretor não atende a ' || public._rotulo_zona(_zona) ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Campanhas. Corpo vigente (20260821170000) + ramos [ZONA].
--    * campanha comum + lead com zona → time da zona (sem exigir "pronta");
--    * EQUIPE FIXA + lead com zona → sorteio SÓ entre quem da equipe atende a
--      zona; ninguém da equipe apto na zona → time da zona (o lead não espera
--      a equipe e não sai da zona — atender rápido DENTRO da regra);
--    * lead sem zona → SWRR da campanha como sempre.
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
  _estrita boolean := public._zona_estrita();
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  SELECT id, corretor_id, status INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  _zona := public.zona_do_lead(_lead_id);

  IF _estrita AND _zona IS NOT NULL THEN
    -- [ZONA] Campanha comum: a distribuição é do time da zona; a campanha
    -- vira rótulo no contexto.
    IF NOT _roleta.equipe_fixa THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  ELSIF NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): zona primeiro só se a
    -- roleta da zona estiver pronta.
    _zslug := public.roleta_da_zona(_zona);
    IF _zslug IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  END IF;

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

  IF _estrita THEN
    -- [ZONA] Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _dlp_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior: filtro por profiles.zonas com fallback.
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
    IF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da equipe fixa apto na zona do lead: time da zona.
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_equipe_fixa_sem_zona',
        jsonb_build_object('campanha', _roleta_slug, 'equipe_fixa', true,
                           'equipe_sem_apto_na_zona', true), true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_disponivel');
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'aguardando_atendimento'::public.lead_status
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
-- 4) Escoar estoque (cron a cada 10 min + botão da Central). Corpo vigente
--    (20260913170118) + [ZONA]: cada corretor recebe o estoque mais antigo
--    DA REGIÃO DELE (ou sem zona). Antes, o rodízio entregava o estoque mais
--    antigo de qualquer zona pelo ramo "manual direto" do motor — o maior
--    vazamento automático (alimentado pela cadência, reativação e régua).
--    A zona de cada lead do estoque é calculada UMA vez por rodada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(_roleta text DEFAULT 'plantao'::text, _limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _sem_vaga int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _lote int;
  _vagas int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
  _estrita boolean := public._zona_estrita();
  _regiao text[];
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  -- [ZONA] Estoque com a zona já resolvida (uma vez por rodada).
  CREATE TEMP TABLE IF NOT EXISTS _estoque_zona (
    lead_id uuid PRIMARY KEY, created_at timestamptz, zona text
  ) ON COMMIT DROP;
  TRUNCATE _estoque_zona;
  INSERT INTO _estoque_zona (lead_id, created_at, zona)
  SELECT l.id, l.created_at,
         CASE WHEN _estrita THEN public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id) END
    FROM public.leads l
   WHERE l.deleted_at IS NULL
     AND COALESCE(l.na_lixeira, false) = false
     AND l.corretor_id IS NULL
     AND l.sdr_id IS NULL
     AND l.status = 'aguardando_corretor';

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _vagas := public.carteira_vagas_entrada_v1(_c.corretor_id);
    IF _vagas <= 0 THEN
      _sem_vaga := _sem_vaga + 1;
      CONTINUE;
    END IF;

    _corretores := _corretores + 1;
    _entregues := 0;
    _lote := LEAST(_por_corretor, _vagas);
    _regiao := public.regiao_do_corretor(_c.corretor_id);

    FOR _lead IN
      SELECT ez.lead_id AS id
        FROM _estoque_zona ez
        JOIN public.leads l ON l.id = ez.lead_id
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
         AND (NOT _estrita OR ez.zona IS NULL OR ez.zona = ANY (_regiao))
       ORDER BY ez.created_at ASC
       LIMIT _lote
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _lote,
                                      'vagas_na_carteira', _vagas), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    -- Sem zona estrita, "nada entregue" = estoque vazio. Com ela, pode ser só
    -- a região DESTE corretor sem estoque — o próximo segue na fila.
    EXIT WHEN _entregues = 0 AND NOT _estrita;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'corretores_sem_vaga', _sem_vaga,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor'),
    'restante_por_zona', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(t.zona, 'sem_zona'), t.n), '{}'::jsonb)
        FROM (SELECT ez.zona, count(*) AS n
                FROM _estoque_zona ez
                JOIN public.leads l ON l.id = ez.lead_id
               WHERE l.corretor_id IS NULL AND l.status = 'aguardando_corretor'
               GROUP BY ez.zona) t)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Entrega do SDR. Corpo vigente (20260904140000) + [ZONA]:
--    * prioridade do corretor original só se ele atende a zona do lead;
--    * roleta de agendados só com quem atende a zona;
--    * ninguém dos agendados na zona → time da ZONA, com a mesma régua de
--      agenda do SDR (a visita marcada não fica órfã nem sai da zona).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_sdr(_lead_id uuid, _motivo text, _inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, _fim timestamp with time zone DEFAULT NULL::timestamp with time zone, _gatilho text DEFAULT 'sdr'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _slug text := 'agendados-sdr';
  _roleta public.roletas%ROWTYPE;
  _vencedor uuid;
  _vencedor_nome text;
  _regra text;
  _tipo public.distribuicao_tipo := 'automatica'::public.distribuicao_tipo;
  _aptos jsonb;
  _inaptos jsonb;
  _aptos_ids uuid[];
  _n_ativos int := 0;
  _log_id uuid;
  _ctx jsonb;
  _sdr_nome text;
  _prioridade_recusa text;
  _motivo_excecao text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zona text;
  _zslug text;
  _zroleta public.roletas%ROWTYPE;
  _slug_usado text;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  END IF;
  IF _lead.sdr_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_sdr');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _lead.sdr_id;
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _slug;
  _slug_usado := _slug;

  IF _estrita THEN
    _zona := public.zona_do_lead(_lead_id);
    IF _zona IS NOT NULL THEN
      SELECT zr.roleta_slug INTO _zslug FROM public.zonas_roletas zr WHERE zr.zona = _zona;
    END IF;
  END IF;

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  --    Só vale para quem HOJE tem o papel corretor: quem virou SDR vindo de
  --    corretor continua sendo corretor_id da carteira antiga e, sem esta
  --    guarda, o motor "entregaria" o lead de volta para o próprio SDR.
  IF _lead.corretor_id IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _lead.corretor_id AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_lead.corretor_id, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF _estrita AND NOT public.corretor_atende_zona(_lead.corretor_id, _zona) THEN
      -- [ZONA] O dono antigo é de outra região: a visita vai para a zona.
      _prioridade_recusa := 'fora_da_regiao';
    ELSIF public._sdr_agenda_conflita(_lead.corretor_id, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _lead.corretor_id;
      _regra := 'sdr_prioridade_corretor_original';
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  IF _vencedor IS NULL THEN
    IF _roleta.id IS NULL OR NOT _roleta.ativo THEN
      _motivo_excecao := 'sem_corretor_ativo';
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('roleta_sdr:' || _slug));

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome)) FILTER (WHERE e.apto), '[]'::jsonb),
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome, 'motivos', e.motivos)) FILTER (WHERE NOT e.apto), '[]'::jsonb),
        array_agg(e.corretor_id) FILTER (WHERE e.apto),
        count(*)::int
      INTO _aptos, _inaptos, _aptos_ids, _n_ativos
      FROM public._elegibilidade_roleta_sdr(_slug, _inicio, _fim) e;

      -- [ZONA] Só quem atende a zona do lead.
      IF _estrita AND _zona IS NOT NULL THEN
        _aptos_ids := ARRAY(SELECT x FROM unnest(COALESCE(_aptos_ids, ARRAY[]::uuid[])) x
                             WHERE public.corretor_atende_zona(x, _zona));
      END IF;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      SELECT rp.corretor_id INTO _vencedor
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _roleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
    END IF;
  END IF;

  -- 3) [ZONA] Ninguém dos agendados atende a zona: time da zona, mesma régua
  --    de agenda (presença, teto do SDR, conflito no horário da visita).
  IF _vencedor IS NULL AND _estrita AND _zslug IS NOT NULL THEN
    SELECT * INTO _zroleta FROM public.roletas WHERE slug = _zslug AND ativo;
    IF FOUND THEN
      SELECT array_agg(e.corretor_id) FILTER (WHERE e.apto)
        INTO _aptos_ids
      FROM public._elegibilidade_roleta_sdr(_zslug, _inicio, _fim) e;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      SELECT rp.corretor_id INTO _vencedor
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _zroleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      IF _vencedor IS NOT NULL THEN
        _regra := 'roleta_sdr_zona';
        _slug_usado := _zslug;
        _roleta := _zroleta;
        _motivo_excecao := NULL;
      END IF;
    END IF;
    IF _vencedor IS NULL THEN
      _motivo_excecao := 'sem_corretor_na_zona';
    END IF;
  END IF;

  _ctx := jsonb_strip_nulls(jsonb_build_object(
    'modelo', 'sdr',
    'gatilho', _gatilho,
    'sdr_id', _lead.sdr_id,
    'sdr_nome', _sdr_nome,
    'regra', _regra,
    'aptos', COALESCE(_aptos, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos, '[]'::jsonb),
    'prioridade_recusa', _prioridade_recusa,
    'inicio', _inicio,
    'fim', _fim,
    'zona', _zona,
    'zona_estrita', _estrita,
    'roleta_usada', _slug_usado
  ));

  IF _vencedor IS NULL THEN
    PERFORM public._registrar_excecao_distribuicao(
      _lead_id, _motivo_excecao,
      CASE WHEN _motivo_excecao = 'sem_corretor_na_zona'
           THEN 'Visita do SDR sem corretor da ' || public._rotulo_zona(_zona) || ' livre ('
                || COALESCE(_motivo, _gatilho) || ') — o lead espera o time da zona'
           ELSE 'Roleta de agendados do SDR sem corretor apto (' || COALESCE(_motivo, _gatilho) || ')' END,
      _slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
    VALUES
      (_lead_id, NULL, 'automatica'::public.distribuicao_tipo, _motivo, _slug, 'roleta_sdr', 'sem_corretor', _uid)
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', _motivo_excecao,
                              'aptos', COALESCE(_aptos, '[]'::jsonb),
                              'inaptos', COALESCE(_inaptos, '[]'::jsonb));
  END IF;

  SELECT p.nome INTO _vencedor_nome FROM public.profiles p WHERE p.id = _vencedor;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = CASE WHEN corretor_id IS DISTINCT FROM _vencedor THEN corretor_id ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         sdr_entregue_em = now(),
         sdr_devolvido_em = NULL,
         roleta_slug = CASE WHEN _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN _slug_usado ELSE roleta_slug END,
         via_webhook = false,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor)
         END
   WHERE id = _lead_id;

  IF _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN
    UPDATE public.roleta_participantes
       SET ultimo_lead_em = now(), updated_at = now()
     WHERE roleta_id = _roleta.id AND corretor_id = _vencedor;
  END IF;
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _vencedor, _tipo, _motivo, _slug_usado, _regra, 'sucesso', _uid)
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object('vencedor', _vencedor, 'vencedor_nome', _vencedor_nome));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(), resolvida_por = _uid,
         resolucao = 'Entregue pelo SDR a ' || COALESCE(_vencedor_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente', 'em_analise');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_entrega',
    'Entregue pelo SDR ' || COALESCE(_sdr_nome, '') || ' ao corretor ' || COALESCE(_vencedor_nome, '') || ' (' || COALESCE(_motivo, _gatilho) || ').',
    'sdr_motor',
    jsonb_build_object('sdr_id', _lead.sdr_id, 'corretor_id', _vencedor, 'regra', _regra,
                       'motivo', _motivo, 'gatilho', _gatilho)
  );

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
    'Lead entregue pelo SDR',
    'SDR ' || COALESCE(_sdr_nome, '') || ' → corretor ' || COALESCE(_vencedor_nome, '') || ': ' || COALESCE(_motivo, _gatilho),
    jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_entrega', 'regra', _regra,
                       'sdr_id', _lead.sdr_id, 'corretor_id', _vencedor)
  );

  -- Push: o trigger de leads só dispara quando corretor_id MUDA; no caminho de
  -- prioridade (mesmo dono) avisamos explicitamente.
  IF _lead.corretor_id IS NOT DISTINCT FROM _vencedor THEN
    PERFORM public.enqueue_push(
      _vencedor, 'Lead do SDR para você',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_motivo, _gatilho),
      '/leads/' || _lead_id::text, 'sdr-' || _lead_id::text);
  END IF;

  -- Marcão (n8n copiloto/handoff) NÃO roda na entrega do SDR: o aviso é o
  -- WhatsApp do SDR (_sdr_notificar_corretor), disparado depois que a visita
  -- existe — um único WhatsApp por entrega.

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _vencedor, 'corretor_nome', _vencedor_nome,
    'regra', _regra, 'roleta', _slug_usado);
END; $function$;

-- ---------------------------------------------------------------------------
-- 6) Oferta Ativa — entrega de lista pela gestão. Corpo vigente
--    (20260727212024) + [ZONA]:
--    * ANTES de mexer em qualquer lead: lead de zona que NENHUM corretor
--      escolhido atende → erro legível (SMQZ1) com a contagem por zona. Nada
--      é entregue pela metade;
--    * divisão entre vários corretores: cada lead vai, em rodízio, para um
--      dos escolhidos que ATENDE a zona dele (lead sem zona: todos).
--    A numeração continua determinística entre os lotes (retomada segura).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuir_oferta_ativa_lote(_oferta_id uuid, _corretor_ids uuid[], _batch_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _oferta record;
  _n integer;
  _ids uuid[];
  _total integer := 0;
  _processed integer := 0;
  _batch_count integer := 0;
  _remaining integer := 0;
  _limit integer := greatest(1, least(coalesce(_batch_size, 50), 100));
  _new_id uuid;
  _created uuid[] := ARRAY[]::uuid[];
  _i integer;
  _estrita boolean := public._zona_estrita();
  _sem_dono text;
  _n_sem_dono integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  IF NOT (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin ou gestor podem atribuir listas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _oferta
  FROM public.ofertas_ativas
  WHERE id = _oferta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(c ORDER BY primeira_ordem), ARRAY[]::uuid[])
    INTO _ids
  FROM (
    SELECT c, min(ordem) AS primeira_ordem
    FROM unnest(_corretor_ids) WITH ORDINALITY AS u(c, ordem)
    WHERE c IS NOT NULL
    GROUP BY c
  ) dedup;

  _n := COALESCE(array_length(_ids, 1), 0);
  IF _n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um corretor' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _total
  FROM public.oferta_ativa_leads
  WHERE oferta_id = _oferta_id;

  IF _total = 0 THEN
    RAISE EXCEPTION 'A lista não tem leads para dividir' USING ERRCODE = '22023';
  END IF;

  -- [ZONA] Cada lead da lista com a zona e os índices (em _ids) de quem pode
  -- recebê-lo. Corretor = papel corretor e região que cobre a zona; quem não
  -- é corretor (gestor) não entra na regra.
  CREATE TEMP TABLE IF NOT EXISTS _oferta_zona (
    lead_id uuid PRIMARY KEY, created_at timestamptz, oal_id uuid, idxs int[]
  ) ON COMMIT DROP;
  TRUNCATE _oferta_zona;
  INSERT INTO _oferta_zona (lead_id, created_at, oal_id, idxs)
  SELECT oal.lead_id, oal.created_at, oal.id,
         ARRAY(SELECT i FROM generate_subscripts(_ids, 1) AS i
                WHERE NOT _estrita
                   OR NOT public.has_role(_ids[i], 'corretor'::app_role)
                   OR public.corretor_atende_zona(_ids[i], z.zona)
                ORDER BY i)
    FROM public.oferta_ativa_leads oal
    CROSS JOIN LATERAL (SELECT public.zona_do_lead(oal.lead_id) AS zona) z
   WHERE oal.oferta_id = _oferta_id;

  SELECT string_agg(t.rotulo || ': ' || t.n, '; ' ORDER BY t.n DESC)
    INTO _sem_dono
  FROM (
    SELECT public._rotulo_zona(public.zona_do_lead(oz.lead_id)) AS rotulo, count(*) AS n
      FROM _oferta_zona oz
     WHERE cardinality(oz.idxs) = 0
     GROUP BY 1
  ) t;
  SELECT count(*) INTO _n_sem_dono FROM _oferta_zona oz WHERE cardinality(oz.idxs) = 0;

  IF _n_sem_dono > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'SMQZ1',
      MESSAGE = 'Fora da região: ' || _n_sem_dono || ' lead(s) da lista são de zona que nenhum corretor escolhido atende ('
                || _sem_dono || '). Inclua um corretor dessas zonas ou tire esses leads da lista.';
  END IF;

  -- Entrega de lista é uma fronteira autorizada de mudança de etapa
  -- (admin/gestor já validados acima): libera a trava de status_via_rpc
  -- apenas dentro desta transação.
  PERFORM set_config('app.transicionar_lead', 'on', true);

  IF _n = 1 THEN
    UPDATE public.ofertas_ativas
       SET corretor_id = _ids[1], updated_at = now()
     WHERE id = _oferta_id;

    WITH pending AS (
      SELECT oal.lead_id
      FROM public.oferta_ativa_leads oal
      JOIN public.leads l ON l.id = oal.lead_id
      WHERE oal.oferta_id = _oferta_id
        AND (
          l.corretor_id IS DISTINCT FROM _ids[1]
          OR l.status IS DISTINCT FROM 'aguardando_atendimento'::public.lead_status
          OR l.via_webhook IS DISTINCT FROM false
        )
      ORDER BY oal.created_at, oal.id
      LIMIT _limit
    ), locked AS (
      SELECT p.lead_id
      FROM pending p
      JOIN public.leads l ON l.id = p.lead_id
      ORDER BY l.id
      FOR UPDATE OF l
    ), updated AS (
      UPDATE public.leads l
         SET corretor_id = _ids[1],
             status = 'aguardando_atendimento'::public.lead_status,
             via_webhook = false,
             data_distribuicao = now(),
             updated_at = now()
        FROM locked
       WHERE l.id = locked.lead_id
       RETURNING l.id
    )
    SELECT count(*) INTO _batch_count FROM updated;

    UPDATE public.oferta_ativa_leads oal
       SET avancado = false
     WHERE oal.oferta_id = _oferta_id
       AND EXISTS (
         SELECT 1
         FROM public.leads l
         WHERE l.id = oal.lead_id
           AND l.corretor_id = _ids[1]
           AND l.status = 'aguardando_atendimento'::public.lead_status
           AND l.via_webhook IS false
       );

    SELECT count(*) INTO _processed
    FROM public.oferta_ativa_leads oal
    JOIN public.leads l ON l.id = oal.lead_id
    WHERE oal.oferta_id = _oferta_id
      AND l.corretor_id = _ids[1]
      AND l.status = 'aguardando_atendimento'::public.lead_status
      AND l.via_webhook IS false;

    _remaining := greatest(_total - _processed, 0);

    PERFORM set_config('app.transicionar_lead', 'off', true);

    RETURN jsonb_build_object(
      'modo', 'single',
      'oferta_id', _oferta_id,
      'total_leads', _total,
      'processados', _processed,
      'lote_processado', _batch_count,
      'restantes', _remaining,
      'concluido', _remaining = 0
    );
  END IF;

  FOR _i IN 1.._n LOOP
    SELECT id INTO _new_id
    FROM public.ofertas_ativas
    WHERE filtros->>'__split_parent' = _oferta_id::text
      AND filtros->>'__split_index' = _i::text
      AND corretor_id = _ids[_i]
    ORDER BY created_at
    LIMIT 1;

    IF _new_id IS NULL THEN
      INSERT INTO public.ofertas_ativas (nome, descricao, status, criado_por, corretor_id, filtros)
      VALUES (
        left(_oferta.nome || ' — parte ' || _i::text || '/' || _n::text, 200),
        _oferta.descricao,
        'ativa',
        _uid,
        _ids[_i],
        coalesce(_oferta.filtros, '{}'::jsonb) || jsonb_build_object(
          '__split_parent', _oferta_id::text,
          '__split_index', _i::text,
          '__split_total', _n
        )
      )
      RETURNING id INTO _new_id;
    END IF;

    _created := _created || _new_id;
  END LOOP;

  -- [ZONA] Rodízio DENTRO do grupo de quem pode receber o lead (com a
  -- regra desligada, ou sem zona, o grupo é "todos" — idêntico ao anterior).
  WITH numbered AS (
    SELECT
      oz.lead_id,
      oz.idxs[(((row_number() OVER (PARTITION BY oz.idxs ORDER BY oz.created_at, oz.oal_id) - 1)
                % cardinality(oz.idxs)) + 1)::integer] AS idx
    FROM _oferta_zona oz
  ), pending AS (
    SELECT
      n.lead_id,
      n.idx,
      _ids[n.idx] AS corretor_id,
      _created[n.idx] AS child_id
    FROM numbered n
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.oferta_ativa_leads done
      WHERE done.lead_id = n.lead_id
        AND done.oferta_id = ANY(_created)
    )
    ORDER BY n.idx, n.lead_id
    LIMIT _limit
  ), locked AS (
    SELECT p.*
    FROM pending p
    JOIN public.leads l ON l.id = p.lead_id
    ORDER BY l.id
    FOR UPDATE OF l
  ), inserted AS (
    INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id, avancado)
    SELECT child_id, lead_id, false
    FROM locked
    ON CONFLICT (oferta_id, lead_id) DO NOTHING
    RETURNING lead_id
  ), updated AS (
    UPDATE public.leads l
       SET corretor_id = locked.corretor_id,
           status = 'aguardando_atendimento'::public.lead_status,
           via_webhook = false,
           data_distribuicao = now(),
           updated_at = now()
      FROM locked
     WHERE l.id = locked.lead_id
     RETURNING l.id
  )
  SELECT count(*) INTO _batch_count FROM updated;

  SELECT count(DISTINCT oal.lead_id) INTO _processed
  FROM public.oferta_ativa_leads oal
  WHERE oal.oferta_id = ANY(_created);

  _remaining := greatest(_total - _processed, 0);

  IF _remaining = 0 THEN
    UPDATE public.ofertas_ativas
       SET status = 'arquivada', updated_at = now()
     WHERE id = _oferta_id;
  END IF;

  PERFORM set_config('app.transicionar_lead', 'off', true);

  RETURN jsonb_build_object(
    'modo', 'split',
    'original_id', _oferta_id,
    'criadas', to_jsonb(_created),
    'total_leads', _total,
    'processados', _processed,
    'lote_processado', _batch_count,
    'restantes', _remaining,
    'concluido', _remaining = 0
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Transferência manual (Leads, Painel do Dia, Leads por Corretor e a API
--    pública PATCH /leads/:id/corretor). Corpo vigente (20260919120000) +
--    [ZONA]: antes de mover QUALQUER lead, confere a região do destino. Lead
--    de zona que o destino não atende → erro legível com a contagem por zona
--    (nada é transferido pela metade). Exceção da gestão: _forcar_fora_da_zona
--    + _motivo_fora_da_zona (mín. 5 caracteres) — vira log auditável.
--    Assinatura nova (parâmetros com DEFAULT): chamadas antigas seguem iguais.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.transferir_leads(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.transferir_leads(
  _ids uuid[],
  _corretor uuid,
  _forcar_fora_da_zona boolean DEFAULT false,
  _motivo_fora_da_zona text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _l record;
  _n integer := 0;
  _ativo boolean;
  _nome text;
  -- Handoff: acumula em vez de disparar dentro do loop. Só vira POST se a
  -- chamada inteira tiver movido UM lead de dono.
  _donos_trocados integer := 0;
  _hand_lead uuid;
  _hand_motivo text;
  -- [ZONA]
  _checa_regiao boolean;
  _motivo_fora text := NULLIF(btrim(COALESCE(_motivo_fora_da_zona, '')), '');
  _n_fora integer := 0;
  _resumo_fora text;
  _fora boolean;
  _zona text;
BEGIN
  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL AND (
    NOT public.is_active_member(_caller)
    OR NOT (
      public.has_role(_caller, 'admin')
      OR public.has_role(_caller, 'superintendente')
      OR public.has_role(_caller, 'gestor')
    )
    OR NOT public.pode_atribuir_lead(_caller, _corretor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.ativo AND p.status_conta = 'ativa'::public.status_conta,
    p.nome
  INTO _ativo, _nome
  FROM public.profiles AS p
  WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo' USING ERRCODE = '22023';
  END IF;

  -- [ZONA] Conferência ANTES de mover qualquer lead.
  _checa_regiao := public._zona_estrita()
                   AND public.has_role(_corretor, 'corretor'::public.app_role);
  IF _checa_regiao THEN
    SELECT COALESCE(sum(t.n), 0)::int,
           string_agg(t.rotulo || ': ' || t.n, '; ' ORDER BY t.n DESC)
      INTO _n_fora, _resumo_fora
    FROM (
      SELECT public._rotulo_zona(x.zona) AS rotulo, count(*) AS n
        FROM (SELECT public.zona_do_lead(l.id) AS zona
                FROM public.leads l
               WHERE l.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
                 AND l.corretor_id IS DISTINCT FROM _corretor) x
       WHERE NOT public.corretor_atende_zona(_corretor, x.zona)
       GROUP BY 1
    ) t;

    IF _n_fora > 0 AND (NOT COALESCE(_forcar_fora_da_zona, false)
                        OR char_length(COALESCE(_motivo_fora, '')) < 5) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'SMQZ1',
        MESSAGE = 'Fora da região: ' || _n_fora || ' de '
                  || COALESCE(cardinality(_ids), 0) || ' lead(s) são de zona que ' || _nome
                  || ' não atende (' || _resumo_fora || '). Escolha um corretor da zona, devolva à roleta'
                  || ' ou registre a exceção da gestão com motivo.';
    END IF;
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads
    WHERE id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _l.id) THEN
      RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
    END IF;

    _fora := false;
    IF _checa_regiao AND _l.corretor_id IS DISTINCT FROM _corretor THEN
      _zona := public.zona_do_lead(_l.id);
      _fora := NOT public.corretor_atende_zona(_corretor, _zona);
    END IF;
    IF _fora THEN
      PERFORM set_config('app.zona_override', 'on', true);
    END IF;

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

    IF _fora THEN
      PERFORM set_config('app.zona_override', 'off', true);
    END IF;

    -- Filas operacionais usam o responsável denormalizado. Mantém somente os
    -- itens ainda acionáveis com a nova carteira; histórico concluído permanece
    -- atribuído a quem o executou.
    UPDATE public.agendamentos
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'agendado'::public.agendamento_status,
        'confirmado'::public.agendamento_status,
        'remarcado'::public.agendamento_status
      );

    UPDATE public.tarefas
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'pendente'::public.tarefa_status,
        'em_andamento'::public.tarefa_status
      );

    INSERT INTO public.distribution_log(
      lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado
    ) VALUES (
      _l.id, _corretor, 'manual',
      CASE WHEN _fora
        THEN 'Transferência manual FORA DA REGIÃO (' || public._rotulo_zona(_zona)
             || ') — exceção da gestão: ' || _motivo_fora
        ELSE 'Transferência manual' END,
      _caller,
      CASE WHEN _fora THEN 'transferencia_fora_da_regiao' ELSE 'transferencia_manual' END,
      'sucesso'
    );

    UPDATE public.distribuicao_excecoes
    SET status = 'resolvida',
        resolvida_em = now(),
        resolvida_por = _caller,
        resolucao = 'Transferido manualmente para ' || _nome
    WHERE lead_id = _l.id AND status IN ('pendente', 'em_analise');

    -- Auditoria por lead (log interno, não gera mensagem) + guarda do handoff.
    IF _l.corretor_id IS DISTINCT FROM _corretor THEN
      PERFORM public._auditar_redistribuicao(
        _l.id, _l.corretor_id, _corretor, 'Transferência manual');

      _donos_trocados := _donos_trocados + 1;
      IF _donos_trocados = 1 THEN
        _hand_lead := _l.id;
        _hand_motivo :=
          'transferência manual: ' ||
          COALESCE((SELECT nome FROM public.profiles WHERE id = _l.corretor_id), '(anterior)') ||
          ' -> ' || _nome;
      END IF;
    END IF;

    _n := _n + 1;
  END LOOP;

  -- Dossiê do copiloto só na transferência avulsa. Em lote quem avisa é a
  -- mensagem única de resumo (edge function notify-lead-transfer); mandar um
  -- POST por lead aqui devolveria a rajada de WhatsApp que essa mudança tirou.
  IF _donos_trocados = 1 THEN
    PERFORM public._notificar_handoff_novo_dono(_hand_lead, _corretor, _hand_motivo);
  END IF;

  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Fila de exceções. Corpo vigente (20260720180000) + [ZONA]: o "atribuir
--    manual" repassa ao motor o pedido de exceção da gestão
--    (_params.forcar_fora_da_zona + _params.motivo_fora_da_zona). Sem ele, o
--    motor recusa corretor fora da região. "Escolher roleta" de outra zona
--    não tira mais o lead da zona dele (o motor registra roleta_pedida).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_excecao(_excecao_id uuid, _acao text, _params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _e record;
  _res jsonb;
BEGIN
  IF _caller IS NULL
     OR NOT public.has_role(_caller, 'admin') THEN
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
      _e.lead_id, 'manual', NULL, (_params->>'corretor_id')::uuid, _caller, 'excecao_manual',
      jsonb_strip_nulls(jsonb_build_object(
        'forcar_fora_da_zona', CASE WHEN _params->>'forcar_fora_da_zona' = 'true' THEN true END,
        'motivo_fora_da_zona', NULLIF(btrim(COALESCE(_params->>'motivo_fora_da_zona', '')), ''))));

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
$function$;

-- ---------------------------------------------------------------------------
-- 9) Discador (Bolsão). Corpos vigentes (20261005120000 / 20260915130000) +
--    [ZONA]: o corretor só RESERVA para discar lead da própria região (ou
--    sem zona) — não faz sentido conversar com um cliente que ele não pode
--    assumir — e o "assumir" devolve 'fora_da_regiao' em vez de estourar a
--    guarda no meio do webhook da 3C Plus.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_bolsao_assumir_v1(_lead uuid, _corretor uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _l record;
  _zona text;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE((SELECT c.portas_legadas_bolsao FROM public.cadencia_config AS c WHERE c.id = 1), false)
     AND NOT (public.has_role(_corretor, 'admin'::public.app_role)
              OR public.has_role(_corretor, 'gestor'::public.app_role)
              OR public.has_role(_corretor, 'superintendente'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porta_fechada_use_lote');
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.sdr_id, l.deleted_at, l.na_lixeira,
         l.corretores_que_tentaram, l.zona, l.bairro, l.projeto_id
    INTO _l
  FROM public.leads AS l
  WHERE l.id = _lead
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _l.deleted_at IS NOT NULL OR _l.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_da_base');
  END IF;
  IF _l.corretor_id = _corretor THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'ja_e_seu');
  END IF;
  IF _l.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tem_dono');
  END IF;
  IF _l.sdr_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'em_triagem_sdr');
  END IF;
  IF public._lead_venda_viva(_lead) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'venda_viva');
  END IF;

  -- [ZONA] Corretor só assume lead da própria região.
  IF public._zona_estrita() AND public.has_role(_corretor, 'corretor'::public.app_role) THEN
    _zona := public._zona_do_lead_campos(_l.zona, _l.bairro, _l.projeto_id);
    IF NOT public.corretor_atende_zona(_corretor, _zona) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'fora_da_regiao', 'zona', _zona);
    END IF;
  END IF;

  UPDATE public.leads
     SET corretor_id = _corretor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         tentativas_redistribuicao = 0,
         via_webhook = false,
         corretores_que_tentaram = CASE
           WHEN _corretor = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN _l.corretores_que_tentaram
           ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
         END
   WHERE id = _lead;

  UPDATE public.bolsao_discagem AS d
     SET assumido_em = now()
   WHERE d.lead_id = _lead;

  -- O lead saiu do Bolsão: os atendimentos abertos se encerram — o de quem
  -- assumiu como "posse própria", os dos outros como "posse de outro" (a aba
  -- deles mostra que ganhou dono, sem dizer quem).
  UPDATE public.discador_atendimentos AS a
     SET encerrado_em = now(),
         encerrado_motivo = CASE WHEN a.corretor_id = _corretor THEN 'posse_propria' ELSE 'posse_outro' END
   WHERE a.lead_id = _lead AND a.encerrado_em IS NULL;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
  VALUES
    (_lead, _corretor, 'automatica'::public.distribuicao_tipo,
     COALESCE(NULLIF(btrim(_motivo), ''), 'Discador: avançou de fase'),
     'discador_bolsao', 'sucesso');

  IF _l.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
    PERFORM public.transicionar_lead(
      _lead, 'aguardando_atendimento'::public.lead_status,
      'Assumido pelo discador (Bolsão)');
  END IF;

  RETURN jsonb_build_object('ok', true, 'motivo', 'assumido',
                            'status_anterior', _l.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.discador_bolsao_reservar_v1(_corretor uuid, _quantidade integer DEFAULT NULL::integer, _modo text DEFAULT 'campanha'::text, _campaign_id text DEFAULT NULL::text, _list_id text DEFAULT NULL::text)
 RETURNS TABLE(lead_id uuid, nome text, telefone text, projeto_nome text, status lead_status, dias_parado integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _cfg jsonb := COALESCE(public.gestao_config_valor('bolsao'), '{}'::jsonb);
  _lote integer;
  _rediscagem_dias integer := COALESCE((_cfg ->> 'discador_rediscagem_dias')::integer, 7);
  _reserva_horas integer := COALESCE((_cfg ->> 'discador_reserva_horas')::integer, 24);
  _anti_ioio_dias integer := COALESCE((_cfg ->> 'discador_anti_ioio_dias')::integer, 30);
  -- [ZONA] Corretor disca só a própria região (ou lead sem zona).
  _filtra_regiao boolean;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;
  IF _modo NOT IN ('campanha', 'um_a_um') THEN
    RAISE EXCEPTION 'modo inválido: %', _modo USING ERRCODE = '22023';
  END IF;
  _lote := LEAST(GREATEST(COALESCE(_quantidade, (_cfg ->> 'discador_lote')::integer, 200), 1), 500);
  _filtra_regiao := public._zona_estrita() AND public.has_role(_corretor, 'corretor'::public.app_role);

  RETURN QUERY
  WITH candidatos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.projeto_nome,
      l.status,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS parado_desde
    FROM public.leads AS l
    WHERE public._bolsao_elegivel(l)
      -- Não atropela um SDR que já está com o lead na mão.
      AND l.sdr_id IS NULL
      -- Ninguém mais está discando este lead agora.
      AND NOT EXISTS (
        SELECT 1 FROM public.bolsao_discagem AS d
        WHERE d.lead_id = l.id AND d.expira_em > now()
      )
      -- Discado há pouco (por qualquer corretor, atendido ou não): espera.
      AND NOT EXISTS (
        SELECT 1 FROM public.chamadas AS c
        WHERE c.lead_id = l.id
          AND c.criado_em > now() - make_interval(days => _rediscagem_dias)
      )
      -- Anti-ioiô: o lead que este corretor devolveu há pouco não volta
      -- para ele pelo discador (mesma régua do puxar, §5.2 do documento).
      AND NOT EXISTS (
        SELECT 1 FROM public.devolucao_log AS dl
        WHERE dl.lead_id = l.id
          AND dl.corretor_anterior_id = _corretor
          AND dl.aplicado
          AND dl.created_at > now() - make_interval(days => _anti_ioio_dias)
      )
      -- [ZONA] (lead sem zona passa: corretor_atende_zona(_, NULL) = true)
      AND (NOT _filtra_regiao
           OR public.corretor_atende_zona(
                _corretor, public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id)))
    ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
             l.id ASC
    LIMIT _lote
    FOR UPDATE OF l SKIP LOCKED
  ),
  reservados AS (
    INSERT INTO public.bolsao_discagem
      (lead_id, corretor_id, modo, campaign_id, list_id, expira_em)
    SELECT c.id, _corretor, _modo, _campaign_id, _list_id,
           now() + make_interval(hours => _reserva_horas)
    FROM candidatos AS c
    ON CONFLICT (lead_id) DO UPDATE
      SET corretor_id = EXCLUDED.corretor_id,
          modo = EXCLUDED.modo,
          campaign_id = EXCLUDED.campaign_id,
          list_id = EXCLUDED.list_id,
          reservado_em = now(),
          expira_em = EXCLUDED.expira_em,
          assumido_em = NULL
      WHERE public.bolsao_discagem.expira_em <= now()
    RETURNING public.bolsao_discagem.lead_id AS reservado_id
  )
  SELECT
    c.id,
    c.nome,
    c.telefone,
    c.projeto_nome,
    c.status,
    GREATEST(0, (EXTRACT(day FROM now() - c.parado_desde))::integer)
  FROM candidatos AS c
  JOIN reservados AS r ON r.reservado_id = c.id
  ORDER BY c.parado_desde ASC, c.id ASC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10) Lote de prospecção. Corpo vigente (20261007120000) + [ZONA]: o
--     corretor só pede lote de zona da própria região. O status do lote
--     passa a dizer qual é a região (a tela mostra só essas zonas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prospeccao_pedir_lote(_zona text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me uuid := auth.uid();
  -- As cinco zonas da capital ou a Grande SP (20261007120000).
  _z text := public._prospeccao_zona_pedida(_zona);
  _st jsonb;
  _lote uuid;
  _n integer := 0;
  _l record;
  _etapa text;
  _tamanho constant integer := 30;
  _anti integer := COALESCE(
    (public.gestao_config_valor('bolsao') ->> 'discador_anti_ioio_dias')::int, 30);
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _z IS NULL THEN
    RAISE EXCEPTION 'zona invalida: %', _zona USING ERRCODE = '22023';
  END IF;

  -- Dois cliques do mesmo corretor não viram dois lotes.
  PERFORM pg_advisory_xact_lock(hashtext('prospeccao_lote:' || _me::text));

  _st := public.prospeccao_lote_status_v1();
  IF NOT (_st ->> 'pode_pedir')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _st ->> 'motivo');
  END IF;

  -- [ZONA] Depois das travas gerais: o corretor só pede lote das zonas da PRÓPRIA região (antes
  -- escolhia qualquer uma das seis). Sem região, não há lote de zona.
  IF public._zona_estrita()
     AND public.has_role(_me, 'corretor'::public.app_role)
     AND NOT public.corretor_atende_zona(_me, _z) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', CASE WHEN cardinality(public.regiao_do_corretor(_me)) = 0
                     THEN 'sem_regiao' ELSE 'zona_fora_da_regiao' END,
      'zona', _z,
      'regiao', to_jsonb(public.regiao_do_corretor(_me)));
  END IF;

  INSERT INTO public.prospeccao_lotes (corretor_id, zona, solicitados)
  VALUES (_me, _z, _tamanho)
  RETURNING id INTO _lote;

  PERFORM set_config('app.prospeccao_lote', 'on', true);

  FOR _l IN
    -- Três filtros sobre o próprio lead, que o planejador aplica do mais
    -- barato ao mais caro (é o COST de cada função): colunas → zona → regra
    -- inteira. Assim a regra, com várias subconsultas por linha, só roda para
    -- quem já é da zona pedida.
    SELECT l.id, l.status, l.classe_lead, l.corretores_que_tentaram,
           l.data_distribuicao, l.timestamp_recebimento
      FROM public.leads AS l
     WHERE l.corretor_id IS NULL
       AND l.sdr_id IS NULL
       AND l.cadencia_etapa IS NULL
       AND l.deleted_at IS NULL
       AND NOT l.na_lixeira
       AND public._prospeccao_zona_do_lead(l) = _z
       AND public._prospeccao_lote_elegivel(l, _me, _anti)
     -- A mesma ordem do Bolsão e do Discador: o parado há mais tempo primeiro.
     ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
              l.id ASC
     LIMIT _tamanho
     FOR UPDATE OF l SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.prospeccao_lote_itens
        (lote_id, lead_id, status_anterior, classe_anterior,
         data_distribuicao_anterior, recebimento_anterior)
      VALUES
        (_lote, _l.id, _l.status, _l.classe_lead,
         _l.data_distribuicao, _l.timestamp_recebimento);

      -- classe 'base' + via_webhook false: o SLA de 15 minutos não toma o
      -- cliente do lote (item 4 do cabeçalho). O gatilho de atribuição põe o
      -- lead em D0 neste mesmo UPDATE.
      UPDATE public.leads
         SET corretor_id               = _me,
             prospeccao_lote_id        = _lote,
             data_distribuicao         = now(),
             timestamp_recebimento     = now(),
             tentativas_redistribuicao = 0,
             via_webhook               = false,
             classe_lead               = 'base',
             corretores_que_tentaram   = CASE
               WHEN _me = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
                 THEN _l.corretores_que_tentaram
               ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _me)
             END
       WHERE id = _l.id AND corretor_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'lead mudou de mãos' USING ERRCODE = 'SMQL1';
      END IF;

      IF _l.status = 'novo'::public.lead_status THEN
        PERFORM public.transicionar_lead(
          _l.id, 'aguardando_atendimento'::public.lead_status, 'Lote de prospecção');
      END IF;

      SELECT l.cadencia_etapa INTO _etapa FROM public.leads AS l WHERE l.id = _l.id;
      IF _etapa IS DISTINCT FROM 'D0' THEN
        RAISE EXCEPTION 'lead fora da cadência' USING ERRCODE = 'SMQL1';
      END IF;

      -- O cliente saiu do Bolsão: atendimentos abertos no Discador se encerram,
      -- como quando alguém assume por lá.
      UPDATE public.discador_atendimentos AS a
         SET encerrado_em = now(),
             encerrado_motivo = CASE WHEN a.corretor_id = _me THEN 'posse_propria' ELSE 'posse_outro' END
       WHERE a.lead_id = _l.id AND a.encerrado_em IS NULL;

      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
      VALUES
        (_l.id, _me, 'manual'::public.distribuicao_tipo,
         'Lote de prospecção (Zona ' || _z || ')', 'lote_prospeccao', 'sucesso');

      _n := _n + 1;
    EXCEPTION WHEN SQLSTATE 'SMQL1' THEN
      NULL;
    END;
  END LOOP;

  PERFORM set_config('app.prospeccao_lote', 'off', true);

  IF _n = 0 THEN
    DELETE FROM public.prospeccao_lotes WHERE id = _lote;
    RETURN jsonb_build_object('ok', false, 'motivo', 'zona_vazia', 'zona', _z);
  END IF;

  UPDATE public.prospeccao_lotes SET entregues = _n WHERE id = _lote;

  RETURN jsonb_build_object(
    'ok', true, 'lote_id', _lote, 'entregues', _n, 'solicitados', _tamanho, 'zona', _z);
END;
$$;

-- Status do lote: + região do corretor e motivo 'sem_regiao'.
CREATE OR REPLACE FUNCTION public.prospeccao_lote_status_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me uuid := auth.uid();
  _lote public.prospeccao_lotes%ROWTYPE;
  _teto integer := COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65);
  _vagas integer;
  _corretor boolean;
  _em_total integer;
  _entregues integer := 0;
  _em integer := 0;
  _ficaram integer := 0;
  _sairam integer := 0;
  _motivo text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _regiao text[] := public.regiao_do_corretor(auth.uid());
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  _corretor := public.is_active_member(_me)
               AND public.has_role(_me, 'corretor'::public.app_role)
               AND public._cadencia_dono_ativo(_me);
  _vagas := public.carteira_vagas_v1(_me);

  SELECT count(*)::int INTO _em_total
    FROM public.leads AS l
   WHERE l.corretor_id = _me
     AND public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa)
     AND l.deleted_at IS NULL
     AND NOT l.na_lixeira;

  SELECT * INTO _lote
    FROM public.prospeccao_lotes AS pl
   WHERE pl.corretor_id = _me
   ORDER BY pl.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    SELECT p.entregues, p.em_cadencia, p.ficaram, p.sairam
      INTO _entregues, _em, _ficaram, _sairam
      FROM public._prospeccao_lote_placar(_lote.id) AS p;
  END IF;

  _motivo := CASE
    WHEN NOT _corretor THEN 'so_corretor'
    WHEN _em_total > 0 THEN 'lote_em_andamento'
    WHEN _vagas <= 0 THEN 'carteira_cheia'
    -- [ZONA] Sem região não há zona para pedir.
    WHEN _estrita AND cardinality(_regiao) = 0 THEN 'sem_regiao'
  END;

  RETURN jsonb_build_object(
    'lote_id', _lote.id,
    'zona', _lote.zona,
    'criado_em', _lote.created_at,
    'entregues', _entregues,
    'em_cadencia', _em,
    'ficaram', _ficaram,
    'sairam', _sairam,
    'em_cadencia_total', _em_total,
    'vagas', _vagas,
    'teto', _teto,
    'tamanho', 30,
    'pode_pedir', _motivo IS NULL,
    -- [ZONA] As zonas que este corretor pode pedir (null = todas: regra
    -- desligada).
    'regiao', CASE WHEN _estrita THEN to_jsonb(_regiao) END,
    'motivo', _motivo,
    'portas_legadas', COALESCE(
      (SELECT c.portas_legadas_bolsao FROM public.cadencia_config AS c WHERE c.id = 1), false));
END;
$$;

-- ---------------------------------------------------------------------------
-- 11) "Desfazer" de emergência (higiene, régua de devolução, fase 0): só
--     DEVOLVEM o lead ao dono anterior — restauração de estado, não entrega
--     nova. Corpos vigentes + aviso à guarda durante o laço.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.higiene_desfazer_lote(_execucao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _r record;
  _n integer := 0;
BEGIN
  -- Mesmo afrouxamento aplicado ao higiene_processar na correcao 6, e aqui ele
  -- importa MAIS: o desfazer e o botao de emergencia. Se o motor arquivar 200
  -- leads por engano as 4h, a pessoa abre o SQL console — onde nao ha JWT de
  -- gestao — e precisa que funcione. Sem contexto de request = chamada
  -- server-side; o portao real ali e o GRANT EXECUTE. Com contexto, exige
  -- gestao, porque a funcao tem GRANT para `authenticated`.
  IF NOT (
       (auth.uid() IS NULL AND auth.role() IS NULL)
    OR COALESCE(auth.role() = 'service_role', false)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'sem permissao para desfazer a higiene' USING ERRCODE = '42501';
  END IF;

  -- [ZONA] devolução ao dono anterior: a guarda de região não se aplica.
  PERFORM set_config('app.zona_override', 'on', true);

  FOR _r IN
    SELECT * FROM public.higiene_execucao_log
     WHERE execucao_id = _execucao_id AND aplicado AND desfeito_em IS NULL
     ORDER BY id
  LOOP
    IF _r.acao = 'alertar' THEN
      DELETE FROM public.alertas
       WHERE ref_id = _r.lead_id AND tipo = 'follow_up'::public.alerta_tipo
         AND created_at >= _r.ts - interval '1 minute';
    ELSIF _r.acao = 'devolver_roleta' THEN
      UPDATE public.leads
         SET corretor_id = COALESCE(corretor_id, _r.corretor_id),
             status = _r.status_antes
       WHERE id = _r.lead_id;
    ELSIF _r.acao = 'perdido' THEN
      -- UPDATE direto, e nao transicionar_lead, de proposito: a RPC grava
      -- ultima_interacao = now(), o que corromperia o relogio de higiene do
      -- lead justamente ao desfazer. Desfazer tem que restaurar o estado
      -- anterior, nao criar movimento novo.
      UPDATE public.leads
         SET status = _r.status_antes,
             motivo_perdido = NULL,          -- era motivo_perda (inexistente)
             motivo_perda_categoria = NULL,
             data_perda = NULL
       WHERE id = _r.lead_id;
    END IF;

    UPDATE public.higiene_execucao_log SET desfeito_em = now() WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;

  PERFORM set_config('app.zona_override', 'off', true);

  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.regua_devolucao_desfazer(_lote uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _r record; _n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin pode desfazer' USING ERRCODE = '42501';
  END IF;

  -- [ZONA] devolução ao dono anterior: a guarda de região não se aplica.
  PERFORM set_config('app.zona_override', 'on', true);

  FOR _r IN
    SELECT * FROM public.devolucao_log
    WHERE lote_id = _lote AND aplicado
  LOOP
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET corretor_id = _r.corretor_anterior_id,
           status = CASE WHEN status = 'aguardando_corretor'::public.lead_status
                         THEN _r.status_no_momento::public.lead_status
                         ELSE status END
     WHERE id = _r.lead_id AND corretor_id IS NULL;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    IF FOUND THEN
      UPDATE public.devolucao_log SET aplicado = false WHERE id = _r.id;
      _n := _n + 1;
    END IF;
  END LOOP;

  PERFORM set_config('app.zona_override', 'off', true);

  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cadencia_fase0_desfazer(_lote uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _r record; _n integer := 0; _voltou integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin desfaz a Fase 0' USING ERRCODE = '42501';
  END IF;

  -- [ZONA] devolução ao dono anterior: a guarda de região não se aplica.
  PERFORM set_config('app.zona_override', 'on', true);

  FOR _r IN
    SELECT * FROM public.cadencia_execucao_log
    WHERE lote_id = _lote AND job = 'fase0' AND aplicado
  LOOP
    DELETE FROM public.reativacao_fila
     WHERE lead_id = _r.lead_id AND origem = 'estoque_30d' AND status = 'aguardando';

    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET corretor_id            = COALESCE(corretor_id, _r.corretor_id),
           status                 = CASE WHEN status = 'perdido'::public.lead_status
                                         THEN 'aguardando_atendimento'::public.lead_status
                                         ELSE status END,
           motivo_perda_categoria = NULL,
           motivo_perdido         = NULL,
           data_perda             = NULL,
           classe_lead            = 'quente',
           cadencia_etapa         = NULL,
           cadencia_prazo_ts      = NULL,
           cadencia_inicio_ts     = NULL
     WHERE id = _r.lead_id
       -- Só volta o que continua exatamente como a Fase 0 deixou.
       AND cadencia_etapa IS NOT DISTINCT FROM (_r.detalhe ->> 'etapa_aplicada')
       AND NOT EXISTS (SELECT 1 FROM public.cadencia_tentativas t
                        WHERE t.lead_id = _r.lead_id);
    -- GET DIAGNOSTICS, e não FOUND, porque o PERFORM abaixo REDEFINE FOUND:
    -- set_config devolve uma linha, então FOUND viraria true mesmo quando o
    -- UPDATE não casou — e o desfazer diria ter revertido leads que não
    -- tocou. A suíte pegou isto no teste do lead já trabalhado.
    GET DIAGNOSTICS _voltou = ROW_COUNT;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    _n := _n + _voltou;
  END LOOP;

  PERFORM set_config('app.zona_override', 'off', true);

  RETURN _n;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 12) A espera pelo time da zona não pode virar atraso. O cron roda a cada
--     minuto, mas depois de 3 tentativas um lead só é retentado a cada 30
--     min. Quando alguém da zona fica disponível (marca presença ou entra no
--     time), as exceções de espera daquela zona zeram a contagem e voltam no
--     próximo minuto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._zona_destravar_espera(_corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n integer;
  _regiao text[] := public.regiao_do_corretor(_corretor);
BEGIN
  IF cardinality(_regiao) = 0 THEN
    RETURN 0;
  END IF;
  UPDATE public.distribuicao_excecoes e
     SET tentativas = 0, updated_at = now()
   WHERE e.status IN ('pendente', 'em_analise')
     AND e.motivo IN ('sem_corretor_na_zona', 'zona_sem_time',
                      'sem_corretor_elegivel', 'sem_corretor_ativo')
     AND e.tentativas > 0
     AND public.zona_do_lead(e.lead_id) = ANY (_regiao);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public._zona_destravar_espera(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._zona_destravar_espera(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_profiles_presenca_destrava_zona()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public._zona_destravar_espera(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_presenca_destrava_zona ON public.profiles;
CREATE TRIGGER trg_profiles_presenca_destrava_zona
  AFTER UPDATE OF presente, presente_em ON public.profiles
  FOR EACH ROW
  WHEN (NEW.presente IS TRUE)
  EXECUTE FUNCTION public.tg_profiles_presenca_destrava_zona();

-- Entrar no time de uma zona também destrava (região espelhada + espera).
CREATE OR REPLACE FUNCTION public.tg_roleta_participantes_regiao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public._sincronizar_zonas_corretor(NEW.corretor_id);
    IF NEW.ativo THEN
      PERFORM public._zona_destravar_espera(NEW.corretor_id);
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND (TG_OP = 'DELETE' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    PERFORM public._sincronizar_zonas_corretor(OLD.corretor_id);
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13) Sanidade — a migration falha se alguma peça não ficou no lugar.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _fn text;
BEGIN
  IF NOT public._zona_estrita() THEN
    RAISE EXCEPTION 'zona estrita: chave zona_estrita deveria nascer ligada';
  END IF;
  IF (SELECT count(*) FROM public.zonas_roletas
       WHERE zona IN ('Norte','Sul','Leste','Oeste','Centro','Grande SP')) < 6 THEN
    RAISE EXCEPTION 'zona estrita: alguma das seis zonas está sem roleta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_zz_guarda_zona_corretor'
                    AND tgrelid = 'public.leads'::regclass) THEN
    RAISE EXCEPTION 'zona estrita: guarda de leads.corretor_id ausente';
  END IF;
  FOREACH _fn IN ARRAY ARRAY[
    'public._distribuir_lead_v3(uuid,public.distribuicao_tipo,text,uuid,uuid,text,jsonb,boolean)',
    'public.distribuir_lead_ponderado(uuid,text)',
    'public.distribuir_estoque_roleta(text,integer)',
    'public._distribuir_lead_sdr(uuid,text,timestamptz,timestamptz,text)',
    'public.atribuir_oferta_ativa_lote(uuid,uuid[],integer)',
    'public.transferir_leads(uuid[],uuid,boolean,text)',
    'public.discador_bolsao_assumir_v1(uuid,uuid,text)',
    'public.discador_bolsao_reservar_v1(uuid,integer,text,text,text)',
    'public.prospeccao_pedir_lote(text)'
  ] LOOP
    IF position('_zona_estrita' IN pg_get_functiondef(_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'zona estrita: % não consulta a regra', _fn;
    END IF;
  END LOOP;
  -- Regra única de zona (vitrine = distribuição = lote).
  IF public.zona_canonica('Santo André') IS DISTINCT FROM 'Sul'
     OR public.zona_canonica('Guarulhos') IS DISTINCT FROM 'Grande SP'
     OR public.zona_canonica('Vila Mauá') IS NOT NULL
     OR public.zona_canonica('ZL') IS DISTINCT FROM 'Leste'
     OR public.zona_canonica('Centro de Guarulhos') IS DISTINCT FROM 'Grande SP' THEN
    RAISE EXCEPTION 'zona estrita: zona_canonica fora da regra da vitrine';
  END IF;
  IF has_function_privilege('anon', 'public.atribuir_lead_a_corretor(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'zona estrita: atribuir_lead_a_corretor continua aberta para anon';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
