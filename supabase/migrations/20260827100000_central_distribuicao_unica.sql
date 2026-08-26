-- ============================================================================
-- Central de Distribuição ÚNICA — escrita endurecida (2026-08-27)
--
-- A configuração das roletas vivia espalhada em 4 superfícies com contratos
-- diferentes: a Central (RPCs auditadas), o painel de Campanhas (INSERT/UPDATE
-- e CRUD de participantes por SQL direto, token gerado no CLIENTE), a página
-- de Pessoas (profiles.zonas por UPDATE direto) e o banco puro (chaves do
-- modelo v2 e campos de elegibilidade sem tela nenhuma).
--
-- Esta migration fecha os caminhos de escrita no banco; o commit de UI da
-- mesma entrega migra as telas para os RPCs. As duas partes vão no MESMO
-- deploy — o painel de Campanhas antigo depende das policies removidas aqui.
--
--  1) atualizar_roleta ganha equipe_fixa/projeto (DROP da assinatura velha:
--     overload de 6 e 9 args quebraria o PostgREST por ambiguidade);
--  2) criar_roleta_campanha — criação auditada com token gerado no SERVIDOR;
--  3) recalcular_tiers_roleta ganha guarda de papel (admin/gestor; cron
--     service_role preservado via auth.uid() IS NULL);
--  4) atualizar_corretor_distribuicao — campos de distribuição do corretor
--     (zonas, vínculo, onboarding, limite webhook) por RPC auditada;
--  5) RLS: roleta_participantes perde as policies de escrita direta do
--     cliente — TODA mudança de participação passa pelo RPC auditado.
--
-- Idempotente. Rollback das policies (se algum fluxo esquecido escrever
-- direto): recriar as 3 policies de 20260720180000_gestor_escopo_equipe_
-- hardening.sql linhas 25-39 (admin OR superintendente).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) atualizar_roleta — agora cobre TODAS as propriedades editáveis da fila,
--    inclusive as de campanha (equipe_fixa, projeto vinculado). NULL mantém.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.atualizar_roleta(text, boolean, boolean, text, text, boolean);

