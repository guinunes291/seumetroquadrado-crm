-- =============================================================================
-- Roletas por filial — três times, as zonas no lead
-- =============================================================================
-- Pedido do dono (11/10/2026, noite): "vamos montar roletas por filial, fica
-- mais simples de distribuir em apenas 3 roletas". Inverte a decisão 1 de
-- 09/10 (docs/ops/presenca-filiais.md: "não há roleta por filial").
-- Decisões na revisão (12/10/2026): Barra Funda = Oeste, Norte e Sul;
-- Liberdade = Centro e Leste; Belém = Leste e Grande SP — a Leste é atendida
-- pelas duas lojas e o lead da Leste ALTERNA entre elas (rodízio); o time da
-- filial é fixo, montado pela gestão; um corretor pode estar em duas filiais
-- (a vez única continua, por filial); o check-in vale em qualquer filial,
-- como em 09/10.
--
-- O modelo: a ZONA fica no lead (vem do projeto); a FILIAL é o time.
--   - zonas_roletas passa a aceitar várias zonas na mesma roleta e a mesma
--     zona em mais de uma roleta (chave (zona, roleta_slug)), com um cursor
--     por par (ultimo_lead_em): a última vez que aquela roleta recebeu lead
--     daquela zona. É esse cursor que faz a Leste alternar.
--   - três roletas de tipo 'zona' (o tipo não muda: nada do que testa
--     tipo = 'zona' precisa mudar), uma por filial, com roletas.filial_id.
--   - _roletas_da_zona(zona): as roletas da zona na ordem do rodízio, com
--     "pronta" (ativa e com alguém apto) e "da vez" (a primeira pronta).
--     roleta_da_zona(zona) mantém a assinatura (motores, repasse, webhooks)
--     e devolve a da vez.
--   - o motor da roleta respeita o pino válido do lead (memória do repasse:
--     o lead fica no mesmo time), senão vai para a da vez; filial sem ninguém
--     apto é pulada; nenhuma pronta, o lead espera na primeira (nunca troca
--     de zona). Ao entregar, grava o cursor do par (zona, roleta).
--   - a região do corretor continua o espelho das roletas em que ele está
--     (profiles.zonas, trigger): quem está na Belém atende Leste e Grande SP.
--   - as 6 roletas antigas ficam ativo = false, nunca apagadas (histórico,
--     tokens de webhook, rollback). Pino antigo em leads.roleta_slug
--     (zona-*) passa a ser ignorado pelo motor (não é roleta da zona): o
--     rodízio decide no próximo repasse. Nenhum UPDATE em leads.
--   - os times migram pela união das zonas da filial (§ dados), com cursor,
--     pausa, limite e faixa preservados; a gestão enxuga na Central.
--   - a vez única (0078) passa a ter a unidade certa por família: zona nos
--     Agendados do SDR (a visita tem zona), ROLETA nas filiais (a fila da
--     filial é uma só para todas as zonas dela).
--
-- O que NÃO muda: zona do lead, zona estrita, corretor_atende_zona, a
-- guarda de região, presença, Marquinhos, campanhas, Bolsão, lote, discador,
-- webhooks e edge functions.
--
-- Idempotente. Espelhada em drizzle/migrations/0079.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema: zonas_roletas (zona, roleta_slug) + cursor; roletas.filial_id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.zonas_roletas ADD COLUMN IF NOT EXISTS ultimo_lead_em timestamptz;
COMMENT ON COLUMN public.zonas_roletas.ultimo_lead_em IS
  'Última vez que esta roleta recebeu lead desta zona — o cursor do rodízio entre as roletas da mesma zona (a Leste alterna entre Liberdade e Belém).';

DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'public.zonas_roletas'::regclass AND c.contype = 'p')
     IS DISTINCT FROM 'PRIMARY KEY (zona, roleta_slug)' THEN
    ALTER TABLE public.zonas_roletas DROP CONSTRAINT IF EXISTS zonas_roletas_pkey;
    ALTER TABLE public.zonas_roletas ADD CONSTRAINT zonas_roletas_pkey PRIMARY KEY (zona, roleta_slug);
  END IF;
END
$$;

ALTER TABLE public.roletas ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais(id);
COMMENT ON COLUMN public.roletas.filial_id IS
  'Roleta de filial (tipo zona): a loja cujo time fixo recebe os leads das zonas mapeadas em zonas_roletas.';

-- ---------------------------------------------------------------------------
-- 2) As três roletas de filial (tipo zona, time fixo).
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, tipo, criterio_participacao, ativo, exigir_presenca, filial_id)
SELECT 'filial-' || f.slug,
       'Roleta ' || f.nome,
       'Time fixo da filial ' || f.nome || ': recebe os leads das zonas que a filial atende '
         || '(Central de Distribuição → Filas). Participação pela gestão, na aba Corretores.',
       'zona', 'manual', true, true, f.id
  FROM public.filiais f
 WHERE f.slug IN ('barra-funda', 'liberdade', 'belem')
ON CONFLICT (slug) DO UPDATE
  SET filial_id = EXCLUDED.filial_id,
      tipo = 'zona';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.roletas WHERE slug IN ('filial-barra-funda', 'filial-liberdade', 'filial-belem')) <> 3 THEN
    RAISE EXCEPTION 'roletas por filial: as três filiais (barra-funda, liberdade, belem) precisam existir em public.filiais';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) As roletas de uma zona, na ordem do rodízio, e a da vez.
