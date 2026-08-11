-- Etapa "Qualificação Corretor" — parte 2/2: fiação completa (o valor foi
-- adicionado na 20260811150000, transação separada). Tudo aqui é CREATE OR
-- REPLACE de corpo com assinatura preservada — nenhum nome novo.
--
-- Regra das transições: 'qualificacao_corretor' entra como destino em toda
-- origem que já aceitava 'em_atendimento' OU 'aguardando_retorno' (é uma
-- etapa do miolo do atendimento); e sai para os mesmos destinos de
-- 'aguardando_retorno' + o próprio 'aguardando_retorno'.

CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(
  p_de public.lead_status,
  p_para public.lead_status,
  p_gestao boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','qualificacao_corretor','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificacao_corretor','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificacao_corretor','qualificado','perdido'])
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificacao_corretor','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificacao_corretor','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificacao_corretor'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','visita_realizada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','agendado','proposta_enviada','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor','visita_realizada','proposta_enviada','contrato_fechado','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = ANY (ARRAY['pos_venda','analise_credito'])
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor'])
    ELSE false
  END;
$$;

-- transicionar_lead: 'qualificacao_corretor' entra na lista de etapas que
-- exigem próxima ação ou follow-up (mesma disciplina de em_atendimento).
CREATE OR REPLACE FUNCTION public.transicionar_lead(
  p_lead_id uuid,
  p_novo_status lead_status,
  p_motivo text DEFAULT NULL::text,
  p_proxima_acao text DEFAULT NULL::text,
  p_proximo_followup timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_motivo_categoria text DEFAULT NULL::text
)
 RETURNS leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _resultado public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _gestao boolean;
  _acao_final text;
  _followup_final timestamptz;
  _categoria_final text;
BEGIN
  IF NOT _service_role AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF p_novo_status IS NULL THEN
    RAISE EXCEPTION 'novo status é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _service_role AND NOT public.pode_acessar_lead(_uid, p_lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  _gestao := _service_role
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT public.transicao_lead_permitida(_lead.status, p_novo_status, _gestao) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status = 'perdido'::public.lead_status
     AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório ao perder um lead' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT EXISTS (
       SELECT 1 FROM public.vendas AS v
       WHERE v.lead_id = p_lead_id AND v.status_venda = 'aprovada'::public.status_venda
     ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda' USING ERRCODE = '23514';
  END IF;

  IF p_novo_status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
     AND NOT _gestao THEN
    RAISE EXCEPTION 'fechamento e pós-venda exigem papel de gestão' USING ERRCODE = '42501';
  END IF;

  IF p_proxima_acao IS NOT NULL AND char_length(btrim(p_proxima_acao)) > 500 THEN
    RAISE EXCEPTION 'próxima ação excede 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_proximo_followup IS NOT NULL AND p_proximo_followup <= now()
     AND p_novo_status NOT IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status) THEN
    RAISE EXCEPTION 'follow-up deve estar no futuro' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres' USING ERRCODE = '22023';
  END IF;

  _acao_final := COALESCE(NULLIF(btrim(p_proxima_acao), ''), _lead.proxima_acao);
  _followup_final := COALESCE(p_proximo_followup, _lead.proximo_followup);

  -- Ao mover para 'perdido' garantimos motivo_perda_categoria: usa o passado
  -- explicitamente, senão herda o já registrado no lead; fallback 'outro' evita
  -- que o trigger enforce_motivo_perda_categoria trave a operação.
  IF p_novo_status = 'perdido'::public.lead_status THEN
    _categoria_final := COALESCE(
      NULLIF(btrim(p_motivo_categoria), ''),
      _lead.motivo_perda_categoria,
      'outro'
    );
  ELSE
    _categoria_final := _lead.motivo_perda_categoria;
  END IF;

  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND (_followup_final IS NULL OR _followup_final <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro' USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'em_atendimento'::public.lead_status, 'aguardando_retorno'::public.lead_status,
    'qualificacao_corretor'::public.lead_status,
    'qualificado'::public.lead_status, 'agendado'::public.lead_status,
    'visita_realizada'::public.lead_status, 'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status
  ) AND _acao_final IS NULL AND _followup_final IS NULL THEN
    RAISE EXCEPTION 'informe próxima ação ou follow-up' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);

  UPDATE public.leads
  SET status = p_novo_status,
      motivo_perdido = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN btrim(p_motivo)
        WHEN _lead.status = 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perdido
      END,
      motivo_perda_categoria = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN _categoria_final
        WHEN _lead.status = 'perdido'::public.lead_status
             AND p_novo_status <> 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perda_categoria
      END,
      proxima_acao = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _acao_final
      END,
      proximo_followup = CASE
        WHEN p_novo_status IN ('contrato_fechado'::public.lead_status,'pos_venda'::public.lead_status,'perdido'::public.lead_status)
        THEN NULL ELSE _followup_final
      END,
      ultima_interacao = now()
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    p_lead_id, 'transicao_lead',
    'Lead movido de ' || _lead.status::text || ' para ' || p_novo_status::text || '.',
    'transicionar_lead',
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _lead.status, 'para_status', p_novo_status,
      'motivo', NULLIF(btrim(p_motivo), ''),
      'motivo_categoria', CASE WHEN p_novo_status='perdido' THEN _categoria_final ELSE NULL END,
      'proxima_acao', _resultado.proxima_acao,
      'proximo_followup', _resultado.proximo_followup,
      'alterado_por', _uid
    ))
  );

  RETURN _resultado;
