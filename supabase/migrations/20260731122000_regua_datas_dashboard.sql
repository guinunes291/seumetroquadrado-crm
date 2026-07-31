-- =====================================================================
-- Régua de datas (3/4) — RPCs do dashboard / aba Relatórios
--
-- Cada métrica passa a ter UMA data canônica, sempre a data do fato:
--
--   Leads .................. leads.created_at
--   Agendamentos ........... agendamentos.created_at (todos os criados)
--   Comparecimento/no-show . agendamentos.data_inicio (qualidade da agenda)
--   Visita realizada ....... agendamentos.data_inicio dos VALIDADOS
--                            (tipo visita, status realizado) — uma por
--                            agendamento, remarcação conta de novo
--   Pasta .................. leads.pasta_montada_em
--   Análise de crédito ..... data da transição para analise_credito
--                            (o lead conta uma vez no período)
--   Perdidos ............... data da transição para perdido (1x por lead)
--   Venda / VGV ............ vendas.data_assinatura, apenas aprovada e
--                            sem distrato. Nunca a data de cadastro, nunca
--                            a data de aprovação.
--
-- O parâmetro _campo_data continua na assinatura só para não quebrar
-- clientes já publicados, mas é IGNORADO: não existe mais "data de
-- registro × data do evento", existe a data certa de cada métrica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- vendas.data_assinatura: fim do default silencioso
--
-- A coluna é NOT NULL com DEFAULT CURRENT_DATE — ou seja, uma venda gravada
-- sem a data explícita não ficava vazia: ficava com a data de HOJE, que é
-- exatamente o erro que estamos corrigindo (venda de junho lançada em julho
-- virando resultado de julho). O formulário de venda já exige o campo; sem o
-- default, qualquer caminho que esqueça a data falha alto em vez de mentir.
-- ---------------------------------------------------------------------
ALTER TABLE public.vendas ALTER COLUMN data_assinatura DROP DEFAULT;

COMMENT ON COLUMN public.vendas.data_assinatura IS
  'Data da assinatura — data canônica da venda em TODO relatório. Obrigatória e sem default: nenhuma venda pode herdar a data do dia do cadastro.';

