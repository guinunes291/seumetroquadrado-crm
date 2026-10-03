-- ============================================================================
-- ZONA ESTRITA — parte 1/2: UMA zona do lead e UMA região do corretor
-- ============================================================================
-- Decisão do dono (03/10/2026): "Um corretor deve receber leads de qualquer
-- origem apenas da sua região de atuação." A regra vale para TODA entrega de
-- lead a corretor — roleta, campanha (inclusive equipe fixa), base, repasse
-- por SLA, Bolsão, Discador, lote de prospecção, SDR, carteira e transferência.
--
-- Esta parte acaba com as DUAS ambiguidades que deixavam lead vazar de zona:
--
-- 1) Havia duas regras de "zona do lead":
--      * a da distribuição (zona_do_lead): só as cinco zonas da capital — o
--        lead do Next Guarulhos ou de um projeto do ABC ficava SEM zona e caía
--        no Plantão, para qualquer corretor;
--      * a da vitrine/lote (_prospeccao_zona_do_lead): ABC = Sul (decisão de
--        28/09) e Grande SP como 6ª zona.
--    Agora há UMA regra (`_zona_do_lead_campos`), a da vitrine, usada pelo
--    motor, pelo lote, pelo Bolsão e pela guarda. Ordem: zona do próprio lead
--    (texto livre canonizado) → bairro do lead → empreendimento.
--
-- 2) Havia duas "regiões do corretor" que podiam discordar:
--      * profiles.zonas (aba Corretores, VAZIO = "recebe de todas");
--      * participação nas roletas de zona (aba Filas).
--    Agora a região é UMA: a participação ATIVA nas roletas de zona (a decisão
--    de 16/08, "a roleta É a zona"). profiles.zonas vira ESPELHO mantido pelo
--    banco — qualquer escrita direta é recalculada — e a aba Corretores passa
--    a editar a participação. Sem participação = sem região = só recebe lead
--    SEM zona. Não existe mais "vazio = todas": quem atende tudo é marcado
--    nas seis zonas, explicitamente.
--
-- Centro e Grande SP ganham roleta própria (zona-centro, zona-grande-sp):
-- toda zona precisa de um time, porque lead de zona não sai mais da zona.
--
-- Backfill (sem encolher a região declarada de ninguém): quem tinha zona em
-- profiles.zonas e NUNCA participou da roleta daquela zona entra nela (log
-- 'incluido', motivo explícito). Quem foi REMOVIDO da roleta pela gestão não
-- volta — a remoção é o ato mais específico. Toda mudança de profiles.zonas
-- feita aqui vai para audit_log com o valor antigo.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) As seis zonas, na ordem dos chips.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._zonas_canonicas()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT ARRAY['Norte','Sul','Leste','Oeste','Centro','Grande SP']::text[];
$$;