CREATE OR REPLACE FUNCTION public.atualizar_roleta(
  _slug text,
  _ativo boolean DEFAULT NULL,
  _exigir_presenca boolean DEFAULT NULL,
  _horario_inicio text DEFAULT NULL,
  _horario_fim text DEFAULT NULL,
  _permitir_fora_horario boolean DEFAULT NULL,
  _equipe_fixa boolean DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _limpar_projeto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(r) INTO _antes FROM public.roletas r WHERE r.slug = _slug;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  -- equipe_fixa/projeto são semântica de CAMPANHA — nas demais roletas o
  -- pedido é erro, não silêncio.
  IF (_equipe_fixa IS NOT NULL OR _projeto_id IS NOT NULL OR _limpar_projeto)
     AND (_antes->>'tipo') IS DISTINCT FROM 'campanha' THEN
    RAISE EXCEPTION 'equipe_fixa/projeto valem apenas para roletas de campanha';
  END IF;

  IF _projeto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto inexistente';
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
      ELSE r.projeto_id END
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

REVOKE ALL ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) criar_roleta_campanha — criação de campanha 100% no servidor: slug
--    normalizado e único, token via gen_random_bytes (nunca mais gerado no
--    navegador), INSERT auditado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_roleta_campanha(
  _nome text,
  _slug text DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _equipe_fixa boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _base text;
  _slug_final text;
  _n int := 1;
  _linha jsonb;
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

  -- Mesma regra de slug que vivia no cliente, agora no servidor (sem
  -- depender de unaccent: translate cobre os acentos do pt-BR).
  _base := left(
    btrim(BOTH '-' FROM regexp_replace(
      translate(lower(btrim(COALESCE(_slug, _nome))),
                'áàâãäéèêëíìîïóòôõöúùûüçñ',
                'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g')),
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
     tipo, equipe_fixa, projeto_id, webhook_token)
  VALUES
    (_slug_final, btrim(_nome),
     CASE WHEN _equipe_fixa
       THEN 'Campanha de equipe fixa — leads caem sempre neste time, sem corte por zona.'
       ELSE 'Campanha criada pela Central de Distribuição.' END,
     true, 'manual', true, 'campanha', COALESCE(_equipe_fixa, false), _projeto_id,
     encode(gen_random_bytes(24), 'hex'));

  SELECT to_jsonb(r) INTO _linha FROM public.roletas r WHERE r.slug = _slug_final;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('roletas', (_linha->>'id')::uuid, 'INSERT', _caller, NULL, _linha);

  RETURN jsonb_build_object('ok', true, 'roleta', _linha);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) recalcular_tiers_roleta — corpo fiel ao vigente (20260718000305) + guarda
--    de papel. `auth.uid() IS NOT NULL` preserva o cron semanal
--    (recalcular_tiers_todas roda como service_role, uid nulo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_tiers_roleta(_roleta_slug text, _gatilho text DEFAULT 'manual')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _roleta record; _media_ag numeric; _media_venda numeric;
  _p record; _tier_novo text; _tier_ant text; _score numeric;
  _tag numeric; _tv numeric; _comp_ag numeric; _comp_v numeric;
  _mudancas int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug;
  IF NOT FOUND THEN RETURN 0; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rt_metrics (
    corretor_id uuid, tier_atual text,
    leads_ag int, leads_venda int, ags int, vds int
  ) ON COMMIT DROP;
  TRUNCATE _rt_metrics;

  INSERT INTO _rt_metrics
  SELECT
    rp.corretor_id,
    rp.tier,
    COALESCE((
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.corretor_id = rp.corretor_id
        AND dl.roleta_slug = _roleta.slug
        AND dl.resultado = 'sucesso'
        AND dl.created_at > now() - (_roleta.janela_ag_dias || ' days')::interval
    ),0),
    COALESCE((
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.corretor_id = rp.corretor_id
        AND dl.roleta_slug = _roleta.slug
        AND dl.resultado = 'sucesso'
        AND dl.created_at > now() - (_roleta.janela_venda_dias || ' days')::interval
    ),0),
    COALESCE((
      SELECT count(*) FROM public.agendamentos a
        JOIN public.leads l ON l.id = a.lead_id
      WHERE a.corretor_id = rp.corretor_id
        AND l.roleta_slug = _roleta.slug
        AND a.created_at > now() - (_roleta.janela_ag_dias || ' days')::interval
    ),0),
    COALESCE((
      SELECT count(*) FROM public.vendas v
        JOIN public.leads l ON l.id = v.lead_id
      WHERE v.corretor_id = rp.corretor_id
        AND l.roleta_slug = _roleta.slug
        AND v.created_at > now() - (_roleta.janela_venda_dias || ' days')::interval
    ),0)
  FROM public.roleta_participantes rp
  WHERE rp.roleta_id = _roleta.id AND rp.ativo;

  -- Médias do time apenas com quem tem amostra
  SELECT
    AVG(CASE WHEN leads_ag    > 0 THEN ags::numeric / leads_ag    END),
    AVG(CASE WHEN leads_venda > 0 THEN vds::numeric / leads_venda END)
  INTO _media_ag, _media_venda
  FROM _rt_metrics WHERE leads_ag >= _roleta.amostra_minima;

  FOR _p IN SELECT * FROM _rt_metrics LOOP
    IF _p.leads_ag < _roleta.amostra_minima THEN
      _tier_novo := 'B';
      _score := 1.0;
    ELSE
      _tag := CASE WHEN _p.leads_ag    > 0 THEN _p.ags::numeric / _p.leads_ag    ELSE 0 END;
      _tv  := CASE WHEN _p.leads_venda > 0 THEN _p.vds::numeric / _p.leads_venda ELSE 0 END;
      _comp_ag := CASE WHEN COALESCE(_media_ag,0)    > 0 THEN _tag / _media_ag    ELSE 1.0 END;
      _comp_v  := CASE WHEN COALESCE(_media_venda,0) > 0 THEN _tv  / _media_venda ELSE 1.0 END;
      _score := _roleta.peso_agendamento * _comp_ag + _roleta.peso_venda * _comp_v;

      _tier_novo := CASE
        WHEN _score >= _roleta.threshold_a THEN 'A'
        WHEN _score <= _roleta.threshold_c THEN 'C'
        ELSE 'B'
      END;
    END IF;

    SELECT tier INTO _tier_ant FROM public.roleta_participantes
      WHERE roleta_id = _roleta.id AND corretor_id = _p.corretor_id;

    UPDATE public.roleta_participantes
       SET tier = _tier_novo,
           tier_score = _score,
           tier_updated_at = now(),
           leads_janela = _p.leads_ag,
           agendamentos_janela = _p.ags,
           vendas_janela = _p.vds
     WHERE roleta_id = _roleta.id AND corretor_id = _p.corretor_id;

    IF _tier_ant IS DISTINCT FROM _tier_novo THEN
      INSERT INTO public.roleta_tier_historico(
        roleta_id, corretor_id, tier_anterior, tier_novo, score,
        leads_janela, agendamentos_janela, vendas_janela, gatilho
      ) VALUES (
        _roleta.id, _p.corretor_id, _tier_ant, _tier_novo, _score,
        _p.leads_ag, _p.ags, _p.vds, _gatilho
      );
      _mudancas := _mudancas + 1;
    END IF;
  END LOOP;

  UPDATE public.roletas SET tiers_recalculados_em = now() WHERE id = _roleta.id;
  DROP TABLE IF EXISTS _rt_metrics;
  RETURN _mudancas;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_tiers_roleta(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.recalcular_tiers_roleta(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_tiers_roleta(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) atualizar_corretor_distribuicao — os campos de DISTRIBUIÇÃO do corretor
--    (zonas atendidas, vínculo fixo/autônomo, onboarding, limite de webhook)
--    saem do UPDATE direto de profiles e viram RPC auditada. O diff logado é
--    RESTRITO a esses campos — a linha inteira de profiles tem PII (telefone,
--    e-mail) que não precisa se espalhar pelo audit_log.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_corretor_distribuicao(
  _corretor_id uuid,
  _zonas text[] DEFAULT NULL,
  _modelo_contrato text DEFAULT NULL,
  _limpar_modelo_contrato boolean DEFAULT false,
  _onboarding_concluido boolean DEFAULT NULL,
  _limite_diario_webhook integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _antes
  FROM public.profiles p WHERE p.id = _corretor_id;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'corretor inexistente';
  END IF;

  IF _zonas IS NOT NULL
     AND NOT (_zonas <@ ARRAY['Norte','Sul','Leste','Oeste','Centro']::text[]) THEN
    RAISE EXCEPTION 'zona invalida (use Norte/Sul/Leste/Oeste/Centro)';
  END IF;

  IF _modelo_contrato IS NOT NULL AND _modelo_contrato NOT IN ('fixo','autonomo') THEN
    RAISE EXCEPTION 'modelo_contrato invalido (fixo|autonomo)';
  END IF;

  IF _limite_diario_webhook IS NOT NULL AND _limite_diario_webhook < 1 THEN
    RAISE EXCEPTION 'limite_diario_webhook deve ser >= 1';
  END IF;

  UPDATE public.profiles p SET
    zonas = COALESCE(_zonas, p.zonas),
    modelo_contrato = CASE
      WHEN _limpar_modelo_contrato THEN NULL
      WHEN _modelo_contrato IS NOT NULL THEN _modelo_contrato
      ELSE p.modelo_contrato END,
    onboarding_concluido_em = CASE
      WHEN _onboarding_concluido IS TRUE THEN COALESCE(p.onboarding_concluido_em, now())
      WHEN _onboarding_concluido IS FALSE THEN NULL
      ELSE p.onboarding_concluido_em END,
    limite_diario_webhook = COALESCE(_limite_diario_webhook, p.limite_diario_webhook)
  WHERE p.id = _corretor_id;

  SELECT jsonb_build_object(
           'zonas', p.zonas,
           'modelo_contrato', p.modelo_contrato,
           'onboarding_concluido_em', p.onboarding_concluido_em,
           'limite_diario_webhook', p.limite_diario_webhook)
    INTO _depois
  FROM public.profiles p WHERE p.id = _corretor_id;

  -- Sem mudança efetiva → sem linha na auditoria.
  IF _antes IS DISTINCT FROM _depois THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('profiles', _corretor_id, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'corretor', _depois);
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_corretor_distribuicao(uuid, text[], text, boolean, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_corretor_distribuicao(uuid, text[], text, boolean, boolean, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) RLS — roleta_participantes perde a escrita direta do cliente. Escritores
--    verificados antes do drop: nenhuma edge function toca a tabela, o motor
--    e o cron são SECURITY DEFINER, o webhook entra por service key, e o
--    único caminho client-side (painel de Campanhas) migra para o RPC neste
--    mesmo deploy. gerenciar_participante_roleta já era o contrato auditado.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "gestao gerencia participantes ins" ON public.roleta_participantes;
DROP POLICY IF EXISTS "gestao gerencia participantes upd" ON public.roleta_participantes;
DROP POLICY IF EXISTS "gestao gerencia participantes del" ON public.roleta_participantes;

-- ---------------------------------------------------------------------------
-- 6) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.atualizar_roleta(text, boolean, boolean, text, text, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'assinatura antiga de atualizar_roleta ainda existe — overload quebraria o PostgREST';
  END IF;
  IF to_regprocedure('public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'atualizar_roleta estendida ausente';
  END IF;
  IF to_regprocedure('public.criar_roleta_campanha(text, text, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'criar_roleta_campanha ausente';
  END IF;
  IF to_regprocedure('public.atualizar_corretor_distribuicao(uuid, text[], text, boolean, boolean, integer)') IS NULL THEN
    RAISE EXCEPTION 'atualizar_corretor_distribuicao ausente';
  END IF;
  IF position('gen_random_bytes' IN pg_get_functiondef(
       'public.criar_roleta_campanha(text, text, uuid, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'criar_roleta_campanha sem token gerado no servidor';
  END IF;
  IF position('forbidden' IN pg_get_functiondef(
       'public.recalcular_tiers_roleta(text, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'recalcular_tiers_roleta sem guarda de papel';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roleta_participantes'
      AND policyname IN ('gestao gerencia participantes ins',
                         'gestao gerencia participantes upd',
                         'gestao gerencia participantes del')
  ) THEN
    RAISE EXCEPTION 'policies de escrita direta em roleta_participantes ainda existem';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
