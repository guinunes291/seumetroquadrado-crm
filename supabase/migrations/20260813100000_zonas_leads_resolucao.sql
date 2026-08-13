-- ============================================================================
-- Zonas de distribuição — o lead passa a TER zona própria e todos os motores
-- passam a respeitá-la (decisões de produto de 2026-08-13):
--
--  1) FONTE DA ZONA (cascata): leads.zona explícita → bairro do lead via
--     tabela zonas_bairros → zona do projeto (fallback já existente).
--     Trigger em leads materializa zona a partir do texto livre (form/webhook)
--     ou do bairro; o que não normaliza vira NULL (sem zona = sem corte).
--  2) CAMPANHAS respeitam zona: distribuir_lead_ponderado ganha o mesmo
--     filtro do motor v3.
--  3) SEM APTO NA ZONA → FALLBACK: em vez de mandar o lead para a fila de
--     exceções, distribui para qualquer corretor apto (atender rápido vale
--     mais que o corte geográfico). O desvio fica registrado no contexto do
--     log ('zona_fallback').
--  4) MANUAL COM AVISO: atribuição manual fora da zona continua valendo
--     (decisão humana), mas o retorno traz 'aviso_zona' e o log registra
--     'divergencia_zona' + motivo explícito.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Colunas novas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bairro text;

