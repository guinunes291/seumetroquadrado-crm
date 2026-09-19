-- Transferência em massa não dispara o dossiê do copiloto lead a lead.
--
-- O QUE ESTAVA ACONTECENDO
-- transferir_leads() chama _notificar_handoff_novo_dono() DENTRO do loop, um
-- POST por lead para o webhook do copiloto (n8n), que responde mandando no
-- WhatsApp do corretor o dossiê "NOVO LEAD (redistribuido) — <nome>". Numa
-- transferência de 21 leads o corretor recebeu 21 dossiês em sequência, além
-- da mensagem única de resumo que o CRM passou a mandar (PR #204/#205). É
-- exatamente a rajada que o WhatsApp trata como spam e que arrisca bloqueio
-- da instância Z-API — com ela vão junto SDR, atendimento e oferta ativa.
--
-- O QUE MUDA
-- O dossiê individual continua valendo para transferência AVULSA: quando a
-- chamada move um único lead de dono, o POST sai igual a hoje. Em lote (mais
-- de um lead trocando de dono na mesma chamada) o webhook não é acionado —
-- quem avisa é a mensagem de resumo da edge function notify-lead-transfer,
-- que lista os leads e sai uma vez só.
--
-- O QUE NÃO MUDA
-- Gate de carteira, auditoria (_auditar_redistribuicao roda por lead, é log
-- interno e não gera mensagem), distribution_log, resolução de exceções,
-- reatribuição de agendamentos/tarefas e o retorno da função. Os demais
-- chamadores de _notificar_handoff_novo_dono (roleta v2, SDR, redistribuição
-- por SLA) seguem intactos: são eventos unitários, um lead por vez.
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
  -- Handoff: acumula em vez de disparar dentro do loop. Só vira POST se a
  -- chamada inteira tiver movido UM lead de dono.
  _donos_trocados integer := 0;
  _hand_lead uuid;
  _hand_motivo text;
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

    -- Auditoria por lead (log interno, não gera mensagem) + guarda do handoff.
    IF _l.corretor_id IS DISTINCT FROM _corretor THEN
      PERFORM public._auditar_redistribuicao(
        _l.id, _l.corretor_id, _corretor, 'Transferência manual');

      _donos_trocados := _donos_trocados + 1;
      IF _donos_trocados = 1 THEN
        _hand_lead := _l.id;
        _hand_motivo :=
          'transferência manual: ' ||
          COALESCE((SELECT nome FROM public.profiles WHERE id = _l.corretor_id), '(anterior)') ||
          ' -> ' || _nome;
      END IF;
    END IF;

    _n := _n + 1;
  END LOOP;

  -- Dossiê do copiloto só na transferência avulsa. Em lote quem avisa é a
  -- mensagem única de resumo (edge function notify-lead-transfer); mandar um
  -- POST por lead aqui devolveria a rajada de WhatsApp que essa mudança tirou.
  IF _donos_trocados = 1 THEN
    PERFORM public._notificar_handoff_novo_dono(_hand_lead, _corretor, _hand_motivo);
  END IF;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid)
  TO authenticated, service_role;

-- Recarrega o schema do PostgREST para expor a definição atualizada.
NOTIFY pgrst, 'reload schema';
