-- Paginação + contagem 100% server-side da lista de leads.
-- Uma RPC única devolve { total, counts (por status), rows (página atual) },
-- aplicando os MESMOS filtros do cliente e o escopo por papel (gestor vê tudo;
-- corretor vê só os próprios, exceto 'novo'). Ordenação de prioridade
-- (aguardando+facebook > aguardando+projeto > aguardando > demais), por recência.

CREATE OR REPLACE FUNCTION public.leads_listagem(
  _status text DEFAULT 'all',
  _origem text DEFAULT 'all',
  _corretor text DEFAULT 'all',
  _temperatura text DEFAULT 'all',
  _periodo text DEFAULT 'all',
  _contato text DEFAULT 'all',
  _busca text DEFAULT '',
  _lixeira boolean DEFAULT false,
  _page int DEFAULT 1,
  _page_size int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin')
    OR public.has_role(_caller,'gestor')
    OR public.has_role(_caller,'superintendente');
  _dt timestamptz;
  _tem_busca boolean := length(coalesce(_busca,'')) > 0;
  _busca_like text := '%' || replace(replace(coalesce(_busca,''), '%', ''), ',', '') || '%';
  _offset int := (greatest(_page, 1) - 1) * _page_size;
  -- CASE garante o curto-circuito: só faz o cast quando _corretor é um uuid de fato.
  _corretor_uuid uuid := CASE
    WHEN _corretor NOT IN ('all', 'unassigned') THEN _corretor::uuid
    ELSE NULL
  END;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  _dt := CASE _periodo
    WHEN 'hoje' THEN date_trunc('day', now())
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE NULL
  END;

  RETURN (
    WITH base AS (
      SELECT l.*
      FROM public.leads l
      WHERE l.na_lixeira = _lixeira
        AND (_origem = 'all' OR l.origem::text = _origem)
        AND (
          _corretor = 'all'
          OR (_corretor = 'unassigned' AND l.corretor_id IS NULL)
          OR (_corretor_uuid IS NOT NULL AND l.corretor_id = _corretor_uuid)
        )
        AND (_temperatura = 'all' OR l.temperatura::text = _temperatura)
        AND (_dt IS NULL OR l.created_at >= _dt)
        AND (
          NOT _tem_busca
          OR l.nome ILIKE _busca_like
          OR l.email ILIKE _busca_like
          OR l.telefone ILIKE _busca_like
        )
        AND (_is_gestor OR (l.status::text <> 'novo' AND l.corretor_id = _caller))
        AND (
          _contato = 'all'
          OR (_contato = 'contato_ontem'
              AND l.ultima_interacao >= date_trunc('day', now()) - interval '1 day'
              AND l.ultima_interacao < date_trunc('day', now()))
          OR (_contato = 'contato_7d' AND l.ultima_interacao >= now() - interval '7 days')
          OR (_contato = 'contato_30d' AND l.ultima_interacao >= now() - interval '30 days')
          OR (_contato = 'com_followup' AND EXISTS (
                SELECT 1 FROM public.tarefas t
                WHERE t.lead_id = l.id
                  AND t.tipo = 'follow_up'
                  AND t.status IN ('pendente', 'em_andamento')
              ))
          OR (_contato = 'sem_contato_5d'
              AND (l.ultima_interacao IS NULL OR l.ultima_interacao < now() - interval '5 days')
              AND l.status::text NOT IN ('contrato_fechado', 'pos_venda', 'perdido'))
        )
    ),
    pagina AS (
      SELECT id, nome, email, telefone, origem::text AS origem, status::text AS status,
             temperatura::text AS temperatura, corretor_id, projeto_id, projeto_nome,
             observacoes, created_at, ultima_interacao, na_lixeira,
             renda_informada, entrada_disponivel, usa_fgts
      FROM base
      WHERE (_status = 'all' OR status::text = _status)
      ORDER BY
        CASE
          WHEN status::text = 'aguardando_atendimento' AND origem::text = 'facebook' THEN 0
          WHEN status::text = 'aguardando_atendimento' AND (projeto_id IS NOT NULL OR projeto_nome IS NOT NULL) THEN 1
          WHEN status::text = 'aguardando_atendimento' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT _page_size OFFSET _offset
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*)::int FROM base),
      'counts', (
        SELECT COALESCE(jsonb_object_agg(g.status, g.n), '{}'::jsonb)
        FROM (SELECT status::text AS status, count(*)::int AS n FROM base GROUP BY status) g
      ),
      'rows', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM pagina p)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.leads_listagem(
  text, text, text, text, text, text, text, boolean, int, int
) TO authenticated;
