-- Blindagem do papel GESTOR: escopo estritamente de equipe (sem poderes org-wide).
--
-- Decisões (produto):
--   * Distribuição/roleta: gestor SÓ LEITURA — continua vendo roletas/fila/exceções
--     (org-wide), mas perde TODA operação. Mantém as policies de SELECT; remove o gestor
--     da ESCRITA (RLS e gate das RPCs de escrita).
--   * Config org-wide SEM conceito de time (projetos, templates, criar equipe) → admin-only.
--   * Superfícies COM conceito de time (metas, métricas por corretor, ranking) → recortadas
--     pela equipe via corretores_do_gestor/ve_carteira_completa (mesmo padrão de leads).
--
-- Nada aqui altera admin/superintendente/corretor além do documentado. Funções reescritas
-- são cópias fiéis da definição vigente com a MENOR mudança possível (gate ou filtro).

-- ===========================================================================
-- 1) DISTRIBUIÇÃO — gestor SÓ LEITURA
-- ===========================================================================

-- 1a) RLS de ESCRITA: remover o gestor (SELECTs de leitura ficam intactos).
DROP POLICY IF EXISTS "Admin/gestor gerenciam a fila" ON public.fila_distribuicao;
CREATE POLICY "Admin gerencia a fila" ON public.fila_distribuicao
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "gestao gerencia participantes ins" ON public.roleta_participantes;
CREATE POLICY "gestao gerencia participantes ins" ON public.roleta_participantes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'));

DROP POLICY IF EXISTS "gestao gerencia participantes upd" ON public.roleta_participantes;
CREATE POLICY "gestao gerencia participantes upd" ON public.roleta_participantes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'));

DROP POLICY IF EXISTS "gestao gerencia participantes del" ON public.roleta_participantes;
CREATE POLICY "gestao gerencia participantes del" ON public.roleta_participantes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'));

-- 1b) RPCs de ESCRITA da distribuição: gate admin-only (era admin OR gestor).
--     Cópias fiéis da definição vigente; muda só o gate.

