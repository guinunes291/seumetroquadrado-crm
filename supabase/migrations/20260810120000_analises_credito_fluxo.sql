-- Aprovação/reprovação da análise de crédito no fluxo (item 3.1 da Onda D,
-- na forma segura — pedido do dono em 2026-08-11).
--
-- A tabela `analises_credito` existe desde jun/2026 e estava ÓRFÃ: o modal
-- de análise registrava a situação só como metadata de interação (enterrada
-- na timeline, incontável). Este lote a revive como o REGISTRO de cada
-- análise — sem mexer no enum de lead_status (a promoção a etapas próprias
-- do funil continua possível depois, com estes dados já populados; o risco
-- alto que a auditoria apontou fica adiado, o valor não).
--
-- 1) Vocabulário fechado de status para escritas novas. NOT VALID de
--    propósito: linhas do import legado podem ter texto livre — validar o
--    passado quebraria o replay; o futuro entra validado.
DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_status_check
    CHECK (status IN ('enviada', 'pendente', 'aprovada', 'reprovada')) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) updated_at honesto (é o carimbo da decisão aprovada/reprovada; o autor
--    e o momento ficam também na interação-eco da timeline).
DROP TRIGGER IF EXISTS analises_credito_set_updated_at ON public.analises_credito;
CREATE TRIGGER analises_credito_set_updated_at
  BEFORE UPDATE ON public.analises_credito
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Última análise por lead (DISTINCT ON) sai barata.
CREATE INDEX IF NOT EXISTS analises_credito_lead_recentes_idx
  ON public.analises_credito (lead_id, created_at DESC);

-- 4) RLS alinhada ao acesso do LEAD (a régua do resto do CRM): quem pode ver
--    o lead vê e decide a análise — cobre lead transferido, que a política
--    antiga (só autor ou gestão) deixava invisível ao corretor novo.
DROP POLICY IF EXISTS analises_select_own_or_gestor ON public.analises_credito;
CREATE POLICY analises_select_acesso_lead ON public.analises_credito
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'superintendente')
  );

DROP POLICY IF EXISTS analises_update_own_or_gestor ON public.analises_credito;
CREATE POLICY analises_update_acesso_lead ON public.analises_credito
  FOR UPDATE TO authenticated
  USING (
    corretor_id = auth.uid()
    OR (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'superintendente')
  )
  WITH CHECK (
    corretor_id = auth.uid()
    OR (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'superintendente')
  );

-- INSERT deixa de aceitar qualquer autenticado: só análise PRÓPRIA em lead
-- que o autor acessa (o import legado usa service_role, que ignora RLS).
DROP POLICY IF EXISTS analises_insert_auth ON public.analises_credito;
CREATE POLICY analises_insert_proprio ON public.analises_credito
  FOR INSERT TO authenticated
  WITH CHECK (
    corretor_id = auth.uid()
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
  );

COMMENT ON TABLE public.analises_credito IS
  'Registro de cada analise de credito do lead (fluxo 3.1): enviada/pendente -> aprovada|reprovada. A ultima linha por lead e o estado atual; a decisao ecoa na timeline como interacao. Responde "quantos negocios estao liberados" via dashboard_kpis.pipeline.';

-- 5) dashboard_kpis: o bloco pipeline ganha analise_aprovada/analise_reprovada
--    (última análise por lead em analise_credito, mesmo escopo do restante).
--    Chaves ADITIVAS no jsonb — front antigo ignora; assinatura inalterada.
CREATE OR REPLACE FUNCTION public.dashboard_kpis(_di timestamp with time zone DEFAULT NULL::timestamp with time zone, _df timestamp with time zone DEFAULT NULL::timestamp with time zone, _corretor uuid DEFAULT NULL::uuid, _campo_data text DEFAULT 'criacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
  _pipeline jsonb;
  _analises jsonb;
  _periodo jsonb;
  _prev jsonb := NULL;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  -- Mesma régua do pipeline_snapshot_v3: gestor vê carteira + equipe.
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  SELECT jsonb_build_object(
    'novo',                  count(*) FILTER (WHERE status = 'novo'),
    'aguardando_atendimento',count(*) FILTER (WHERE status = 'aguardando_atendimento'),
    'aguardando_retorno',    count(*) FILTER (WHERE status = 'aguardando_retorno'),
    'em_atendimento',        count(*) FILTER (WHERE status = 'em_atendimento'),
    'agendado',              count(*) FILTER (WHERE status = 'agendado'),
    'visita_realizada',      count(*) FILTER (WHERE status = 'visita_realizada'),
    'analise_credito',       count(*) FILTER (WHERE status = 'analise_credito'),
    -- pos_venda é terminal (guard de fechamento): não é lead em aberto.
    'em_aberto',             count(*) FILTER (WHERE status NOT IN ('contrato_fechado','perdido','pos_venda')),
    'sem_corretor',          count(*) FILTER (WHERE corretor_id IS NULL AND status NOT IN ('contrato_fechado','perdido','pos_venda'))
  ) INTO _pipeline
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Resultado da ÚLTIMA análise de cada lead parado em analise_credito
  -- (item 3.1): responde "quantos negócios estão liberados" sem nova etapa.
  SELECT jsonb_build_object(
    'analise_aprovada',  count(*) FILTER (WHERE ult.status = 'aprovada'),
    'analise_reprovada', count(*) FILTER (WHERE ult.status = 'reprovada')
  ) INTO _analises
  FROM (
    SELECT DISTINCT ON (ac.lead_id) ac.lead_id, ac.status
    FROM public.analises_credito ac
    WHERE ac.lead_id IS NOT NULL
    ORDER BY ac.lead_id, ac.created_at DESC
  ) ult
  JOIN public.leads l ON l.id = ult.lead_id
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.status = 'analise_credito'
    AND (_scope IS NULL OR l.corretor_id = _scope)
    AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe));

  _periodo := public.dashboard_atividade_periodo(_di, _df, _scope, _campo_data);

  IF _di IS NOT NULL AND _df IS NOT NULL THEN
    _prev := public.dashboard_atividade_periodo(_di - (_df - _di), _di, _scope, _campo_data);
  END IF;

  RETURN jsonb_build_object('pipeline', _pipeline || COALESCE(_analises, '{}'::jsonb), 'periodo', _periodo, 'prev', _prev);
END;
$function$;

NOTIFY pgrst, 'reload schema';
