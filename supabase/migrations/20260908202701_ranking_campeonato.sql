-- Campeonato SMQ: leitura atômica e completa, sem o top-50 por pontos do v2.
-- A fonte comercial continua sendo atividades_diarias/ledger de aprovação:
-- dia = aprovado_em em SP; distratos estornam o dia original. Não repondera
-- atividades nem reescreve histórico. Equipes refletem o vínculo ATUAL do CRM.
-- JSON escalar evita o max_rows do PostgREST sobre linhas de participantes.
-- SECURITY DEFINER com o MESMO escopo do ranking_periodo_v2; não aceita IDs
-- de usuários. Metas, equipes e evidências também são recortadas nesse escopo.
CREATE OR REPLACE FUNCTION public.ranking_campeonato(_inicio date, _fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  _caller uuid := auth.uid();
  _completo boolean := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente');
  _gestao boolean := _completo OR public.has_role(auth.uid(), 'gestor');
  _ini_ts timestamptz := (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo');
  _fim_ts timestamptz := ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim
    OR date_trunc('month', _inicio::timestamp) <> date_trunc('month', _fim::timestamp) THEN
    RAISE EXCEPTION 'informe um único mês válido' USING ERRCODE = '22023';
  END IF;
  WITH escopo AS MATERIALIZED (
    SELECT p.id, p.nome, p.equipe_id,
      COALESCE(NULLIF(p.avatar_url, ''), NULLIF(p.foto_url, '')) AS foto,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
          AND ur.role IN ('admin', 'gestor')
      ) OR EXISTS (SELECT 1 FROM public.equipes eq WHERE eq.gestor_id = p.id)
      THEN 'gestao' ELSE 'corretor' END AS categoria
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      -- Contas desativadas pela gestão (ativo=false, ex.: contas de teste)
      -- saem do ranking e dos totais — mesma régua de gestao_pacing.
      AND p.ativo = true
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
    -- "Leads recebidos": pela data em que o lead chegou ao corretor
    -- (distribuição), caindo na criação quando nunca foi distribuído.
    SELECT l.corretor_id, count(*)::bigint AS leads
    FROM public.leads AS l
    WHERE COALESCE(l.data_distribuicao, l.created_at) >= _ini_ts
      AND COALESCE(l.data_distribuicao, l.created_at) < _fim_ts
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
      e.nome, e.equipe_id, e.foto, e.categoria,
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
    GROUP BY e.id, e.nome, e.equipe_id, e.foto, e.categoria

  ), equipes_visiveis AS (
    SELECT e.id, e.nome, e.gestor_id, g.nome AS gestor_nome,
      COALESCE(NULLIF(g.avatar_url, ''), NULLIF(g.foto_url, '')) AS gestor_foto
    FROM public.equipes e
    LEFT JOIN public.profiles g ON g.id = e.gestor_id
    WHERE _gestao AND e.ativo AND (
      _completo OR e.gestor_id = _caller
      OR e.id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = _caller)
    )
  ), evidencias AS (
    SELECT v.id, l.corretor_id, v.aprovado_em, l.dia, l.vgv_delta AS valor
    FROM public.venda_metricas_ledger l
    JOIN public.vendas v ON v.id = l.venda_id
    WHERE l.evento = 'credito' AND l.dia BETWEEN _inicio AND _fim
      AND l.corretor_id IN (SELECT id FROM escopo)
      AND v.status_venda = 'aprovada' AND NOT v.distrato
      AND NOT EXISTS (SELECT 1 FROM public.venda_metricas_ledger est
        WHERE est.venda_id = l.venda_id AND est.evento = 'estorno')
  ), coortes AS (
    -- Mesmos IDs de leads do início ao desfecho; não divide eventos independentes.
    -- Coorte dinâmica da carteira atual, criada no mês, acompanhada até esta leitura.
    SELECT l.corretor_id, count(*)::int AS leads,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.vendas v
        WHERE v.lead_id = l.id AND v.corretor_id = l.corretor_id
          AND v.status_venda = 'aprovada' AND NOT v.distrato
          AND v.aprovado_em <= statement_timestamp()
      ))::int AS convertidos
    FROM public.leads l
    WHERE l.corretor_id IN (SELECT id FROM escopo)
      AND l.created_at >= _ini_ts AND l.created_at < _fim_ts
      AND l.deleted_at IS NULL AND NOT l.na_lixeira
    GROUP BY l.corretor_id
  )
  SELECT jsonb_build_object(
    'versao', 1,
    'gerado_em', statement_timestamp(),
    'inicio', _inicio, 'fim', _fim,
    'escopo', CASE WHEN _completo THEN 'operacao' WHEN _gestao THEN 'equipe' ELSE 'individual' END,
    'total_participantes', (SELECT count(*) FROM escopo),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.corretor_id) FROM agregado a), '[]'::jsonb),
    'equipes', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM equipes_visiveis e), '[]'::jsonb),
    'vendas', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.aprovado_em, v.id) FROM evidencias v), '[]'::jsonb),
    'metas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'corretor_id', m.corretor_id, 'equipe_id', m.equipe_id,
      'meta_vendas', m.meta_vendas, 'meta_visitas', m.meta_visitas,
      'meta_leads_atendidos', m.meta_leads_atendidos, 'meta_gmv', m.meta_gmv))
      FROM public.metas m WHERE m.ano = extract(year FROM _inicio) AND m.mes = extract(month FROM _inicio)
      AND (m.corretor_id IN (SELECT id FROM escopo)
        OR (m.corretor_id IS NULL AND m.equipe_id IN (SELECT id FROM equipes_visiveis))
        OR (_completo AND m.corretor_id IS NULL AND m.equipe_id IS NULL))), '[]'::jsonb),
    'pesos', COALESCE((SELECT jsonb_agg(jsonb_build_object('chave', c.chave, 'pontos', c.pontos, 'ativo', c.ativo))
      FROM public.configuracao_pontuacao c), '[]'::jsonb),
    'calendario', public.gestao_config_valor('pacing'),
    'coortes', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.corretor_id) FROM coortes c), '[]'::jsonb),
    'coortes_desde', public.gestao_config_valor('coortes_confiaveis_desde')
  ) INTO _result;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_campeonato(date, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ranking_campeonato(date, date) TO authenticated;
COMMENT ON FUNCTION public.ranking_campeonato(date, date) IS
  'Snapshot mensal integral do campeonato: mesmos contadores/escopo de ranking_periodo_v2, evidências aprovadas, metas, equipes atuais e pesos. Sem truncamento top-N e sem dados de contato de leads.';