--    pronta = ativa e com alguém apto (_roleta_pronta, a régua da roleta);
--    da_vez = a primeira pronta. Empate no cursor: a ordem das filiais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roletas_da_zona(_zona text)
RETURNS TABLE(roleta_slug text, nome text, filial_slug text, filial_nome text,
              ordem integer, pronta boolean, da_vez boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH r AS (
    SELECT zr.roleta_slug,
           ro.nome,
           f.slug AS filial_slug,
           f.nome AS filial_nome,
           row_number() OVER (
             ORDER BY zr.ultimo_lead_em ASC NULLS FIRST, coalesce(f.ordem, 99), zr.roleta_slug
           )::int AS ordem,
           public._roleta_pronta(zr.roleta_slug) AS pronta
      FROM public.zonas_roletas zr
      JOIN public.roletas ro ON ro.slug = zr.roleta_slug
      LEFT JOIN public.filiais f ON f.id = ro.filial_id
     WHERE zr.zona = _zona
  )
  SELECT r.roleta_slug, r.nome, r.filial_slug, r.filial_nome, r.ordem, r.pronta,
         r.pronta AND r.ordem = (SELECT min(x.ordem) FROM r x WHERE x.pronta) AS da_vez
    FROM r
   ORDER BY r.ordem;
$$;

-- Mesma assinatura de 20260816140000: a roleta da vez (pronta), ou NULL.
CREATE OR REPLACE FUNCTION public.roleta_da_zona(_zona text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.roleta_slug FROM public._roletas_da_zona(_zona) x WHERE x.da_vez LIMIT 1
$$;

-- O slug é uma roleta desta zona (pino válido para o motor)?
CREATE OR REPLACE FUNCTION public._roleta_atende_zona(_slug text, _zona text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.zona = _zona AND zr.roleta_slug = _slug)
$$;

-- A roleta pode receber ESTE lead: ativa e com alguém apto que ainda não o
-- teve. "Pronta" (_roleta_pronta, telas e roleta_da_zona) não conhece o lead;
-- o motor escolhe a filial por esta, senão o repasse por SLA esperava na
-- filial em que só o dono que estourou está apto, com a outra filial da zona
-- pronta (o pino e a da vez são tentados primeiro, depois as outras).
CREATE OR REPLACE FUNCTION public._roleta_pronta_para_lead(_slug text, _tentaram uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((SELECT r.ativo FROM public.roletas r WHERE r.slug = _slug), false)
     AND EXISTS (
       SELECT 1 FROM public._elegibilidade_roleta(_slug) e
        WHERE e.apto AND NOT (e.corretor_id = ANY (COALESCE(_tentaram, ARRAY[]::uuid[]))))
$$;

-- ---------------------------------------------------------------------------
-- 4) Região de atuação (aba Corretores) por roleta inteira. Mesma assinatura
--    de 20261009120000: _zonas são as zonas desejadas, que agora têm de ser a
--    união das zonas de filiais inteiras (a tela manda isso). Inclui/remove
--    por roleta de filial — com N zonas na mesma roleta, o laço antigo por
--    zona inseria numa linha e removia na outra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_corretor_distribuicao(
  _corretor_id uuid, _zonas text[] DEFAULT NULL, _modelo_contrato text DEFAULT NULL,
  _limpar_modelo_contrato boolean DEFAULT false, _onboarding_concluido boolean DEFAULT NULL,
  _limite_diario_webhook integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
  _desejadas text[];
  _cobertas text[];
  _rr record;
  _tem boolean;
  _quer boolean;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'onboarding_concluido_origem', p.onboarding_concluido_origem,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _antes
  FROM public.profiles p WHERE p.id = _corretor_id;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'corretor inexistente';
  END IF;

  IF _zonas IS NOT NULL THEN
    _desejadas := ARRAY(SELECT DISTINCT public.zona_canonica(z) FROM unnest(_zonas) AS z);
    IF EXISTS (SELECT 1 FROM unnest(_desejadas) AS z WHERE z IS NULL)
       OR NOT (_desejadas <@ public._zonas_canonicas()) THEN
      RAISE EXCEPTION 'zona invalida (use Norte/Sul/Leste/Oeste/Centro/Grande SP)';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(_desejadas) AS z
                WHERE NOT EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.zona = z)) THEN
      RAISE EXCEPTION 'zona sem roleta vinculada — configure zonas_roletas';
    END IF;
    IF cardinality(_desejadas) > 0 AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::public.app_role
      WHERE p.id = _corretor_id AND p.ativo = true
    ) THEN
      RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor';
    END IF;

    -- [FILIAL] A região é por filial: uma roleta entra quando TODAS as zonas
    -- dela estão nas desejadas; e as desejadas têm de ser exatamente a união
    -- das roletas que entram (não dá para atender "só a Leste" da Belém).
    SELECT coalesce(array_agg(DISTINCT z ORDER BY z), ARRAY[]::text[])
      INTO _cobertas
      FROM (
        SELECT zr.zona AS z
          FROM public.roletas r
          JOIN public.zonas_roletas zr ON zr.roleta_slug = r.slug
         WHERE r.tipo = 'zona' AND r.ativo
           AND (SELECT coalesce(array_agg(z2.zona), ARRAY[]::text[])
                  FROM public.zonas_roletas z2 WHERE z2.roleta_slug = r.slug) <@ _desejadas
      ) x;
    IF NOT (_desejadas <@ _cobertas) THEN
      RAISE EXCEPTION 'a região é por filial: marque a filial inteira (zonas sem filial completa: %)',
        array_to_string(ARRAY(SELECT z FROM unnest(_desejadas) z WHERE NOT (z = ANY(_cobertas))), ', ');
    END IF;

    FOR _rr IN
      SELECT r.id AS roleta_id, r.slug,
             (SELECT coalesce(array_agg(zr.zona), ARRAY[]::text[])
                FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug) AS zonas
        FROM public.roletas r
       WHERE r.tipo = 'zona' AND r.ativo
         AND EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug)
       ORDER BY r.slug
    LOOP
      _quer := cardinality(_rr.zonas) > 0 AND _rr.zonas <@ _desejadas;
      SELECT EXISTS (SELECT 1 FROM public.roleta_participantes rp
                      WHERE rp.roleta_id = _rr.roleta_id AND rp.corretor_id = _corretor_id
                        AND rp.ativo)
        INTO _tem;
      IF _quer AND NOT _tem THEN
        INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
        VALUES (_rr.roleta_id, _corretor_id, true, _caller)
        ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
          ativo = true, pausado_ate = NULL, motivo_pausa = NULL,
          incluido_por = _caller, incluido_em = now();
        INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
        VALUES (_rr.roleta_id, _corretor_id, 'incluido', 'Região de atuação (aba Corretores, por filial)', _caller);
      ELSIF NOT _quer AND _tem THEN
        UPDATE public.roleta_participantes
           SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
         WHERE roleta_id = _rr.roleta_id AND corretor_id = _corretor_id;
        INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
        VALUES (_rr.roleta_id, _corretor_id, 'removido', 'Região de atuação (aba Corretores, por filial)', _caller);
      END IF;
    END LOOP;
  END IF;

  IF _modelo_contrato IS NOT NULL AND _modelo_contrato NOT IN ('fixo','autonomo') THEN
    RAISE EXCEPTION 'modelo_contrato invalido (fixo|autonomo)';
  END IF;

  IF _limite_diario_webhook IS NOT NULL AND _limite_diario_webhook < 1 THEN
    RAISE EXCEPTION 'limite_diario_webhook deve ser >= 1';
  END IF;

  -- zonas fica de fora: é espelho da participação (trigger acima).
  UPDATE public.profiles p SET
    modelo_contrato = CASE
      WHEN _limpar_modelo_contrato THEN NULL
      WHEN _modelo_contrato IS NOT NULL THEN _modelo_contrato
      ELSE p.modelo_contrato END,
    onboarding_concluido_em = CASE
      WHEN _onboarding_concluido IS TRUE THEN COALESCE(p.onboarding_concluido_em, now())
      WHEN _onboarding_concluido IS FALSE THEN NULL
      ELSE p.onboarding_concluido_em END,
    onboarding_concluido_origem = CASE
      WHEN _onboarding_concluido IS TRUE THEN COALESCE(p.onboarding_concluido_origem, 'manual')
      WHEN _onboarding_concluido IS FALSE THEN NULL
      ELSE p.onboarding_concluido_origem END,
    limite_diario_webhook = COALESCE(_limite_diario_webhook, p.limite_diario_webhook)
  WHERE p.id = _corretor_id;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'onboarding_concluido_origem', p.onboarding_concluido_origem,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _depois
  FROM public.profiles p WHERE p.id = _corretor_id;

  IF _antes IS DISTINCT FROM _depois THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('profiles', _corretor_id, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'corretor', _depois);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Os times: a união das zonas da filial. Por corretor e filial: ativo =
--    algum ativo (só quem está ativo em alguma zona entra); ultimo_lead_em =
--    o mais recente (ninguém fura a fila por ter mudado de roleta); pausa =
--    a mais longa em vigor; limite_diario = o maior; tier = o da linha mais
--    recente; wrr_current = 0; incluido_em/por = o mais antigo. Uma linha de
--    log por inclusão. Reutilizável (e testável) fora da migration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._filial_unir_participantes(_destino text, _origens text[], _motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _dest uuid;
  _n    integer := 0;
BEGIN
  SELECT r.id INTO _dest FROM public.roletas r WHERE r.slug = _destino;
  IF _dest IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _destino;
  END IF;

  WITH o AS (
    SELECT rp.*
      FROM public.roleta_participantes rp
      JOIN public.roletas r ON r.id = rp.roleta_id
     WHERE r.slug = ANY(_origens) AND rp.ativo
  ),
  u AS (
    SELECT o.corretor_id,
           max(o.ultimo_lead_em) AS ultimo_lead_em,
           max(o.pausado_ate) FILTER (WHERE o.pausado_ate > now()) AS pausado_ate,
           (array_agg(o.motivo_pausa ORDER BY o.pausado_ate DESC NULLS LAST)
              FILTER (WHERE o.pausado_ate > now()))[1] AS motivo_pausa,
           max(o.limite_diario) AS limite_diario,
           coalesce((array_agg(o.tier ORDER BY o.tier_updated_at DESC NULLS LAST))[1], 'B') AS tier,
           min(o.incluido_em) AS incluido_em,
           (array_agg(o.incluido_por ORDER BY o.incluido_em ASC NULLS LAST))[1] AS incluido_por
      FROM o
     GROUP BY o.corretor_id
  ),
  ins AS (
    INSERT INTO public.roleta_participantes
      (roleta_id, corretor_id, ativo, ultimo_lead_em, pausado_ate, motivo_pausa,
       limite_diario, tier, wrr_current, incluido_em, incluido_por)
    SELECT _dest, u.corretor_id, true, u.ultimo_lead_em, u.pausado_ate, u.motivo_pausa,
           u.limite_diario, u.tier, 0, coalesce(u.incluido_em, now()), u.incluido_por
      FROM u
    ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
      ativo = true,
      ultimo_lead_em = greatest(public.roleta_participantes.ultimo_lead_em, EXCLUDED.ultimo_lead_em),
      pausado_ate    = greatest(public.roleta_participantes.pausado_ate, EXCLUDED.pausado_ate),
      limite_diario  = greatest(public.roleta_participantes.limite_diario, EXCLUDED.limite_diario)
    RETURNING corretor_id
  )
  INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
  SELECT _dest, ins.corretor_id, 'incluido', _motivo, NULL FROM ins;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Dados: os times, o mapa, as roletas antigas desligadas.
--    Só na primeira vez (as 6 antigas ainda ativas); rodar de novo não refaz.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'zona-leste' AND ativo) THEN
    RAISE NOTICE 'roletas por filial: times já migrados, nada a fazer';
    RETURN;
  END IF;

  _n := public._filial_unir_participantes('filial-barra-funda',
          ARRAY['zona-oeste', 'zona-norte', 'zona-sul'],
          'Roletas por filial (12/10/2026): união das zonas da filial');
  RAISE NOTICE 'Roleta Barra Funda: % corretor(es)', _n;
  _n := public._filial_unir_participantes('filial-liberdade',
          ARRAY['zona-centro', 'zona-leste'],
          'Roletas por filial (12/10/2026): união das zonas da filial');
  RAISE NOTICE 'Roleta Liberdade: % corretor(es)', _n;
  _n := public._filial_unir_participantes('filial-belem',
          ARRAY['zona-leste', 'zona-grande-sp'],
          'Roletas por filial (12/10/2026): união das zonas da filial');
  RAISE NOTICE 'Roleta Belém: % corretor(es)', _n;

  -- O mapa (o trigger por statement reespelha profiles.zonas de todo mundo).
  DELETE FROM public.zonas_roletas
   WHERE roleta_slug IN ('zona-norte', 'zona-sul', 'zona-leste', 'zona-oeste', 'zona-centro', 'zona-grande-sp');
  INSERT INTO public.zonas_roletas (zona, roleta_slug) VALUES
    ('Oeste',     'filial-barra-funda'),
    ('Norte',     'filial-barra-funda'),
    ('Sul',       'filial-barra-funda'),
    ('Centro',    'filial-liberdade'),
    ('Leste',     'filial-liberdade'),
    ('Leste',     'filial-belem'),
    ('Grande SP', 'filial-belem')
  ON CONFLICT (zona, roleta_slug) DO NOTHING;

  -- As antigas: desligadas, nunca apagadas (histórico, tokens, rollback).
  UPDATE public.roletas
     SET ativo = false,
         descricao = coalesce(descricao, '') || ' [Desativada em 12/10/2026: substituída pelas roletas por filial.]'
   WHERE slug IN ('zona-norte', 'zona-sul', 'zona-leste', 'zona-oeste', 'zona-centro', 'zona-grande-sp');
