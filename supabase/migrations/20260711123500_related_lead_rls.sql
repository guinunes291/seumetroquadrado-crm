-- Propaga o mesmo escopo de carteira para dados satélites do lead. Policies
-- antigas eram baseadas apenas no papel "gestor" e, por OR cumulativo, davam
-- acesso à organização inteira.

CREATE OR REPLACE FUNCTION public.pode_acessar_corretor(
  _user_id uuid,
  _corretor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND _corretor_id IS NOT NULL
     AND (
       _user_id = _corretor_id
       OR public.has_role(_user_id, 'admin'::public.app_role)
       OR public.has_role(_user_id, 'superintendente'::public.app_role)
       OR (
         public.has_role(_user_id, 'gestor'::public.app_role)
         AND EXISTS (
           SELECT 1
           FROM public.profiles AS gestor
           JOIN public.profiles AS corretor ON corretor.id = _corretor_id
           WHERE gestor.id = _user_id
             AND (
               (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
               OR EXISTS (
                 SELECT 1 FROM public.equipes AS e
                 WHERE e.id = corretor.equipe_id AND e.gestor_id = _user_id
               )
             )
         )
       )
     );
$$;
REVOKE ALL ON FUNCTION public.pode_acessar_corretor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_corretor(uuid, uuid)
  TO authenticated, service_role;

-- A versão anterior era SECURITY DEFINER e tratava qualquer gestor como
-- global. RLS da tabela não protege funções definer, portanto o gate de origem
-- e destino precisa acontecer dentro da própria operação transacional.
CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l record;
  _n integer := 0;
  _ativo boolean;
  _nome text;
BEGIN
  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL AND (
    NOT public.is_active_member(_caller)
    OR NOT (
      public.has_role(_caller, 'admin')
      OR public.has_role(_caller, 'superintendente')
      OR public.has_role(_caller, 'gestor')
    )
    OR NOT public.pode_atribuir_lead(_caller, _corretor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.ativo AND p.status_conta = 'ativa'::public.status_conta,
    p.nome
  INTO _ativo, _nome
  FROM public.profiles AS p
  WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo' USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads
    WHERE id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _l.id) THEN
      RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
    END IF;

    UPDATE public.leads
    SET corretor_anterior_id = _l.corretor_id,
        corretor_id = _corretor,
        data_distribuicao = now(),
        timestamp_recebimento = now(),
        tentativas_redistribuicao = 0,
        via_webhook = false,
        corretores_que_tentaram = CASE
          WHEN _corretor = ANY(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
            THEN _l.corretores_que_tentaram
          ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
        END
    WHERE id = _l.id;

    -- Filas operacionais usam o responsável denormalizado. Mantém somente os
    -- itens ainda acionáveis com a nova carteira; histórico concluído permanece
    -- atribuído a quem o executou.
    UPDATE public.agendamentos
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'agendado'::public.agendamento_status,
        'confirmado'::public.agendamento_status,
        'remarcado'::public.agendamento_status
      );

    UPDATE public.tarefas
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'pendente'::public.tarefa_status,
        'em_andamento'::public.tarefa_status
      );

    INSERT INTO public.distribution_log(
      lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado
    ) VALUES (
      _l.id, _corretor, 'manual', 'Transferência manual', _caller,
      'transferencia_manual', 'sucesso'
    );

    UPDATE public.distribuicao_excecoes
    SET status = 'resolvida',
        resolvida_em = now(),
        resolvida_por = _caller,
        resolucao = 'Transferido manualmente para ' || _nome
    WHERE lead_id = _l.id AND status IN ('pendente', 'em_analise');

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid)
  TO authenticated, service_role;

-- O timer de SLA roda no navegador, mas não pode ser usado como oráculo para
-- redistribuir um lead de outra carteira. Mantém a idempotência do motor e
-- acrescenta o mesmo gate central antes de bloquear/alterar a linha.
CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _lead record;
  _res jsonb;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, dc.timeout_minutos
  INTO _lead
  FROM public.leads AS l
  LEFT JOIN public.distribuicao_config AS dc ON dc.origem = l.origem
  WHERE l.id = _lead_id
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR COALESCE(_lead.tentativas_redistribuicao, 0) >= 3
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  UPDATE public.leads
  SET corretores_que_tentaram = array_append(
    COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id
  )
  WHERE id = _lead_id
    AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  _res := public._distribuir_lead_v3(
    _lead_id,
    'redistribuicao',
    NULL,
    NULL,
    _caller,
    'sla_webhook_imediato',
    jsonb_build_object(
      'sla_minutos', _lead.timeout_minutos,
      'corretor_anterior_sla', _lead.corretor_id
    )
  );

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
    SET status = 'aguardando_atendimento',
        tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
    WHERE id = _lead_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.disparar_repasse_sla_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_repasse_sla_lead(uuid)
  TO authenticated, service_role;

-- Agenda --------------------------------------------------------------------
DROP POLICY IF EXISTS "agendamentos_select_proprios_ou_admin" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_autenticado" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_responsavel_ou_admin" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_admin_gestor" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_select_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_carteira" ON public.agendamentos;

CREATE POLICY "agendamentos_select_carteira" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "agendamentos_insert_carteira" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por_id = auth.uid()
    AND (
      (
        lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), lead_id)
        AND public.pode_atribuir_lead(auth.uid(), corretor_id)
      )
      OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
    )
  );