CREATE OR REPLACE FUNCTION public.distribuir_lead_v3(_lead_id uuid, _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo, _roleta_slug text DEFAULT NULL::text, _corretor_id uuid DEFAULT NULL::uuid, _gatilho text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public._distribuir_lead_v3(_lead_id, _tipo, _roleta_slug, _corretor_id, _caller, _gatilho, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.triar_e_distribuir_lead(_lead_id uuid, _gatilho text DEFAULT 'cron'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _lead record;
  _tel text;
  _dup_id uuid;
  _dup_corretor uuid;
  _ant_ativo boolean;
  _ctx_extra jsonb := '{}'::jsonb;
  _excecao_id uuid;
  _log_id uuid;
BEGIN
  -- Gate FORA do bloco com handler: 'forbidden' precisa estourar para o
  -- chamador, nunca virar exceção 'falha_tecnica' (senão qualquer
  -- authenticated pollui a fila/alertas e mascara bugs de permissão).
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada', resolvida_em = now(), resolvida_por = _caller,
           resolucao = 'Lead está na lixeira — distribuição bloqueada'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_na_lixeira');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    -- Fecha exceção órfã (lead ganhou dono fora do motor) para o
    -- "Reprocessar" da fila nunca virar beco sem saída.
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida', resolvida_em = now(), resolvida_por = _caller,
           resolucao = 'Lead já estava atribuído'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  -- Dados mínimos: sem telefone não há atendimento possível.
  IF _lead.telefone IS NULL OR btrim(_lead.telefone) = '' THEN
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'dados_incompletos', 'Lead sem telefone', NULL,
      jsonb_build_object('gatilho', _gatilho));
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES (_lead_id, NULL, 'automatica', 'Lead sem telefone — fila de exceções',
            NULL, 'triagem', 'excecao')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_build_object('gatilho', _gatilho, 'motivo', 'dados_incompletos'));
    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', 'dados_incompletos');
  END IF;

  -- Duplicidade / corretor anterior — REGISTRADOS no contexto da decisão.
  -- Regra de negócio (decisão da diretoria): cliente retornante SEMPRE roda
  -- nova roleta; o histórico fica no log para auditoria.
  _tel := regexp_replace(_lead.telefone, '\D', '', 'g');
  IF length(_tel) >= 8 THEN
    SELECT l.id, l.corretor_id INTO _dup_id, _dup_corretor
    FROM public.leads l
    WHERE l.id <> _lead.id
      AND l.deleted_at IS NULL
      AND regexp_replace(l.telefone, '\D', '', 'g') = _tel
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF _dup_corretor IS NOT NULL THEN
    SELECT p.ativo INTO _ant_ativo FROM public.profiles p WHERE p.id = _dup_corretor;
  END IF;

  _ctx_extra := jsonb_build_object(
    'dedup', CASE WHEN _dup_id IS NULL THEN NULL
                  ELSE jsonb_build_object('duplicado_id', _dup_id) END,
    'corretor_anterior', CASE WHEN _dup_corretor IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'corretor_id', _dup_corretor,
                    'ativo', COALESCE(_ant_ativo, false),
                    'politica', 'sempre_nova_roleta') END
  );

  RETURN public._distribuir_lead_v3(_lead_id, 'automatica', NULL, NULL, _caller, _gatilho, _ctx_extra);

  EXCEPTION WHEN OTHERS THEN
    -- Falha técnica: o lead vai para a fila de exceções em vez de sumir.
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'falha_tecnica', SQLERRM, NULL,
      jsonb_build_object('gatilho', _gatilho, 'sqlstate', SQLSTATE));
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES (_lead_id, NULL, 'automatica', 'Falha técnica na distribuição: ' || SQLERRM,
            NULL, 'triagem', 'erro');
    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', 'falha_tecnica', 'erro', SQLERRM);
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerenciar_participante_roleta(_slug text, _corretor_id uuid, _acao text, _motivo text DEFAULT NULL::text, _limite integer DEFAULT NULL::integer, _pausado_ate timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _roleta_id uuid;
  _eh_admin boolean;
BEGIN
  _eh_admin := _caller IS NOT NULL AND public.has_role(_caller, 'admin');
  IF _caller IS NOT NULL AND NOT _eh_admin THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO _roleta_id FROM public.roletas WHERE slug = _slug;
  IF _roleta_id IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  IF _acao = 'incluir' THEN
    -- Config pode restringir a inclusão manual na Marquinhos a admins.
    IF _slug = 'marquinhos' AND NOT _eh_admin
       AND NOT (public.get_dist_setting('permitir_inclusao_manual') #>> '{}')::boolean THEN
      RAISE EXCEPTION 'inclusao manual desabilitada para gestores';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
      WHERE p.id = _corretor_id AND p.ativo = true
    ) THEN
      RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor';
    END IF;

    INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, limite_diario, incluido_por)
    VALUES (_roleta_id, _corretor_id, true, _limite, _caller)
    ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
      ativo = true,
      pausado_ate = NULL,
      motivo_pausa = NULL,
      limite_diario = COALESCE(EXCLUDED.limite_diario, public.roleta_participantes.limite_diario),
      incluido_por = _caller,
      incluido_em = now();
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'incluido', _motivo, _caller);

  ELSIF _acao = 'remover' THEN
    UPDATE public.roleta_participantes
       SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'removido', _motivo, _caller);

  ELSIF _acao = 'pausar' THEN
    IF _pausado_ate IS NULL OR _pausado_ate <= now() THEN
      RAISE EXCEPTION 'pausa exige data futura (_pausado_ate)';
    END IF;
    UPDATE public.roleta_participantes
       SET pausado_ate = _pausado_ate, motivo_pausa = _motivo
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'pausado',
            COALESCE(_motivo,'') || ' (até ' || to_char(_pausado_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
            _caller);

  ELSIF _acao = 'reativar' THEN
    UPDATE public.roleta_participantes
       SET ativo = true, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'reativado', _motivo, _caller);

  ELSIF _acao = 'limite' THEN
    UPDATE public.roleta_participantes
       SET limite_diario = _limite
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'limite_alterado',
            'Limite diário: ' || COALESCE(_limite::text, 'padrão'), _caller);

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_excecao(_excecao_id uuid, _acao text, _params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _e record;
  _res jsonb;
BEGIN
  IF _caller IS NULL
     OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _e FROM public.distribuicao_excecoes WHERE id = _excecao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'excecao nao encontrada';
  END IF;
  IF _e.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'excecao ja resolvida/arquivada';
  END IF;

  IF _acao = 'corrigir_origem' THEN
    IF _params->>'origem' IS NULL THEN RAISE EXCEPTION 'origem obrigatoria'; END IF;
    UPDATE public.leads
       SET origem = (_params->>'origem')::public.lead_origem
     WHERE id = _e.lead_id;
    _res := public.triar_e_distribuir_lead(_e.lead_id, 'excecao_corrigir_origem');

  ELSIF _acao = 'escolher_roleta' THEN
    IF _params->>'roleta_slug' IS NULL THEN RAISE EXCEPTION 'roleta_slug obrigatoria'; END IF;
    _res := public._distribuir_lead_v3(
      _e.lead_id, 'automatica', _params->>'roleta_slug', NULL, _caller, 'excecao_roleta_forcada', '{}'::jsonb);

  ELSIF _acao = 'atribuir_manual' THEN
    IF _params->>'corretor_id' IS NULL THEN RAISE EXCEPTION 'corretor_id obrigatorio'; END IF;
    _res := public._distribuir_lead_v3(
      _e.lead_id, 'manual', NULL, (_params->>'corretor_id')::uuid, _caller, 'excecao_manual', '{}'::jsonb);

  ELSIF _acao = 'reprocessar' THEN
    _res := public.triar_e_distribuir_lead(_e.lead_id, 'excecao_reprocesso');

  ELSIF _acao = 'em_analise' THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'em_analise' WHERE id = _excecao_id;
    RETURN jsonb_build_object('ok', true, 'status', 'em_analise');

  ELSIF _acao = 'arquivar' THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada',
           resolvida_por = _caller,
           resolvida_em = now(),
           resolucao = COALESCE(_params->>'motivo', 'Arquivada manualmente')
     WHERE id = _excecao_id;
    RETURN jsonb_build_object('ok', true, 'status', 'arquivada');

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  -- Se o motor resolveu a exceção, garante o autor da ação registrado.
  UPDATE public.distribuicao_excecoes
     SET resolvida_por = COALESCE(resolvida_por, _caller)
   WHERE id = _excecao_id AND status = 'resolvida';

  RETURN _res;
END;
$function$;

-- ===========================================================================
-- 2) CONFIG ORG-WIDE SEM CONCEITO DE TIME → admin-only (remover o gestor)
-- ===========================================================================