END
$$;

-- ---------------------------------------------------------------------------
-- 7) Os motores. Mesmo corpo da 0078 (vez única) + os blocos [FILIAL]:
--    pino válido ou roleta da vez; cursor do par (zona, roleta) ao entregar;
--    a reserva do SDR tenta as filiais na ordem; a vez única da família
--    'zona' por roleta.
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
  -- [PESO]
  _ponderado boolean := false;
  -- [ORIGEM]
  _origem uuid;
  -- [FILIAL] (0079)
  _zr record;
  -- [VEZ ÚNICA] (0078) A vez é uma só: quem já é o 1º da fila de uma zona
  -- mais movimentada não é o 1º desta. _vez_fora: quem saiu dos candidatos
  -- por isso (e em que zona está a vez dele); _vez_forcada: a regra pularia
  -- todo mundo, então a fila ficou como estava (e ninguém saiu: _vez_fora
  -- volta a vazio).
  _vez_unica boolean := false;
  _vez_fora_ids uuid[] := ARRAY[]::uuid[];
  _vez_fora jsonb := '[]'::jsonb;
  _vez_forcada boolean := false;
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
      -- [FILIAL] (0079) A zona pode ter mais de uma roleta: a da vez primeiro
      -- (o passo 3 tenta as outras na ordem do rodízio).
      SELECT x.roleta_slug INTO _zslug
        FROM public._roletas_da_zona(_zona) x
       ORDER BY (NOT x.da_vez), x.ordem
       LIMIT 1;
    END IF;
  END IF;

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  --    Só vale para quem HOJE tem o papel corretor: quem virou SDR vindo de
  --    corretor continua sendo corretor_id da carteira antiga e, sem esta
  --    guarda, o motor "entregaria" o lead de volta para o próprio SDR.
  --    [ORIGEM] (10/10/2026) Lead que o SDR PUXOU de um corretor que tinha
  --    falado com o cliente nos últimos dias (sdr_corretor_origem_id, gravado
  --    por criar_lead_dedup) volta para esse corretor na entrega, com as
  --    mesmas guardas — conta ativa, papel corretor, região e agenda livre.
  _origem := COALESCE(_lead.corretor_id, _lead.sdr_corretor_origem_id);
  IF _origem IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _origem AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_origem, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF _estrita AND NOT public.corretor_atende_zona(_origem, _zona) THEN
      -- [ZONA] O dono antigo é de outra região: a visita vai para a zona.
      _prioridade_recusa := 'fora_da_regiao';
    ELSIF public._sdr_agenda_conflita(_origem, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _origem;
      _regra := CASE WHEN _lead.corretor_id IS NOT NULL THEN 'sdr_prioridade_corretor_original'
                     ELSE 'sdr_retorno_corretor_origem' END;
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  --    [VEZ ÚNICA] (0078) e quem já é o 1º de uma zona mais movimentada.
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

      -- [VEZ ÚNICA] (0078) Quem já é o 1º da fila de uma zona mais
      -- movimentada (_vez_unica_tomados: a mesma conta da tela) sai dos
      -- candidatos desta zona. Se isso esvaziasse a fila, ela fica como está:
      -- a vez nunca segura o lead.
      IF _estrita AND _zona IS NOT NULL AND public._vez_unica_ativa()
         AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        _vez_unica := true;
        SELECT COALESCE(array_agg(t.corretor_id), ARRAY[]::uuid[]),
               COALESCE(jsonb_agg(jsonb_build_object(
                 'corretor_id', t.corretor_id, 'vez_em', t.vez_em)), '[]'::jsonb)
          INTO _vez_fora_ids, _vez_fora
          FROM public._vez_unica_tomados('sdr', _zona) t
         WHERE t.corretor_id = ANY(_aptos_ids);
        IF COALESCE(array_length(_vez_fora_ids, 1), 0) > 0 THEN
          IF EXISTS (SELECT 1 FROM unnest(_aptos_ids) x WHERE NOT (x = ANY(_vez_fora_ids))) THEN
            _aptos_ids := ARRAY(SELECT x FROM unnest(_aptos_ids) x
                                 WHERE NOT (x = ANY(_vez_fora_ids)));
          ELSE
            _vez_forcada := true;
            _vez_fora := '[]'::jsonb;
          END IF;
        END IF;
      END IF;

      -- [PESO] Regra semanal valendo: rodízio PONDERADO (meta = peso cheio;
      -- exceção por 1 venda e complemento = peso menor). Fora dela, o rodízio
      -- de sempre: quem está há mais tempo sem receber.
      _ponderado := public._roleta_sdr_ponderado();
      IF _ponderado THEN
        _vencedor := public._roleta_sdr_escolher_ponderado(
          _roleta.id, COALESCE(_aptos_ids, ARRAY[]::uuid[]));
      ELSE
        SELECT rp.corretor_id INTO _vencedor
        FROM public.roleta_participantes rp
        WHERE rp.roleta_id = _roleta.id
          AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
        ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
        LIMIT 1
        FOR UPDATE OF rp SKIP LOCKED;
      END IF;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
    END IF;
  END IF;

  -- 3) [ZONA] Ninguém dos agendados atende a zona: time da zona, mesma régua
  --    de agenda (presença, teto do SDR, conflito no horário da visita).
  --    [FILIAL] (0079) A zona pode ter mais de uma roleta: a da vez primeiro,
  --    depois as outras, na ordem do rodízio entre as filiais.
  IF _vencedor IS NULL AND _estrita AND _zslug IS NOT NULL THEN
    FOR _zr IN
      SELECT x.roleta_slug FROM public._roletas_da_zona(_zona) x
       ORDER BY (NOT x.da_vez), x.ordem
    LOOP
      SELECT * INTO _zroleta FROM public.roletas WHERE slug = _zr.roleta_slug AND ativo;
      CONTINUE WHEN NOT FOUND;

      SELECT array_agg(e.corretor_id) FILTER (WHERE e.apto)
        INTO _aptos_ids
      FROM public._elegibilidade_roleta_sdr(_zr.roleta_slug, _inicio, _fim) e;

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
        _slug_usado := _zr.roleta_slug;
        _roleta := _zroleta;
        _motivo_excecao := NULL;
        EXIT;
      END IF;
    END LOOP;
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
    'corretor_origem', _lead.sdr_corretor_origem_id,
    'inicio', _inicio,
    'fim', _fim,
    'zona', _zona,
    'zona_estrita', _estrita,
    'roleta_usada', _slug_usado,
    'rodizio_ponderado', _ponderado,
    'vez_unica', _vez_unica,
    'vez_em_outra_zona', _vez_fora,
    'vez_unica_forcada', _vez_forcada
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
         -- [ORIGEM] Usada uma vez: numa devolução (no-show, 7 dias parado) o
         -- próximo agendamento segue a régua normal.
         sdr_corretor_origem_id = NULL,
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
  -- [FILIAL] (0079) A reserva também anda o cursor do par (zona, roleta).
  IF _regra = 'roleta_sdr_zona' AND _zona IS NOT NULL THEN
    UPDATE public.zonas_roletas SET ultimo_lead_em = now()
     WHERE zona = _zona AND roleta_slug = _slug_usado;
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
  _zslug_pronta text;
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
  -- [VEZ ÚNICA] (0078) A vez é uma só: quem já é o 1º da fila de uma zona
  -- mais movimentada não é o 1º desta. _vez_fora: quem saiu dos candidatos
  -- por isso (e em que zona está a vez dele); _vez_forcada: a regra pularia
  -- todo mundo, então a fila ficou como estava (e ninguém saiu: _vez_fora
  -- volta a vazio).
  _vez_unica boolean := false;
  _vez_fora_ids uuid[] := ARRAY[]::uuid[];
  _vez_fora jsonb := '[]'::jsonb;
  _vez_forcada boolean := false;
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
    -- [FILIAL] (0079) A zona pode ter mais de uma roleta (Leste: Liberdade e
    -- Belém). Pino válido do lead (memória do repasse: fica no mesmo time)
    -- e pronto PARA ESTE LEAD → ele; senão a primeira do rodízio entre as
    -- filiais da zona (_roletas_da_zona) com alguém apto que ainda não teve
    -- o lead (_roleta_pronta_para_lead); nenhuma → o pino, ou a da vez, ou a
    -- primeira da ordem (o lead espera lá, nunca troca de zona).
    SELECT x.roleta_slug INTO _zslug_pronta
      FROM public._roletas_da_zona(_zona) x
     WHERE x.pronta AND public._roleta_pronta_para_lead(x.roleta_slug, _tentaram)
     ORDER BY x.ordem
     LIMIT 1;
    IF _roleta_slug IS NOT NULL AND public._roleta_atende_zona(_roleta_slug, _zona)
       AND (public._roleta_pronta_para_lead(_roleta_slug, _tentaram) OR _zslug_pronta IS NULL) THEN
      _zslug_lead := _roleta_slug;
    ELSE
      _zslug_lead := COALESCE(
        _zslug_pronta,
        public.roleta_da_zona(_zona),
        (SELECT x.roleta_slug FROM public._roletas_da_zona(_zona) x ORDER BY x.ordem LIMIT 1));
    END IF;
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

    -- [VEZ ÚNICA] (0078) Só nas roletas de zona: quem já é o 1º da fila de
    -- uma zona mais movimentada (_vez_unica_tomados: a mesma conta da tela)
    -- sai dos candidatos desta. Se isso esvaziasse a fila, ela fica como
    -- está: a vez nunca segura o lead.
    IF _estrita AND _zona IS NOT NULL AND _roleta_tipo = 'zona'
       AND public._vez_unica_ativa()
       AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      _vez_unica := true;
      SELECT COALESCE(array_agg(t.corretor_id), ARRAY[]::uuid[]),
             COALESCE(jsonb_agg(jsonb_build_object(
               'corretor_id', t.corretor_id, 'vez_em', t.vez_em)), '[]'::jsonb)
        INTO _vez_fora_ids, _vez_fora
        FROM public._vez_unica_tomados('zona', _slug) t
       WHERE t.corretor_id = ANY(_aptos_ids);
      IF COALESCE(array_length(_vez_fora_ids, 1), 0) > 0 THEN
        IF EXISTS (SELECT 1 FROM unnest(_aptos_ids) x WHERE NOT (x = ANY(_vez_fora_ids))) THEN
          _aptos_ids := ARRAY(SELECT x FROM unnest(_aptos_ids) x
                               WHERE NOT (x = ANY(_vez_fora_ids)));
        ELSE
          _vez_forcada := true;
          _vez_fora := '[]'::jsonb;
        END IF;
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
      -- Serializa o rodízio por roleta (como o SDR 'roleta_sdr:' e o SWRR
      -- 'roleta_swrr:' já fazem): sem isto, o SKIP LOCKED esvazia a fila quando
      -- a vez única deixou um só candidato e outro lead da zona está sendo
      -- entregue na mesma hora — e a vez "segura" o lead por um ciclo do cron.
      PERFORM pg_advisory_xact_lock(hashtext('roleta_rodizio:' || _r.id::text));
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
    'marquinhos_na_zona', _marquinhos_na_zona,
    'vez_unica', _vez_unica,
    'vez_em_outra_zona', _vez_fora,
    'vez_unica_forcada', _vez_forcada
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
                     || ': ausência, cota, pausa ou já teve o lead) — o lead espera o time da filial';
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
  -- [FILIAL] (0079) O cursor do par (zona, roleta): é o que faz a Leste
  -- alternar entre Liberdade e Belém.
  IF _zona IS NOT NULL AND _roleta_tipo = 'zona' THEN
    UPDATE public.zonas_roletas SET ultimo_lead_em = now()
     WHERE zona = _zona AND roleta_slug = _slug;
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
-- 8) A vez é uma só, com a unidade certa por família (0078 → por filial).
--    'sdr': a fila dos Agendados do SDR é por ZONA (a visita tem zona) — a
--    unidade é a zona, como na 0078. 'zona': a fila da roleta de filial é
--    UMA para todas as zonas dela (o 1º da Belém é o 1º para lead da Leste e
--    da Grande SP) — a unidade é a ROLETA. Ordem: da unidade mais movimentada
--    (leads entregues nos 30 dias anteriores ao começo desta semana: por
--    zona do contexto no SDR; por roleta_slug nas filiais) para a menos;
--    empate pela ordem canônica das zonas ou das filiais.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._vez_unica_zonas_ordem();

