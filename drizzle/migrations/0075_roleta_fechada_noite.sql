-- =============================================================================
-- Roleta fechada à noite — das 22h às 9h nenhum lead é sorteado; o que chega
-- fica com o Marquinhos (robô) ou espera a reabertura.
--
-- Pedido do dono (10/10/2026): "após as 22h todos os leads parem de cair na
-- roleta e passem a cair para o marquinhos".
--
-- Decisões do dono (10/10/2026):
--   * a roleta fecha às 22h e REABRE ÀS 9h (horário de Brasília);
--   * lead que o Marquinhos termina de qualificar à noite: o CRM guarda e
--     entrega na reabertura, para quem fez check-in; o robô avisa o cliente
--     que o consultor chama a partir das 9h (n8n, fora do repositório);
--   * a rota direta (campanha que pula o robô) desliga às 22h e religa às 9h
--     no banco do robô (smq-operacional, fora do repositório) — à noite o
--     lead do formulário vai para o Marquinhos;
--   * sem exceção da gestão: à noite a roleta é fechada para todos, inclusive
--     com "liberado pela gestão".
--
-- Como era: as roletas são 24h (horario_inicio/fim nulos) e a janela por
-- roleta, quando existe, só segura o cron (auth.uid() nulo) — o botão da
-- gestão, o selo de SLA na tela do corretor e o "lead perdido" passavam por
-- cima. E a janela só existe no motor v3: a campanha de equipe fixa
-- (distribuir_lead_ponderado / _repassar_lead_campanha) e o Escoar estoque
-- (entrega direta ao corretor) nem olham para ela.
--
-- Desenho — uma janela GLOBAL, num lugar só (`_roleta_fechada_agora()`), e a
-- trava em cada porta que SORTEIA:
--
--   _distribuir_lead_v3 ............. lead novo espera sem dono; repasse fica
--                                     com o dono atual (adiado, sem log)
--   distribuir_lead_ponderado ....... webhook de campanha: idem
--   _repassar_lead_campanha ......... repasse de campanha: idem
--   disparar_repasse_sla_lead ....... selo de SLA: não repassa, não toca no lead
--   processar_distribuicao_automatica a rodada do cron não roda
--   distribuir_estoque_roleta ....... estoque (e o do SDR) não é entregue
--   alertar_roletas_sem_apto ........ roleta fechada não é "roleta vazia"
--   marcar_lead_perdido ............. a perda à noite espera a reabertura sem
--                                     dono, em vez de ir para a lixeira
--
-- O que NÃO muda:
--   * atribuição direta a um corretor escolhido pela gestão (exceção →
--     "Atribuir", transferência, Distribuir manual com corretor) — não é
--     roleta;
--   * lead que o corretor PUXA (Bolsão, lote de prospecção, Discador);
--   * a roleta Agendados do SDR (visita marcada pelo SDR, entregue pela
--     agenda — política própria, sem presença do dia);
--   * presença: o check-in continua valendo o dia todo; quem fez check-in
--     antes das 9h entra na primeira rodada da reabertura (o lote da noite é
--     dividido entre quem já estava lá);
--   * o checkout automático (23h) e a virada do dia.
--
-- Reabertura: o cron de distribuição roda a cada minuto; a primeira rodada
-- depois das 9h entrega os leads que chegaram à noite (ordem de chegada,
-- rodízio de sempre) e destrava os repasses por SLA e de leads parados.
--
-- Configuração: distribuicao_settings.roleta_noite =
--   {"ativa": true, "inicio": "22:00", "fim": "09:00"}
-- (Central de Distribuição → Configurações). Chave ausente ou ilegível = a
-- regra do dono (22h–9h, ligada): um ajuste quebrado nunca abre a roleta de
-- madrugada por acidente. Início = fim também desliga. Rollback imediato:
--   UPDATE public.distribuicao_settings
--      SET valor = valor || '{"ativa": false}'::jsonb WHERE chave = 'roleta_noite';
--
-- O banco do robô vira a rota direta nos MESMOS horários; mudar a janela aqui
-- não muda lá (docs/ops/roleta-fechada-noite.md).
--
-- Idempotente. Espelhada em drizzle/migrations/0075.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Configuração (um registro só: ligar, início e fim salvam juntos — dois
--    campos separados criavam uma janela fantasma no meio do caminho)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao)
VALUES ('roleta_noite',
        '{"ativa": true, "inicio": "22:00", "fim": "09:00"}'::jsonb,
        'Roleta fechada à noite (horário de Brasília): entre "inicio" e "fim" '
        || 'nenhum lead é sorteado — o que chega espera a reabertura. '
        || 'ativa=false desliga.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) A janela
-- ---------------------------------------------------------------------------

-- Leitura tolerante: chave ausente, "ativa" que não é booleano ou horário fora
-- de HH:MM caem no padrão do dono (ligada, 22:00–09:00).
CREATE OR REPLACE FUNCTION public._roleta_noite_config(
  OUT ativa boolean, OUT inicio time, OUT fim time)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH v AS (SELECT public.get_dist_setting('roleta_noite') AS j)
  SELECT
    COALESCE(CASE WHEN jsonb_typeof(v.j -> 'ativa') = 'boolean'
                  THEN (v.j ->> 'ativa')::boolean END, true),
    COALESCE(CASE WHEN v.j ->> 'inicio' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  THEN (v.j ->> 'inicio')::time END, time '22:00'),
    COALESCE(CASE WHEN v.j ->> 'fim' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  THEN (v.j ->> 'fim')::time END, time '09:00')
  FROM v;
$$;

-- Fechada em [inicio, fim) no relógio de Brasília. Às 22:00:00 já fecha; às
-- 09:00:00 já abre. Janela que vira a meia-noite (22h → 9h) é o caso normal.
CREATE OR REPLACE FUNCTION public._roleta_fechada_agora(_em timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    CASE
      WHEN NOT c.ativa OR c.inicio = c.fim THEN false
      WHEN c.inicio < c.fim THEN t.hora >= c.inicio AND t.hora < c.fim
      ELSE t.hora >= c.inicio OR t.hora < c.fim
    END, false)
  FROM public._roleta_noite_config() c,
       LATERAL (SELECT (_em AT TIME ZONE 'America/Sao_Paulo')::time AS hora) t;
$$;

-- Próxima reabertura (NULL com a roleta aberta).
CREATE OR REPLACE FUNCTION public._roleta_reabre_em(_em timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN public._roleta_fechada_agora(_em) THEN
           CASE WHEN ((d.dia + c.fim) AT TIME ZONE 'America/Sao_Paulo') > _em
                THEN (d.dia + c.fim) AT TIME ZONE 'America/Sao_Paulo'
                ELSE ((d.dia + 1) + c.fim) AT TIME ZONE 'America/Sao_Paulo'
           END
         END
  FROM public._roleta_noite_config() c,
       LATERAL (SELECT (_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia) d;
$$;

-- Próximo fechamento (NULL com a roleta fechada ou a regra desligada).
CREATE OR REPLACE FUNCTION public._roleta_fecha_em(_em timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN c.ativa AND c.inicio <> c.fim AND NOT public._roleta_fechada_agora(_em) THEN
           CASE WHEN ((d.dia + c.inicio) AT TIME ZONE 'America/Sao_Paulo') > _em
                THEN (d.dia + c.inicio) AT TIME ZONE 'America/Sao_Paulo'
                ELSE ((d.dia + 1) + c.inicio) AT TIME ZONE 'America/Sao_Paulo'
           END
         END
  FROM public._roleta_noite_config() c,
       LATERAL (SELECT (_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia) d;
$$;

-- "09:00" — a hora da reabertura, para mensagens (webhook, log, telas).
CREATE OR REPLACE FUNCTION public._roleta_reabre_as()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT to_char(c.fim, 'HH24:MI') FROM public._roleta_noite_config() c;
$$;

-- Leitura das telas (check-in, Minhas roletas, Central): qualquer usuário
-- logado — é só o horário, e o corretor não lê distribuicao_settings (RLS).
CREATE OR REPLACE FUNCTION public.roleta_janela_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'ativa', c.ativa AND c.inicio <> c.fim,
    'inicio', to_char(c.inicio, 'HH24:MI'),
    'fim', to_char(c.fim, 'HH24:MI'),
    'fechada', public._roleta_fechada_agora(),
    'reabre_em', public._roleta_reabre_em(),
    'fecha_em', public._roleta_fecha_em(),
    'agora', now())
  FROM public._roleta_noite_config() c;
$$;

REVOKE ALL ON FUNCTION public._roleta_noite_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._roleta_fechada_agora(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._roleta_reabre_em(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._roleta_fecha_em(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._roleta_reabre_as() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_noite_config() TO service_role;
GRANT EXECUTE ON FUNCTION public._roleta_fechada_agora(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._roleta_reabre_em(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._roleta_fecha_em(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._roleta_reabre_as() TO service_role;

REVOKE ALL ON FUNCTION public.roleta_janela_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_janela_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Motor: _distribuir_lead_v3 = corpo vigente (20261012120000) + [NOITE]
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
  -- [MARQUINHOS] _marquinhos_na_zona: esta chamada tenta a Roleta
  -- Marquinhos filtrada pela zona. _marquinhos_desvio: chamada de volta para
  -- o time da zona porque ninguém da Marquinhos estava apto ali.
  _marquinhos_na_zona boolean := false;
  _marquinhos_desvio boolean :=
    COALESCE((_contexto_extra->>'marquinhos_sem_apto_na_zona')::boolean, false);
  _marquinhos_fora_horario boolean := false;
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
  -- [MARQUINHOS] Exceção: lead do Marquinhos com zona tenta antes quem da
  -- Roleta Marquinhos atende a zona (o filtro de região abaixo faz o corte);
  -- sem ninguém apto ali, volta para o time da zona (ver "sem vencedor").
  IF _v2 AND _corretor_id IS NULL AND _roleta_slug IS NULL AND _classe = 'base' THEN
    _slug := 'base';
  ELSIF _estrita AND _zona IS NOT NULL AND _corretor_id IS NULL THEN
    IF _roleta_slug = 'base' THEN
      _slug := 'base';
    ELSIF NOT _marquinhos_desvio
          AND COALESCE((public.get_dist_setting('marquinhos_antes_da_zona') #>> '{}')::boolean, true)
          AND public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem) = 'marquinhos'
          AND EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'marquinhos' AND ativo) THEN
      _slug := 'marquinhos';
      _marquinhos_na_zona := true;
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

  -- [NOITE] Roleta fechada (22h–9h BRT, 20261014120000): nenhum sorteio, de
  -- nenhum chamador — cron, webhook, repasse por SLA, lead perdido, botão da
  -- gestão. O lead novo espera sem dono e o cron o entrega na reabertura; o
  -- repasse fica com o dono atual até lá. Sem exceção e sem log: o cron
  -- re-tenta a cada minuto. Atribuição direta a um corretor escolhido
  -- (_corretor_id) não é roleta e segue livre.
  IF _corretor_id IS NULL AND public._roleta_fechada_agora() THEN
    RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'roleta_fechada_noite',
             'reabre_em', public._roleta_reabre_em(), 'reabre_as', public._roleta_reabre_as())
             || jsonb_build_object('roleta', _slug);
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
        -- [MARQUINHOS] Marquinhos fora da janela não segura o lead: ninguém
        -- dela recebe agora, e o lead segue para o time da zona.
        IF NOT _marquinhos_na_zona THEN
          RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'fora_do_horario', 'roleta', _slug);
        END IF;
        _marquinhos_fora_horario := true;
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
    IF _marquinhos_fora_horario THEN
      _aptos_ids := ARRAY[]::uuid[];
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
    'motivo_fora_da_zona', _motivo_fora,
    'marquinhos_na_zona', _marquinhos_na_zona
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF _marquinhos_na_zona THEN
      -- [MARQUINHOS] Ninguém da Marquinhos apto na zona do lead: time da zona,
      -- nesta mesma transação (sem exceção nem log da tentativa — o que a
      -- Marquinhos tinha fica no contexto da decisão da zona). A chave
      -- marquinhos_sem_apto_na_zona impede a volta para a Marquinhos.
      RETURN public._distribuir_lead_v3(
        _lead_id, _tipo, _zslug_lead, NULL, _distribuido_por, _gatilho,
        COALESCE(_contexto_extra, '{}'::jsonb) || jsonb_build_object(
          'marquinhos_sem_apto_na_zona', true,
          'roleta_pedida', 'marquinhos',
          'marquinhos_fora_do_horario', _marquinhos_fora_horario,
          'marquinhos_inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
          'marquinhos_fora_da_regiao', _fora_regiao),
        _registrar_excecao);
    END IF;

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
    IF _marquinhos_desvio THEN
      _motivo_log := _motivo_log || ' (a Roleta Marquinhos também não tinha ninguém apto na zona)';
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
       WHEN _marquinhos_na_zona
         THEN 'Roleta marquinhos — rodízio entre quem da Marquinhos atende a ' || public._rotulo_zona(_zona)
       WHEN _marquinhos_desvio
         THEN 'Roleta ' || _slug || ' — rodízio (ninguém da Roleta Marquinhos apto na '
              || public._rotulo_zona(_zona) || ')'
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

-- ---------------------------------------------------------------------------
-- 4) Os outros sorteios: campanha (webhook e repasse) e o selo de SLA
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

  SELECT id, corretor_id, status, corretores_que_tentaram INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  -- [NOITE] Roleta fechada: a campanha também espera (20261014120000).
  IF public._roleta_fechada_agora() THEN
    RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'roleta_fechada_noite',
      'reabre_em', public._roleta_reabre_em(), 'reabre_as', public._roleta_reabre_as())
      || jsonb_build_object('roleta', _roleta_slug);
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
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    -- Registro mãe (20261010120400): quem já tem um registro ativo da pessoa
    -- não recebe outro — o filho da campanha vai para outro corretor.
    AND NOT (rp.corretor_id = ANY (COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
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

CREATE OR REPLACE FUNCTION public._repassar_lead_campanha(_lead_id uuid, _roleta_slug text, _gatilho text, _contexto_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record;
  _lead record;
  _zona text;
  _estrita boolean := public._zona_estrita();
  _tentaram uuid[];
  _picked uuid;
  _picked_nome text;
  _tier_picked text;
  _sum_pesos int;
  _n_zona int;
  _ctx jsonb;
  _log_id uuid;
  _excecao_id uuid;
  _motivo_log text;
BEGIN
  SELECT l.id, l.corretor_id, l.corretores_que_tentaram, l.deleted_at, l.na_lixeira
    INTO _lead
    FROM public.leads l WHERE l.id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  -- [NOITE] Roleta fechada: o lead fica com o dono atual até a reabertura.
  IF public._roleta_fechada_agora() THEN
    RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'roleta_fechada_noite',
      'reabre_em', public._roleta_reabre_em(), 'reabre_as', public._roleta_reabre_as())
      || jsonb_build_object('roleta', _roleta_slug);
  END IF;

  _zona := public.zona_do_lead(_lead_id);
  -- Quem já teve o lead não recebe de volta — o dono atual incluído, mesmo
  -- que o chamador não o tenha posto na lista.
  _tentaram := array_append(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]),
                            _lead.corretor_id);
  _ctx := jsonb_build_object('campanha', _roleta_slug, 'repasse', true)
          || COALESCE(_contexto_extra, '{}'::jsonb);

  SELECT * INTO _roleta FROM public.roletas
   WHERE slug = _roleta_slug AND tipo = 'campanha' AND ativo;

  -- Campanha desligada (ou não é campanha): a triagem normal decide — zona
  -- estrita, pino de zona e origem, como o motor faz com qualquer repasse.
  IF NOT FOUND THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
      _ctx || jsonb_build_object('campanha_inativa', true));
  END IF;

  -- Zona estrita: campanha comum com lead de zona é do time da zona.
  IF _estrita AND _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho, _ctx);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  CREATE TEMP TABLE IF NOT EXISTS _rlc_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _rlc_elegiveis;

  -- Mesma elegibilidade da roleta ponderada (20261009120100), menos quem já
  -- teve o lead.
  INSERT INTO _rlc_elegiveis
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
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    AND NOT (rp.corretor_id = ANY(_tentaram))
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
    -- Equipe fixa: só quem da equipe atende a zona do lead.
    IF _zona IS NOT NULL THEN
      DELETE FROM _rlc_elegiveis e
       WHERE NOT public.corretor_atende_zona(e.corretor_id, _zona);
    END IF;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _rlc_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _rlc_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _rlc_elegiveis;

  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    -- Equipe fixa com lead de zona e ninguém da equipe na zona: time da zona.
    IF _estrita AND _zona IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
        _ctx || jsonb_build_object('equipe_fixa', true, 'equipe_sem_apto_na_zona', true));
    END IF;

    -- Ninguém mais na equipe: o lead fica com o dono atual e a exceção abre
    -- (alerta à gestão + backoff do cron). Antes, o cron de parados o
    -- re-tentava a cada minuto, sem fim.
    _motivo_log := 'Repasse na campanha ' || _roleta.slug
                   || ' sem outro corretor apto — lead segue com o dono atual';
    _ctx := _ctx || jsonb_build_object('roleta', _roleta.slug, 'gatilho', _gatilho,
                                       'zona', _zona, 'excluidos_por_tentativa', to_jsonb(_tentaram));
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'sem_corretor_elegivel', _motivo_log, _roleta.slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, 'redistribuicao', _motivo_log, _roleta.slug,
       'repasse_campanha', 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_elegivel',
                              'excecao_id', _excecao_id, 'roleta', _roleta.slug);
  END IF;

  -- [V2] O estouro do dono que perdeu o lead conta para a pausa automática,
  -- como no repasse do motor.
  IF public._modelo_v2_ativo() AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _roleta.slug);
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _rlc_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _rlc_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  -- Repasse = entrega nova: relógio do SLA reinicia, dono anterior registrado,
  -- pino da campanha mantido.
  UPDATE public.leads
     SET corretor_anterior_id = corretor_id,
         corretor_id = _picked,
         roleta_slug = _roleta.slug,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         corretores_que_tentaram = CASE
           WHEN _picked = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _picked) END
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;
  SELECT p.nome INTO _picked_nome FROM public.profiles p WHERE p.id = _picked;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _picked, 'redistribuicao',
     'Repasse na campanha ' || _roleta.slug || ' (' || _gatilho || ') — tier ' || COALESCE(_tier_picked, 'B'),
     _roleta.slug, 'repasse_campanha:' || _roleta.slug || ':tier' || COALESCE(_tier_picked, 'B'),
     'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object(
    'roleta', _roleta.slug, 'gatilho', _gatilho, 'zona', _zona,
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'vencedor', jsonb_build_object('corretor_id', _picked, 'nome', _picked_nome)));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolucao = 'Repassado na campanha para ' || COALESCE(_picked_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked, 'corretor_nome', _picked_nome,
    'tier', _tier_picked, 'roleta', _roleta.slug, 'zona', _zona);
