-- Fila Única: o funil das etapas do corretor (ou da operação, para a gestão)
-- em dois recortes numa chamada só — 'safra' (leads criados nos últimos
-- _dias) e 'base' (a carteira inteira, viva ou fechada). Cada linha diz
-- quantos leads estão na etapa e quantos estão parados há 5+ dias pelo relógio
-- da Higiene do Funil: GREATEST(ultima_interacao, ultimo_contato), senão
-- created_at — o mesmo relógio que ordena o fundo do funil na fila.
--
-- 'perdido' volta como etapa própria (ordem 99): é a saída lateral do funil, e
-- o cliente a mostra fora dos degraus. 'entrada' (ordem 0: novo e aguardando
-- corretor) só aparece para quem enxerga lead sem dono.
--
-- Escopo, na mesma regra de dashboard_funil e leads_sem_acao: corretor vê SÓ
-- a própria carteira (o parâmetro _corretor é ignorado); gestão pode pedir um
-- corretor do escopo dela ou NULL (tudo que o escopo alcança). Nenhuma linha
-- fora do escopo, nunca um erro por pedir corretor de outra equipe.
CREATE OR REPLACE FUNCTION public.fila_funil_v1(
  _dias integer DEFAULT 30,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE (
  recorte text,
  etapa text,
  ordem smallint,
  quantidade integer,
  parados integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _gestao boolean;
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
  _janela interval := make_interval(days => LEAST(GREATEST(COALESCE(_dias, 30), 1), 365));
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _gestao := public.has_role(_caller, 'admin')
          OR public.has_role(_caller, 'gestor')
          OR public.has_role(_caller, 'superintendente');
  IF NOT _gestao THEN
    _scope := _caller;
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH carteira AS (
    SELECT
      public.funil_ordem(l.status) AS ord,
      l.created_at AS criado_em,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (_scope IS NULL OR l.corretor_id = _scope)
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
  ),
  recortes AS (
    SELECT 'base'::text AS rec, c.ord, c.movimento FROM carteira AS c
    UNION ALL
    SELECT 'safra'::text, c.ord, c.movimento FROM carteira AS c
     WHERE c.criado_em >= now() - _janela
  )
  SELECT
    r.rec,
    CASE r.ord
      WHEN 0 THEN 'entrada'
      WHEN 1 THEN 'aguardando_atendimento'
      WHEN 2 THEN 'aguardando_retorno'
      WHEN 3 THEN 'qualificacao_corretor'
      WHEN 4 THEN 'em_atendimento'
      WHEN 5 THEN 'agendado'
      WHEN 6 THEN 'visita_realizada'
      WHEN 7 THEN 'analise_credito'
      WHEN 8 THEN 'venda'
      ELSE 'perdido'
    END,
    r.ord,
    count(*)::integer,
    -- Parado só faz sentido no funil comercial (1..7): venda e perdido são
    -- terminais, entrada ainda não tem dono.
    count(*) FILTER (
      WHERE r.ord BETWEEN 1 AND 7 AND r.movimento < now() - interval '5 days'
    )::integer
  FROM recortes AS r
  GROUP BY r.rec, r.ord
  ORDER BY r.rec, r.ord;
END;
$$;

COMMENT ON FUNCTION public.fila_funil_v1(integer, uuid) IS
  'Fila Única: funil das etapas em dois recortes (safra de N dias e base inteira), com leads na etapa e parados há 5+ dias pelo relógio da Higiene. Corretor vê só a própria carteira; gestão escolhe corretor do escopo ou NULL.';

GRANT EXECUTE ON FUNCTION public.fila_funil_v1(integer, uuid) TO authenticated, service_role;