CREATE OR REPLACE FUNCTION public._vez_unica_unidades(_familia text)
RETURNS TABLE(unidade text, rotulo text, roleta_slug text, zona text, ordem integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH janela AS (
    SELECT date_trunc('week', now()) - interval '30 days' AS ini,
           date_trunc('week', now()) AS fim
  ),
  n_zona AS (
    SELECT c.contexto ->> 'zona' AS zona, count(*)::int AS leads
      FROM public.distribution_log dl
      JOIN public.distribuicao_log_contexto c ON c.log_id = dl.id
      CROSS JOIN janela j
     WHERE _familia = 'sdr'
       AND dl.created_at >= j.ini AND dl.created_at < j.fim
       AND dl.resultado = 'sucesso'
       AND c.contexto ? 'zona'
     GROUP BY 1
  ),
  n_roleta AS (
    SELECT dl.roleta_slug, count(*)::int AS leads
      FROM public.distribution_log dl
      CROSS JOIN janela j
     WHERE _familia = 'zona'
       AND dl.created_at >= j.ini AND dl.created_at < j.fim
       AND dl.resultado = 'sucesso'
       AND dl.roleta_slug IS NOT NULL
     GROUP BY 1
  ),
  sdr AS (
    SELECT DISTINCT zr.zona AS unidade, zr.zona AS rotulo, 'agendados-sdr'::text AS roleta_slug, zr.zona,
           coalesce(n.leads, 0) AS leads,
           coalesce(array_position(public._zonas_canonicas(), zr.zona), 99) AS desempate,
           zr.zona AS desempate2
      FROM public.zonas_roletas zr
      LEFT JOIN n_zona n ON n.zona = zr.zona
     WHERE _familia = 'sdr'
  ),
  filiais AS (
    SELECT r.slug AS unidade,
           coalesce(f.nome, r.nome) AS rotulo,
           r.slug AS roleta_slug,
           (SELECT min(zr.zona) FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug) AS zona,
           coalesce(n.leads, 0) AS leads,
           coalesce(f.ordem, 99) AS desempate,
           r.slug AS desempate2
      FROM public.roletas r
      LEFT JOIN public.filiais f ON f.id = r.filial_id
      LEFT JOIN n_roleta n ON n.roleta_slug = r.slug
     WHERE _familia = 'zona' AND r.tipo = 'zona' AND r.ativo
       AND EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug)
  ),
  todas AS (
    SELECT * FROM sdr UNION ALL SELECT * FROM filiais
  )
  SELECT t.unidade, t.rotulo, t.roleta_slug, t.zona,
         row_number() OVER (ORDER BY t.leads DESC, t.desempate, t.desempate2)::int AS ordem
    FROM todas t;
$$;

-- As cabeças: unidade a unidade, na ordem, o 1º da fila de quem ainda não é
-- o 1º de uma unidade anterior. _ate_unidade: para ANTES dela (o motor só
-- precisa das anteriores). A régua do SDR não depende da zona: uma vez só.
-- A assinatura é a mesma, mas a coluna rotulo é nova: DROP + CREATE.
DROP FUNCTION IF EXISTS public._vez_unica_cabecas(text, text);

CREATE OR REPLACE FUNCTION public._vez_unica_cabecas(_familia text, _ate_unidade text DEFAULT NULL)
RETURNS TABLE(unidade text, rotulo text, ordem integer, corretor_id uuid, forcado boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _u       record;
  _cab     jsonb := '[]'::jsonb;
  _cabeca  uuid;
  _forcado boolean;
  _elig    jsonb;
BEGIN
  IF _familia NOT IN ('sdr', 'zona') THEN
    RETURN;
  END IF;
  IF _ate_unidade IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public._vez_unica_unidades(_familia) u WHERE u.unidade = _ate_unidade) THEN
    RETURN;
  END IF;
  IF _familia = 'sdr' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'corretor_id', e.corretor_id, 'nome', e.nome,
             'apto', e.apto, 'motivos', to_jsonb(e.motivos))), '[]'::jsonb)
      INTO _elig
      FROM public._elegibilidade_roleta_sdr('agendados-sdr', NULL, NULL) e;
  END IF;

  FOR _u IN
    SELECT u.unidade, u.rotulo, u.roleta_slug, u.zona, u.ordem
      FROM public._vez_unica_unidades(_familia) u
     ORDER BY u.ordem
  LOOP
    EXIT WHEN _ate_unidade IS NOT NULL AND _u.unidade = _ate_unidade;
    _cabeca := NULL;
    SELECT f.corretor_id INTO _cabeca
      FROM public._roleta_fila_prevista(
             _u.roleta_slug,
             CASE WHEN _familia = 'sdr' THEN _u.zona ELSE NULL END,
             NULL, _cab, _elig) f
     WHERE f.posicao = 1;
    _forcado := _cabeca IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(_cab) AS c(corretor_id uuid)
       WHERE c.corretor_id = _cabeca);
    _cab := _cab || jsonb_build_array(jsonb_build_object(
      'unidade', _u.unidade, 'rotulo', _u.rotulo, 'ordem', _u.ordem,
      'corretor_id', _cabeca, 'forcado', _forcado));
    unidade := _u.unidade;
    rotulo := _u.rotulo;
    ordem := _u.ordem;
    corretor_id := _cabeca;
    forcado := _forcado;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Parâmetro renomeado (zona → unidade): DROP + CREATE.
DROP FUNCTION IF EXISTS public._vez_unica_cabecas_json(text, text);

CREATE OR REPLACE FUNCTION public._vez_unica_cabecas_json(_familia text, _ate_unidade text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'unidade', c.unidade, 'rotulo', c.rotulo, 'ordem', c.ordem,
           'corretor_id', c.corretor_id, 'forcado', c.forcado)
           ORDER BY c.ordem), '[]'::jsonb)
    FROM public._vez_unica_cabecas(_familia, _ate_unidade) c;
$$;

-- Para o motor: quem já é o 1º de uma unidade anterior (zona no SDR, roleta
-- nas filiais), e onde está a vez dele (rótulo).
-- Parâmetro renomeado (zona → unidade): DROP + CREATE.
DROP FUNCTION IF EXISTS public._vez_unica_tomados(text, text);

