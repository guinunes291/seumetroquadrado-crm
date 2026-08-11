-- "Aprovado condicionado" no fluxo da análise de crédito (pedido do dono,
-- 2026-08-11): cliente que aprova, mas não com o potencial máximo — crédito
-- menor que o pretendido, exigência do banco, condição a cumprir. É um
-- desfecho POSITIVO com ressalva: libera o negócio, mas pede ajuste de
-- produto/valor. Terceiro resultado ao lado de aprovada/reprovada.
--
-- A constraint da 20260810120000 é substituída (aquela migration ainda não
-- foi aplicada em produção, mas já está em main — por isso NÃO se edita o
-- arquivo antigo; o replay aplica as duas em ordem e termina neste estado).

ALTER TABLE public.analises_credito
  DROP CONSTRAINT IF EXISTS analises_credito_status_check;
DO $$
BEGIN
  ALTER TABLE public.analises_credito
    ADD CONSTRAINT analises_credito_status_check
    CHECK (status IN ('enviada', 'pendente', 'aprovada', 'aprovada_condicionada', 'reprovada'))
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- dashboard_kpis: o bloco pipeline passa a contar também as condicionadas
-- (chave ADITIVA no jsonb — front antigo ignora; assinatura inalterada).
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

  -- Resultado da ÚLTIMA análise de cada lead parado em analise_credito:
  -- liberados (aprovada), liberados com ressalva (condicionada) e retrabalho.
  SELECT jsonb_build_object(
    'analise_aprovada',     count(*) FILTER (WHERE ult.status = 'aprovada'),
    'analise_condicionada', count(*) FILTER (WHERE ult.status = 'aprovada_condicionada'),
    'analise_reprovada',    count(*) FILTER (WHERE ult.status = 'reprovada')
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