CREATE POLICY "agendamentos_update_carteira" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "agendamentos_delete_carteira" ON public.agendamentos
  FOR DELETE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

-- Tarefas -------------------------------------------------------------------
DROP POLICY IF EXISTS "Corretores veem suas tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Corretores criam tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Corretores atualizam suas tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Admin/gestor deletam tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_select_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_insert_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_update_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_delete_carteira" ON public.tarefas;

CREATE POLICY "tarefas_select_carteira" ON public.tarefas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "tarefas_insert_carteira" ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (
    (criado_por IS NULL OR criado_por = auth.uid())
    AND (
      (
        lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), lead_id)
        AND public.pode_atribuir_lead(auth.uid(), corretor_id)
      )
      OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
    )
  );
CREATE POLICY "tarefas_update_carteira" ON public.tarefas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "tarefas_delete_carteira" ON public.tarefas FOR DELETE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

-- Timeline e histórico ------------------------------------------------------
DROP POLICY IF EXISTS "Admins e gestores veem todas interacoes" ON public.interacoes;
DROP POLICY IF EXISTS "Corretor ve interacoes dos seus leads" ON public.interacoes;
DROP POLICY IF EXISTS "Autenticados criam interacoes em leads visiveis" ON public.interacoes;
DROP POLICY IF EXISTS "Autor edita propria interacao" ON public.interacoes;
DROP POLICY IF EXISTS "Autor ou admin remove interacao" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_select_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_insert_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_update_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_delete_carteira" ON public.interacoes;

CREATE POLICY "interacoes_select_carteira" ON public.interacoes FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "interacoes_insert_carteira" ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "interacoes_update_carteira" ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  )
  WITH CHECK (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );
CREATE POLICY "interacoes_delete_carteira" ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

DROP POLICY IF EXISTS "Admin/gestor veem todas as transicoes"
  ON public.lead_status_transitions;
DROP POLICY IF EXISTS "Corretor ve transicoes dos seus leads"
  ON public.lead_status_transitions;
DROP POLICY IF EXISTS "lead_status_transitions_select_carteira"
  ON public.lead_status_transitions;
CREATE POLICY "lead_status_transitions_select_carteira"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "Admin/gestor veem log completo" ON public.distribution_log;
DROP POLICY IF EXISTS "Corretor vê o próprio log" ON public.distribution_log;
DROP POLICY IF EXISTS "Service e admin/gestor inserem log" ON public.distribution_log;
DROP POLICY IF EXISTS "distribution_log_select_carteira" ON public.distribution_log;
REVOKE INSERT ON public.distribution_log FROM authenticated;
CREATE POLICY "distribution_log_select_carteira" ON public.distribution_log
  FOR SELECT TO authenticated USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Entidades comerciais ligadas ao lead ------------------------------------
DROP POLICY IF EXISTS "visitas_select" ON public.visitas;
DROP POLICY IF EXISTS "visitas_insert" ON public.visitas;
DROP POLICY IF EXISTS "visitas_update" ON public.visitas;
DROP POLICY IF EXISTS "visitas_select_carteira" ON public.visitas;
DROP POLICY IF EXISTS "visitas_insert_carteira" ON public.visitas;
DROP POLICY IF EXISTS "visitas_update_carteira" ON public.visitas;
CREATE POLICY "visitas_select_carteira" ON public.visitas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "visitas_insert_carteira" ON public.visitas FOR INSERT TO authenticated
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "visitas_update_carteira" ON public.visitas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

DROP POLICY IF EXISTS "analises_select" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_select_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_auth" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_delete_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_select_carteira" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_carteira" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update_carteira" ON public.analises_credito;
CREATE POLICY "analises_select_carteira" ON public.analises_credito FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "analises_insert_carteira" ON public.analises_credito FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "analises_update_carteira" ON public.analises_credito FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id))
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "propostas_select" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update" ON public.propostas;
DROP POLICY IF EXISTS "propostas_select_carteira" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert_carteira" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update_carteira" ON public.propostas;
CREATE POLICY "propostas_select_carteira" ON public.propostas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "propostas_insert_carteira" ON public.propostas FOR INSERT TO authenticated
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "propostas_update_carteira" ON public.propostas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

