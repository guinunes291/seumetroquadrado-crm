-- A) backup: só service_role
ALTER TABLE public.bkp_f085_arquivadas_20260731 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bkp_f085_arquivadas_20260731 FROM anon, authenticated;

-- C) token da roleta fora do alcance do app
REVOKE SELECT ON public.roletas FROM authenticated;
GRANT SELECT (id, slug, nome, descricao, ativo, criterio_participacao, exigir_presenca, horario_inicio, horario_fim, permitir_fora_horario, created_at, updated_at, tipo, projeto_id, peso_agendamento, peso_venda, threshold_a, threshold_c, janela_ag_dias, janela_venda_dias, amostra_minima, peso_tier_a, peso_tier_b, peso_tier_c, tiers_recalculados_em, equipe_fixa, filial_id) ON public.roletas TO authenticated;

CREATE OR REPLACE FUNCTION public.get_roleta_webhook_token(_roleta_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'apenas admin' USING ERRCODE = '42501';
  END IF;
  SELECT webhook_token INTO _t FROM public.roletas WHERE id = _roleta_id;
  RETURN _t;
END $$;
REVOKE ALL ON FUNCTION public.get_roleta_webhook_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_roleta_webhook_token(uuid) TO authenticated;

-- B) leitura só para membro ativo
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('app_flags','app_flags_select'),
    ('cadencia_config','cadencia_config leitura autenticada'),
    ('comissao_tier_regras','tier regras leitura'),
    ('configuracao_pontuacao','todos leem config pontuacao'),
    ('copa_config_pontos','copa_config_pontos_select'),
    ('copa_config_premios','copa_config_premios_select'),
    ('copa_confrontos','copa_confrontos_select'),
    ('copa_edicao','copa_edicao_select'),
    ('copa_fases','copa_fases_select'),
    ('copa_participantes','copa_participantes_select'),
    ('copa_selecoes','copa_selecoes_select'),
    ('equipes','Usuários autenticados podem ver equipes'),
    ('higiene_config','higiene_config_select'),
    ('higiene_regra_fase','higiene_regra_fase_select'),
    ('historico_precos','Autenticados leem histórico'),
    ('metas','Autenticados leem metas'),
    ('objecoes','objecoes_select_all_auth'),
    ('projeto_foco','Autenticados leem projeto em foco'),
    ('projetos','Autenticados leem projetos'),
    ('scripts_vendas','scripts_select_all_auth'),
    ('unidades','Autenticados leem unidades'),
    ('vendas_construtora_avulsa','leitura autenticada'),
    ('zonas_bairros','zonas_bairros leitura autenticada'),
    ('zonas_roletas','zonas_roletas leitura autenticada')
  ) AS v(t, p) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.p, r.t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()))', r.p, r.t);
  END LOOP;
END $$;