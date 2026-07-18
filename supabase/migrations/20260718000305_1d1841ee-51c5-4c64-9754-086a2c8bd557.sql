
-- 1) roletas: liberar slugs de campanha e adicionar metadados
ALTER TABLE public.roletas DROP CONSTRAINT IF EXISTS roletas_slug_check;

ALTER TABLE public.roletas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'campanha',
  ADD COLUMN IF NOT EXISTS webhook_token text,
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS peso_agendamento numeric NOT NULL DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS peso_venda numeric NOT NULL DEFAULT 0.60,
  ADD COLUMN IF NOT EXISTS threshold_a numeric NOT NULL DEFAULT 1.15,
  ADD COLUMN IF NOT EXISTS threshold_c numeric NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS janela_ag_dias int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS janela_venda_dias int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS amostra_minima int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS peso_tier_a int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS peso_tier_b int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS peso_tier_c int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tiers_recalculados_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS roletas_webhook_token_uidx
  ON public.roletas(webhook_token) WHERE webhook_token IS NOT NULL;

UPDATE public.roletas SET tipo='sistema' WHERE slug IN ('plantao','marquinhos','landing');

-- 2) participantes: tier, score, snapshot e cursor de SWRR
ALTER TABLE public.roleta_participantes
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS tier_score numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS tier_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS leads_janela int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agendamentos_janela int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendas_janela int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wrr_current int NOT NULL DEFAULT 0;

ALTER TABLE public.roleta_participantes
  DROP CONSTRAINT IF EXISTS roleta_participantes_tier_check;
ALTER TABLE public.roleta_participantes
  ADD CONSTRAINT roleta_participantes_tier_check CHECK (tier IN ('A','B','C'));

-- 3) histórico de tier
CREATE TABLE IF NOT EXISTS public.roleta_tier_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roleta_id uuid NOT NULL REFERENCES public.roletas(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_anterior text,
  tier_novo text NOT NULL,
  score numeric NOT NULL,
  leads_janela int NOT NULL DEFAULT 0,
  agendamentos_janela int NOT NULL DEFAULT 0,
  vendas_janela int NOT NULL DEFAULT 0,
  gatilho text NOT NULL DEFAULT 'cron',
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.roleta_tier_historico TO authenticated;
GRANT ALL ON public.roleta_tier_historico TO service_role;

ALTER TABLE public.roleta_tier_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestao ve tier hist" ON public.roleta_tier_historico;
CREATE POLICY "gestao ve tier hist"
  ON public.roleta_tier_historico FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'superintendente'::app_role)
    OR corretor_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_tier_hist_roleta ON public.roleta_tier_historico(roleta_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tier_hist_corretor ON public.roleta_tier_historico(corretor_id, criado_em DESC);

-- 4) leads.roleta_slug — memória da campanha para redistribuição SLA
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS roleta_slug text;
CREATE INDEX IF NOT EXISTS idx_leads_roleta_slug
  ON public.leads(roleta_slug) WHERE roleta_slug IS NOT NULL;

-- 5) Seed das 7 novas roletas de campanha + token na landing (fallback)
DO $$
DECLARE _campanhas jsonb := '[
  {"slug":"longitude-tucuruvi",   "nome":"Longitude Tucuruvi"},
  {"slug":"well-perdizes",        "nome":"Well Perdizes"},
  {"slug":"ma-vila-prudente",     "nome":"MA Vila Prudente"},
  {"slug":"jardim-bf",            "nome":"Jardim BF"},
  {"slug":"ma-voluntarios-patria","nome":"MA Voluntários da Pátria"},
  {"slug":"vibra-sabara",         "nome":"Vibra Sabará"},
  {"slug":"lior-lavvi",           "nome":"Lior by Lavvi"}
]'::jsonb;
  _row jsonb;
