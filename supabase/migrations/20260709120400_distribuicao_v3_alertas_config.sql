-- ============================================================================
-- Distribuição v3 — passo 4/4: CONFIGURAÇÕES ADMIN + ALERTAS INTELIGENTES.
--
--   • atualizar_roleta / atualizar_distribuicao_config — escrita de config
--     exclusiva de admin, com trilha no audit_log (a UI de Configurações da
--     central usa estes RPCs; as tabelas não têm policy de escrita direta);
--   • alertas: roleta ativa sem corretor apto (15 min), lead sem atendimento
--     acima do tempo máximo (10 min) e volume desproporcional (diário) —
--     todos deduplicados por alerta não lido (nunca spam).
--     (Exceção criada e origem não mapeada já alertam inline no motor.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) atualizar_roleta — NULL mantém o valor; horários '' limpam a janela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_roleta(
  _slug text,
  _ativo boolean DEFAULT NULL,
  _exigir_presenca boolean DEFAULT NULL,
  _horario_inicio text DEFAULT NULL,
  _horario_fim text DEFAULT NULL,
  _permitir_fora_horario boolean DEFAULT NULL
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
    permitir_fora_horario = COALESCE(_permitir_fora_horario, r.permitir_fora_horario)
  WHERE r.slug = _slug;

  SELECT to_jsonb(r) INTO _depois FROM public.roletas r WHERE r.slug = _slug;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('roletas', (_depois->>'id')::uuid, 'UPDATE', _caller, _antes, _depois);

  RETURN jsonb_build_object('ok', true, 'roleta', _depois);
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) atualizar_distribuicao_config — mapeamento origem→roleta e tempos.
--    Flags explícitas para "limpar" (NULL = manter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_distribuicao_config(
  _origem public.lead_origem,
  _roleta_slug text DEFAULT NULL,
  _limpar_roleta boolean DEFAULT false,
  _timeout_horas integer DEFAULT NULL,
  _timeout_minutos integer DEFAULT NULL,
  _limpar_timeout_minutos boolean DEFAULT false,
  _sla_minutos integer DEFAULT NULL
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

  IF _roleta_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.roletas WHERE slug = _roleta_slug) THEN
    RAISE EXCEPTION 'roleta % inexistente', _roleta_slug;
  END IF;

  SELECT to_jsonb(c) INTO _antes FROM public.distribuicao_config c WHERE c.origem = _origem;

  INSERT INTO public.distribuicao_config (origem) VALUES (_origem)
  ON CONFLICT (origem) DO NOTHING;

  UPDATE public.distribuicao_config c SET
    roleta_slug = CASE WHEN _limpar_roleta THEN NULL ELSE COALESCE(_roleta_slug, c.roleta_slug) END,
    timeout_horas = COALESCE(_timeout_horas, c.timeout_horas),
    timeout_minutos = CASE WHEN _limpar_timeout_minutos THEN NULL ELSE COALESCE(_timeout_minutos, c.timeout_minutos) END,
    sla_minutos = COALESCE(_sla_minutos, c.sla_minutos),
    updated_at = now()
  WHERE c.origem = _origem;

  SELECT to_jsonb(c) INTO _depois FROM public.distribuicao_config c WHERE c.origem = _origem;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('distribuicao_config', gen_random_uuid(), 'UPDATE', _caller, _antes, _depois);

  RETURN jsonb_build_object('ok', true, 'config', _depois);
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_distribuicao_config(public.lead_origem, text, boolean, integer, integer, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_distribuicao_config(public.lead_origem, text, boolean, integer, integer, boolean, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Alerta: roleta ativa sem corretor apto (cron 15 min, dentro do horário).
--    Dedupe: 1 alerta não lido por roleta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alertar_roletas_sem_apto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
  _aptos int;
  _agora time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  _dentro boolean;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.alertar_roletas_sem_apto() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Alerta: lead sem atendimento acima do tempo máximo (cron 10 min).
--    Notifica o corretor responsável (quem precisa agir) + gestores.
--    Dedupe: 1 alerta não lido por lead/usuário.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alertar_leads_sem_atendimento()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_min int := (public.get_dist_setting('max_minutos_sem_atendimento') #>> '{}')::int;
BEGIN
  -- Corretor responsável
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id, 'distribuicao'::alerta_tipo,
         'Lead sem atendimento: ' || l.nome,
         'Aguardando atendimento há mais de ' || _max_min || ' min. Inicie o atendimento para não perder o lead.',
         '/leads/' || l.id, l.id
  FROM public.leads l
  WHERE l.status = 'aguardando_atendimento'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.corretor_id IS NOT NULL
    AND COALESCE(l.data_distribuicao, l.created_at) < now() - (_max_min || ' minutes')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.user_id = l.corretor_id AND a.tipo = 'distribuicao'
        AND a.ref_id = l.id AND a.lida = false
    );

  -- Gestores (resumo por lead, mesmo dedupe)
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT DISTINCT ur.user_id, 'distribuicao'::alerta_tipo,
         'Lead sem atendimento: ' || l.nome,
         'Com ' || coalesce(p.nome, 'corretor') || ' há mais de ' || _max_min || ' min sem atendimento.',
         '/leads/' || l.id, l.id
  FROM public.leads l
  JOIN public.profiles p ON p.id = l.corretor_id
  CROSS JOIN public.user_roles ur
  WHERE ur.role IN ('admin','gestor')
    AND l.status = 'aguardando_atendimento'
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.corretor_id IS NOT NULL
    AND COALESCE(l.data_distribuicao, l.created_at) < now() - (_max_min || ' minutes')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.user_id = ur.user_id AND a.tipo = 'distribuicao'
        AND a.ref_id = l.id AND a.lida = false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.alertar_leads_sem_atendimento() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Alerta: volume desproporcional (cron diário ao fim da tarde).
--    Corretor com > 2× a média do dia e ≥ 5 leads → gestores investigam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alertar_volume_desproporcional()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _media numeric;
  _r record;
BEGIN
  SELECT avg(n) INTO _media FROM (
    SELECT count(*) AS n
    FROM public.distribution_log dl
    WHERE dl.resultado = 'sucesso'
      AND dl.corretor_id IS NOT NULL
      AND (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = _hoje
    GROUP BY dl.corretor_id
  ) t;

  IF _media IS NULL OR _media = 0 THEN RETURN; END IF;

  FOR _r IN
    SELECT dl.corretor_id, count(*) AS n
    FROM public.distribution_log dl
    WHERE dl.resultado = 'sucesso'
      AND dl.corretor_id IS NOT NULL
      AND (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = _hoje
    GROUP BY dl.corretor_id
    HAVING count(*) >= 5 AND count(*) > 2 * _media
  LOOP
    PERFORM public._alertar_gestores_distribuicao(
      'Volume desproporcional de leads',
      coalesce((SELECT nome FROM public.profiles WHERE id = _r.corretor_id), 'Corretor')
        || ' recebeu ' || _r.n || ' leads hoje (média da equipe: ' || round(_media, 1) || ').',
      _r.corretor_id,
      '/distribuicao?tab=historico');
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.alertar_volume_desproporcional() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Crons (upsert por nome, padrão do repo)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-roletas-vazias') THEN
    PERFORM cron.unschedule('alertar-roletas-vazias');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-sem-atendimento') THEN
    PERFORM cron.unschedule('alertar-sem-atendimento');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-volume-desproporcional') THEN
    PERFORM cron.unschedule('alertar-volume-desproporcional');
  END IF;
END $$;

SELECT cron.schedule('alertar-roletas-vazias', '*/15 * * * *',
  $$SELECT public.alertar_roletas_sem_apto();$$);
SELECT cron.schedule('alertar-sem-atendimento', '*/10 * * * *',
  $$SELECT public.alertar_leads_sem_atendimento();$$);
-- 21:00 UTC = 18:00 BRT
SELECT cron.schedule('alertar-volume-desproporcional', '0 21 * * *',
  $$SELECT public.alertar_volume_desproporcional();$$);

NOTIFY pgrst, 'reload schema';