END;
$function$;

CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _lead record; _res jsonb; _anterior uuid; _novo uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  -- [NOITE] Roleta fechada: o repasse espera a reabertura, sem tocar no lead
  -- (nem em corretores_que_tentaram). O selo re-tenta sozinho.
  IF public._roleta_fechada_agora() THEN
    RETURN false;
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, l.roleta_slug, dc.timeout_minutos
    INTO _lead
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.id = _lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  IF COALESCE(_lead.tentativas_redistribuicao, 0) >= 2 THEN
    PERFORM public._escalar_lead_gestor(_lead_id, _lead.tentativas_redistribuicao);
    RETURN false;
  END IF;

  _anterior := _lead.corretor_id;

  UPDATE public.leads
     SET corretores_que_tentaram = array_append(
           COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
   WHERE id = _lead_id
     AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  -- Lead de campanha repassa DENTRO da campanha (equipe/tier/pino), com a
  -- zona estrita; campanha desligada cai na triagem normal. Antes ia para a
  -- roleta ponderada de lead NOVO, que recusa lead com dono ('ja_atribuido')
  -- — o repasse nunca acontecia (20261009120200).
  IF _lead.roleta_slug IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.roletas r
        WHERE r.slug = _lead.roleta_slug AND r.tipo = 'campanha'
     ) THEN
    _res := public._repassar_lead_campanha(
      _lead_id, _lead.roleta_slug, 'sla_webhook_imediato',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));
  ELSE
    _res := public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', _lead.roleta_slug, NULL, _caller, 'sla_webhook_imediato',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _anterior));
  END IF;

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
       SET status = 'aguardando_atendimento',
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
     WHERE id = _lead_id
     RETURNING corretor_id INTO _novo;

    IF _novo IS NOT NULL AND _novo <> _anterior THEN
      PERFORM public._auditar_redistribuicao(
        _lead_id, _anterior, _novo,
        'Lead redistribuído por SLA (' || _lead.timeout_minutos || 'min sem contato)');
      PERFORM public._notificar_handoff_novo_dono(
        _lead_id, _novo,
        'redistribuido por SLA (' || _lead.timeout_minutos || 'min): ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _anterior), '(anterior)') ||
        ' -> ' || COALESCE((SELECT nome FROM public.profiles WHERE id = _novo), '(novo)'));
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END; $function$;

