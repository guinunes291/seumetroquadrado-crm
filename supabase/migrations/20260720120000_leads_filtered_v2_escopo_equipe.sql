-- leads_filtered_v2 — escopo de gestor = EQUIPE (fecha a última brecha do "gestor global").
--
-- Contexto: a unificação de 20260719130000_kpis_consistencia.sql ("ESCOPO DE GESTOR =
-- EQUIPE") reescreveu leads_status_counts_v2, os dashboards e as policies de SELECT
-- (leads/tarefas/agendamentos) para o escopo carteira/equipe, mas NÃO reescreveu a RPC da
-- LISTA de leads, leads_filtered_v2 (definida em 20260714100000_leads_filtered_v2.sql). Ela
-- ficou com a lógica antiga `_is_gestor := has_role(admin|gestor|superintendente)` e o filtro
-- `(_is_gestor OR (corretor_id = _caller AND status <> 'novo'))` — ou seja, QUALQUER gestor
-- via TODOS os leads da empresa na tela de Leads, enquanto as contagens (chip "Todos") já
-- estavam recortadas por equipe. Resultado: lista global × contagem por equipe.
--
-- Correção: espelhar em leads_filtered_v2 o MESMO escopo de leads_status_counts_v2 (19/07):
--   _ve_tudo := ve_carteira_completa(_caller)            -- admin/superintendente veem tudo
--   _equipe  := corretores_do_gestor(_caller)            -- gestor: própria carteira + equipe
--                                                        --   (exclui leads órfãos sem corretor)
--   ... AND (_ve_tudo OR corretor_id = _caller OR corretor_id = ANY(_equipe))
-- Corretor passa a enxergar também os próprios 'novo' (igual kanban/RLS/contagens de 19/07).
-- Nenhuma outra parte do corpo muda: mesmas colunas, filtros, ordenação e paginação.
-- (ve_carteira_completa e corretores_do_gestor vêm de 20260718100000_escopo_carteira_rapido.sql.)

CREATE OR REPLACE FUNCTION public.leads_filtered_v2(
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
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean;
  _ve_tudo boolean;
  _equipe uuid[];
  _tz text := 'America/Sao_Paulo';
  _hoje0 timestamptz;
  _sort_col text;
  _sort_desc boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _is_gestor := public.has_role(_caller,'admin')
             OR public.has_role(_caller,'gestor')
             OR public.has_role(_caller,'superintendente');
  -- Mesma régua do leads_status_counts_v2/pipeline/RLS: admin/superintendente veem tudo;
  -- gestor vê carteira própria + equipe (sem leads órfãos); corretor vê a própria carteira
  -- (INCLUSIVE 'novo').
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  -- meia-noite de HOJE no fuso da operação (para "contato ontem")
  _hoje0 := date_trunc('day', now() AT TIME ZONE _tz) AT TIME ZONE _tz;

  -- whitelist de ordenação (qualquer outro valor cai no padrão de prioridade)
  _sort_col := CASE WHEN _sort IN ('nome','created_at','ultima_interacao','status','temperatura')
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
      EXISTS (
        SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = l.id
          AND t.tipo = 'follow_up'
          AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL
          AND (_is_gestor OR t.corretor_id = _caller)
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
      END AS prioridade
    FROM public.leads l
    LEFT JOIN ultima_venda uv ON uv.lead_id = l.id
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
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
  ),
  com_contato AS (
    SELECT * FROM base b
    WHERE
      CASE COALESCE(_contato, 'all')
        WHEN 'all' THEN true
        WHEN 'contato_ontem' THEN
          b.ultima_interacao >= _hoje0 - interval '1 day' AND b.ultima_interacao < _hoje0
        WHEN 'contato_7d' THEN b.ultima_interacao >= now() - interval '7 days'
        WHEN 'contato_30d' THEN b.ultima_interacao >= now() - interval '30 days'
        WHEN 'com_followup' THEN b.tem_followup
        WHEN 'sem_contato_5d' THEN
          (b.ultima_interacao IS NULL OR b.ultima_interacao < now() - interval '5 days')
          AND b.status NOT IN ('contrato_fechado','pos_venda','perdido')
        ELSE true
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
    CASE WHEN _sort_col = 'status' AND NOT _sort_desc THEN f.status END ASC,
    CASE WHEN _sort_col = 'status' AND _sort_desc THEN f.status END DESC,
    CASE WHEN _sort_col = 'temperatura' AND NOT _sort_desc THEN f.temperatura END ASC,
    CASE WHEN _sort_col = 'temperatura' AND _sort_desc THEN f.temperatura END DESC,
    CASE WHEN _sort_col IS NULL THEN f.prioridade END ASC,
    CASE WHEN _sort_col IS NULL AND f.status = 'contrato_fechado' THEN f.data_venda END DESC NULLS LAST,
    f.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.leads_filtered_v2(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_filtered_v2(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_filtered_v2(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