CREATE OR REPLACE FUNCTION public._vez_unica_tomados(_familia text, _unidade text)
RETURNS TABLE(corretor_id uuid, vez_em text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT ON (c.corretor_id) c.corretor_id, c.rotulo
    FROM public._vez_unica_cabecas(_familia, _unidade) c
   WHERE c.corretor_id IS NOT NULL
   ORDER BY c.corretor_id, c.ordem;
$$;

-- ---------------------------------------------------------------------------
-- 9) A fila prevista (0076/0078) com a unidade da vez única por família e a
--    roleta de filial com várias zonas: a zona pedida é respeitada se for
--    uma das zonas da roleta; senão (ou NULL), a primeira — a ordem da fila é
--    a mesma para todas as zonas da roleta.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._roleta_fila_prevista(text, text, text);
DROP FUNCTION IF EXISTS public._roleta_fila_prevista(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public._roleta_fila_prevista(text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public._roleta_fila_prevista(
  _slug text, _zona text DEFAULT NULL, _regua text DEFAULT NULL,
  _cabecas jsonb DEFAULT NULL, _elig_pronta jsonb DEFAULT NULL)
RETURNS TABLE(corretor_id uuid, nome text, posicao integer, apto boolean, motivos text[], vez_em text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _r       public.roletas%ROWTYPE;
  _estrita boolean := public._zona_estrita();
  _mec     text;
  _elig    jsonb;
  -- [VEZ ÚNICA]
  _familia text;
  _unidade text;
  _aptos   uuid[] := ARRAY[]::uuid[];
  _tomados uuid[] := ARRAY[]::uuid[];
  _vez     jsonb := '{}'::jsonb;
  _ordem   integer;
BEGIN
  SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  _mec := public._roleta_fila_mecanica(_slug, _regua);

  -- [FILIAL] A roleta de zona atende N zonas: a zona pedida vale se for uma
  -- delas; senão, a primeira (a fila é a mesma para todas).
  IF _r.tipo = 'zona' AND (_zona IS NULL OR NOT public._roleta_atende_zona(_slug, _zona)) THEN
    SELECT zr.zona INTO _zona
      FROM public.zonas_roletas zr
     WHERE zr.roleta_slug = _slug
     ORDER BY zr.zona
     LIMIT 1;
  END IF;

  -- Campanha comum + lead com zona: quem distribui é a roleta da zona.
  IF _r.tipo = 'campanha' AND NOT _r.equipe_fixa AND _estrita AND _zona IS NOT NULL THEN
    RETURN;
  END IF;

  -- A régua de cada motor (ou a já calculada por quem chamou: a do SDR não
  -- depende da zona, e _vez_unica_cabecas a calcula uma vez, não uma por zona).
  IF _elig_pronta IS NOT NULL THEN
    _elig := _elig_pronta;
  ELSIF _r.tipo = 'sdr' OR _regua = 'sdr' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', e.corretor_id, 'nome', e.nome,
             'apto', e.apto, 'motivos', to_jsonb(e.motivos)))
      INTO _elig
      FROM public._elegibilidade_roleta_sdr(_slug, NULL, NULL) e;
  ELSIF _r.tipo = 'campanha' THEN
    -- Os filtros de distribuir_lead_ponderado, um a um (presença sem data e
    -- cota no dia do banco, como lá).
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', c.corretor_id, 'nome', c.nome,
             'apto', (c.participante_ativo AND c.eh_corretor AND NOT c.pausado AND c.perfil_ativo
                      AND c.tem_telefone AND c.presenca_ok AND c.dentro_cota),
             'motivos', to_jsonb(array_remove(ARRAY[
               CASE WHEN NOT c.participante_ativo THEN 'participacao_inativa' END,
               CASE WHEN c.pausado THEN 'pausado' END,
               CASE WHEN NOT c.perfil_ativo THEN 'perfil_inativo' END,
               CASE WHEN NOT c.eh_corretor THEN 'sem_role_corretor' END,
               CASE WHEN NOT c.tem_telefone THEN 'sem_telefone' END,
               CASE WHEN NOT c.presenca_ok THEN 'ausente_hoje' END,
               CASE WHEN NOT c.dentro_cota THEN 'cota_diaria_atingida' END
             ], NULL))))
      INTO _elig
      FROM (
        SELECT rp.corretor_id,
               p.nome,
               rp.ativo AS participante_ativo,
               EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor') AS eh_corretor,
               NOT (rp.pausado_ate IS NULL OR rp.pausado_ate < now()) AS pausado,
               p.ativo = true AS perfil_ativo,
               coalesce(p.telefone, '') <> '' AS tem_telefone,
               (NOT _r.exigir_presenca OR p.presente = true) AS presenca_ok,
               (rp.limite_diario IS NULL OR (
                  SELECT count(*) FROM public.distribution_log dl
                   WHERE dl.corretor_id = rp.corretor_id
                     AND dl.roleta_slug = _r.slug
                     AND dl.resultado = 'sucesso'
                     AND dl.created_at >= date_trunc('day', now())
                ) < rp.limite_diario) AS dentro_cota
          FROM public.roleta_participantes rp
          JOIN public.profiles p ON p.id = rp.corretor_id
         WHERE rp.roleta_id = _r.id
      ) c;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', e.corretor_id, 'nome', e.nome,
             'apto', e.apto AND coalesce(x.apto, true),
             'motivos', to_jsonb(coalesce(e.motivos, '{}') || coalesce(x.motivos, '{}'))))
      INTO _elig
      FROM public._elegibilidade_roleta(_slug) e
      -- [V2] A régua extra do motor (onboarding, vínculo, disjuntor).
      LEFT JOIN LATERAL (
        SELECT v.apto, v.motivos FROM public._apto_extra_v2(e.corretor_id) v
         WHERE public._modelo_v2_ativo() AND e.apto
      ) x ON true;
  END IF;

  -- [VEZ ÚNICA] Só nas duas famílias da regra, com zona estrita e zona.
  -- Unidade: a zona (SDR) ou esta roleta (filial).
  IF _estrita AND _zona IS NOT NULL AND public._vez_unica_ativa() THEN
    _familia := CASE WHEN _r.tipo = 'sdr' AND (_regua IS NULL OR _regua = 'sdr') THEN 'sdr'
                     WHEN _r.tipo = 'zona' AND _regua IS NULL THEN 'zona' END;
    _unidade := CASE _familia WHEN 'sdr' THEN _zona WHEN 'zona' THEN _slug END;
  END IF;
  IF _familia IS NOT NULL THEN
    IF _cabecas IS NULL THEN
      _cabecas := public._vez_unica_cabecas_json(_familia, _unidade);
    END IF;
    -- Os aptos desta fila (depois do filtro de zona).
    SELECT coalesce(array_agg(x.corretor_id), ARRAY[]::uuid[]) INTO _aptos
      FROM jsonb_to_recordset(coalesce(_elig, '[]'::jsonb)) AS x(corretor_id uuid, apto boolean)
     WHERE x.apto AND _r.ativo AND public.corretor_atende_zona(x.corretor_id, _zona);
    -- A posição desta unidade na ordem (ausente = todas as cabeças são anteriores).
    SELECT c.ordem INTO _ordem
      FROM jsonb_to_recordset(_cabecas) AS c(unidade text, ordem integer)
     WHERE c.unidade = _unidade
     LIMIT 1;
    -- Quem já é o 1º de uma unidade anterior, e onde (a primeira em que é).
    SELECT coalesce(array_agg(t.cid), ARRAY[]::uuid[]),
           coalesce(jsonb_object_agg(t.cid::text, t.rotulo), '{}'::jsonb)
      INTO _tomados, _vez
      FROM (
        SELECT DISTINCT ON (c.corretor_id) c.corretor_id AS cid, c.rotulo
          FROM jsonb_to_recordset(_cabecas) AS c(unidade text, rotulo text, ordem integer, corretor_id uuid)
         WHERE c.corretor_id IS NOT NULL
           AND c.corretor_id = ANY(_aptos)
           AND c.ordem < coalesce(_ordem, 2147483647)
         ORDER BY c.corretor_id, c.ordem
      ) t;
    -- A regra pularia todo mundo: a fila fica como está (o motor idem).
    IF cardinality(_tomados) > 0
       AND NOT EXISTS (SELECT 1 FROM unnest(_aptos) a WHERE NOT (a = ANY(_tomados))) THEN
      _tomados := ARRAY[]::uuid[];
      _vez := '{}'::jsonb;
    END IF;
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT x.corretor_id,
           x.nome,
           x.apto AND _r.ativo AND NOT (x.corretor_id = ANY(_tomados)) AS apto,
           coalesce(x.motivos, '{}')
             || CASE WHEN _r.ativo THEN '{}'::text[] ELSE ARRAY['roleta_desativada'] END
             || CASE WHEN x.corretor_id = ANY(_tomados) THEN ARRAY['vez_em_outra_zona']
                     ELSE '{}'::text[] END AS motivos,
           CASE WHEN x.corretor_id = ANY(_tomados) THEN _vez ->> x.corretor_id::text END AS vez_em
      FROM jsonb_to_recordset(coalesce(_elig, '[]'::jsonb))
           AS x(corretor_id uuid, nome text, apto boolean, motivos text[])
     -- [FILIAL] (0079) A campanha de equipe fixa manda: sem corte por zona.
     WHERE NOT (_estrita AND _zona IS NOT NULL)
        OR _r.tipo = 'campanha'
        OR public.corretor_atende_zona(x.corretor_id, _zona)
  ),
  ap AS (
    SELECT e.corretor_id,
           rp.ultimo_lead_em,
           rp.incluido_em,
           coalesce(rp.wrr_current, 0) AS corrente,
           CASE
             WHEN _mec = 'ponderado_semana' THEN public._roleta_sdr_peso_atual(e.corretor_id)
             WHEN _r.tipo = 'campanha' THEN
               CASE rp.tier WHEN 'A' THEN _r.peso_tier_a WHEN 'C' THEN _r.peso_tier_c
                            ELSE _r.peso_tier_b END
             ELSE CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
           END AS peso,
           -- Desempate de cada motor: SDR (último lead, inclusão, id),
           -- campanha (id), v3 ponderado (último lead, id).
           row_number() OVER (
             ORDER BY CASE WHEN _r.tipo = 'campanha' THEN NULL ELSE rp.ultimo_lead_em END
                        ASC NULLS FIRST,
                      CASE WHEN _r.tipo = 'sdr' THEN rp.incluido_em END ASC,
                      e.corretor_id
           ) AS desempate
      FROM e
      JOIN public.roleta_participantes rp
        ON rp.roleta_id = _r.id AND rp.corretor_id = e.corretor_id
     WHERE e.apto
  ),
  ordem AS (
    SELECT a.corretor_id,
           row_number() OVER (
             ORDER BY a.ultimo_lead_em ASC NULLS FIRST, a.incluido_em ASC, a.corretor_id
           )::integer AS posicao
      FROM ap a
     WHERE _mec = 'rodizio'
    UNION ALL
    SELECT s.corretor_id, s.posicao
      FROM public._fila_swrr(
             ARRAY(SELECT a.corretor_id FROM ap a ORDER BY a.desempate),
             ARRAY(SELECT a.peso FROM ap a ORDER BY a.desempate),
             ARRAY(SELECT a.corrente FROM ap a ORDER BY a.desempate),
             _r.tipo <> 'campanha') s
     WHERE _mec <> 'rodizio'
  )
  SELECT e.corretor_id, e.nome, o.posicao, e.apto, e.motivos, e.vez_em
    FROM e
    LEFT JOIN ordem o ON o.corretor_id = e.corretor_id
   ORDER BY o.posicao NULLS LAST, e.nome;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10) As duas portas: todas as roletas de filial da zona (com da_vez, filial
--     e zonas); a reserva do SDR na roleta da vez; posição por roleta de
--     filial (zona NULL, filial e zonas no objeto).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roletas_filas_zona_v1(_zona text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _estrita boolean := public._zona_estrita();
  _zslugs  text[];
  _zvez    text;
  _r       record;
  _fila    jsonb;
  _fora    jsonb;
  _n       integer;
  _reserva jsonb;
  _out     jsonb := '[]'::jsonb;
  -- [VEZ ÚNICA]
  _cab_sdr  jsonb;
  _cab_zona jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT (
       public.has_role(_uid, 'sdr') OR public.has_role(_uid, 'admin')
       OR public.has_role(_uid, 'gestor') OR public.has_role(_uid, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _zona IS NOT NULL THEN
    SELECT coalesce(array_agg(x.roleta_slug ORDER BY x.ordem), ARRAY[]::text[]),
           (SELECT y.roleta_slug FROM public._roletas_da_zona(_zona) y WHERE y.da_vez LIMIT 1)
      INTO _zslugs, _zvez
      FROM public._roletas_da_zona(_zona) x;
    IF cardinality(_zslugs) = 0 THEN
      RAISE EXCEPTION 'Zona desconhecida: %', _zona USING ERRCODE = '22023';
    END IF;
    -- Nenhuma pronta: a primeira da ordem é onde o lead espera.
    _zvez := coalesce(_zvez, _zslugs[1]);
  END IF;

  -- [VEZ ÚNICA] As cabeças de cada família, uma vez só.
  IF _zona IS NOT NULL AND _estrita AND public._vez_unica_ativa() THEN
    _cab_sdr  := public._vez_unica_cabecas_json('sdr');
    _cab_zona := public._vez_unica_cabecas_json('zona');
  END IF;

  FOR _r IN
    SELECT r.slug, r.nome, r.tipo, r.equipe_fixa, r.exigir_presenca,
           CASE WHEN r.tipo = 'sdr' THEN 'sdr'
                WHEN r.tipo = 'zona' THEN 'zona'
                WHEN r.slug = 'marquinhos' THEN 'marquinhos'
                ELSE 'campanha' END AS papel,
           f.slug AS filial_slug, f.nome AS filial_nome,
           (SELECT coalesce(jsonb_agg(zr.zona ORDER BY zr.zona), '[]'::jsonb)
              FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug) AS zonas,
           r.slug = _zvez AS da_vez,
           coalesce(array_position(_zslugs, r.slug), 99) AS ordem_zona
      FROM public.roletas r
      LEFT JOIN public.filiais f ON f.id = r.filial_id
     WHERE r.ativo
       AND (
         (r.tipo = 'sdr' AND _zona IS NOT NULL)
         OR (r.tipo = 'zona' AND r.slug = ANY(coalesce(_zslugs, ARRAY[]::text[])))
         OR r.slug = 'marquinhos'
         -- [FILIAL] (0079) Campanha de equipe fixa: de qualquer zona; numa
         -- zona, as da(s) filial(is) que a atendem e as sem filial.
         OR (r.tipo = 'campanha' AND (
              _zona IS NULL OR NOT _estrita
              OR (r.equipe_fixa AND (r.filial_id IS NULL OR r.filial_id IN (
                    SELECT ro.filial_id FROM public.roletas ro
                     WHERE ro.slug = ANY(coalesce(_zslugs, ARRAY[]::text[])))))))
       )
     ORDER BY CASE WHEN r.tipo = 'sdr' THEN 1 WHEN r.tipo = 'zona' THEN 2
                   WHEN r.slug = 'marquinhos' THEN 3 ELSE 4 END,
              CASE WHEN r.tipo = 'zona' THEN coalesce(array_position(_zslugs, r.slug), 99) ELSE 0 END,
              r.nome
  LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'posicao', f.posicao, 'corretor_id', f.corretor_id, 'nome', f.nome)
             ORDER BY f.posicao) FILTER (WHERE f.apto), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'corretor_id', f.corretor_id, 'nome', f.nome, 'motivos', to_jsonb(f.motivos),
               'vez_em', f.vez_em))
             ORDER BY f.nome) FILTER (WHERE NOT f.apto), '[]'::jsonb),
           count(*)::int
      INTO _fila, _fora, _n
      FROM public._roleta_fila_prevista(
             _r.slug, _zona, NULL,
             CASE _r.papel WHEN 'sdr' THEN _cab_sdr WHEN 'zona' THEN _cab_zona
                           ELSE '[]'::jsonb END) f;

    -- Campanha sem ninguém da equipe nesta zona: não é fila desta zona.
    CONTINUE WHEN _r.papel = 'campanha' AND _zona IS NOT NULL AND _n = 0;

    -- Visita do SDR sem ninguém do time apto na zona: vai para o time da
    -- filial da vez pela régua do SDR (sem presença). Fora da vez única.
    _reserva := NULL;
    IF _r.papel = 'sdr' AND _zvez IS NOT NULL AND jsonb_array_length(_fila) = 0 THEN
      SELECT jsonb_build_object(
               'slug', _zvez,
               'fila', coalesce(jsonb_agg(jsonb_build_object(
                         'posicao', f.posicao, 'corretor_id', f.corretor_id, 'nome', f.nome)
                       ORDER BY f.posicao) FILTER (WHERE f.apto), '[]'::jsonb))
        INTO _reserva
        FROM public._roleta_fila_prevista(_zvez, _zona, 'sdr', '[]'::jsonb) f;
    END IF;

    _out := _out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'slug', _r.slug,
      'nome', _r.nome,
      'papel', _r.papel,
      'mecanica', public._roleta_fila_mecanica(_r.slug),
      'equipe_fixa', _r.equipe_fixa,
      'exige_presenca', _r.exigir_presenca AND _r.papel <> 'sdr',
      'fora_do_horario', public._roleta_fora_do_horario(_r.slug),
      'segue_zona', _r.papel = 'campanha' AND NOT _r.equipe_fixa AND _estrita AND _zona IS NOT NULL,
      'vez_unica', _r.papel IN ('sdr', 'zona') AND _cab_sdr IS NOT NULL,
      'da_vez', CASE WHEN _r.papel = 'zona' THEN _r.da_vez END,
      'filial', CASE WHEN _r.filial_slug IS NOT NULL
                     THEN jsonb_build_object('slug', _r.filial_slug, 'nome', _r.filial_nome) END,
      'zonas', CASE WHEN _r.papel = 'zona' THEN _r.zonas END,
      'fila', _fila,
      'fora', _fora,
      'reserva', _reserva)));
  END LOOP;

  RETURN jsonb_build_object(
    'zona', _zona,
    'zona_estrita', _estrita,
    'zonas', coalesce((SELECT jsonb_agg(DISTINCT zr.zona ORDER BY zr.zona) FROM public.zonas_roletas zr),
                      '[]'::jsonb),
    'roletas', _out);