END;
$function$;

-- funil_ordem: a etapa entra na posição comercial 3, entre aguardando_retorno
-- e em_atendimento — espelho de LEAD_STATUS_ORDER (src/lib/leads.ts). Os
-- ordinais são calculados na consulta (nada persistido), renumerar é seguro.
CREATE OR REPLACE FUNCTION public.funil_ordem(_s public.lead_status)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE _s
    -- Pré-funil (caixa de entrada, ainda não distribuído/aceito).
    WHEN 'novo'                   THEN 0
    WHEN 'aguardando_corretor'    THEN 0
    -- Funil comercial (mesma ordem de LEAD_STATUS_ORDER).
    WHEN 'aguardando_atendimento' THEN 1
    WHEN 'aguardando_retorno'     THEN 2
    WHEN 'qualificacao_corretor'  THEN 3
    WHEN 'em_atendimento'         THEN 4
    WHEN 'qualificado'            THEN 4  -- legado: equivale a em_atendimento
    WHEN 'agendado'               THEN 5
    WHEN 'visita_realizada'       THEN 6
    WHEN 'proposta_enviada'       THEN 6  -- legado: pós-visita, pré-análise
    WHEN 'analise_credito'        THEN 7
    WHEN 'contrato_fechado'       THEN 8
    WHEN 'pos_venda'              THEN 8  -- terminal de sucesso
    WHEN 'perdido'                THEN 99
  END;
$$;

-- dashboard_kpis: pipeline ganha 'qualificacao_corretor' (aditivo; em_aberto
-- já cobre a etapa por ser NOT IN dos terminais).
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
    'qualificacao_corretor', count(*) FILTER (WHERE status = 'qualificacao_corretor'),
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

-- dashboard_funil: quem passa pela qualificação conta no degrau
-- "Em atendimento" do funil do período.
CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _df timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _corretor uuid DEFAULT NULL::uuid,
  _campo_data text DEFAULT 'criacao'::text
)
RETURNS TABLE(etapa text, ordem integer, quantidade integer)
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
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH novos AS (
    SELECT count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
  ),
  trans AS (
    SELECT t.para_status, t.lead_id
    FROM public.lead_status_transitions t
    JOIN public.leads l ON l.id = t.lead_id
    WHERE l.deleted_at IS NULL
      AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
      AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
      AND (_ve_tudo
           OR COALESCE(t.corretor_id, l.corretor_id) = _caller
           OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe))
  ),
  ag AS (
    SELECT count(DISTINCT lead_id)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND auto_gerado = false
      AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
  ),
  vi AS (
    SELECT count(DISTINCT lead_id)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL AND lead_id IS NOT NULL
      AND tipo = 'visita' AND status = 'realizado'
      AND (_di IS NULL OR data_inicio >= _di) AND (_df IS NULL OR data_inicio < _df)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
  ),
  ve AS (
    SELECT count(DISTINCT lead_id)::int AS n
    FROM public.vendas
    WHERE distrato = false AND status_venda = 'aprovada' AND data_assinatura IS NOT NULL
      AND (_di_date IS NULL OR data_assinatura >= _di_date)
      AND (_df_date IS NULL OR data_assinatura <= _df_date)
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
  )
  SELECT * FROM (VALUES
    ('Novos', 1, (SELECT n FROM novos)),
    ('Em atendimento', 2, (SELECT count(DISTINCT lead_id)::int FROM trans
                            WHERE para_status IN ('em_atendimento','qualificado','aguardando_retorno','qualificacao_corretor'))),
    ('Agendados', 3, (SELECT n FROM ag)),
    ('Visitas', 4, (SELECT n FROM vi)),
    ('Análise crédito', 5, (SELECT count(DISTINCT lead_id)::int FROM trans
                             WHERE para_status = 'analise_credito')),
    ('Fechados', 6, (SELECT n FROM ve))
  ) AS t(etapa, ordem, quantidade);
END;
$function$;

COMMENT ON FUNCTION public.dashboard_funil(timestamptz, timestamptz, uuid, text) IS
  'Funil por EVENTOS do período (leads distintos): criação do lead, entrada em atendimento, agendamento criado, visita validada no dia da visita, entrada em análise e venda pela data da assinatura.';

-- ---------------------------------------------------------------------
-- dashboard_metricas_por_corretor — ranking da aba Relatórios
-- ---------------------------------------------------------------------

