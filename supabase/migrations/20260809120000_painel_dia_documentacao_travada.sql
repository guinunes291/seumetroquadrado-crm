-- Painel do Dia: 8ª exceção `documentacao_travada` (ux-ia-2026-08, item 2.6).
--
-- A tarefa #14 ("quais pastas estão travadas por pendência de documentação,
-- na operação inteira?") não tinha caminho no CRM — só o corretor via a fila
-- "docs" da própria carteira; o gestor perguntava por ferramenta MCP externa.
-- Critério: lead ATIVO com documento pendente/reprovado SEM MOVIMENTO há N+
-- dias (N em gestao_config.documentacao_travada_dias, default 3) — tempo
-- medido pelo updated_at do documento mais antigo em aberto. Não é o critério
-- cru da fila do corretor (doc criado hoje já "trava" lá): para a gestão,
-- travada = pendência que envelheceu.
--
-- Mesmo nome e assinatura (retorno é um jsonb único): CREATE OR REPLACE, sem
-- versão nova — front antigo ignora o tipo desconhecido (normalizarExcecao
-- descarta), front novo ganha o 8º chip por TIPOS_ORDENADOS.

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('documentacao_travada_dias',
   '3',
   'Dias sem movimento (updated_at) em documento pendente/reprovado a partir dos quais a pasta conta como travada no Painel do Dia.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gestao_painel_dia(
  _tipos text[] DEFAULT NULL,
  _corretor uuid DEFAULT NULL,
  _limite int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _excecoes jsonb;
  _resumo jsonb;
  _sem_interacao jsonb;
  _analise_dias int := COALESCE((public.gestao_config_valor('analise_parada_dias'))::int, 5);
  _docs_dias int := COALESCE((public.gestao_config_valor('documentacao_travada_dias'))::int, 3);
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'gestor')
          OR public.has_role(_caller, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  WITH escopo AS (
    SELECT b.*
    FROM metrics.leads_base b
    WHERE (_corretor IS NULL OR b.corretor_id = _corretor)
      -- Mesma régua do RLS: gestor vê só a equipe (lead sem corretor fica de
      -- fora para gestor; admin/superintendente veem tudo, inclusive órfãos).
      AND (_ve_tudo OR b.corretor_id = _caller OR b.corretor_id = ANY(_equipe))
  ),
  excecoes AS (
    -- 1) SLA de 1º contato estourado (novo/aguardando além do SLA da origem).
    SELECT e.id AS lead_id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text AS etapa, e.temperatura, e.valor_potencial,
           'sla_estourado'::text AS tipo, 1 AS severidade,
           jsonb_build_object(
             'minutos', (EXTRACT(EPOCH FROM (now() - COALESCE(e.data_distribuicao, e.created_at))) / 60)::int,
             'sla_minutos', sla.efetivo
           ) AS detalhe
    FROM escopo e
    LEFT JOIN public.distribuicao_config dc ON dc.origem::text = e.origem
    CROSS JOIN LATERAL (
      SELECT COALESCE(dc.sla_minutos,
                      (public.gestao_config_valor('sla_fallback_minutos'))::int, 30) AS efetivo
    ) sla
    WHERE e.status IN ('novo', 'aguardando_atendimento')
      AND (EXTRACT(EPOCH FROM (now() - COALESCE(e.data_distribuicao, e.created_at))) / 60) > sla.efetivo

    UNION ALL
    -- 2) Parado além do limiar da temperatura (quente 2d / morno 5d / frio 15d — config).
    SELECT e.id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'parado', 3,
           jsonb_build_object('dias_parado', e.dias_parado,
                              'limiar_dias', public.gestao_limiar_parado(e.temperatura))
    FROM escopo e
    WHERE e.ativo
      AND e.status NOT IN ('novo', 'aguardando_atendimento')
      AND e.dias_parado >= public.gestao_limiar_parado(e.temperatura)

    UNION ALL
    -- 3) Follow-up vencido.
    SELECT e.id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'followup_vencido', 3,
           jsonb_build_object('vencido_ha_horas',
             (EXTRACT(EPOCH FROM (now() - e.proximo_followup)) / 3600)::int)
    FROM escopo e
    WHERE e.ativo AND e.proximo_followup < now()

    UNION ALL
    -- 4) Visita das próximas 48h ainda sem confirmação.
    SELECT e.id, e.nome, e.telefone, a.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'visita_sem_confirmacao', 2,
           jsonb_build_object('data_visita', a.data_inicio)
    FROM public.agendamentos a
    JOIN escopo e ON e.id = a.lead_id
    WHERE a.deleted_at IS NULL
      AND a.tipo = 'visita'
      AND a.status = 'agendado'
      AND a.data_inicio BETWEEN now() AND now() + interval '48 hours'

    UNION ALL
    -- 5) Visita passada (>24h) sem registro de desfecho.
    SELECT e.id, e.nome, e.telefone, a.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'visita_sem_registro', 2,
           jsonb_build_object('data_visita', a.data_inicio)
    FROM public.agendamentos a
    JOIN escopo e ON e.id = a.lead_id
    WHERE a.deleted_at IS NULL
      AND a.tipo = 'visita'
      AND a.status IN ('agendado', 'confirmado')
      AND a.data_inicio < now() - interval '24 hours'

    UNION ALL
    -- 6) Análise de crédito parada (no MCMV é onde a venda morre vendida).
    SELECT e.id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'analise_parada', 2,
           jsonb_build_object('dias_parado', e.dias_parado, 'limiar_dias', _analise_dias)
    FROM escopo e
    WHERE e.status = 'analise_credito' AND e.dias_parado >= _analise_dias

    UNION ALL
    -- 7) Lead ativo sem corretor (fila/roleta travada).
    SELECT e.id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'sem_corretor', 1,
           jsonb_build_object('dias_desde_criacao',
             GREATEST(0, EXTRACT(DAY FROM (now() - e.created_at))::int))
    FROM escopo e
    WHERE e.ativo AND e.corretor_id IS NULL

    UNION ALL
    -- 8) Pasta travada (item 2.6, tarefa #14): documento pendente/reprovado
    --    SEM MOVIMENTO há _docs_dias+ num lead ativo — pendência que
    --    envelheceu, não doc que acabou de ser pedido.
    SELECT e.id, e.nome, e.telefone, e.corretor_id, e.corretor_nome,
           e.status::text, e.temperatura, e.valor_potencial,
           'documentacao_travada', 2,
           jsonb_build_object(
             'docs_pendentes', d.n,
             'dias_parado', d.dias,
             'limiar_dias', _docs_dias)
    FROM escopo e
    JOIN LATERAL (
      SELECT count(*)::int AS n,
             GREATEST(0, EXTRACT(DAY FROM (now() - min(dd.updated_at)))::int) AS dias
      FROM public.documentacoes dd
      WHERE dd.lead_id = e.id
        AND dd.status IN ('pendente', 'reprovado')
    ) d ON d.n > 0
    WHERE e.ativo
      AND d.dias >= _docs_dias
  ),
  filtradas AS (
    SELECT * FROM excecoes
    WHERE (_tipos IS NULL OR tipo = ANY(_tipos))
    ORDER BY severidade ASC, valor_potencial DESC NULLS LAST
    LIMIT GREATEST(_limite, 1)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'tipo', f.tipo,
      'severidade', f.severidade,
      'lead_id', f.lead_id,
      'lead_nome', f.nome,
      'telefone', f.telefone,
      'corretor_id', f.corretor_id,
      'corretor_nome', f.corretor_nome,
      'etapa', f.etapa,
      'temperatura', f.temperatura,
      'valor_potencial', f.valor_potencial,
      'detalhe', f.detalhe
    )), '[]'::jsonb),
    jsonb_build_object(
      'por_tipo', COALESCE((SELECT jsonb_object_agg(t.tipo, t.n)
                            FROM (SELECT tipo, count(*)::int AS n FROM excecoes
                                  WHERE (_tipos IS NULL OR tipo = ANY(_tipos))
                                  GROUP BY tipo) t), '{}'::jsonb),
      'total', (SELECT count(*)::int FROM excecoes WHERE (_tipos IS NULL OR tipo = ANY(_tipos))),
      'vgv_em_risco', (SELECT COALESCE(sum(leads_unicos.valor_potencial), 0)
                       FROM (SELECT DISTINCT ON (lead_id) lead_id, valor_potencial
                             FROM excecoes
                             WHERE (_tipos IS NULL OR tipo = ANY(_tipos))
                             ORDER BY lead_id) leads_unicos)
    )
  INTO _excecoes, _resumo
  FROM filtradas f;

  -- Corretores marcados como presentes hoje e sem NENHUMA interação registrada.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('corretor_id', p.id, 'nome', p.nome)), '[]'::jsonb)
  INTO _sem_interacao
  FROM public.profiles p
  WHERE p.presente = true
    AND p.ativo = true
    AND (_ve_tudo OR p.id = ANY(_equipe))
    AND NOT EXISTS (
      SELECT 1 FROM public.interacoes i
      WHERE i.autor_id = p.id
        AND i.deleted_at IS NULL
        AND COALESCE(i.ocorreu_em, i.created_at) >= date_trunc('day', now())
    );

  RETURN jsonb_build_object(
    'excecoes', _excecoes,
    'resumo', _resumo || jsonb_build_object('corretores_sem_interacao', _sem_interacao),
    'atualizado_em', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.gestao_painel_dia(text[], uuid, int) IS
  'Painel do Dia (Tela 1): feed de exceções AO VIVO — sla_estourado, parado (limiar por temperatura), followup_vencido, visita_sem_confirmacao (48h), visita_sem_registro (>24h), analise_parada, sem_corretor, documentacao_travada (doc pendente/reprovado sem movimento há N dias) — com resumo por tipo, VGV em risco (estimado, leads distintos) e corretores presentes sem interação hoje. Escopo: admin/superintendente tudo; gestor só a equipe; corretor: forbidden.';

REVOKE ALL ON FUNCTION public.gestao_painel_dia(text[], uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_painel_dia(text[], uuid, int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