END;
$$;

CREATE OR REPLACE FUNCTION public.minhas_posicoes_roletas_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _estrita boolean := public._zona_estrita();
  _zonas   text[];
  _r       record;
  _z       text;
  _alvos   text[];
  _total   integer;
  _achou   boolean;
  _posicao integer;
  _apto    boolean;
  _motivos jsonb;
  _vez_em  text;
  _out     jsonb := '[]'::jsonb;
  -- [VEZ ÚNICA]
  _cab_sdr  jsonb;
  _cab_zona jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(p.zonas, '{}') INTO _zonas FROM public.profiles p WHERE p.id = _uid;

  -- [VEZ ÚNICA] As cabeças de cada família, uma vez só.
  IF _estrita AND public._vez_unica_ativa() THEN
    _cab_sdr  := public._vez_unica_cabecas_json('sdr');
    _cab_zona := public._vez_unica_cabecas_json('zona');
  END IF;

  FOR _r IN
    SELECT r.slug, r.nome, r.tipo, r.equipe_fixa,
           CASE WHEN r.tipo = 'sdr' THEN 'sdr'
                WHEN r.tipo = 'zona' THEN 'zona'
                WHEN r.slug = 'marquinhos' THEN 'marquinhos'
                ELSE 'campanha' END AS papel,
           f.nome AS filial_nome,
           (SELECT coalesce(jsonb_agg(zr.zona ORDER BY zr.zona), '[]'::jsonb)
              FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug) AS zonas_da_roleta
      FROM public.roletas r
      JOIN public.roleta_participantes rp ON rp.roleta_id = r.id AND rp.corretor_id = _uid
      LEFT JOIN public.filiais f ON f.id = r.filial_id
     -- Só a participação ATIVA: a roleta de onde a gestão o removeu não é
     -- "dele" (e, numa roleta de filial, removê-lo tira as zonas dela da região).
     WHERE rp.ativo
       AND r.ativo
       AND (r.tipo IN ('zona', 'sdr', 'campanha') OR r.slug = 'marquinhos')
     ORDER BY CASE WHEN r.tipo = 'zona' THEN 1 WHEN r.tipo = 'sdr' THEN 2
                   WHEN r.slug = 'marquinhos' THEN 3 ELSE 4 END,
              r.nome
  LOOP
    -- Em que filas desta roleta ele está: a roleta de filial é UMA fila para
    -- todas as zonas dela (zona NULL); a campanha também (a campanha manda);
    -- na fila do SDR, uma por zona que ele atende (fora, se não atende
    -- nenhuma).
    _alvos := CASE
      WHEN _r.papel = 'zona' THEN ARRAY[NULL::text]
      -- [FILIAL] (0079) A campanha manda, de qualquer zona: uma fila só.
      WHEN _r.papel = 'campanha' THEN ARRAY[NULL::text]
      WHEN NOT _estrita THEN ARRAY[NULL::text]
      WHEN cardinality(_zonas) > 0 THEN _zonas
      ELSE ARRAY[NULL::text]
    END;

    FOREACH _z IN ARRAY _alvos LOOP
      -- A fila do SDR só recebe visita com zona: sem zona no perfil, fora.
      IF _r.papel = 'sdr' AND _z IS NULL AND _estrita THEN
        _out := _out || jsonb_build_array(jsonb_build_object(
          'slug', _r.slug, 'nome', _r.nome, 'papel', _r.papel, 'zona', NULL,
          'mecanica', public._roleta_fila_mecanica(_r.slug),
          'posicao', NULL, 'total', 0, 'apto', false,
          'motivos', '["sem_zona_no_perfil"]'::jsonb, 'vez_em', NULL));
        CONTINUE;
      END IF;

      SELECT count(*) FILTER (WHERE f.apto)::int,
             count(*) FILTER (WHERE f.corretor_id = _uid) > 0,
             max(f.posicao) FILTER (WHERE f.corretor_id = _uid),
             coalesce(bool_or(f.apto) FILTER (WHERE f.corretor_id = _uid), false),
             (jsonb_agg(to_jsonb(f.motivos)) FILTER (WHERE f.corretor_id = _uid)) -> 0,
             max(f.vez_em) FILTER (WHERE f.corretor_id = _uid)
        INTO _total, _achou, _posicao, _apto, _motivos, _vez_em
        FROM public._roleta_fila_prevista(
               _r.slug, _z, NULL,
               CASE _r.papel WHEN 'sdr' THEN _cab_sdr WHEN 'zona' THEN _cab_zona
                             ELSE '[]'::jsonb END) f;

      _out := _out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'slug', _r.slug,
        'nome', _r.nome,
        'papel', _r.papel,
        'zona', _z,
        'filial', _r.filial_nome,
        'zonas', CASE WHEN _r.papel = 'zona' THEN _r.zonas_da_roleta END,
        'mecanica', public._roleta_fila_mecanica(_r.slug),
        'posicao', _posicao,
        'total', _total,
        'apto', _apto,
        'motivos', CASE WHEN _achou THEN coalesce(_motivos, '[]'::jsonb)
                        ELSE '["fora_da_regiao"]'::jsonb END,
        'vez_em', _vez_em)) || jsonb_build_object('zona', _z, 'vez_em', _vez_em, 'posicao', _posicao));
    END LOOP;
  END LOOP;

  RETURN _out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13) Campanhas por filial — a válvula para receber lead de outras zonas.