-- leads_filtered_v5: peso 11 no score (entre aguardando_retorno=10 e
-- em_atendimento=12 — espelho de src/lib/priority.ts) e ordinal novo no
-- sort semântico por status. Assinatura intacta; counts_v5 não enumera
-- etapas (só filtra), então não muda.
CREATE OR REPLACE FUNCTION public.leads_filtered_v5(
  _na_lixeira boolean DEFAULT false,
  _status text DEFAULT NULL,
  _origem text DEFAULT NULL,
  _corretor text DEFAULT NULL,
  _temperatura text DEFAULT NULL,
  _periodo_start timestamptz DEFAULT NULL,
  _periodo_end timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _search_digits text DEFAULT NULL,
  _contato text DEFAULT NULL,
  _parado_dias int DEFAULT NULL,
  _analise text DEFAULT NULL,
  _sort text DEFAULT NULL,
  _sort_dir text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE(
  id uuid,
  nome text,
  email text,
  telefone text,
  origem text,
  status text,
  temperatura text,
  corretor_id uuid,
  projeto_id uuid,
  projeto_nome text,
  observacoes text,
  created_at timestamptz,
  ultima_interacao timestamptz,
  na_lixeira boolean,
  renda_informada text,
  entrada_disponivel text,
  usa_fgts boolean,
  data_venda date,
  tem_followup boolean,
  proximo_followup timestamptz,
  score int,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
  _tz text := 'America/Sao_Paulo';
  _hoje0 timestamptz;
  _sort_col text;
  _sort_desc boolean;
  _contato_norm text := COALESCE(_contato, 'all');
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Validação ESTRITA dos recortes (o fim do ELSE true): valor que o servidor
  -- não conhece é bug do chamador — falha alto em vez de devolver tudo.
  IF _contato_norm NOT IN ('all','contato_ontem','contato_7d','contato_30d',
                           'com_followup','sem_contato_5d','sem_contato_30d') THEN
    RAISE EXCEPTION 'contato invalido: %', _contato USING ERRCODE = '22023';
  END IF;
  IF _parado_dias IS NOT NULL AND (_parado_dias < 1 OR _parado_dias > 365) THEN
    RAISE EXCEPTION 'parado_dias fora de 1..365: %', _parado_dias USING ERRCODE = '22023';
  END IF;
  IF _analise IS NOT NULL AND _analise NOT IN
     ('all','em_andamento','aprovada','aprovada_condicionada','reprovada') THEN
    RAISE EXCEPTION 'analise invalido: %', _analise USING ERRCODE = '22023';
  END IF;

  -- Mesma régua de 20260718100000: admin/superintendente veem tudo; gestor vê
  -- carteira própria + equipe + ÓRFÃOS; corretor vê a própria carteira.
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  -- meia-noite de HOJE no fuso da operação (para "contato ontem")
  _hoje0 := date_trunc('day', now() AT TIME ZONE _tz) AT TIME ZONE _tz;

  -- whitelist de ordenação (qualquer outro valor cai no padrão de prioridade)
  _sort_col := CASE WHEN _sort IN ('nome','created_at','ultima_interacao','status',
                                   'temperatura','score','proximo_followup')
                    THEN _sort ELSE NULL END;
  _sort_desc := COALESCE(_sort_dir, 'desc') = 'desc';

  RETURN QUERY
  WITH ultima_venda AS (
    SELECT DISTINCT ON (v.lead_id)
      v.lead_id,
      v.data_assinatura
    FROM public.vendas v
    WHERE v.lead_id IS NOT NULL
      AND COALESCE(v.distrato, false) = false
    ORDER BY v.lead_id, v.data_assinatura DESC NULLS LAST, v.created_at DESC
  ),
  base AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.origem::text AS origem,
      l.status::text AS status,
      l.temperatura::text AS temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.observacoes,
      l.created_at,
      l.ultima_interacao,
      l.na_lixeira,
      l.renda_informada,
      l.entrada_disponivel,
      l.usa_fgts,
      uv.data_assinatura AS data_venda,
      l.proximo_followup,
      EXISTS (
        SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = l.id
          AND t.tipo = 'follow_up'
          AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL
          AND (_ve_tudo OR t.corretor_id = _caller OR t.corretor_id = ANY(_equipe))
      ) AS tem_followup,
      CASE
        WHEN l.status::text = 'contrato_fechado' THEN COALESCE(uv.data_assinatura::timestamptz, l.created_at)
        ELSE l.created_at
      END AS data_filtro,
      CASE
        WHEN l.status::text = 'aguardando_atendimento' AND l.origem::text = 'facebook' THEN 0
        WHEN l.status::text = 'aguardando_atendimento'
             AND (l.projeto_id IS NOT NULL OR l.projeto_nome IS NOT NULL) THEN 1
        WHEN l.status::text = 'aguardando_atendimento' THEN 2
        ELSE 3
      END AS prioridade,
      -- Score 0-100, espelho de src/lib/priority.ts (mudou lá, muda aqui):
      -- temperatura + peso da etapa + SLA de 1º atendimento + dias sem contato.
      LEAST(100,
        CASE l.temperatura::text WHEN 'quente' THEN 35 WHEN 'morno' THEN 15 ELSE 0 END
        + CASE l.status::text
            WHEN 'analise_credito' THEN 25
            WHEN 'visita_realizada' THEN 22
            WHEN 'agendado' THEN 16
            WHEN 'em_atendimento' THEN 12
            WHEN 'qualificacao_corretor' THEN 11
            WHEN 'aguardando_retorno' THEN 10
            WHEN 'qualificado' THEN 10
            WHEN 'aguardando_atendimento' THEN 6
            WHEN 'novo' THEN 6
            ELSE 0
          END
        + sla.pontos
        + CASE
            WHEN l.ultima_interacao IS NULL THEN 12
            ELSE LEAST(20, GREATEST(0,
              floor(EXTRACT(EPOCH FROM (now() - l.ultima_interacao)) / 86400))::int * 4)
          END
      )::int AS score,
      -- Ordem semântica para o sort por coluna (funil / calor), no lugar da
      -- ordem alfabética do texto do enum.
      CASE l.status::text
        WHEN 'novo' THEN 0
        WHEN 'aguardando_corretor' THEN 1
        WHEN 'aguardando_atendimento' THEN 2
        WHEN 'aguardando_retorno' THEN 3
        WHEN 'qualificacao_corretor' THEN 4
        WHEN 'em_atendimento' THEN 5
        WHEN 'qualificado' THEN 6
        WHEN 'agendado' THEN 7
        WHEN 'visita_realizada' THEN 8
        WHEN 'proposta_enviada' THEN 9
        WHEN 'analise_credito' THEN 10
        WHEN 'contrato_fechado' THEN 11
        WHEN 'pos_venda' THEN 12
        WHEN 'perdido' THEN 13
        ELSE 99
      END AS status_rank,
      CASE l.temperatura::text WHEN 'quente' THEN 3 WHEN 'morno' THEN 2 WHEN 'frio' THEN 1 ELSE 0 END AS temp_rank
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
    LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
    CROSS JOIN LATERAL (
      -- Componente de SLA do score: só corre para o 1º atendimento (mesma
      -- régua de leads_sla_pendentes: estourado +20, atenção (>60%) +10).
      SELECT CASE
        WHEN l.status::text NOT IN ('novo','aguardando_atendimento') THEN 0
        ELSE (
          SELECT CASE
            WHEN decorrido > efetivo THEN 20
            WHEN decorrido > efetivo * 0.6 THEN 10
            ELSE 0
          END
          FROM (
            SELECT
              (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at))) / 60) AS decorrido,
              CASE
                WHEN l.via_webhook AND dc.timeout_minutos IS NOT NULL
                  THEN LEAST(dc.timeout_minutos, COALESCE(dc.sla_minutos, 30))
                ELSE COALESCE(dc.sla_minutos, 30)
              END::numeric AS efetivo
          ) x
        )
      END AS pontos
    ) sla
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
      AND (_status IS NULL OR _status = 'all' OR l.status::text = _status)
      AND (_origem IS NULL OR _origem = 'all' OR l.origem::text = _origem)
      AND (
        _corretor IS NULL OR _corretor = 'all'
        OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
        OR (_corretor NOT IN ('all','unassigned') AND l.corretor_id::text = _corretor)
      )
      AND (_temperatura IS NULL OR _temperatura = 'all' OR l.temperatura::text = _temperatura)
      AND (
        _search IS NULL OR _search = ''
        OR l.search_text ILIKE '%'||_search||'%'
        OR (_search_digits IS NOT NULL AND _search_digits <> '' AND l.search_text ILIKE '%'||_search_digits||'%')
      )
      AND (
        _ve_tudo
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR (_gestor AND l.corretor_id IS NULL)
      )
      -- Recorte paramétrico "parado há X+ dias": mesmo predicado das réguas
      -- fixas sem_contato_*, compõe por AND com o _contato.
      AND (
        _parado_dias IS NULL
        OR (
          (l.ultima_interacao IS NULL OR l.ultima_interacao < now() - make_interval(days => _parado_dias))
          AND l.status::text NOT IN ('contrato_fechado','pos_venda','perdido')
        )
      )
      -- Recorte pela ÚLTIMA análise de crédito do lead (item 3.1b). A
      -- subconsulta correlata só corre com o filtro ativo.
      AND (
        _analise IS NULL OR _analise = 'all'
        OR CASE _analise
             WHEN 'em_andamento' THEN
               (SELECT ac.status FROM public.analises_credito ac
                 WHERE ac.lead_id = l.id ORDER BY ac.created_at DESC LIMIT 1)
               IN ('enviada','pendente')
             ELSE
               (SELECT ac.status FROM public.analises_credito ac
                 WHERE ac.lead_id = l.id ORDER BY ac.created_at DESC LIMIT 1) = _analise
           END
      )
  ),
  com_contato AS (
    SELECT * FROM base b
    WHERE
      CASE _contato_norm
        WHEN 'all' THEN true
        WHEN 'contato_ontem' THEN
          b.ultima_interacao >= _hoje0 - interval '1 day' AND b.ultima_interacao < _hoje0
        WHEN 'contato_7d' THEN b.ultima_interacao >= now() - interval '7 days'
        WHEN 'contato_30d' THEN b.ultima_interacao >= now() - interval '30 days'
        WHEN 'com_followup' THEN b.tem_followup
        WHEN 'sem_contato_5d' THEN
          (b.ultima_interacao IS NULL OR b.ultima_interacao < now() - interval '5 days')
          AND b.status NOT IN ('contrato_fechado','pos_venda','perdido')
        WHEN 'sem_contato_30d' THEN
          (b.ultima_interacao IS NULL OR b.ultima_interacao < now() - interval '30 days')
          AND b.status NOT IN ('contrato_fechado','pos_venda','perdido')
        -- Inalcançável (validação na entrada); false = nunca "devolver tudo".
        ELSE false
      END
  ),
  filtrado AS (
    SELECT *
    FROM com_contato c
    WHERE (_periodo_start IS NULL OR c.data_filtro >= _periodo_start)
      AND (_periodo_end IS NULL OR c.data_filtro <= _periodo_end)
  )
  SELECT
    f.id,
    f.nome,
    f.email,
    f.telefone,
    f.origem,
    f.status,
    f.temperatura,
    f.corretor_id,
    f.projeto_id,
    f.projeto_nome,
    f.observacoes,
    f.created_at,
    f.ultima_interacao,
    f.na_lixeira,
    f.renda_informada,
    f.entrada_disponivel,
    f.usa_fgts,
    f.data_venda,
    f.tem_followup,
    f.proximo_followup,
    f.score,
    count(*) OVER() AS total_count
  FROM filtrado f
  ORDER BY
    -- ordenação explícita por coluna (whitelist) OU prioridade operacional
    CASE WHEN _sort_col = 'nome' AND NOT _sort_desc THEN f.nome END ASC,
    CASE WHEN _sort_col = 'nome' AND _sort_desc THEN f.nome END DESC,
    CASE WHEN _sort_col = 'created_at' AND NOT _sort_desc THEN f.created_at END ASC,
    CASE WHEN _sort_col = 'created_at' AND _sort_desc THEN f.created_at END DESC,
    CASE WHEN _sort_col = 'ultima_interacao' AND NOT _sort_desc THEN f.ultima_interacao END ASC NULLS FIRST,
    CASE WHEN _sort_col = 'ultima_interacao' AND _sort_desc THEN f.ultima_interacao END DESC NULLS LAST,
    CASE WHEN _sort_col = 'status' AND NOT _sort_desc THEN f.status_rank END ASC,
    CASE WHEN _sort_col = 'status' AND _sort_desc THEN f.status_rank END DESC,
    CASE WHEN _sort_col = 'temperatura' AND NOT _sort_desc THEN f.temp_rank END ASC,
    CASE WHEN _sort_col = 'temperatura' AND _sort_desc THEN f.temp_rank END DESC,
    CASE WHEN _sort_col = 'score' AND NOT _sort_desc THEN f.score END ASC,
    CASE WHEN _sort_col = 'score' AND _sort_desc THEN f.score END DESC,
    CASE WHEN _sort_col = 'proximo_followup' AND NOT _sort_desc THEN f.proximo_followup END ASC NULLS LAST,
    CASE WHEN _sort_col = 'proximo_followup' AND _sort_desc THEN f.proximo_followup END DESC NULLS LAST,
    CASE WHEN _sort_col IS NULL THEN f.prioridade END ASC,
    CASE WHEN _sort_col IS NULL AND f.status = 'contrato_fechado' THEN f.data_venda END DESC NULLS LAST,
    -- desempate: score operacional (quem esfria/estoura SLA sobe), depois recência
    CASE WHEN _sort_col IS NULL THEN f.score END DESC,
    f.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.leads_filtered_v5(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, int, text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_filtered_v5(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, int, text, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_filtered_v5(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, int, text, text, text, int, int) TO authenticated;


-- atendimento_inbox_v4: o lead em qualificação pontua 11 no score da fila
-- (sem isso ele afundaria com peso 0 atrás dos vizinhos de etapa).
CREATE OR REPLACE FUNCTION public.atendimento_inbox_v4(
  _corretor_id uuid DEFAULT NULL,
  _limit_per_queue integer DEFAULT 15
)
RETURNS TABLE(
  fila text,
  total_count bigint,
  items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _target uuid := COALESCE(_corretor_id, auth.uid());
  _take integer := LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30);
  _now timestamptz := statement_timestamp();
BEGIN
  IF NOT public.is_active_member(_caller)
     OR NOT public.pode_acessar_corretor(_caller, _target) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH queue_defs(fila, ordem) AS (
    VALUES
      ('novos'::text, 1),
      ('responder'::text, 2),
      ('followups'::text, 3),
      ('esfriando'::text, 4),
      ('confirmar_visita'::text, 5),
      ('docs'::text, 6)
  ), base AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.email,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      l.created_at,
      l.corretor_id,
      l.origem,
      l.renda_informada,
      l.entrada_disponivel,
      l.usa_fgts,
      ultima.direcao AS ultima_direcao,
      ultima.ocorreu_em AS ultima_ocorreu_em,
      COALESCE(docs.quantidade, 0::bigint) AS docs_pendentes,
      visita.agendamento_id AS visita_agendamento_id,
      visita.data_inicio AS visita_em,
      -- Régua única de contato (nunca NULL): interação registrada, senão o
      -- ultimo_contato importado/manual, senão a chegada do lead.
      GREATEST(
        0,
        floor(extract(epoch FROM (
          _now - COALESCE(l.ultima_interacao, l.ultimo_contato, l.created_at)
        )) / 86400)::integer
      ) AS dias_sem_contato,
      CASE
        WHEN ultima.ocorreu_em IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - ultima.ocorreu_em)) / 60)::bigint
        )
      END AS minutos_desde_resposta,
      CASE
        WHEN l.proximo_followup IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - l.proximo_followup)) / 60)::bigint
        )
      END AS minutos_followup_vencido,
      GREATEST(
        0,
        floor(extract(epoch FROM (_now - l.created_at)) / 60)::bigint
      ) AS minutos_desde_chegada
    FROM public.leads AS l
    LEFT JOIN LATERAL (
      SELECT i.direcao, i.ocorreu_em
      FROM public.interacoes AS i
      WHERE i.lead_id = l.id
        AND i.deleted_at IS NULL
      ORDER BY i.ocorreu_em DESC, i.id DESC
      LIMIT 1
    ) AS ultima ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS quantidade
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS docs ON true
    LEFT JOIN LATERAL (
      -- Próxima visita das 48h ainda sem confirmação (mesmo critério da
      -- exceção visita_sem_confirmacao do painel do gestor).
      SELECT a.id AS agendamento_id, a.data_inicio
      FROM public.agendamentos AS a
      WHERE a.lead_id = l.id
        AND a.deleted_at IS NULL
        AND a.tipo = 'visita'
        AND a.auto_gerado = false
        AND a.status = 'agendado'
        AND a.data_inicio BETWEEN _now AND _now + interval '48 hours'
      ORDER BY a.data_inicio ASC
      LIMIT 1
    ) AS visita ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id = _target
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND public.pode_acessar_lead(_caller, l.id)
  ), classified AS (
    SELECT
      b.*,
      CASE
        WHEN b.status IN (
          'novo'::public.lead_status,
          'aguardando_atendimento'::public.lead_status
        )
          THEN 'novos'
        WHEN b.ultima_direcao = 'entrada'::public.interacao_direcao
          THEN 'responder'
        WHEN b.proximo_followup IS NOT NULL AND b.proximo_followup <= _now
          THEN 'followups'
        WHEN b.temperatura IN (
          'quente'::public.lead_temperatura,
          'morno'::public.lead_temperatura
        ) AND b.dias_sem_contato >= 3
          THEN 'esfriando'
        WHEN b.visita_agendamento_id IS NOT NULL
          THEN 'confirmar_visita'
        WHEN b.docs_pendentes > 0
          THEN 'docs'
        ELSE NULL
      END::text AS fila,
      LEAST(
        100,
        GREATEST(
          0,
          CASE b.temperatura::text
            WHEN 'quente' THEN 35
            WHEN 'morno' THEN 15
            ELSE 0
          END
          + CASE b.status::text
            WHEN 'analise_credito' THEN 25
            WHEN 'visita_realizada' THEN 22
            WHEN 'agendado' THEN 16
            WHEN 'em_atendimento' THEN 12
            WHEN 'qualificacao_corretor' THEN 11
            WHEN 'aguardando_retorno' THEN 10
            WHEN 'qualificado' THEN 10
            WHEN 'aguardando_atendimento' THEN 6
            WHEN 'novo' THEN 6
            ELSE 0
          END
          + CASE
            WHEN b.ultima_interacao IS NULL THEN 12
            WHEN b.dias_sem_contato >= 1 THEN LEAST(20, b.dias_sem_contato * 4)
            ELSE 0
          END
        )
      )::integer AS score
    FROM base AS b
  ), with_reason AS (
    SELECT
      c.*,
      CASE
        WHEN c.score >= 60 THEN 'alta'
        WHEN c.score >= 35 THEN 'media'
        ELSE 'baixa'
      END::text AS tier,
      CASE c.fila
        WHEN 'novos' THEN
          'chegou ' || CASE
            WHEN c.minutos_desde_chegada < 60
              THEN 'há ' || c.minutos_desde_chegada || 'min'
            WHEN c.minutos_desde_chegada < 1440
              THEN 'há ' || floor(c.minutos_desde_chegada / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_desde_chegada / 1440.0)::bigint || 'd'
          END || ' e aguarda o primeiro contato'
        WHEN 'responder' THEN
          'respondeu ' || CASE
            WHEN c.minutos_desde_resposta < 60
              THEN 'há ' || c.minutos_desde_resposta || 'min'
            WHEN c.minutos_desde_resposta < 1440
              THEN 'há ' || floor(c.minutos_desde_resposta / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_desde_resposta / 1440.0)::bigint || 'd'
          END || ' e aguarda retorno'
        WHEN 'followups' THEN
          'follow-up combinado venceu ' || CASE
            WHEN c.minutos_followup_vencido < 60
              THEN 'há ' || c.minutos_followup_vencido || 'min'
            WHEN c.minutos_followup_vencido < 1440
              THEN 'há ' || floor(c.minutos_followup_vencido / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_followup_vencido / 1440.0)::bigint || 'd'
          END
        WHEN 'esfriando' THEN
          c.temperatura::text || ' sem contato há ' || c.dias_sem_contato || ' dia(s)'
        WHEN 'confirmar_visita' THEN
          'visita ' || to_char(c.visita_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
            || ' ainda sem confirmação'
        WHEN 'docs' THEN
          c.docs_pendentes || ' documento(s) pendente(s) travando a pasta'
        ELSE NULL
      END::text AS motivo
    FROM classified AS c
    WHERE c.fila IS NOT NULL
  ), ranked AS (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.fila
        ORDER BY
          r.score DESC,
          CASE r.fila
            WHEN 'novos' THEN r.created_at
            WHEN 'responder' THEN r.ultima_ocorreu_em
            WHEN 'followups' THEN r.proximo_followup
            WHEN 'confirmar_visita' THEN r.visita_em
            ELSE COALESCE(r.ultima_interacao, r.created_at)
          END ASC NULLS LAST,
          r.id
      ) AS row_number
    FROM with_reason AS r
  ), aggregated AS (
    SELECT
      r.fila,
      count(*)::bigint AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'lead', jsonb_build_object(
              'id', r.id,
              'nome', r.nome,
              'telefone', r.telefone,
              'email', r.email,
              'status', r.status,
              'temperatura', r.temperatura,
              'ultima_interacao', r.ultima_interacao,
              'proximo_followup', r.proximo_followup,
              'projeto_nome', r.projeto_nome,
              'created_at', r.created_at,
              'corretor_id', r.corretor_id,
              'origem', r.origem,
              'renda_informada', r.renda_informada,
              'entrada_disponivel', r.entrada_disponivel,
              'usa_fgts', r.usa_fgts
            ),
            'score', r.score,
            'tier', r.tier,
            'motivo', r.motivo,
            'docsPendentes', r.docs_pendentes,
            'agendamentoId', r.visita_agendamento_id,
            'visitaEm', r.visita_em
          )
          ORDER BY r.row_number
        ) FILTER (WHERE r.row_number <= _take),
        '[]'::jsonb
      ) AS items
    FROM ranked AS r
    GROUP BY r.fila
  )
  SELECT
    q.fila,
    COALESCE(a.total_count, 0::bigint),
    COALESCE(a.items, '[]'::jsonb)
  FROM queue_defs AS q
  LEFT JOIN aggregated AS a ON a.fila = q.fila
  ORDER BY q.ordem;
