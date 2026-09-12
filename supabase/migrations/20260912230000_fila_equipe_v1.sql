-- Fila Única, vista pelo gestor: uma linha por corretor do escopo com os
-- números que a fila cobra — carteira ativa (leads vivos com dono), próximos
-- passos vencidos, sem próximo passo (a mesma régua de leads_sem_acao), fundo
-- do funil parado (agendado / visita / proposta / análise sem movimento há
-- 5+ dias pelo relógio da Higiene) e o dinheiro em jogo (VGV pelo preço de
-- tabela do projeto de interesse, a convenção valor_potencial das métricas).
--
-- Quem precisa de ajuda hoje não é quem tem mais leads: é quem tem fundo do
-- funil parado e vencidos — por isso a ordem. Só gestão (admin, gestor,
-- superintendente); o gestor vê a própria equipe, admin e superintendente
-- veem a operação e ganham a linha "Sem corretor" (o estoque sem dono, que
-- é assunto da Higiene). Corretor recebe 42501, nunca uma lista vazia.
CREATE OR REPLACE FUNCTION public.fila_equipe_v1()
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  carteira_ativa integer,
  vencidos integer,
  sem_proximo_passo integer,
  fundo_parado integer,
  em_jogo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT _ve_tudo AND cardinality(_equipe) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
        OR p.id = _caller
      )
  ),
  vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.proximo_followup,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END AS valor
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND (
        (l.corretor_id IS NULL AND _ve_tudo)
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR (_ve_tudo AND l.corretor_id IS NOT NULL)
      )
  ),
  marcados AS (
    SELECT
      v.corretor_id,
      v.valor,
      (v.proximo_followup IS NOT NULL AND v.proximo_followup < now()) AS vencido,
      -- A mesma régua de leads_sem_acao: nada aberto que diga o próximo passo.
      (
        (v.proximo_followup IS NULL OR v.proximo_followup <= now())
        AND NOT EXISTS (
          SELECT 1 FROM public.tarefas AS t
          WHERE t.lead_id = v.id AND t.status IN ('pendente', 'em_andamento')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.agendamentos AS a
          WHERE a.lead_id = v.id
            AND a.data_inicio >= now()
            AND a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')
        )
      ) AS sem_passo,
      (
        v.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
        AND v.movimento < now() - interval '5 days'
      ) AS fundo
    FROM vivos AS v
  ),
  agg AS (
    SELECT
      m.corretor_id,
      count(*)::integer AS carteira_ativa,
      count(*) FILTER (WHERE m.vencido)::integer AS vencidos,
      count(*) FILTER (WHERE m.sem_passo)::integer AS sem_proximo_passo,
      count(*) FILTER (WHERE m.fundo)::integer AS fundo_parado,
      COALESCE(sum(m.valor), 0)::numeric AS em_jogo
    FROM marcados AS m
    GROUP BY m.corretor_id
  ),
  linhas AS (
    SELECT
      c.id AS corretor_id,
      c.nome,
      COALESCE(a.carteira_ativa, 0) AS carteira_ativa,
      COALESCE(a.vencidos, 0) AS vencidos,
      COALESCE(a.sem_proximo_passo, 0) AS sem_proximo_passo,
      COALESCE(a.fundo_parado, 0) AS fundo_parado,
      COALESCE(a.em_jogo, 0)::numeric AS em_jogo
    FROM corretores AS c
    LEFT JOIN agg AS a ON a.corretor_id = c.id
    UNION ALL
    -- O estoque sem dono só para quem vê a operação inteira.
    SELECT NULL::uuid, 'Sem corretor'::text, a.carteira_ativa, 0, 0, 0, a.em_jogo
    FROM agg AS a
    WHERE a.corretor_id IS NULL AND _ve_tudo
  )
  SELECT
    li.corretor_id,
    li.nome,
    li.carteira_ativa,
    li.vencidos,
    li.sem_proximo_passo,
    li.fundo_parado,
    li.em_jogo
  FROM linhas AS li
  ORDER BY (li.corretor_id IS NULL), li.fundo_parado DESC, li.vencidos DESC, li.nome;
END;
$$;

COMMENT ON FUNCTION public.fila_equipe_v1() IS
  'Fila Única do gestor: por corretor do escopo, carteira ativa, próximos passos vencidos, sem próximo passo (régua de leads_sem_acao), fundo do funil parado (5+ dias) e VGV em jogo. Admin/superintendente ganham a linha "Sem corretor". Corretor: 42501.';

REVOKE ALL ON FUNCTION public.fila_equipe_v1()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fila_equipe_v1()
  TO authenticated;