--     Decisão do dono (12/10/2026): "dentro de cada filial teremos algumas
--     campanhas específicas para adicionar os corretores a receberem leads
--     de outras zonas, para não ficar totalmente travado na sua zona".
--     Respostas: são as campanhas de anúncio (Meta Ads) de hoje, cada uma
--     pertencendo a uma filial (roletas.filial_id); a campanha de equipe
--     fixa entrega a quem está nela, de QUALQUER zona (acaba o corte por
--     zona de 03/10 nas campanhas); qualquer corretor pode entrar; depois da
--     entrega, repasse por SLA e transferência valem entre os participantes
--     da campanha (a guarda de região libera só esse caso). Campanha comum
--     (sem equipe) continua mandando o lead com zona para a filial da zona.
-- ---------------------------------------------------------------------------

-- Lead de campanha pode ir para participante ativo da campanha, de qualquer
-- zona (guarda de região e transferência).
CREATE OR REPLACE FUNCTION public._lead_liberado_por_campanha(_roleta_slug text, _corretor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _roleta_slug IS NOT NULL AND _corretor IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.roletas r
      JOIN public.roleta_participantes rp ON rp.roleta_id = r.id
     WHERE r.slug = _roleta_slug AND r.tipo = 'campanha' AND r.ativo
       AND rp.corretor_id = _corretor AND rp.ativo)
$$;

