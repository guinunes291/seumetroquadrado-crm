-- Restaura o gate de carteira em transferir_leads.
--
-- A migration 20260711201106 (estilo UUID, gerada) redefiniu transferir_leads
-- com um gate fraco: apenas has_role(admin|gestor), sem is_active_member, sem
-- pode_atribuir_lead no destino e SEM pode_acessar_lead por lead. Como funções
-- SECURITY DEFINER ignoram a RLS da tabela, isso permite que qualquer gestor
-- transfira leads de QUALQUER equipe (roubo de carteira cross-equipe) — furo
-- ativo em produção. Esta migration é aditiva (CREATE OR REPLACE, assinatura
-- idêntica) e reaplica o corpo forte de 20260711123500, preservando as chamadas
-- de auditoria/handoff que a versão 201106 introduziu para não perder a
-- notificação do novo dono.
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

    -- Auditoria + notificação de handoff (preservadas de 20260711201106):
    -- só quando o dono realmente muda.
    IF _l.corretor_id IS DISTINCT FROM _corretor THEN
      PERFORM public._auditar_redistribuicao(
        _l.id, _l.corretor_id, _corretor, 'Transferência manual');
      PERFORM public._notificar_handoff_novo_dono(
        _l.id, _corretor,
        'transferência manual: ' ||
        COALESCE((SELECT nome FROM public.profiles WHERE id = _l.corretor_id), '(anterior)') ||
        ' -> ' || _nome);
    END IF;

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid)
  TO authenticated, service_role;

-- Recarrega o schema do PostgREST para expor a definição atualizada.
NOTIFY pgrst, 'reload schema';
