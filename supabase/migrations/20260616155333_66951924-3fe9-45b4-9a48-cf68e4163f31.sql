ALTER TABLE public.copa_pontuacoes ADD COLUMN IF NOT EXISTS total integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.copa_ranking(_edicao_id uuid)
 RETURNS TABLE(corretor_id uuid, nome text, bandeira text, agendamentos integer, visitas integer, analise integer, vendas integer, total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT data_inicio::timestamptz AS di, (data_fim + 1)::timestamptz AS df
    FROM public.copa_edicao WHERE id = _edicao_id
  ),
  cfg AS (
    SELECT
      COALESCE(MAX(pontos) FILTER (WHERE chave='agendamento'),0) AS p_ag,
      COALESCE(MAX(pontos) FILTER (WHERE chave='visita'),0)      AS p_vi,
      COALESCE(MAX(pontos) FILTER (WHERE chave='analise'),0)     AS p_an,
      COALESCE(MAX(pontos) FILTER (WHERE chave='venda'),0)       AS p_ve
    FROM public.copa_config_pontos
  ),
  part AS (
    SELECT cp.corretor_id AS cid, s.bandeira AS bandeira
    FROM public.copa_participantes cp
    LEFT JOIN public.copa_selecoes s ON s.id = cp.selecao_id
    WHERE cp.edicao_id = _edicao_id AND cp.ativo = true
  ),
  ag AS (
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a, e
    WHERE a.deleted_at IS NULL AND a.created_at >= e.di AND a.created_at < e.df
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id AS cid,
      count(*) FILTER (WHERE t.para_status='visita_realizada')::int AS vi,
      count(*) FILTER (WHERE t.para_status='analise_credito')::int  AS an,
      count(*) FILTER (WHERE t.para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions t, e
    WHERE t.created_at >= e.di AND t.created_at < e.df
    GROUP BY t.corretor_id
  ),
  man AS (
    SELECT pn.corretor_id AS cid,
      COALESCE(SUM(pn.agendamentos),0)::int AS ag,
      COALESCE(SUM(pn.visitas),0)::int      AS vi,
      COALESCE(SUM(pn.analise),0)::int      AS an,
      COALESCE(SUM(pn.vendas),0)::int       AS ve,
      COALESCE(SUM(pn.total),0)::int        AS bonus
    FROM public.copa_pontuacoes pn
    WHERE pn.edicao_id = _edicao_id
    GROUP BY pn.corretor_id
  )
  SELECT
    part.cid,
    COALESCE(pr.nome, 'Corretor'),
    COALESCE(part.bandeira, ''),
    (COALESCE(ag.n,0)  + COALESCE(man.ag,0)),
    (COALESCE(tr.vi,0) + COALESCE(man.vi,0)),
    (COALESCE(tr.an,0) + COALESCE(man.an,0)),
    (COALESCE(tr.ve,0) + COALESCE(man.ve,0)),
    ((COALESCE(ag.n,0)  + COALESCE(man.ag,0)) * cfg.p_ag
     + (COALESCE(tr.vi,0) + COALESCE(man.vi,0)) * cfg.p_vi
     + (COALESCE(tr.an,0) + COALESCE(man.an,0)) * cfg.p_an
     + (COALESCE(tr.ve,0) + COALESCE(man.ve,0)) * cfg.p_ve
     + COALESCE(man.bonus,0))
  FROM part
  CROSS JOIN cfg
  LEFT JOIN public.profiles pr ON pr.id = part.cid
  LEFT JOIN ag  ON ag.cid  = part.cid
  LEFT JOIN tr  ON tr.cid  = part.cid
  LEFT JOIN man ON man.cid = part.cid
  ORDER BY 8 DESC, 2 ASC;
$function$;