-- ---------------------------------------------------------------------------
-- 5) Crons: rodada de distribuição, estoque e alerta de roleta vazia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _dist int := 0;
  _falhas int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  -- Rodada manual ("Rodar distribuição" da Central) é de ADMIN. Sem JWT é o
  -- pg_cron (dono da função) ou service_role — o anon perdeu o EXECUTE abaixo,
  -- então "auth.uid() nulo" volta a significar só "sistema".
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- [NOITE] Roleta fechada (20261014120000): a rodada não roda — nem
  -- triagem, nem repasse por SLA, nem lead parado (que mexeriam em
  -- corretores_que_tentaram e escalariam para a gestão de madrugada). A
  -- primeira rodada depois da reabertura entrega o que chegou à noite.
  IF public._roleta_fechada_agora() THEN
    RETURN jsonb_build_object(
      'distribuidos', 0, 'sem_corretor', 0, 'repassados_sla', 0, 'redistribuidos', 0,
      'roleta_fechada', true, 'reabre_em', public._roleta_reabre_em(),
      'reabre_as', public._roleta_reabre_as(), 'em', now());
  END IF;

  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at ASC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
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
$function$;

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

  -- [NOITE] Roleta fechada: o estoque (e o do SDR) espera a reabertura. A
  -- entrega daqui é direta ao corretor — sem esta guarda, quem ainda está
  -- com o check-in aberto às 22h30 receberia o lote.
  IF public._roleta_fechada_agora() THEN
    RETURN jsonb_build_object(
      'ok', true, 'roleta', _roleta, 'distribuidos', 0, 'corretores_aptos', 0,
      'roleta_fechada', true, 'reabre_em', public._roleta_reabre_em(),
      'reabre_as', public._roleta_reabre_as(),
      'restante_estoque', (
        SELECT count(*) FROM public.leads l
         WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
           AND l.corretor_id IS NULL AND l.sdr_id IS NULL
           AND l.status = 'aguardando_corretor'));
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

