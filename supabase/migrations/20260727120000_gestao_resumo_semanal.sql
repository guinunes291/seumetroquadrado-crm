-- Camada de Gestão (Fase D): resumo semanal pronto para o grupo do time.
--
-- Janela: os últimos 7 dias vs os 7 anteriores (comparação de ritmo com
-- ritmo). O front transforma o jsonb em XLSX multi-abas (exportSheetsXlsx).

CREATE OR REPLACE FUNCTION public.gestao_resumo_semanal()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '8s'
AS $$
DECLARE
  _esc record;
  _de timestamptz := date_trunc('day', now()) - interval '7 days';
  _ate timestamptz := date_trunc('day', now());
  _prev_de timestamptz := date_trunc('day', now()) - interval '14 days';
  _resultado jsonb;
BEGIN
  _esc := public._gestao_escopo();

  WITH escopo AS (
    SELECT b.* FROM metrics.leads_base b
    WHERE (_esc.ve_tudo OR b.corretor_id = ANY(_esc.equipe))
  ),
  kpis AS (
    SELECT
      (SELECT count(*) FROM escopo WHERE created_at >= _de AND created_at < _ate)::int AS leads_novos,
      (SELECT count(*) FROM escopo WHERE created_at >= _prev_de AND created_at < _de)::int AS leads_novos_prev,
      (SELECT count(*) FROM escopo WHERE status = 'perdido' AND data_perda >= _de AND data_perda < _ate)::int AS perdidos,
      (SELECT count(*) FROM public.agendamentos a JOIN escopo e ON e.id = a.lead_id
        WHERE a.deleted_at IS NULL AND a.status = 'realizado'
          AND a.data_inicio >= _de AND a.data_inicio < _ate)::int AS visitas,
      (SELECT count(*) FROM public.vendas v
        WHERE v.status_venda = 'aprovada' AND v.distrato = false
          AND COALESCE(v.aprovado_em, v.created_at) >= _de
          AND COALESCE(v.aprovado_em, v.created_at) < _ate
          AND (_esc.ve_tudo OR v.corretor_id = ANY(_esc.equipe)))::int AS vendas,
      (SELECT COALESCE(sum(v.valor_venda), 0) FROM public.vendas v
        WHERE v.status_venda = 'aprovada' AND v.distrato = false
          AND COALESCE(v.aprovado_em, v.created_at) >= _de
          AND COALESCE(v.aprovado_em, v.created_at) < _ate
          AND (_esc.ve_tudo OR v.corretor_id = ANY(_esc.equipe))) AS vgv,
      (SELECT count(*) FROM public.vendas v
        WHERE v.status_venda = 'aprovada' AND v.distrato = false
          AND COALESCE(v.aprovado_em, v.created_at) >= _prev_de
          AND COALESCE(v.aprovado_em, v.created_at) < _de
          AND (_esc.ve_tudo OR v.corretor_id = ANY(_esc.equipe)))::int AS vendas_prev
  ),
  por_corretor AS (
    SELECT jsonb_agg(jsonb_build_object(
      'corretor_id', p.id,
      'nome', p.nome,
      'leads_novos', (SELECT count(*) FROM escopo e
                      WHERE e.corretor_id = p.id AND e.created_at >= _de AND e.created_at < _ate),
      'interacoes', (SELECT count(*) FROM public.interacoes i
                     WHERE i.autor_id = p.id AND i.deleted_at IS NULL
                       AND COALESCE(i.ocorreu_em, i.created_at) >= _de
                       AND COALESCE(i.ocorreu_em, i.created_at) < _ate),
      'visitas', (SELECT count(*) FROM public.agendamentos a
                  WHERE a.corretor_id = p.id AND a.deleted_at IS NULL
                    AND a.status = 'realizado'
                    AND a.data_inicio >= _de AND a.data_inicio < _ate),
      'vendas', (SELECT count(*) FROM public.vendas v
                 WHERE v.corretor_id = p.id AND v.status_venda = 'aprovada'
                   AND v.distrato = false
                   AND COALESCE(v.aprovado_em, v.created_at) >= _de
                   AND COALESCE(v.aprovado_em, v.created_at) < _ate),
      'vgv', (SELECT COALESCE(sum(v.valor_venda), 0) FROM public.vendas v
              WHERE v.corretor_id = p.id AND v.status_venda = 'aprovada'
                AND v.distrato = false
                AND COALESCE(v.aprovado_em, v.created_at) >= _de
                AND COALESCE(v.aprovado_em, v.created_at) < _ate)
    ) ORDER BY p.nome) AS arr
    FROM public.profiles p
    WHERE p.ativo = true
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor')
      AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  )
  SELECT jsonb_build_object(
    'semana', jsonb_build_object('de', _de::date, 'ate', (_ate - interval '1 day')::date),
    'kpis', (SELECT to_jsonb(k) FROM kpis k),
    'por_corretor', COALESCE((SELECT arr FROM por_corretor), '[]'::jsonb),
    'atualizado_em', now()
  ) INTO _resultado;

  RETURN _resultado;
END;
$$;

COMMENT ON FUNCTION public.gestao_resumo_semanal() IS
  'Resumo dos últimos 7 dias vs os 7 anteriores (leads novos, visitas realizadas, vendas aprovadas sem distrato, VGV, perdidos) + linha por corretor — matéria-prima do XLSX semanal pronto para o grupo do time. Escopo: gestor só a equipe.';

REVOKE ALL ON FUNCTION public.gestao_resumo_semanal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_resumo_semanal() TO authenticated, service_role;