-- projetos: gestor perde a gestão do catálogo (SELECT continua liberado).
DROP POLICY IF EXISTS "Admin/gestor criam projetos" ON public.projetos;
CREATE POLICY "Admin cria projetos" ON public.projetos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin/gestor atualizam projetos" ON public.projetos;
CREATE POLICY "Admin atualiza projetos" ON public.projetos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin/gestor deletam projetos" ON public.projetos;
CREATE POLICY "Admin deleta projetos" ON public.projetos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- templates_mensagem: idem (SELECT de ativos continua).
DROP POLICY IF EXISTS "Admin/gestor criam templates" ON public.templates_mensagem;
CREATE POLICY "Admin cria templates" ON public.templates_mensagem
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin/gestor atualizam templates" ON public.templates_mensagem;
CREATE POLICY "Admin atualiza templates" ON public.templates_mensagem
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin/gestor deletam templates" ON public.templates_mensagem;
CREATE POLICY "Admin deleta templates" ON public.templates_mensagem
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- equipes: gestor não cria equipes (continua editando a PRÓPRIA — policy separada intacta).
DROP POLICY IF EXISTS "Admin/gestor podem criar equipes" ON public.equipes;
CREATE POLICY "Admin pode criar equipes" ON public.equipes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===========================================================================
-- 3) METAS → gestor recortado por time (só metas de corretores do time / da própria equipe)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.pode_gerir_meta(_uid uuid, _corretor_id uuid, _equipe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_role(_uid, 'admin')
    OR (
      public.has_role(_uid, 'gestor') AND (
        (_corretor_id IS NOT NULL AND _corretor_id IN (SELECT public.corretores_do_gestor(_uid)))
        OR (_equipe_id IS NOT NULL AND (
             EXISTS (SELECT 1 FROM public.equipes e WHERE e.id = _equipe_id AND e.gestor_id = _uid)
             OR EXISTS (SELECT 1 FROM public.profiles g WHERE g.id = _uid AND g.equipe_id = _equipe_id)
           ))
      )
    );
$$;
REVOKE ALL ON FUNCTION public.pode_gerir_meta(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_meta(uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin/gestor criam metas" ON public.metas;
CREATE POLICY "Gestao cria metas do escopo" ON public.metas
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_gerir_meta(auth.uid(), corretor_id, equipe_id));
DROP POLICY IF EXISTS "Admin/gestor atualizam metas" ON public.metas;
CREATE POLICY "Gestao atualiza metas do escopo" ON public.metas
  FOR UPDATE TO authenticated
  USING (public.pode_gerir_meta(auth.uid(), corretor_id, equipe_id))
  WITH CHECK (public.pode_gerir_meta(auth.uid(), corretor_id, equipe_id));
DROP POLICY IF EXISTS "Admin/gestor deletam metas" ON public.metas;
CREATE POLICY "Gestao deleta metas do escopo" ON public.metas
  FOR DELETE TO authenticated
  USING (public.pode_gerir_meta(auth.uid(), corretor_id, equipe_id));

-- ===========================================================================
-- 4) MÉTRICAS org-wide → recortar por time (mesmo padrão dos dashboards de 19/07)
-- ===========================================================================

-- 4a) dashboard_metricas_por_corretor: mantém o gate (gestor pode chamar) e recorta as CTEs
--     pela equipe do gestor (admin/superintendente seguem vendo todos).
CREATE OR REPLACE FUNCTION public.dashboard_metricas_por_corretor(_di timestamp with time zone, _df timestamp with time zone, _campo_data text DEFAULT 'criacao'::text)
 RETURNS TABLE(corretor_id uuid, nome text, leads integer, agendamentos integer, visitas integer, analise integer, fechados integer, perdidos integer, conversao numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _use_evento boolean := (_campo_data = 'evento');
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- admin/superintendente veem todos; gestor só a equipe.
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH ll AS (
    SELECT l.corretor_id AS cid, count(*)::int AS n,
           count(*) FILTER (WHERE l.status='perdido')::int AS perd
    FROM public.leads l
    WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.corretor_id IS NOT NULL
      AND l.created_at >= _di AND l.created_at < _df
      AND (_ve_tudo OR l.corretor_id = ANY(_equipe))
    GROUP BY l.corretor_id
  ),
  ag AS (
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.corretor_id IS NOT NULL
      AND (
        (NOT _use_evento AND a.created_at >= _di AND a.created_at < _df)
        OR (_use_evento AND a.data_inicio >= _di AND a.data_inicio < _df)
      )
      AND (_ve_tudo OR a.corretor_id = ANY(_equipe))
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id AS cid,
           count(*) FILTER (WHERE t.para_status='visita_realizada')::int AS vi,
           count(*) FILTER (WHERE t.para_status='analise_credito')::int AS an,
           count(*) FILTER (WHERE t.para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions t
    WHERE t.created_at >= _di AND t.created_at < _df AND t.corretor_id IS NOT NULL
      AND (_ve_tudo OR t.corretor_id = ANY(_equipe))
    GROUP BY t.corretor_id
  ),
  todos AS (
    SELECT cid FROM ll UNION SELECT cid FROM ag UNION SELECT cid FROM tr
  )
  SELECT t.cid,
         COALESCE(p.nome, 'Corretor'),
         COALESCE(ll.n,0),
         COALESCE(ag.n,0),
         COALESCE(tr.vi,0),
         COALESCE(tr.an,0),
         COALESCE(tr.ve,0),
         COALESCE(ll.perd,0),
         CASE WHEN COALESCE(ll.n,0) > 0
              THEN round((COALESCE(tr.ve,0)::numeric / ll.n::numeric) * 100, 1)
              ELSE 0 END
  FROM todos t
  LEFT JOIN ll ON ll.cid = t.cid
  LEFT JOIN ag ON ag.cid = t.cid
  LEFT JOIN tr ON tr.cid = t.cid
  LEFT JOIN public.profiles p ON p.id = t.cid
  ORDER BY COALESCE(tr.ve,0) DESC, COALESCE(tr.vi,0) DESC, COALESCE(ll.n,0) DESC;
END;
$function$;

-- 4b) ranking_atividades: gestor recortado por time (era _gestor OR self).
CREATE OR REPLACE FUNCTION public.ranking_atividades(_di date, _df date)
 RETURNS TABLE(corretor_id uuid, nome text, pontuacao integer, ligacoes integer, whatsapps integer, agendamentos integer, visitas integer, documentacoes integer, vendas integer, vgv numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_uid);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_uid)), '{}'::uuid[]);
  RETURN QUERY
  SELECT a.corretor_id, p.nome,
         sum(a.pontuacao_total)::int, sum(a.ligacoes)::int, sum(a.whatsapps)::int,
         sum(a.agendamentos)::int, sum(a.visitas)::int, sum(a.documentacoes)::int,
         sum(a.vendas)::int, sum(a.vgv_dia)
  FROM public.atividades_diarias a
  LEFT JOIN public.profiles p ON p.id = a.corretor_id
  WHERE a.dia BETWEEN _di AND _df
    AND (_ve_tudo OR a.corretor_id = _uid OR a.corretor_id = ANY(_equipe))
  GROUP BY a.corretor_id, p.nome
  ORDER BY 3 DESC;
