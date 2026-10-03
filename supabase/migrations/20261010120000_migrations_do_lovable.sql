-- ============================================================================
-- Migrations que o PRÓPRIO Lovable criou e aplicou em produção, trazidas para
-- o replay do CI
-- ============================================================================
-- O Lovable aplica em produção o que está em drizzle/migrations; o CI aplica
-- supabase/migrations do zero. Migrations que nasceram no chat do Lovable
-- (commits do gpt-engineer-app[bot]) existem SÓ em drizzle/ — o CI testava um
-- schema diferente do de produção: sem a comissão por tier (tabela, funções e
-- trigger em vendas), com a visita marcada pelo corretor ainda passando pela
-- roleta do SDR.
--
--   drizzle/migrations/0013_vendas_total_empresa.sql            (25/09)
--   drizzle/migrations/0015_comissao_tier_esteira.sql            (28/09)
--   drizzle/migrations/0022_corretor_agenda_nao_vira_lead_sdr.sql (29/09)
--   drizzle/migrations/0037_leads_funil_registros_v1.sql         (29/09)
--
-- (A 0044, origem "portal", já entrou em 20261009120500.)
--
-- Mesma ordem e mesmo SQL. Corpos de função copiados sem mudança
-- (tests/drizzle-espelho.test.ts confere); só entram guardas de idempotência
-- (P1-5: IF NOT EXISTS, DROP ... IF EXISTS antes de CREATE POLICY/TRIGGER,
-- seed com ON CONFLICT DO NOTHING) e o lock_timeout passa a SET LOCAL.
--
-- SEM espelho em drizzle/: esse SQL já está aplicado em produção pelo
-- Lovable. O fechamento de anon nas funções de tier, que produção precisa,
-- vem na migration seguinte (20261010120100), essa sim espelhada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0013 — vendas_total_empresa (contador de vendas da empresa para a gestão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_total_empresa()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_active_member(auth.uid()) AND (
      public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  THEN jsonb_build_object(
    'mes', count(*) FILTER (WHERE date_trunc('month', data_assinatura) = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    'ano', count(*) FILTER (WHERE date_trunc('year', data_assinatura) = date_trunc('year', (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    'total', count(*))
  ELSE NULL END
  FROM public.vendas
  WHERE status_venda = 'aprovada' AND coalesce(distrato,false) = false AND data_assinatura IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.vendas_total_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendas_total_empresa() TO authenticated;
-- ---------------------------------------------------------------------------
-- 0015 — comissão por tier e esteira (tabela de regras, funções e trigger que
--        preenche tier/esteira/% na venda e trava percentuais fora da gestão)
-- ---------------------------------------------------------------------------
SET LOCAL lock_timeout = '20s';
CREATE TABLE IF NOT EXISTS public.comissao_tier_regras (
  tier text PRIMARY KEY,
  ordem int NOT NULL,
  min_vendas int NOT NULL,
  pct_lead_empresa numeric(5,2) NOT NULL,
  pct_lead_proprio numeric(5,2) NOT NULL,
  pct_marquinhos numeric(5,2) NOT NULL,
  pct_sdr numeric(5,2) NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comissao_tier_regras TO authenticated;
GRANT UPDATE ON public.comissao_tier_regras TO authenticated;
GRANT ALL ON public.comissao_tier_regras TO service_role;
ALTER TABLE public.comissao_tier_regras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tier regras leitura" ON public.comissao_tier_regras;
CREATE POLICY "tier regras leitura" ON public.comissao_tier_regras FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tier regras admin edita" ON public.comissao_tier_regras;
CREATE POLICY "tier regras admin edita" ON public.comissao_tier_regras FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.comissao_tier_regras VALUES
 ('tier_1',1,0,40,45,30,8,now()),
 ('tier_2',2,3,45,50,35,8,now()),
 ('tier_3',3,5,50,55,37,8,now()),
 ('elite',4,8,55,60,40,8,now())
ON CONFLICT (tier) DO NOTHING;

ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS tier_comissao text,
  ADD COLUMN IF NOT EXISTS esteira_comissao text,
  ADD COLUMN IF NOT EXISTS pct_share_corretor numeric(5,2);

CREATE OR REPLACE FUNCTION public.corretor_vendas_trimestre(p_corretor uuid, p_ref date, p_offset int DEFAULT -1)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::int FROM vendas v
  WHERE v.corretor_id = p_corretor AND v.status_venda='aprovada' AND coalesce(v.distrato,false)=false
    AND v.data_assinatura >= (date_trunc('quarter', p_ref) + make_interval(months => 3*p_offset))::date
    AND v.data_assinatura <  (date_trunc('quarter', p_ref) + make_interval(months => 3*(p_offset+1)))::date
$$;

CREATE OR REPLACE FUNCTION public.corretor_tier(p_corretor uuid, p_ref date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tier FROM comissao_tier_regras
  WHERE min_vendas <= public.corretor_vendas_trimestre(p_corretor, p_ref, -1)
  ORDER BY ordem DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.lead_esteira_comissao(p_lead uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM agendamentos a WHERE a.lead_id=l.id AND a.tipo='visita' AND a.criado_por_id IS NULL) THEN 'marquinhos'
    WHEN l.sdr_id IS NOT NULL THEN 'sdr'
    WHEN l.origem::text IN ('captacao_corretor','investimento_corretor') THEN 'lead_proprio'
    ELSE 'lead_empresa' END
  FROM leads l WHERE l.id = p_lead
$$;

CREATE OR REPLACE FUNCTION public.comissao_sugerida_corretor(p_lead uuid, p_corretor uuid, p_data date DEFAULT NULL)
RETURNS TABLE(tier text, esteira text, pct_share numeric, vendas_trimestre_anterior int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ref date := coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date); r comissao_tier_regras;
BEGIN
  tier := public.corretor_tier(p_corretor, v_ref);
  esteira := coalesce(public.lead_esteira_comissao(p_lead),'lead_empresa');
  vendas_trimestre_anterior := public.corretor_vendas_trimestre(p_corretor, v_ref, -1);
  SELECT * INTO r FROM comissao_tier_regras t WHERE t.tier = comissao_sugerida_corretor.tier;
  pct_share := CASE esteira WHEN 'marquinhos' THEN r.pct_marquinhos WHEN 'sdr' THEN r.pct_sdr
                 WHEN 'lead_proprio' THEN r.pct_lead_proprio ELSE r.pct_lead_empresa END;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.comissao_sugerida_corretor(uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corretor_tier(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corretor_vendas_trimestre(uuid,date,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendas_aplicar_tier_comissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v_gestao boolean;
BEGIN
  v_gestao := auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
              OR public.has_role(auth.uid(),'superintendente');
  IF TG_OP = 'INSERT' THEN
    IF NEW.corretor_id IS NOT NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT * INTO s FROM public.comissao_sugerida_corretor(NEW.lead_id, NEW.corretor_id, NEW.data_assinatura);
      NEW.tier_comissao := s.tier; NEW.esteira_comissao := s.esteira; NEW.pct_share_corretor := s.pct_share;
      IF NOT v_gestao AND s.pct_share IS NOT NULL THEN
        NEW.percentual_corretor := round(coalesce(NEW.percentual_comissao,0) * s.pct_share / 100, 4);
      END IF;
    END IF;
  ELSIF NOT v_gestao AND (NEW.percentual_corretor IS DISTINCT FROM OLD.percentual_corretor
        OR NEW.percentual_comissao IS DISTINCT FROM OLD.percentual_comissao) THEN
    RAISE EXCEPTION 'Somente a gestão pode alterar os percentuais de comissão';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vendas_tier_comissao ON public.vendas;
CREATE TRIGGER trg_vendas_tier_comissao BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.vendas_aplicar_tier_comissao();

CREATE OR REPLACE FUNCTION public.ranking_tiers_corretores()
RETURNS TABLE(corretor_id uuid, nome text, vendas_trimestre_anterior int, vendas_trimestre_atual int, tier_atual text, tier_proximo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d)
  SELECT p.id, p.nome,
    public.corretor_vendas_trimestre(p.id, h.d, -1),
    public.corretor_vendas_trimestre(p.id, h.d, 0),
    public.corretor_tier(p.id, h.d),
    (SELECT t.tier FROM comissao_tier_regras t WHERE t.min_vendas <= public.corretor_vendas_trimestre(p.id, h.d, 0) ORDER BY t.ordem DESC LIMIT 1)
  FROM profiles p CROSS JOIN hoje h
  WHERE coalesce(p.ativo,true) AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role IN ('corretor','gestor'))
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente') OR p.id = auth.uid())
  ORDER BY 4 DESC, 3 DESC, 2
$$;
GRANT EXECUTE ON FUNCTION public.ranking_tiers_corretores() TO authenticated;
-- ---------------------------------------------------------------------------
-- 0022 — visita marcada pelo próprio corretor não vira entrega do SDR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sdr_visita_roleta_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _v uuid;
  _prev text := COALESCE(current_setting('app.sdr_motor', true), '');
  _uid uuid := auth.uid();
BEGIN
  -- Visita marcada pelo próprio corretor não é entrega do SDR:
  -- não passa pela roleta do SDR nem dispara o aviso "Lead do SDR".
  IF _uid IS NOT NULL AND public.has_role(_uid, 'corretor'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo = 'visita'::public.agendamento_tipo
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('agendado'::public.agendamento_status, 'confirmado'::public.agendamento_status,
                        'remarcado'::public.agendamento_status)
     AND NEW.data_inicio > now() THEN
    _v := public._sdr_visita_roleta(NEW.lead_id, NEW.corretor_id, NEW.data_inicio, NEW.data_fim, 'agendamento_visita');
    PERFORM set_config('app.sdr_motor', _prev, true);
    IF _v IS NOT NULL THEN
      IF NULLIF(btrim(NEW.local), '') IS NULL THEN
        RAISE EXCEPTION 'informe o endereço da visita (campo Local): o corretor recebe a mensagem com endereço e horário'
          USING ERRCODE = '22023';
      END IF;
      NEW.corretor_id := _v;
      NEW.criado_por_id := COALESCE(NEW.criado_por_id, auth.uid());
      PERFORM set_config('app.sdr_visita_lead', NEW.lead_id::text, true);
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
-- ---------------------------------------------------------------------------
-- 0037 — leads_funil_registros_v1 (funil por coorte da lista de leads)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_funil_registros_v1(_na_lixeira boolean DEFAULT false, _origem text DEFAULT NULL, _corretor text DEFAULT NULL, _temperatura text DEFAULT NULL, _periodo_start timestamptz DEFAULT NULL, _periodo_end timestamptz DEFAULT NULL, _search text DEFAULT NULL, _search_digits text DEFAULT NULL)
RETURNS TABLE(etapa text, quantidade bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  RETURN QUERY
  WITH coorte AS (
    SELECT l.id, l.status::text AS status
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (_corretor IS NULL OR _corretor = 'all'
           OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
           OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor))
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (_search IS NULL OR _search = '' OR l.search_text ILIKE '%'||_search||'%'
           OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%'))
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
      AND (_periodo_start IS NULL OR l.created_at >= _periodo_start)
      AND (_periodo_end IS NULL OR l.created_at <= _periodo_end)
  ),
  marcas AS (
    SELECT c.id,
      (c.status IN ('contrato_fechado','pos_venda')
        OR EXISTS (SELECT 1 FROM public.vendas v WHERE v.lead_id = c.id AND COALESCE(v.distrato,false) = false AND v.status_venda::text NOT IN ('rejeitada','cancelada'))
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'contrato_fechado')) AS venda,
      (c.status IN ('analise_credito')
        OR EXISTS (SELECT 1 FROM public.analises_credito a WHERE a.lead_id = c.id)
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'analise_credito')) AS analise,
      (c.status IN ('visita_realizada','proposta_enviada')
        OR EXISTS (SELECT 1 FROM public.visitas vi WHERE vi.lead_id = c.id)
        OR EXISTS (SELECT 1 FROM public.agendamentos ag WHERE ag.lead_id = c.id AND ag.deleted_at IS NULL AND ag.status::text = 'realizado')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status IN ('visita_realizada','proposta_enviada'))) AS visita,
      (c.status = 'agendado'
        OR EXISTS (SELECT 1 FROM public.agendamentos ag WHERE ag.lead_id = c.id AND ag.deleted_at IS NULL AND ag.tipo::text = 'visita')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status = 'agendado')) AS agendado,
      (c.status IN ('em_atendimento','aguardando_retorno','qualificado','qualificacao_corretor')
        OR EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id = c.id AND t.para_status IN ('em_atendimento','aguardando_retorno','qualificado','qualificacao_corretor'))) AS atendimento,
      (c.status = 'perdido') AS perdido
    FROM coorte c
  ),
  -- Quem chegou a uma etapa adiante também passou pelas anteriores.
  acc AS (
    SELECT m.id, m.perdido, m.venda,
      (m.venda OR m.analise) AS analise,
      (m.venda OR m.analise OR m.visita) AS visita,
      (m.venda OR m.analise OR m.visita OR m.agendado) AS agendado,
      (m.venda OR m.analise OR m.visita OR m.agendado OR m.atendimento) AS atendimento
    FROM marcas m
  )
  SELECT 'entrada', count(*) FROM acc
  UNION ALL SELECT 'em_atendimento', count(*) FILTER (WHERE atendimento) FROM acc
  UNION ALL SELECT 'agendado', count(*) FILTER (WHERE agendado) FROM acc
  UNION ALL SELECT 'visita_realizada', count(*) FILTER (WHERE visita) FROM acc
  UNION ALL SELECT 'analise_credito', count(*) FILTER (WHERE analise) FROM acc
  UNION ALL SELECT 'venda', count(*) FILTER (WHERE venda) FROM acc
  UNION ALL SELECT 'perdido', count(*) FILTER (WHERE perdido) FROM acc;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.leads_funil_registros_v1(boolean,text,text,text,timestamptz,timestamptz,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