END;
$$;

REVOKE ALL ON FUNCTION public.atendimento_inbox_v4(uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.atendimento_inbox_v4(uuid, integer)
  TO authenticated;


-- fechamento_sinais_v1: etapa no radar de fechamento (coorte começa a
-- acumular histórico a partir de agora; espelho: src/lib/fechamento.ts).
CREATE OR REPLACE FUNCTION public.fechamento_sinais_v1(
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  WITH etapas_radar(status, indice_base, rotulo) AS (
    VALUES
      ('analise_credito'::public.lead_status, 72, 'Em analise de credito'::text),
      ('proposta_enviada'::public.lead_status, 60, 'Proposta enviada'::text),
      ('visita_realizada'::public.lead_status, 48, 'Visita realizada'::text),
      ('agendado'::public.lead_status, 35, 'Visita agendada'::text),
      ('qualificado'::public.lead_status, 24, 'Qualificado'::text),
      ('aguardando_retorno'::public.lead_status, 16, 'Aguardando retorno'::text),
      ('qualificacao_corretor'::public.lead_status, 15, 'Qualificacao do corretor'::text),
      ('em_atendimento'::public.lead_status, 14, 'Em atendimento'::text)
  ), entradas_coorte AS (
    -- Uma observacao por lead/etapa. A janela contem 365 dias completos de
    -- coortes, cada uma ja acompanhada durante todo o horizonte de 90 dias.
    SELECT
      t.lead_id,
      t.para_status AS status,
      min(t.created_at) AS entrada_em
    FROM public.lead_status_transitions AS t
    JOIN etapas_radar AS e ON e.status = t.para_status
    WHERE t.created_at >= now() - interval '455 days'
      AND t.created_at < now() - interval '90 days'
    GROUP BY t.lead_id, t.para_status
  ), entradas_maduras AS (
    -- Autoriza uma vez por lead/etapa, depois da deduplicacao do historico.
    SELECT e.*
    FROM entradas_coorte AS e
    JOIN public.leads AS historico ON historico.id = e.lead_id
    WHERE historico.deleted_at IS NULL
      AND public.pode_acessar_lead(_caller, historico.id)
  ), amostra_por_etapa AS (
    SELECT
      e.status,
      count(*)::integer AS amostra,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM public.vendas AS v
          WHERE v.lead_id = e.lead_id
            AND v.status_venda = 'aprovada'::public.status_venda
            AND v.aprovado_em >= e.entrada_em
            AND v.aprovado_em <= e.entrada_em + interval '90 days'
        )
      )::integer AS vendas_aprovadas
    FROM entradas_maduras AS e
    GROUP BY e.status
  ), leads_ativos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      e.indice_base,
      e.rotulo,
      COALESCE(a.amostra, 0) AS amostra,
      COALESCE(a.vendas_aprovadas, 0) AS vendas_aprovadas,
      COALESCE(d.pendentes, 0) AS documentos_pendentes
    FROM public.leads AS l
    JOIN etapas_radar AS e ON e.status = l.status
    LEFT JOIN amostra_por_etapa AS a ON a.status = l.status
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS pendentes
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS d ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND public.pode_acessar_lead(_caller, l.id)
  ), fatores AS (
    SELECT
      l.*,
      (
        CASE l.temperatura::text
          WHEN 'quente' THEN 15
          WHEN 'frio' THEN -12
          ELSE 0
        END
        + CASE
            WHEN l.ultima_interacao IS NULL THEN -10
            WHEN l.ultima_interacao >= now() - interval '2 days' THEN 10
            WHEN l.ultima_interacao < now() - interval '14 days' THEN -18
            WHEN l.ultima_interacao < now() - interval '7 days' THEN -8
            ELSE 0
          END
        + CASE
            WHEN l.proximo_followup >= now() THEN 5
            ELSE 0
          END
      )::integer AS ajuste_engajamento,
      array_remove(ARRAY[
        l.rotulo,
        CASE l.temperatura::text
          WHEN 'quente' THEN 'Temperatura quente'
          WHEN 'frio' THEN 'Temperatura fria'
          ELSE NULL
        END,
        CASE
          WHEN l.ultima_interacao IS NULL THEN 'Sem interacao registrada'
          WHEN l.ultima_interacao >= now() - interval '2 days' THEN 'Interacao nos ultimos 2 dias'
          WHEN l.ultima_interacao < now() - interval '14 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          WHEN l.ultima_interacao < now() - interval '7 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          ELSE NULL
        END,
        CASE
          WHEN l.proximo_followup >= now() THEN 'Follow-up programado'
          ELSE NULL
        END
      ], NULL)::text[] AS fatores
    FROM leads_ativos AS l
  ), calculados AS (
    SELECT
      f.*,
      CASE
        WHEN f.amostra >= 30 THEN LEAST(100, GREATEST(0, round(
          (100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0))
          + (f.ajuste_engajamento * 0.5)
        )::integer))
        ELSE LEAST(100, GREATEST(0, f.indice_base + f.ajuste_engajamento))
      END AS indice,
      CASE
        WHEN f.amostra >= 30 THEN 'historico_calibrado'
        ELSE 'heuristico'
      END AS metodo,
      CASE
        WHEN f.amostra >= 30
          THEN round(100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0), 1)
        ELSE NULL
      END AS taxa_historica_pct
    FROM fatores AS f
  ), ordenados AS (
    SELECT
      c.*,
      CASE
        WHEN c.indice >= 55 THEN 'alta'
        WHEN c.indice >= 30 THEN 'media'
        ELSE 'baixa'
      END AS nivel
    FROM calculados AS c
  ), visiveis AS (
    SELECT o.*
    FROM ordenados AS o
    ORDER BY o.indice DESC, o.ultima_interacao DESC NULLS LAST, o.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'nome', v.nome,
            'telefone', v.telefone,
            'status', v.status,
            'temperatura', v.temperatura,
            'ultima_interacao', v.ultima_interacao,
            'proximo_followup', v.proximo_followup,
            'projeto_nome', v.projeto_nome,
            'indice', v.indice,
            'nivel', v.nivel,
            'metodo', v.metodo,
            'taxa_historica_pct', v.taxa_historica_pct,
            'amostra_etapa', v.amostra,
            'vendas_aprovadas_etapa', v.vendas_aprovadas,
            'documentos_pendentes', v.documentos_pendentes,
            'fatores', to_jsonb(v.fatores)
          )
          ORDER BY v.indice DESC, v.ultima_interacao DESC NULLS LAST, v.id DESC
        )
        FROM visiveis AS v
      ),
      '[]'::jsonb
    ),
    'total_count', (SELECT count(*) FROM ordenados),
    'contagens', jsonb_build_object(
      'alta', (SELECT count(*) FROM ordenados WHERE nivel = 'alta'),
      'media', (SELECT count(*) FROM ordenados WHERE nivel = 'media'),
      'baixa', (SELECT count(*) FROM ordenados WHERE nivel = 'baixa')
    ),
    'limit', _take,
    'amostra_minima', 30,
    'janela_coorte_dias', 365,
    'horizonte_conversao_dias', 90,
    'indice_semantica', 'sinal_de_priorizacao_nao_probabilidade'
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.fechamento_sinais_v1(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fechamento_sinais_v1(integer)
  TO authenticated;

COMMENT ON FUNCTION public.fechamento_sinais_v1(integer) IS
  'Retorna ate 50 sinais de fechamento da carteira autorizada. Usa somente vendas aprovadas para taxa historica; indice e sinal de priorizacao, nunca probabilidade individual.';

NOTIFY pgrst, 'reload schema';