END;
$function$;

-- 4c) equipe_metricas_campanha: hoje SEM gate nenhum (qualquer authenticated). Como só é
--     usada na tela de Campanhas (que vira admin-only), passa a exigir admin.
CREATE OR REPLACE FUNCTION public.equipe_metricas_campanha(_roleta_id uuid)
 RETURNS TABLE(corretor_id uuid, leads_janela integer, agendamentos_janela integer, vendas_janela integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT slug, janela_ag_dias, janela_venda_dias
    INTO _r
    FROM public.roletas
   WHERE id = _roleta_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    rp.corretor_id,
    COALESCE((
      SELECT count(*)::int FROM public.distribution_log dl
       WHERE dl.corretor_id = rp.corretor_id
         AND dl.roleta_slug = _r.slug
         AND dl.resultado = 'sucesso'
         AND dl.created_at > now() - (_r.janela_ag_dias || ' days')::interval
    ), 0) AS leads_janela,
    COALESCE((
      SELECT count(*)::int FROM public.agendamentos a
        JOIN public.leads l ON l.id = a.lead_id
       WHERE a.corretor_id = rp.corretor_id
         AND l.roleta_slug = _r.slug
         AND a.created_at > now() - (_r.janela_ag_dias || ' days')::interval
    ), 0) AS agendamentos_janela,
    COALESCE((
      SELECT count(*)::int FROM public.vendas v
        JOIN public.leads l ON l.id = v.lead_id
       WHERE v.corretor_id = rp.corretor_id
         AND l.roleta_slug = _r.slug
         AND v.created_at > now() - (_r.janela_venda_dias || ' days')::interval
    ), 0) AS vendas_janela
  FROM public.roleta_participantes rp
  WHERE rp.roleta_id = _roleta_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