CREATE OR REPLACE FUNCTION public.alertar_roletas_sem_apto()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _aptos int;
  _agora time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  _dentro boolean;
BEGIN
  -- [NOITE] Roleta fechada não é roleta vazia: de madrugada todo mundo já
  -- fez checkout e o alerta tocaria a cada 15 minutos para a gestão.
  IF public._roleta_fechada_agora() THEN
    RETURN;
  END IF;

  FOR _r IN SELECT * FROM public.roletas WHERE ativo LOOP
    IF _r.horario_inicio IS NOT NULL AND _r.horario_fim IS NOT NULL THEN
      IF _r.horario_inicio <= _r.horario_fim THEN
        _dentro := _agora BETWEEN _r.horario_inicio AND _r.horario_fim;
      ELSE
        _dentro := (_agora >= _r.horario_inicio OR _agora <= _r.horario_fim);
      END IF;
      IF NOT _dentro THEN CONTINUE; END IF;
    END IF;

    SELECT count(*) INTO _aptos FROM public._elegibilidade_roleta(_r.slug) e WHERE e.apto;
    IF _aptos = 0 THEN
      PERFORM public._alertar_gestores_distribuicao(
        'Roleta sem corretor apto: ' || _r.nome,
        'Nenhum corretor apto agora — novos leads desta roleta irão para a fila de exceções.',
        _r.id,
        '/distribuicao?tab=' || _r.slug);
    END IF;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Lead perdido à noite: espera a reabertura em vez de ir para a lixeira
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(_lead_id uuid, _categoria text DEFAULT NULL::text, _detalhe text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ELSIF COALESCE((_res->>'adiado')::boolean, false)
        AND _res->>'motivo' = 'roleta_fechada_noite' THEN
    -- [NOITE] Roleta fechada (20261014120000): o repasse fica para a
    -- reabertura. O lead sai da carteira de quem o perdeu e espera sem dono,
    -- no status de entrada — o cron o entrega para outro corretor (quem já
    -- o teve continua fora, por corretores_que_tentaram). Sem esta volta, a
    -- noite inteira de perdas iria para a lixeira como "sem corretor".
    UPDATE public.oferta_ativa_leads
       SET contatado = true,
           contatado_em = COALESCE(contatado_em, now())
     WHERE lead_id = _lead_id
       AND NOT contatado;

    UPDATE public.leads
       SET corretor_anterior_id = COALESCE(_atual, corretor_anterior_id),
           corretor_id = NULL,
           status = 'aguardando_atendimento',
           corretores_que_tentaram = _tentou
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado)
    VALUES (_lead_id, NULL, 'redistribuicao',
            'Lead perdido com a roleta fechada à noite: repasse às ' || (_res->>'reabre_as') || ' — ' || _motivo,
            _caller, 'lead_perdido_noite', 'sem_corretor');

    RETURN NULL;
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
$function$;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _fn text;
BEGIN
  -- Toda porta que sorteia carrega a trava (marcar_lead_perdido reconhece o
  -- 'roleta_fechada_noite' que o motor devolve).
  FOREACH _fn IN ARRAY ARRAY[
    'public._distribuir_lead_v3(uuid,distribuicao_tipo,text,uuid,uuid,text,jsonb,boolean)',
    'public.distribuir_lead_ponderado(uuid,text)',
    'public._repassar_lead_campanha(uuid,text,text,jsonb)',
    'public.disparar_repasse_sla_lead(uuid)',
    'public.processar_distribuicao_automatica()',
    'public.distribuir_estoque_roleta(text,integer)',
    'public.alertar_roletas_sem_apto()',
    'public.marcar_lead_perdido(uuid,text,text)'
  ] LOOP
    IF position('roleta_fechada' IN pg_get_functiondef(_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'roleta fechada à noite: % sem a trava', _fn;
    END IF;
  END LOOP;

  -- Helpers internos e a leitura das telas: nada para anon.
  FOREACH _fn IN ARRAY ARRAY[
    'public._roleta_noite_config()',
    'public._roleta_fechada_agora(timestamptz)',
    'public._roleta_reabre_em(timestamptz)',
    'public._roleta_fecha_em(timestamptz)',
    'public._roleta_reabre_as()',
    'public.roleta_janela_v1()'
  ] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'permissões: % executável por anon', _fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.roleta_janela_v1()', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões: roleta_janela_v1 precisa de authenticated (telas)';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