-- A guarda de região de leads.corretor_id (20261009120100) + a exceção da
-- campanha.
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
  -- [FILIAL] (0079) Lead de campanha: quem está na campanha recebe, de
  -- qualquer zona — na entrega, no repasse e na transferência.
  IF public._lead_liberado_por_campanha(NEW.roleta_slug, NEW.corretor_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'SMQZ1',
    MESSAGE = public._msg_fora_da_regiao(_zona, NEW.corretor_id),
    DETAIL = jsonb_build_object('lead_id', NEW.id, 'zona', _zona,
                                'corretor_id', NEW.corretor_id)::text,
    HINT = 'Região do corretor = roletas de filial em que ele participa (Central de Distribuição); lead de campanha vai para quem está na campanha.';
END;
$$;

-- Criar campanha com a filial dona (assinatura nova: a antiga, de 4
-- parâmetros, sai para a chamada por nome não ficar ambígua).
DROP FUNCTION IF EXISTS public.criar_roleta_campanha(text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.criar_roleta_campanha(
  _nome text, _slug text DEFAULT NULL, _projeto_id uuid DEFAULT NULL,
  _equipe_fixa boolean DEFAULT false, _filial_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _caller uuid := auth.uid();
  _base text;
  _slug_final text;
  _n int := 1;
  _linha jsonb;
  _filial_id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF btrim(COALESCE(_nome, '')) = '' THEN
    RAISE EXCEPTION 'nome obrigatorio';
  END IF;

  IF _projeto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto inexistente';
  END IF;

  IF _filial_slug IS NOT NULL THEN
    SELECT f.id INTO _filial_id FROM public.filiais f WHERE f.slug = _filial_slug AND f.ativa;
    IF _filial_id IS NULL THEN
      RAISE EXCEPTION 'filial % inexistente', _filial_slug;
    END IF;
  END IF;

  -- Mesma regra de slug que vivia no cliente, agora no servidor (sem
  -- depender de unaccent: translate cobre os acentos do pt-BR).
  _base := left(
    btrim(regexp_replace(
      translate(lower(btrim(COALESCE(_slug, _nome))),
                'áàâãäéèêëíìîïóòôõöúùûüçñ',
                'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g'), '-'),
    60);
  IF _base = '' THEN
    RAISE EXCEPTION 'slug invalido';
  END IF;

  _slug_final := _base;
  WHILE EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _slug_final) LOOP
    _n := _n + 1;
    _slug_final := left(_base, 56) || '-' || _n;
  END LOOP;

  INSERT INTO public.roletas
    (slug, nome, descricao, ativo, criterio_participacao, exigir_presenca,
     tipo, equipe_fixa, projeto_id, webhook_token, filial_id)
  VALUES
    (_slug_final, btrim(_nome),
     CASE WHEN _equipe_fixa
       THEN 'Campanha de equipe fixa — leads caem sempre neste time, de qualquer zona.'
       ELSE 'Campanha criada pela Central de Distribuição.' END,
     true, 'manual', true, 'campanha', COALESCE(_equipe_fixa, false), _projeto_id,
     encode(gen_random_bytes(24), 'hex'), _filial_id);

  SELECT to_jsonb(r) INTO _linha FROM public.roletas r WHERE r.slug = _slug_final;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('roletas', (_linha->>'id')::uuid, 'INSERT', _caller, NULL, _linha);

  RETURN jsonb_build_object('ok', true, 'roleta', _linha);
END;
$$;

DROP FUNCTION IF EXISTS public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean);

CREATE OR REPLACE FUNCTION public.atualizar_roleta(
  _slug text, _ativo boolean DEFAULT NULL, _exigir_presenca boolean DEFAULT NULL,
  _horario_inicio text DEFAULT NULL, _horario_fim text DEFAULT NULL,
  _permitir_fora_horario boolean DEFAULT NULL, _equipe_fixa boolean DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL, _limpar_projeto boolean DEFAULT false,
  _filial_slug text DEFAULT NULL, _limpar_filial boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
  _filial_id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _projeto_id IS NOT NULL AND NOT _limpar_projeto
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto % inexistente', _projeto_id;
  END IF;
  IF _filial_slug IS NOT NULL AND NOT _limpar_filial THEN
    SELECT f.id INTO _filial_id FROM public.filiais f WHERE f.slug = _filial_slug AND f.ativa;
    IF _filial_id IS NULL THEN
      RAISE EXCEPTION 'filial % inexistente', _filial_slug;
    END IF;
  END IF;

  SELECT to_jsonb(r) INTO _antes FROM public.roletas r WHERE r.slug = _slug;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;
  -- A roleta de filial (tipo zona) não troca de filial por aqui.
  IF (_antes ->> 'tipo') = 'zona' AND (_filial_slug IS NOT NULL OR _limpar_filial) THEN
    RAISE EXCEPTION 'a roleta de filial não troca de filial';
  END IF;

  UPDATE public.roletas r SET
    ativo = COALESCE(_ativo, r.ativo),
    exigir_presenca = COALESCE(_exigir_presenca, r.exigir_presenca),
    horario_inicio = CASE
      WHEN _horario_inicio IS NULL THEN r.horario_inicio
      WHEN btrim(_horario_inicio) = '' THEN NULL
      ELSE _horario_inicio::time END,
    horario_fim = CASE
      WHEN _horario_fim IS NULL THEN r.horario_fim
      WHEN btrim(_horario_fim) = '' THEN NULL
      ELSE _horario_fim::time END,
    permitir_fora_horario = COALESCE(_permitir_fora_horario, r.permitir_fora_horario),
    equipe_fixa = COALESCE(_equipe_fixa, r.equipe_fixa),
    projeto_id = CASE
      WHEN _limpar_projeto THEN NULL
      WHEN _projeto_id IS NOT NULL THEN _projeto_id
      ELSE r.projeto_id END,
    filial_id = CASE
      WHEN _limpar_filial THEN NULL
      WHEN _filial_id IS NOT NULL THEN _filial_id
      ELSE r.filial_id END
  WHERE r.slug = _slug;

  SELECT to_jsonb(r) INTO _depois FROM public.roletas r WHERE r.slug = _slug;

  -- Sem mudança efetiva (blur sem edição) → sem ruído na auditoria.
  -- (updated_at muda em todo UPDATE — fica fora da comparação.)
  IF (_antes - 'updated_at') IS DISTINCT FROM (_depois - 'updated_at') THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('roletas', (_depois->>'id')::uuid, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'roleta', _depois);
END;
$$;

REVOKE ALL ON FUNCTION public._lead_liberado_por_campanha(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lead_liberado_por_campanha(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 14) Campanhas: o motor (distribuir_lead_ponderado), o repasse dentro da
--     campanha e a transferência da gestão — a campanha manda, de qualquer
--     zona (mesmos corpos vigentes + os blocos [FILIAL]).
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
    -- [FILIAL] (0079) Equipe fixa: a campanha manda — quem está nela recebe,
    -- de qualquer zona (decisão do dono, 12/10: a campanha da filial é a
    -- válvula para receber lead de outras zonas). Sem corte por zona.
    NULL;
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
      -- [ZONA] Ninguém da equipe fixa apto agora: a filial da zona do lead.
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
    -- [FILIAL] (0079) Equipe fixa: a campanha manda — o repasse fica entre
    -- quem está nela, de qualquer zona. Sem corte por zona.
    NULL;
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
    -- Equipe fixa com lead de zona e ninguém mais da equipe apto: a filial da zona.
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

CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid, _forcar_fora_da_zona boolean DEFAULT false, _motivo_fora_da_zona text DEFAULT NULL::text)
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
        FROM (SELECT public.zona_do_lead(l.id) AS zona, l.roleta_slug
                FROM public.leads l
               WHERE l.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
                 AND l.corretor_id IS DISTINCT FROM _corretor) x
       WHERE NOT public.corretor_atende_zona(_corretor, x.zona)
         -- [FILIAL] (0079) Lead de campanha vai para quem está na campanha.
         AND NOT public._lead_liberado_por_campanha(x.roleta_slug, _corretor)
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
    SELECT id, corretor_id, corretores_que_tentaram, roleta_slug
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
      _fora := NOT public.corretor_atende_zona(_corretor, _zona)
               AND NOT public._lead_liberado_por_campanha(_l.roleta_slug, _corretor);
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

-- ---------------------------------------------------------------------------
-- 11) Permissões: as peças internas só pelo banco; as portas, como antes.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._roletas_da_zona(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roletas_da_zona(text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_atende_zona(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_atende_zona(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_pronta_para_lead(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_pronta_para_lead(text, uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public._filial_unir_participantes(text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._filial_unir_participantes(text, text[], text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_unidades(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_unidades(text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_cabecas(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_cabecas(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_cabecas_json(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_cabecas_json(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_tomados(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_tomados(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_fila_prevista(text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_fila_prevista(text, text, text, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.roletas_filas_zona_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roletas_filas_zona_v1(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.minhas_posicoes_roletas_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_posicoes_roletas_v1() TO authenticated, service_role;

-- A leitura do mapa pelas telas (chips e editor por filial) continua pela
-- policy de SELECT já existente em zonas_roletas.

-- ---------------------------------------------------------------------------
-- 12) Guarda: o mapa, os times e as funções no lugar.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'public.zonas_roletas'::regclass AND c.contype = 'p')
     IS DISTINCT FROM 'PRIMARY KEY (zona, roleta_slug)' THEN
    RAISE EXCEPTION 'roletas por filial: zonas_roletas sem a chave (zona, roleta_slug)';
  END IF;
  IF (SELECT count(DISTINCT zona) FROM public.zonas_roletas) <> 6
     OR (SELECT count(*) FROM public.zonas_roletas) <> 7
     OR (SELECT count(DISTINCT roleta_slug) FROM public.zonas_roletas) <> 3 THEN
    RAISE EXCEPTION 'roletas por filial: o mapa deveria ter 6 zonas em 7 linhas para 3 roletas';
  END IF;
  IF (SELECT count(*) FROM public.roletas
       WHERE slug IN ('filial-barra-funda', 'filial-liberdade', 'filial-belem')
         AND tipo = 'zona' AND ativo AND filial_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'roletas por filial: as três roletas de filial deveriam estar ativas, tipo zona, com filial';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roletas
              WHERE slug IN ('zona-norte', 'zona-sul', 'zona-leste', 'zona-oeste', 'zona-centro', 'zona-grande-sp')
                AND ativo) THEN
    RAISE EXCEPTION 'roletas por filial: roleta de zona antiga ainda ativa';
  END IF;
  -- Ninguém que estava ativo numa zona ficou fora da filial que a atende.
  IF EXISTS (
    SELECT 1
      FROM public.roleta_participantes rp
      JOIN public.roletas r ON r.id = rp.roleta_id
      JOIN (VALUES ('zona-oeste', 'filial-barra-funda'), ('zona-norte', 'filial-barra-funda'),
                   ('zona-sul', 'filial-barra-funda'), ('zona-centro', 'filial-liberdade'),
                   ('zona-leste', 'filial-liberdade'), ('zona-leste', 'filial-belem'),
                   ('zona-grande-sp', 'filial-belem')) m(antiga, nova) ON m.antiga = r.slug
     WHERE rp.ativo
       AND NOT EXISTS (
         SELECT 1 FROM public.roleta_participantes rp2
           JOIN public.roletas r2 ON r2.id = rp2.roleta_id
          WHERE r2.slug = m.nova AND rp2.corretor_id = rp.corretor_id AND rp2.ativo)
  ) THEN
    RAISE EXCEPTION 'roletas por filial: participante ativo de uma zona ficou fora da filial';
  END IF;
  IF to_regprocedure('public._roleta_fila_prevista(text, text, text, jsonb)') IS NOT NULL
     OR to_regprocedure('public._roleta_fila_prevista(text, text, text, jsonb, jsonb)') IS NULL
     OR to_regprocedure('public._vez_unica_zonas_ordem()') IS NOT NULL
     OR to_regprocedure('public._vez_unica_unidades(text)') IS NULL
     OR to_regprocedure('public._roletas_da_zona(text)') IS NULL
     OR to_regprocedure('public._roleta_pronta_para_lead(text, uuid[])') IS NULL THEN
    RAISE EXCEPTION 'roletas por filial: função ausente ou assinatura antiga ainda no lugar';
  END IF;
  IF to_regprocedure('public.criar_roleta_campanha(text, text, uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.criar_roleta_campanha(text, text, uuid, boolean, text)') IS NULL
     OR to_regprocedure('public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public._lead_liberado_por_campanha(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'roletas por filial: RPCs das campanhas com assinatura antiga ou ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'distribuir_lead_ponderado'
       AND p.prosrc LIKE '%[FILIAL]%' AND p.prosrc NOT LIKE '%DELETE FROM _dlp_elegiveis e%WHERE NOT public.corretor_atende_zona%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'tg_leads_guarda_zona'
       AND p.prosrc LIKE '%_lead_liberado_por_campanha%'
  ) THEN
    RAISE EXCEPTION 'roletas por filial: campanha ainda com corte por zona ou guarda sem a exceção';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_distribuir_lead_v3'
       AND p.prosrc LIKE '%_roleta_atende_zona(%' AND p.prosrc LIKE '%zonas_roletas SET ultimo_lead_em%'
       AND p.prosrc LIKE '%_roleta_pronta_para_lead(%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_distribuir_lead_sdr'
       AND p.prosrc LIKE '%_roletas_da_zona(%'
  ) THEN
    RAISE EXCEPTION 'roletas por filial: motor sem a regra';
  END IF;
END
$guard$;