GRANT EXECUTE ON FUNCTION public._zonas_canonicas() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) zona_canonica — texto livre de zona/região ("Zona Leste", "ZL", "ABC",
--    "Guarulhos", "Grande SP") para uma das seis zonas, ou NULL.
--    ABC vem antes de tudo (decisão de 28/09: ABC conta como Zona Sul); depois
--    a Grande SP (para "Centro de Guarulhos" não virar Centro); por fim as
--    cinco zonas da capital pela mesma zona_normalizar de sempre.
--    "Vila Mauá" é bairro da capital: _zona_eh_abc já o exclui, e aqui ele
--    também não vira Grande SP (o município "Mauá" casaria por palavra).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zona_canonica(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN k = '' THEN NULL
    WHEN public._zona_eh_abc(_txt) THEN 'Sul'
    WHEN k IN ('grande sp', 'grande sao paulo') THEN 'Grande SP'
    WHEN k !~ '(^| )vila maua( |$)' AND public._zona_eh_grande_sp(_txt) THEN 'Grande SP'
    ELSE public.zona_normalizar(_txt)
  END
  FROM (SELECT public._zona_chave(_txt) AS k) AS t;
$$;

GRANT EXECUTE ON FUNCTION public.zona_canonica(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) _zona_do_lead_campos — A regra única. Recebe os campos (e não o id) para
--    a guarda poder avaliar a linha NEW de um INSERT/UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._zona_do_lead_campos(_zona text, _bairro text, _projeto_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Bairro: a tabela zonas_bairros manda; fora dela, só o que aponta para
  -- fora da capital (ABC → Sul, "Ponte Grande (Guarulhos)" → Grande SP) —
  -- zona_canonica, sem o degrau das cinco zonas (bairro "Jardim Sul" não é
  -- Zona Sul).
  SELECT COALESCE(
    -- Atalho: leads.zona já vem canônica do trigger; regex só no texto livre.
    CASE WHEN _zona = ANY (public._zonas_canonicas()) THEN _zona
         ELSE public.zona_canonica(_zona) END,
    public.zona_do_bairro(_bairro),
    CASE WHEN public.zona_canonica(_bairro) IN ('Sul', 'Grande SP')
              AND (public._zona_eh_abc(_bairro) OR public._zona_eh_grande_sp(_bairro))
         THEN public.zona_canonica(_bairro) END,
    (SELECT public._zona_do_projeto(p.zona_smq, p.regiao, p.cidade, p.bairro)
       FROM public.projetos p WHERE p.id = _projeto_id)
  );
$$;

REVOKE ALL ON FUNCTION public._zona_do_lead_campos(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._zona_do_lead_campos(text, text, uuid) TO authenticated, service_role;

-- zona_do_lead: mesma assinatura de sempre (motor, telas e relatórios usam),
-- agora pela regra única.
CREATE OR REPLACE FUNCTION public.zona_do_lead(_lead_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id)
  FROM public.leads l WHERE l.id = _lead_id
$$;

GRANT EXECUTE ON FUNCTION public.zona_do_lead(uuid) TO authenticated, service_role;

-- O lote e o Bolsão usam a MESMA regra (antes eram uma cópia que já tinha
-- divergido da distribuição).
CREATE OR REPLACE FUNCTION public._prospeccao_zona_do_lead(l public.leads)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id);
$$;

-- O trigger que materializa leads.zona também passa a entender ABC e Grande
-- SP ("Guarulhos" no formulário deixava de ser informação e virava NULL).
CREATE OR REPLACE FUNCTION public.leads_resolver_zona()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mesma cascata de _zona_do_lead_campos, sem o degrau do empreendimento
  -- (esse continua dinâmico: o projeto pode ganhar zona depois).
  NEW.zona := public._zona_do_lead_campos(NEW.zona, NEW.bairro, NULL);
  RETURN NEW;
END;
$$;

-- Grande SP vira zona de primeira classe também nos mapas editáveis.
ALTER TABLE public.zonas_bairros DROP CONSTRAINT IF EXISTS zonas_bairros_zona_check;
ALTER TABLE public.zonas_bairros
  ADD CONSTRAINT zonas_bairros_zona_check
  CHECK (zona IN ('Norte','Sul','Leste','Oeste','Centro','Grande SP'));

ALTER TABLE public.zonas_roletas DROP CONSTRAINT IF EXISTS zonas_roletas_zona_check;
ALTER TABLE public.zonas_roletas
  ADD CONSTRAINT zonas_roletas_zona_check
  CHECK (zona IN ('Norte','Sul','Leste','Oeste','Centro','Grande SP'));

-- Backfill: zona livre já gravada que agora canoniza (ex.: "Guarulhos").
UPDATE public.leads
   SET zona = public.zona_canonica(zona)
 WHERE zona IS NOT NULL
   AND public.zona_canonica(zona) IS NOT NULL
   AND zona IS DISTINCT FROM public.zona_canonica(zona);

-- ---------------------------------------------------------------------------
-- 3) Toda zona tem roleta: Centro e Grande SP entram (vazias — a gestão monta
--    o time na Central). Replay preserva token e nome já ajustados.
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, criterio_participacao, exigir_presenca, tipo, webhook_token)
VALUES
  ('zona-centro', 'Roleta Centro',
   'Equipe do Centro — participação manual definida pela gestão; leads com zona Centro caem aqui.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex')),
  ('zona-grande-sp', 'Roleta Grande SP',
   'Equipe da Grande SP (Guarulhos, Osasco e demais municípios fora da capital; ABC conta como Zona Sul) — participação manual definida pela gestão.',
   'manual', true, 'zona', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (slug) DO UPDATE
  SET tipo = 'zona',
      criterio_participacao = 'manual',
      webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token);