BEGIN
  FOR _row IN SELECT * FROM jsonb_array_elements(_campanhas) LOOP
    INSERT INTO public.roletas(slug, nome, ativo, criterio_participacao, exigir_presenca, tipo, webhook_token)
    VALUES (_row->>'slug', _row->>'nome', true, 'manual', true, 'campanha', encode(gen_random_bytes(24),'hex'))
    ON CONFLICT (slug) DO UPDATE
      SET nome = EXCLUDED.nome,
          tipo = 'campanha',
          webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token);
  END LOOP;

  -- landing recebe token para servir de fallback pelo próprio endpoint de campanha
  UPDATE public.roletas
     SET webhook_token = COALESCE(webhook_token, encode(gen_random_bytes(24),'hex'))
   WHERE slug = 'landing';
END $$;

-- 6) RPC: distribuir lead pela roleta ponderada por tier (smooth weighted round-robin)
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _roleta record; _picked uuid; _tier_picked text; _sum_pesos int;
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

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

  -- Atribui o lead
  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = 'em_atendimento',
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
    'tier', _tier_picked, 'roleta_slug', _roleta.slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.distribuir_lead_ponderado(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_ponderado(uuid, text) TO service_role;

-- 7) RPC: recalcular tiers de uma roleta
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

-- 8) Recalcula todas as campanhas
CREATE OR REPLACE FUNCTION public.recalcular_tiers_todas(_gatilho text DEFAULT 'cron')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _r record; _total int := 0;
BEGIN
  FOR _r IN SELECT slug FROM public.roletas WHERE tipo='campanha' AND ativo LOOP
    _total := _total + public.recalcular_tiers_roleta(_r.slug, _gatilho);
  END LOOP;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_tiers_todas(text) FROM public;
GRANT EXECUTE ON FUNCTION public.recalcular_tiers_todas(text) TO service_role;

-- 9) SLA: quando o lead veio de campanha, redistribui dentro dela
CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _lead record; _res jsonb; _qtd int := 0; _anterior uuid; _novo uuid;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao, l.roleta_slug,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             COALESCE(l.tentativas_redistribuicao, 0) AS tentativas,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL AND l.data_distribuicao IS NOT NULL
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.distribuicao_excecoes e
          WHERE e.lead_id = l.id AND e.status IN ('pendente','em_analise')
            AND e.tentativas >= _max_tent AND e.updated_at > now() - interval '30 minutes'
        )
    )
    SELECT id, corretor_id, data_distribuicao, roleta_slug, timeout_horas, tentativas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    IF _lead.tentativas >= 2 THEN
      PERFORM public._escalar_lead_gestor(_lead.id, _lead.tentativas);
      CONTINUE;
    END IF;

    _anterior := _lead.corretor_id;

    UPDATE public.leads
       SET corretores_que_tentaram = array_append(
             COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    -- Campanha do lead → SLA dentro da mesma equipe
    IF _lead.roleta_slug IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _lead.roleta_slug AND r.tipo='campanha')
    THEN
      _res := public.distribuir_lead_ponderado(_lead.id, _lead.roleta_slug);
    ELSE
      _res := public._distribuir_lead_v3(
        _lead.id, 'redistribuicao', NULL, NULL, NULL, 'lead_parado',
        jsonb_build_object('timeout_horas', _lead.timeout_horas,
                           'corretor_anterior_parado', _anterior));
    END IF;

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id
       RETURNING corretor_id INTO _novo;

      IF _novo IS NOT NULL AND _novo <> _anterior THEN
        PERFORM public._auditar_redistribuicao(
          _lead.id, _anterior, _novo,
          'SLA/redistribuição ('||COALESCE(_lead.roleta_slug,'geral')||')');
      END IF;

      _qtd := _qtd + 1;
    END IF;
  END LOOP;

  RETURN _qtd;
END;
$function$;

-- 10) Cron: recálculo semanal (segunda 08:00 SP = 11:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('recalc-tiers-roletas-weekly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalc-tiers-roletas-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'recalc-tiers-roletas-weekly',
  '0 11 * * 1',
  $$SELECT public.recalcular_tiers_todas('cron')$$
);