DROP POLICY IF EXISTS "propvis_select" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_insert" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_select_carteira" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_insert_carteira" ON public.propostas_visitantes;
CREATE POLICY "propvis_select_carteira" ON public.propostas_visitantes
  FOR SELECT TO authenticated
  USING (public.pode_acessar_corretor(auth.uid(), corretor_id));
CREATE POLICY "propvis_insert_carteira" ON public.propostas_visitantes
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_corretor(auth.uid(), COALESCE(corretor_id, auth.uid())));

-- Oferta ativa e logs do copiloto ------------------------------------------
DROP POLICY IF EXISTS "oal_select" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_insert" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_update" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_delete" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_select_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_insert_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_update_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_delete_carteira" ON public.oferta_ativa_leads;
CREATE POLICY "oal_select_carteira" ON public.oferta_ativa_leads FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_insert_carteira" ON public.oferta_ativa_leads FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_update_carteira" ON public.oferta_ativa_leads FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id))
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_delete_carteira" ON public.oferta_ativa_leads FOR DELETE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "copiloto_eventos_admin_read" ON public.copiloto_eventos;
DROP POLICY IF EXISTS "copiloto_eventos_select_carteira" ON public.copiloto_eventos;
CREATE POLICY "copiloto_eventos_select_carteira" ON public.copiloto_eventos
  FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
      OR (
        lead_id IS NULL
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'superintendente')
        )
      )
    )
  );

-- Buscas/duplicatas SECURITY DEFINER também respeitam a carteira ------------
CREATE OR REPLACE FUNCTION public.detectar_duplicatas_leads()
RETURNS TABLE (grupo_chave text, tipo text, quantidade bigint, lead_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH acessiveis AS (
    SELECT l.*
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND public.pode_acessar_lead(auth.uid(), l.id)
  )
  SELECT regexp_replace(telefone, '\D', '', 'g'), 'telefone'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE telefone IS NOT NULL AND telefone <> ''
  GROUP BY regexp_replace(telefone, '\D', '', 'g')
  HAVING count(*) > 1
  UNION ALL
  SELECT lower(trim(email)), 'email'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE email IS NOT NULL AND email <> ''
  GROUP BY lower(trim(email))
  HAVING count(*) > 1;
$$;
REVOKE ALL ON FUNCTION public.detectar_duplicatas_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detectar_duplicatas_leads() TO authenticated;

CREATE OR REPLACE FUNCTION public.mesclar_leads(_lead_destino uuid, _lead_origem uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL
     OR NOT (
       public.has_role(_caller, 'admin')
       OR public.has_role(_caller, 'superintendente')
       OR public.has_role(_caller, 'gestor')
     )
     OR NOT public.pode_acessar_lead(_caller, _lead_destino)
     OR NOT public.pode_acessar_lead(_caller, _lead_origem) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _lead_destino = _lead_origem THEN
    RAISE EXCEPTION 'destino e origem iguais' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.leads
  WHERE id IN (_lead_destino, _lead_origem)
  ORDER BY id FOR UPDATE;
  UPDATE public.interacoes SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.tarefas SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.agendamentos SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.leads
  SET deleted_at = now(),
      observacoes = COALESCE(observacoes, '') || E'\n[Mesclado no lead '
        || _lead_destino::text || ']'
  WHERE id = _lead_origem;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mesclar_leads(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) TO service_role;

-- Mantém a redistribuição especializada de perda, mas impede que o RPC legado
-- aceite um gestor de outra equipe. O wrapper faz o mesmo gate central antes
-- de entrar no motor transacional existente.
REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text)
  TO service_role;
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido_v2(
  _lead_id uuid,
  _categoria text,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(_categoria), '') IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatorio' USING ERRCODE = '22023';
  END IF;
  RETURN public.marcar_lead_perdido(_lead_id, _categoria, _detalhe);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  TO authenticated;

-- A função interna de oferta nunca deve ser chamável como API e filtra o
-- chamador mesmo quando executada dentro de outra SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _sem_dias integer;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]')));
  _temps := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]')));
  _projetos := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'))::uuid
  );
  _origens := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]')));
  _sem_dias := NULLIF(_filtros->>'semInteracaoHaDias','')::integer;

  RETURN QUERY
  SELECT l.* FROM public.leads AS l
  WHERE public.pode_acessar_lead(auth.uid(), l.id)
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_corretor IS NULL OR l.corretor_id = _corretor)
    AND (cardinality(_statuses) = 0 OR l.status::text = ANY(_statuses))
    AND (cardinality(_temps) = 0 OR l.temperatura::text = ANY(_temps))
    AND (cardinality(_projetos) = 0 OR l.projeto_id = ANY(_projetos))
    AND (cardinality(_origens) = 0 OR l.origem::text = ANY(_origens))
    AND (
      _sem_dias IS NULL OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - make_interval(days => _sem_dias)
    );
END;
$$;
REVOKE ALL ON FUNCTION public._oferta_ativa_query(jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oferta_ativa_query(jsonb, uuid) TO service_role;
