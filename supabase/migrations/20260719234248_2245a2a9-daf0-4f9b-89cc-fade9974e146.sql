CREATE OR REPLACE FUNCTION public.ranking_periodo_v2(_inicio date, _fim date, _limit integer DEFAULT 50)
 RETURNS TABLE(posicao bigint, corretor_id uuid, nome text, pontuacao bigint, ligacoes bigint, whatsapps bigint, agendamentos bigint, visitas bigint, documentacoes bigint, vendas bigint, vgv numeric, leads bigint, alteracoes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _ini_ts timestamptz := (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo');
  _fim_ts timestamptz := ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS papel
        WHERE papel.user_id = p.id
          AND papel.role IN (
            'corretor'::public.app_role,
            'gestor'::public.app_role,
            'admin'::public.app_role
          )
      )
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_agregado AS (
    SELECT l.corretor_id, count(*)::bigint AS leads
    FROM public.leads AS l
    WHERE l.created_at >= _ini_ts
      AND l.created_at < _fim_ts
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IN (SELECT id FROM escopo)
    GROUP BY l.corretor_id
  ), transicoes_agregado AS (
    SELECT t.corretor_id, count(*)::bigint AS alteracoes
    FROM public.lead_status_transitions AS t
    WHERE t.created_at >= _ini_ts
      AND t.created_at < _fim_ts
      AND t.corretor_id IN (SELECT id FROM escopo)
    GROUP BY t.corretor_id
  ), agregado AS (
    SELECT
      e.id AS corretor_id,
      e.nome,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao,
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(max(la.leads), 0)::bigint AS leads,
      COALESCE(max(ta.alteracoes), 0)::bigint AS alteracoes
    FROM escopo AS e
    LEFT JOIN public.atividades_diarias AS a
      ON a.corretor_id = e.id
     AND a.dia BETWEEN _inicio AND _fim
    LEFT JOIN leads_agregado AS la ON la.corretor_id = e.id
    LEFT JOIN transicoes_agregado AS ta ON ta.corretor_id = e.id
    GROUP BY e.id, e.nome
  ), ranqueado AS (
    SELECT
      dense_rank() OVER (
        ORDER BY a.pontuacao DESC, a.vendas DESC, a.vgv DESC
      ) AS posicao,
      a.*
    FROM agregado AS a
  )
  SELECT
    r.posicao,
    r.corretor_id,
    r.nome,
    r.pontuacao,
    r.ligacoes,
    r.whatsapps,
    r.agendamentos,
    r.visitas,
    r.documentacoes,
    r.vendas,
    r.vgv,
    r.leads,
    r.alteracoes
  FROM ranqueado AS r
  ORDER BY r.posicao, r.corretor_id
  LIMIT _take;
END;
$function$;