INSERT INTO public.zonas_roletas (zona, roleta_slug) VALUES
  ('Centro', 'zona-centro'),
  ('Grande SP', 'zona-grande-sp')
ON CONFLICT (zona) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) A região do corretor = participação ATIVA nas roletas de zona (pausa não
--    tira região; remoção tira).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._zonas_da_regiao(_corretor uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT zr.zona ORDER BY zr.zona)
      FILTER (WHERE zr.zona IS NOT NULL), ARRAY[]::text[])
  FROM public.roleta_participantes rp
  JOIN public.roletas r ON r.id = rp.roleta_id
  JOIN public.zonas_roletas zr ON zr.roleta_slug = r.slug
  WHERE rp.corretor_id = _corretor
    AND rp.ativo;
$$;

-- Ordem dos chips (Norte, Sul, Leste, Oeste, Centro, Grande SP) — o
-- array_agg acima ordena alfabeticamente; a ordem de exibição sai daqui.
CREATE OR REPLACE FUNCTION public.regiao_do_corretor(_corretor uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(z ORDER BY array_position(public._zonas_canonicas(), z)), ARRAY[]::text[])
  FROM unnest(public._zonas_da_regiao(_corretor)) AS z;
$$;

REVOKE ALL ON FUNCTION public._zonas_da_regiao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._zonas_da_regiao(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.regiao_do_corretor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regiao_do_corretor(uuid) TO authenticated, service_role;

-- O predicado ÚNICO da regra. Lead sem zona (não dá para saber de onde é)
-- não fere a região de ninguém. Lê o espelho profiles.zonas (barato: entra em
-- filtros sobre o Bolsão inteiro); o espelho é mantido pelos triggers abaixo.
CREATE OR REPLACE FUNCTION public.corretor_atende_zona(_corretor uuid, _zona text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _zona IS NULL
      OR EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = _corretor AND _zona = ANY (p.zonas));
$$;

REVOKE ALL ON FUNCTION public.corretor_atende_zona(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corretor_atende_zona(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Backfill da região — ANTES dos triggers de espelho, para que o valor
--    antigo de profiles.zonas ainda esteja lá para ser lido.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  _p record;
  _z text;
  _roleta_id uuid;
  _n int := 0;
BEGIN
  FOR _p IN
    SELECT p.id, p.zonas
      FROM public.profiles p
     WHERE COALESCE(array_length(p.zonas, 1), 0) > 0
       AND p.ativo
       AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role)
  LOOP
    FOREACH _z IN ARRAY _p.zonas LOOP
      SELECT r.id INTO _roleta_id
        FROM public.zonas_roletas zr
        JOIN public.roletas r ON r.slug = zr.roleta_slug
       WHERE zr.zona = public.zona_canonica(_z);
      CONTINUE WHEN _roleta_id IS NULL;
      -- Linha existente (ativa OU removida pela gestão) fica como está.
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.roleta_participantes rp
                             WHERE rp.roleta_id = _roleta_id AND rp.corretor_id = _p.id);
      INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
      VALUES (_roleta_id, _p.id, true);
      INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
      VALUES (_roleta_id, _p.id, 'incluido',
              'Região única (out/2026): zona declarada no cadastro do corretor (profiles.zonas)', NULL);
      _n := _n + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'zona estrita: % participações de zona criadas a partir de profiles.zonas', _n;
END;
$backfill$;

-- Espelho inicial, com o valor antigo em audit_log (nada some sem rastro).
INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
SELECT 'profiles', p.id, 'UPDATE', NULL,
       jsonb_build_object('zonas', p.zonas),
       jsonb_build_object('zonas', public.regiao_do_corretor(p.id),
                          'motivo', 'zona_estrita: região = participação nas roletas de zona')
  FROM public.profiles p
 WHERE p.zonas IS DISTINCT FROM public.regiao_do_corretor(p.id);

UPDATE public.profiles p
   SET zonas = public.regiao_do_corretor(p.id)
 WHERE p.zonas IS DISTINCT FROM public.regiao_do_corretor(p.id);

-- ---------------------------------------------------------------------------
-- 6) Espelho: profiles.zonas é DERIVADO. Qualquer INSERT/UPDATE que toque a
--    coluna é recalculado (fecha também o furo de o corretor editar a própria
--    região pela API — protect_profile_sensitive_fields não cobria zonas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_profiles_zonas_espelho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.zonas := public.regiao_do_corretor(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_zonas_espelho ON public.profiles;
CREATE TRIGGER trg_profiles_zonas_espelho
  BEFORE INSERT OR UPDATE OF zonas ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_zonas_espelho();

CREATE OR REPLACE FUNCTION public._sincronizar_zonas_corretor(_corretor uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.profiles p
     SET zonas = public.regiao_do_corretor(p.id)
   WHERE p.id = _corretor
     AND p.zonas IS DISTINCT FROM public.regiao_do_corretor(p.id);
$$;

REVOKE ALL ON FUNCTION public._sincronizar_zonas_corretor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sincronizar_zonas_corretor(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_roleta_participantes_regiao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public._sincronizar_zonas_corretor(NEW.corretor_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND (TG_OP = 'DELETE' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    PERFORM public._sincronizar_zonas_corretor(OLD.corretor_id);
  END IF;
  RETURN NULL;
END;
$$;

-- Só mudanças de PARTICIPAÇÃO disparam (o cursor ultimo_lead_em/wrr_current
-- muda a cada lead e não pode pagar este custo).
DROP TRIGGER IF EXISTS trg_roleta_participantes_regiao ON public.roleta_participantes;
CREATE TRIGGER trg_roleta_participantes_regiao
  AFTER INSERT OR DELETE OR UPDATE OF ativo, roleta_id, corretor_id ON public.roleta_participantes
  FOR EACH ROW EXECUTE FUNCTION public.tg_roleta_participantes_regiao();

CREATE OR REPLACE FUNCTION public.tg_zonas_roletas_regiao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.profiles p
     SET zonas = public.regiao_do_corretor(p.id)
   WHERE p.zonas IS DISTINCT FROM public.regiao_do_corretor(p.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_zonas_roletas_regiao ON public.zonas_roletas;
CREATE TRIGGER trg_zonas_roletas_regiao
  AFTER INSERT OR UPDATE OR DELETE ON public.zonas_roletas
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_zonas_roletas_regiao();

-- ---------------------------------------------------------------------------
-- 7) Aba Corretores: o editor de zonas passa a editar a PARTICIPAÇÃO nas
--    roletas de zona (a região é uma só). Assinatura e demais campos
--    idênticos à versão de 20260916190056.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_corretor_distribuicao(
  _corretor_id uuid,
  _zonas text[] DEFAULT NULL::text[],
  _modelo_contrato text DEFAULT NULL::text,
  _limpar_modelo_contrato boolean DEFAULT false,
  _onboarding_concluido boolean DEFAULT NULL::boolean,
  _limite_diario_webhook integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
  _desejadas text[];
  _zr record;
  _tem boolean;
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

    FOR _zr IN
      SELECT zr.zona, r.id AS roleta_id
        FROM public.zonas_roletas zr
        JOIN public.roletas r ON r.slug = zr.roleta_slug
    LOOP
      SELECT EXISTS (SELECT 1 FROM public.roleta_participantes rp
                      WHERE rp.roleta_id = _zr.roleta_id AND rp.corretor_id = _corretor_id
                        AND rp.ativo)
        INTO _tem;
      IF _zr.zona = ANY (_desejadas) AND NOT _tem THEN
        INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
        VALUES (_zr.roleta_id, _corretor_id, true, _caller)
        ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
          ativo = true, pausado_ate = NULL, motivo_pausa = NULL,
          incluido_por = _caller, incluido_em = now();
        INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
        VALUES (_zr.roleta_id, _corretor_id, 'incluido', 'Região de atuação (aba Corretores)', _caller);
      ELSIF NOT (_zr.zona = ANY (_desejadas)) AND _tem THEN
        UPDATE public.roleta_participantes
           SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
         WHERE roleta_id = _zr.roleta_id AND corretor_id = _corretor_id;
        INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
        VALUES (_zr.roleta_id, _corretor_id, 'removido', 'Região de atuação (aba Corretores)', _caller);
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
$function$;

REVOKE ALL ON FUNCTION public.atualizar_corretor_distribuicao(uuid, text[], text, boolean, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_corretor_distribuicao(uuid, text[], text, boolean, boolean, integer) TO authenticated, service_role;