-- ---------------------------------------------------------------------------
-- 1) zonas_bairros — mapeamento bairro (normalizado) → zona. Editável pela
--    gestão (a operação conhece o próprio recorte melhor que qualquer seed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zonas_bairros (
  bairro text PRIMARY KEY,
  zona text NOT NULL CHECK (zona IN ('Norte','Sul','Leste','Oeste','Centro')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zonas_bairros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zonas_bairros leitura autenticada" ON public.zonas_bairros;
CREATE POLICY "zonas_bairros leitura autenticada"
  ON public.zonas_bairros FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "zonas_bairros escrita gestao" ON public.zonas_bairros;
CREATE POLICY "zonas_bairros escrita gestao"
  ON public.zonas_bairros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zonas_bairros TO authenticated;
GRANT SELECT ON public.zonas_bairros TO service_role;

-- Seed: bairros/distritos de São Paulo no recorte coloquial usado pela
-- operação (o mesmo dos chips Norte/Sul/Leste/Oeste/Centro). Chaves já
-- normalizadas (minúsculas, sem acento). ON CONFLICT DO NOTHING: ajuste
-- manual da gestão nunca é sobrescrito por replay.
INSERT INTO public.zonas_bairros (bairro, zona)
SELECT unnest(ARRAY[
  'santana','tucuruvi','mandaqui','tremembe','jacana','vila maria',
  'vila guilherme','vila medeiros','casa verde','cachoeirinha',
  'vila nova cachoeirinha','limao','freguesia do o','brasilandia','pirituba',
  'jaragua','sao domingos','perus','anhanguera','imirim','lauzane paulista',
  'parada inglesa','jardim sao paulo','vila gustavo','carandiru','agua fria',
  'jardim franca','horto florestal','vila ede','jardim brasil','itaberaba',
  'jardim peri','vila palmeiras','vila aurora','santa terezinha'
]), 'Norte'
ON CONFLICT (bairro) DO NOTHING;

INSERT INTO public.zonas_bairros (bairro, zona)
SELECT unnest(ARRAY[
  'vila mariana','saude','moema','jabaquara','ipiranga','sacoma','cursino',
  'vila das merces','santo amaro','campo belo','brooklin','campo grande',
  'socorro','cidade ademar','pedreira','interlagos','grajau','parelheiros',
  'cidade dutra','jardim angela','jardim sao luis','m boi mirim','campo limpo',
  'capao redondo','vila andrade','morumbi','paraiso','vila clementino',
  'planalto paulista','chacara klabin','klabin','vila mascote',
  'americanopolis','vila santa catarina','cidade vargas','vila guarani',
  'jardim aeroporto','alto da boa vista','chacara santo antonio',
  'granja julieta','jardim marajoara','veleiros','jardim sao savio'
]), 'Sul'
ON CONFLICT (bairro) DO NOTHING;

INSERT INTO public.zonas_bairros (bairro, zona)
SELECT unnest(ARRAY[
  'tatuape','mooca','bras','belem','belenzinho','pari','penha','vila matilde',
  'carrao','vila carrao','aricanduva','vila formosa','sapopemba',
  'vila prudente','sao lucas','vila zelina','vila alpina','itaquera',
  'jose bonifacio','parque do carmo','cidade lider','artur alvim',
  'arthur alvim','sao mateus','sao rafael','iguatemi','itaim paulista',
  'vila curuca','lajeado','guaianases','cidade tiradentes',
  'ermelino matarazzo','ponte rasa','sao miguel paulista','vila jacui',
  'jardim helena','cangaiba','vila esperanca','agua rasa',
  'jardim analia franco','analia franco','vila regente feijo','vila invernada',
  'jardim iguatemi','parque sao lucas','vila ema'
]), 'Leste'
ON CONFLICT (bairro) DO NOTHING;

INSERT INTO public.zonas_bairros (bairro, zona)
SELECT unnest(ARRAY[
  'pinheiros','lapa','perdizes','pompeia','vila pompeia','vila leopoldina',
  'jaguare','rio pequeno','butanta','vila sonia','raposo tavares',
  'alto de pinheiros','vila madalena','sumare','sumarezinho','barra funda',
  'agua branca','jaguara','vila jaguara','city lapa','alto da lapa',
  'jardim bonfiglioli','vila romana','pacaembu','jardim paulista','jardins',
  'itaim bibi','vila olimpia'
]), 'Oeste'
ON CONFLICT (bairro) DO NOTHING;

INSERT INTO public.zonas_bairros (bairro, zona)
SELECT unnest(ARRAY[
  'se','centro','republica','bela vista','bixiga','consolacao','liberdade',
  'cambuci','bom retiro','santa cecilia','higienopolis','aclimacao',
  'glicerio','luz','campos eliseos','santa ifigenia','vila buarque'
]), 'Centro'
ON CONFLICT (bairro) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) zona_do_bairro — resolve a zona a partir do texto do bairro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zona_do_bairro(_txt text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT zb.zona
  FROM public.zonas_bairros zb
  WHERE zb.bairro = regexp_replace(
    lower(btrim(translate(coalesce(_txt,''),
      'ÀÁÂÃÄÉÊÍÓÔÕÚÇàáâãäéêíóôõúç','AAAAAEEIOOOUCaaaaaeeiooouc'))),
    '\s+', ' ', 'g')
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.zona_do_bairro(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) zona_do_lead v2 — cascata: zona do lead → bairro do lead → projeto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zona_do_lead(_lead_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    public.zona_normalizar(l.zona),
    public.zona_do_bairro(l.bairro),
    (SELECT public.zona_normalizar(COALESCE(NULLIF(btrim(p.zona_smq), ''), p.regiao))
       FROM public.projetos p WHERE p.id = l.projeto_id)
  )
  FROM public.leads l WHERE l.id = _lead_id
$$;

GRANT EXECUTE ON FUNCTION public.zona_do_lead(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Trigger: materializa leads.zona no INSERT/UPDATE. O texto livre que
--    chega de webhook/form ("Zona leste", "quero perto do centro") vira o
--    valor canônico; o que não normaliza cai para o bairro; sem os dois,
--    NULL (o fallback do projeto continua dinâmico em zona_do_lead).
--    Zona explícita já normalizada nunca é sobrescrita por mudança de bairro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_resolver_zona()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.zona := COALESCE(public.zona_normalizar(NEW.zona), public.zona_do_bairro(NEW.bairro));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_resolver_zona_ins ON public.leads;
CREATE TRIGGER trg_leads_resolver_zona_ins
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_resolver_zona();

DROP TRIGGER IF EXISTS trg_leads_resolver_zona_upd ON public.leads;
CREATE TRIGGER trg_leads_resolver_zona_upd
  BEFORE UPDATE OF zona, bairro ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_resolver_zona();

-- Backfill: normaliza qualquer valor livre que já exista.
UPDATE public.leads
   SET zona = public.zona_normalizar(zona)
 WHERE zona IS NOT NULL
   AND zona IS DISTINCT FROM public.zona_normalizar(zona);

-- ---------------------------------------------------------------------------
-- 5) Motor v3 — fallback "qualquer apto" quando ninguém atende a zona, e
--    aviso (sem bloqueio) na atribuição manual fora da zona.
--    Corpo idêntico ao de 20260811180000 fora os trechos comentados.
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
  _slug := COALESCE(_roleta_slug, public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem));
  _zona := public.zona_do_lead(_lead_id);

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
    IF _zona IS NOT NULL AND array_length(_aptos_ids, 1) > 0 THEN
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
-- 6) Roleta ponderada (campanhas) — mesmo corte de zona do motor v3, com o
--    mesmo fallback. Corpo idêntico ao de 20260719123000 fora o bloco de zona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int;
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
-- 7) criar_lead_dedup — passa a aceitar zona/bairro no payload (whitelist).
--    Corpo idêntico ao de 20260720171415 fora os dois campos novos.
-- ---------------------------------------------------------------------------
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
  _zona text := NULLIF(btrim(_payload->>'zona'), '');
  _bairro text := NULLIF(btrim(_payload->>'bairro'), '');
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
    corretor_id, status, zona, bairro
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _status, _zona, _bairro
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_lead_dedup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lead_dedup(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n int;
BEGIN
  IF to_regprocedure('public.zona_do_bairro(text)') IS NULL THEN
    RAISE EXCEPTION 'zona_do_bairro ausente';
  END IF;
  IF to_regprocedure('public.zona_do_lead(uuid)') IS NULL THEN
    RAISE EXCEPTION 'zona_do_lead ausente';
  END IF;
  SELECT count(*) INTO _n FROM public.zonas_bairros;
  IF _n < 100 THEN
    RAISE EXCEPTION 'seed de zonas_bairros incompleto (% bairros)', _n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_resolver_zona_ins'
  ) THEN
    RAISE EXCEPTION 'trigger de resolução de zona ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