-- ---------------------------------------------------------------------
-- dashboard_atividade_periodo — o coração dos KPIs do período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_atividade_periodo(
  _di timestamp with time zone,
  _df timestamp with time zone,
  _scope uuid,
  _campo_data text DEFAULT 'criacao'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _di_date date := CASE WHEN _di IS NULL THEN NULL ELSE (_di AT TIME ZONE 'America/Sao_Paulo')::date END;
  _df_date date := CASE WHEN _df IS NULL THEN NULL ELSE (_df AT TIME ZONE 'America/Sao_Paulo')::date END;
  _caller uuid := auth.uid();
  -- Sem caller (contexto de serviço, sem JWT) mantém o comportamento
  -- histórico: sem recorte de carteira, o _scope manda sozinho.
  _sem_caller boolean := (_caller IS NULL);
  _ve_tudo boolean := public.ve_carteira_completa(_caller);
  _equipe uuid[] := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  _leads_novos int;
  _agendamentos int;
  _visitas int;
  _no_shows int;
  _visitas_agendadas int;
  _pastas int;
  _analises int;
  _perdidos int;
  _vendas int;
  _vgv numeric;
BEGIN
  -- Leads: data de criação do lead.
  SELECT count(*)::int INTO _leads_novos
  FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Agendamentos: data de CRIAÇÃO do agendamento (produção do corretor).
  -- Conta todos os criados, inclusive os que depois foram remarcados ou
  -- cancelados — o que aconteceu com eles é medido logo abaixo. Fora só os
  -- sintéticos (criados pelo sistema para datar visita sem agenda).
  SELECT count(*)::int INTO _agendamentos
  FROM public.agendamentos
  WHERE deleted_at IS NULL
    AND auto_gerado = false
    AND (_di IS NULL OR created_at >= _di) AND (_df IS NULL OR created_at < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Visitas realizadas / no-show / base de comparecimento: sempre pelo dia
  -- em que a visita estava marcada (data_inicio), validada por agendamento.
  SELECT
    count(*) FILTER (WHERE status = 'realizado')::int,
    count(*) FILTER (WHERE status = 'nao_compareceu')::int,
    count(*) FILTER (WHERE status IN ('realizado','nao_compareceu','agendado','confirmado'))::int
  INTO _visitas, _no_shows, _visitas_agendadas
  FROM public.agendamentos
  WHERE deleted_at IS NULL
    AND tipo = 'visita'
    AND (_di IS NULL OR data_inicio >= _di) AND (_df IS NULL OR data_inicio < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Pasta: data em que a pasta foi montada (3+ documentos recebidos).
  SELECT count(*)::int INTO _pastas
  FROM public.leads
  WHERE deleted_at IS NULL
    AND pasta_montada_em IS NOT NULL
    AND (_di IS NULL OR pasta_montada_em >= _di) AND (_df IS NULL OR pasta_montada_em < _df)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  -- Análise de crédito: data da MUDANÇA de status. O lead conta uma vez
  -- por período mesmo se entrar e sair mais de uma vez.
  SELECT count(DISTINCT t.lead_id)::int INTO _analises
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'analise_credito'
    AND l.deleted_at IS NULL
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
    AND (_sem_caller OR _ve_tudo
         OR COALESCE(t.corretor_id, l.corretor_id) = _caller
         OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe));

  -- Perdidos: perda é fato histórico — o lead que foi para a lixeira
  -- depois de perdido CONTINUA contando. Só soft-delete apaga.
  SELECT count(DISTINCT t.lead_id)::int INTO _perdidos
  FROM public.lead_status_transitions t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.para_status = 'perdido'
    AND l.deleted_at IS NULL
    AND (_di IS NULL OR t.created_at >= _di) AND (_df IS NULL OR t.created_at < _df)
    AND (_scope IS NULL OR COALESCE(t.corretor_id, l.corretor_id) = _scope)
    AND (_sem_caller OR _ve_tudo
         OR COALESCE(t.corretor_id, l.corretor_id) = _caller
         OR COALESCE(t.corretor_id, l.corretor_id) = ANY(_equipe));

  -- Venda e VGV: SEMPRE a data da assinatura. Nunca a data de cadastro,
  -- nunca a data de aprovação. Só venda aprovada e sem distrato.
  SELECT count(*)::int, COALESCE(sum(valor_venda), 0) INTO _vendas, _vgv
  FROM public.vendas
  WHERE distrato = false
    AND status_venda = 'aprovada'
    AND data_assinatura IS NOT NULL
    AND (_di_date IS NULL OR data_assinatura >= _di_date)
    AND (_df_date IS NULL OR data_assinatura <= _df_date)
    AND (_scope IS NULL OR corretor_id = _scope)
    AND (_sem_caller OR _ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe));

  RETURN jsonb_build_object(
    'leads_novos', _leads_novos,
    'agendamentos', _agendamentos,
    'visitas', _visitas,
    'no_shows', _no_shows,
    'visitas_agendadas', _visitas_agendadas,
    'pastas', _pastas,
    'analises', _analises,
    'perdidos', _perdidos,
    'vendas', _vendas,
    'vgv', _vgv
  );
END;
$function$;

COMMENT ON FUNCTION public.dashboard_atividade_periodo(timestamptz, timestamptz, uuid, text) IS
  'KPIs do período com a data canônica de cada métrica: lead=criação, agendamento=criação, visita=dia da visita validada, pasta=pasta montada, análise=mudança de status, venda=data da assinatura. _campo_data é ignorado (mantido só por compatibilidade).';

-- ---------------------------------------------------------------------
-- dashboard_serie_diaria — mesma régua, dia a dia
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(
  _di timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _df timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _corretor uuid DEFAULT NULL::uuid,
  _campo_data text DEFAULT 'criacao'::text
)
RETURNS TABLE(dia date, leads integer, agendamentos integer, visitas integer, vendas integer)
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
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d1 date;
  _d2 date;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  IF _di IS NULL OR _df IS NULL THEN
    _d1 := _hoje - 89;
    _d2 := _hoje;
  ELSE
    _d1 := (_di AT TIME ZONE 'America/Sao_Paulo')::date;
    _d2 := LEAST((_df AT TIME ZONE 'America/Sao_Paulo')::date, _hoje);
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(_d1, _d2, interval '1 day')::date AS d
  ),
  l AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  ),
  ag AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND auto_gerado = false
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  ),
  vi AS (
    SELECT (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::int AS n
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND tipo = 'visita'
      AND status = 'realizado'
      AND (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  ),
  ve AS (
    SELECT data_assinatura AS d, count(*)::int AS n
    FROM public.vendas
    WHERE distrato = false
      AND status_venda = 'aprovada'
      AND data_assinatura BETWEEN _d1 AND _d2
      AND (_scope IS NULL OR corretor_id = _scope)
      AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(l.n,0),
         COALESCE(ag.n,0),
         COALESCE(vi.n,0),
         COALESCE(ve.n,0)
  FROM dias
  LEFT JOIN l  ON l.d  = dias.d
  LEFT JOIN ag ON ag.d = dias.d
  LEFT JOIN vi ON vi.d = dias.d
  LEFT JOIN ve ON ve.d = dias.d
  ORDER BY dias.d;
END;
$function$;

-- ---------------------------------------------------------------------
-- dashboard_funil — passa a contar EVENTOS ocorridos no período
--
-- Antes: coorte por data de criação do lead, olhando o status de HOJE
-- ("de quem entrou no período, quantos chegaram até aqui"). Agora cada
-- etapa responde "quantos leads passaram por aqui DENTRO do período",
-- pela data de cada fato. Como são eventos, uma etapa pode ser maior que
-- a anterior (lead criado mês passado que visitou agora) — é a leitura
-- correta de produção do período, não uma inconsistência.
--
-- Grão: leads distintos (é um funil de leads). O contador de visitas
-- realizadas por agendamento fica nos KPIs, onde cada visita conta.
-- ---------------------------------------------------------------------
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
                            WHERE para_status IN ('em_atendimento','qualificado','aguardando_retorno'))),
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
CREATE OR REPLACE FUNCTION public.dashboard_metricas_por_corretor(
  _di timestamp with time zone,
  _df timestamp with time zone,
  _campo_data text DEFAULT 'criacao'::text
)
RETURNS TABLE(
  corretor_id uuid, nome text, leads integer, agendamentos integer,
  visitas integer, analise integer, fechados integer, perdidos integer,
  conversao numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _di_date date := (_di AT TIME ZONE 'America/Sao_Paulo')::date;
  _df_date date := (_df AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- admin/superintendente veem todos; gestor só a equipe.
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH ll AS (
    SELECT l.corretor_id AS cid, count(*)::int AS n
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.corretor_id IS NOT NULL
      AND l.created_at >= _di AND l.created_at < _df
      AND (_ve_tudo OR l.corretor_id = ANY(_equipe))
    GROUP BY l.corretor_id
  ),
  ag AS (
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.corretor_id IS NOT NULL AND a.auto_gerado = false
      AND a.created_at >= _di AND a.created_at < _df
      AND (_ve_tudo OR a.corretor_id = ANY(_equipe))
    GROUP BY a.corretor_id
  ),
  vi AS (
    -- Visita conta por agendamento validado, no dia em que a visita ocorreu.
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.corretor_id IS NOT NULL
      AND a.tipo = 'visita' AND a.status = 'realizado'
      AND a.data_inicio >= _di AND a.data_inicio < _df
      AND (_ve_tudo OR a.corretor_id = ANY(_equipe))
    GROUP BY a.corretor_id
  ),
  tr AS (
    -- Etapas de status contam o lead uma vez por período.
    SELECT t.corretor_id AS cid,
           count(DISTINCT t.lead_id) FILTER (WHERE t.para_status='analise_credito')::int AS an,
           count(DISTINCT t.lead_id) FILTER (WHERE t.para_status='perdido')::int AS perd
    FROM public.lead_status_transitions t
    WHERE t.created_at >= _di AND t.created_at < _df AND t.corretor_id IS NOT NULL
      AND (_ve_tudo OR t.corretor_id = ANY(_equipe))
    GROUP BY t.corretor_id
  ),
  ve AS (
    -- Venda pela data da assinatura, só aprovada e sem distrato.
    SELECT v.corretor_id AS cid, count(*)::int AS n
    FROM public.vendas v
    WHERE v.distrato = false AND v.status_venda = 'aprovada'
      AND v.data_assinatura IS NOT NULL
      AND v.data_assinatura >= _di_date AND v.data_assinatura <= _df_date
      AND v.corretor_id IS NOT NULL
      AND (_ve_tudo OR v.corretor_id = ANY(_equipe))
    GROUP BY v.corretor_id
  ),
  todos AS (
    SELECT cid FROM ll
    UNION SELECT cid FROM ag
    UNION SELECT cid FROM vi
    UNION SELECT cid FROM tr
    UNION SELECT cid FROM ve
  )
  SELECT t.cid,
         COALESCE(p.nome, 'Corretor'),
         COALESCE(ll.n,0),
         COALESCE(ag.n,0),
         COALESCE(vi.n,0),
         COALESCE(tr.an,0),
         COALESCE(ve.n,0),
         COALESCE(tr.perd,0),
         CASE WHEN COALESCE(ll.n,0) > 0
              THEN round((COALESCE(ve.n,0)::numeric / ll.n::numeric) * 100, 1)
              ELSE 0 END
  FROM todos t
  LEFT JOIN ll ON ll.cid = t.cid
  LEFT JOIN ag ON ag.cid = t.cid
  LEFT JOIN vi ON vi.cid = t.cid
  LEFT JOIN tr ON tr.cid = t.cid
  LEFT JOIN ve ON ve.cid = t.cid
  LEFT JOIN public.profiles p ON p.id = t.cid
  ORDER BY COALESCE(ve.n,0) DESC, COALESCE(vi.n,0) DESC, COALESCE(ll.n,0) DESC;
END;
$function$;

COMMENT ON FUNCTION public.dashboard_metricas_por_corretor(timestamptz, timestamptz, text) IS
  'Ranking por corretor na régua canônica: lead=criação, agendamento=criação, visita=dia da visita validada, análise/perdido=data da mudança de status (1x por lead), venda=data da assinatura.';
