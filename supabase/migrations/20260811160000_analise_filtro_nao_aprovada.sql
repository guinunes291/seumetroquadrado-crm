-- Quinta opção do filtro de análise (pedido do dono, 2026-08-11):
-- 'nao_aprovada' = o lead TEM análise e a última NÃO é aprovação — nem plena
-- nem condicionada. Cobre enviada/pendente/reprovada num recorte só: a fila
-- de retrabalho + espera ("quem tem análise e ainda não liberou").
--
-- Mesmo nome e mesma assinatura (só um valor aceito a mais na validação e um
-- ramo novo no CASE) — CREATE OR REPLACE é legal aqui; o corpo parte da
-- versão VIVA (fiação 20260811151000, que já carrega o score da etapa nova).
-- Regra de ouro mantida: o recorte muda nas DUAS funções, chips e lista
-- nunca divergem. Lead SEM análise segue fora de qualquer recorte (subquery
-- NULL não casa com IN).

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
     ('all','em_andamento','aprovada','aprovada_condicionada','reprovada','nao_aprovada') THEN
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
             WHEN 'nao_aprovada' THEN
               (SELECT ac.status FROM public.analises_credito ac
                 WHERE ac.lead_id = l.id ORDER BY ac.created_at DESC LIMIT 1)
               IN ('enviada','pendente','reprovada')
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

CREATE OR REPLACE FUNCTION public.leads_status_counts_v5(
  _na_lixeira boolean DEFAULT false,
  _origem text DEFAULT NULL,
  _corretor text DEFAULT NULL,
  _temperatura text DEFAULT NULL,
  _periodo_start timestamptz DEFAULT NULL,
  _periodo_end timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _search_digits text DEFAULT NULL,
  _contato text DEFAULT NULL,
  _parado_dias int DEFAULT NULL,
  _analise text DEFAULT NULL
) RETURNS TABLE(status text, quantidade bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
  _tz text := 'America/Sao_Paulo';
  _hoje0 timestamptz;
  _contato_norm text := COALESCE(_contato, 'all');
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _contato_norm NOT IN ('all','contato_ontem','contato_7d','contato_30d',
                           'com_followup','sem_contato_5d','sem_contato_30d') THEN
    RAISE EXCEPTION 'contato invalido: %', _contato USING ERRCODE = '22023';
  END IF;
  IF _parado_dias IS NOT NULL AND (_parado_dias < 1 OR _parado_dias > 365) THEN
    RAISE EXCEPTION 'parado_dias fora de 1..365: %', _parado_dias USING ERRCODE = '22023';
  END IF;
  IF _analise IS NOT NULL AND _analise NOT IN
     ('all','em_andamento','aprovada','aprovada_condicionada','reprovada','nao_aprovada') THEN
    RAISE EXCEPTION 'analise invalido: %', _analise USING ERRCODE = '22023';
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  _hoje0 := date_trunc('day', now() AT TIME ZONE _tz) AT TIME ZONE _tz;

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
      l.status::text AS status,
      l.ultima_interacao,
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
      END AS data_filtro
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = _na_lixeira
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
             WHEN 'nao_aprovada' THEN
               (SELECT ac.status FROM public.analises_credito ac
                 WHERE ac.lead_id = l.id ORDER BY ac.created_at DESC LIMIT 1)
               IN ('enviada','pendente','reprovada')
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
        ELSE false
      END
  ),
  filtrado AS (
    SELECT c.status
    FROM com_contato c
    WHERE (_periodo_start IS NULL OR c.data_filtro >= _periodo_start)
      AND (_periodo_end IS NULL OR c.data_filtro <= _periodo_end)
  )
  SELECT f.status, count(*) AS quantidade
  FROM filtrado f
  GROUP BY f.status
  UNION ALL
  SELECT '__total__', count(*) FROM filtrado;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_status_counts_v5(boolean, text, text, text, timestamptz, timestamptz, text, text, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_status_counts_v5(boolean, text, text, text, timestamptz, timestamptz, text, text, text, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_status_counts_v5(boolean, text, text, text, timestamptz, timestamptz, text, text, text, int, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
