-- =====================================================================
-- Modo Visita — desfecho "não compareceu" e registro na timeline
--
-- Dois furos do fluxo de campo:
--
--  1) NÃO EXISTIA NO-SHOW. Concluir a visita só aceitava "visita realizada"
--     ou "aguardando retorno", e nos dois casos o agendamento virava
--     'realizado'. Cliente que não apareceu ficava com o agendamento em
--     'confirmado' para sempre — e, desde a régua de datas (20260731121000),
--     agendamento validado é a fonte da métrica de visitas e comparecimento.
--     O no-show simplesmente não chegava ao relatório.
--
--  2) A VISITA NÃO IA PARA A TIMELINE. A RPC gravava a execução e mexia no
--     status do lead, mas nunca criava interação. Quem abria o lead depois
--     via a etapa mudada e nenhum registro da visita. A outra porta para o
--     mesmo fato (validar_visita, usada pelo modal do Kanban) já criava —
--     duas portas, dois resultados.
--
-- A assinatura ganha p_compareceu. Como CREATE OR REPLACE com aridade
-- diferente criaria uma SOBRECARGA (e a chamada por nome ficaria ambígua),
-- a versão de 8 argumentos é derrubada antes.
-- =====================================================================

DROP FUNCTION IF EXISTS public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.salvar_modo_visita(
  p_agendamento_id uuid,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_nota_transcrita text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_concluir boolean DEFAULT false,
  p_proxima_etapa public.lead_status DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL,
  p_compareceu boolean DEFAULT true
)
RETURNS public.visita_execucoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _agenda public.agendamentos%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _resultado public.visita_execucoes%ROWTYPE;
  _checklist jsonb := COALESCE(p_checklist, '{}'::jsonb);
  _ja_concluida boolean := false;
  _compareceu boolean := COALESCE(p_compareceu, true);
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _agenda
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND deleted_at IS NULL
    AND tipo = 'visita'::public.agendamento_tipo
  FOR UPDATE;

  IF NOT FOUND OR _agenda.lead_id IS NULL THEN
    RAISE EXCEPTION 'visita vinculada a lead não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  -- lead_id é a fonte de autorização. O corretor_id da agenda/execução é
  -- histórico denormalizado e não pode manter acesso depois de transferência.
  IF NOT public.pode_acessar_lead(_uid, _agenda.lead_id) THEN
    RAISE EXCEPTION 'visita fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_checklist) <> 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(_checklist) AS item(chave, valor)
       WHERE item.chave NOT IN (
         'horario_confirmado',
         'documentos_separados',
         'simulacao_revisada',
         'projeto_apresentado',
         'objecoes_registradas'
       )
       OR jsonb_typeof(item.valor) <> 'boolean'
     ) THEN
    RAISE EXCEPTION 'checklist inválido' USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(p_nota_transcrita, '')) > 5000
     OR char_length(COALESCE(p_observacoes, '')) > 5000
     OR char_length(COALESCE(p_proxima_acao, '')) > 500 THEN
    RAISE EXCEPTION 'conteúdo da visita excede o limite'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead
  FROM public.leads
  WHERE id = _agenda.lead_id
  FOR UPDATE;

  SELECT * INTO _resultado
  FROM public.visita_execucoes
  WHERE agendamento_id = _agenda.id
  FOR UPDATE;
  _ja_concluida := FOUND AND _resultado.status = 'concluida';

  -- Repetir a confirmação (duplo toque/retry de rede) é idempotente: nunca
  -- tenta mover o lead uma segunda vez.
  IF _ja_concluida THEN
    RETURN _resultado;
  END IF;

  IF _agenda.status NOT IN (
    'agendado'::public.agendamento_status,
    'confirmado'::public.agendamento_status
  ) THEN
    RAISE EXCEPTION 'somente visita agendada ou confirmada pode ser executada'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir AND p_proxima_etapa IS NULL THEN
    RAISE EXCEPTION 'próxima etapa é obrigatória ao concluir'
      USING ERRCODE = '22023';
  END IF;

  -- Sem comparecimento não existe visita realizada: o lead volta para a fila
  -- de retorno, e o follow-up futuro deixa de ser opcional — cliente que não
  -- apareceu sem próximo contato marcado é lead perdido em câmera lenta.
  IF p_concluir AND NOT _compareceu
     AND p_proxima_etapa = 'visita_realizada'::public.lead_status THEN
    RAISE EXCEPTION 'visita sem comparecimento não pode virar visita realizada'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir
     AND (p_proxima_etapa = 'aguardando_retorno'::public.lead_status OR NOT _compareceu)
     AND (p_proximo_followup IS NULL OR p_proximo_followup <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visita_execucoes AS execucao (
    agendamento_id,
    lead_id,
    corretor_id,
    checklist,
    nota_transcrita,
    observacoes,
    status,
    proxima_etapa,
    proxima_acao,
    proximo_followup,
    concluida_em,
    criada_por,
    atualizada_por
  ) VALUES (
    _agenda.id,
    _agenda.lead_id,
    _agenda.corretor_id,
    _checklist,
    NULLIF(btrim(p_nota_transcrita), ''),
    NULLIF(btrim(p_observacoes), ''),
    CASE WHEN p_concluir THEN 'concluida' ELSE 'em_andamento' END,
    CASE WHEN p_concluir THEN p_proxima_etapa ELSE NULL END,
    CASE WHEN p_concluir THEN NULLIF(btrim(p_proxima_acao), '') ELSE NULL END,
    CASE WHEN p_concluir THEN p_proximo_followup ELSE NULL END,
    CASE WHEN p_concluir THEN now() ELSE NULL END,
    _uid,
    _uid
  )
  ON CONFLICT (agendamento_id) DO UPDATE
  SET checklist = EXCLUDED.checklist,
      nota_transcrita = EXCLUDED.nota_transcrita,
      observacoes = EXCLUDED.observacoes,
      status = CASE
        WHEN execucao.status = 'concluida' THEN execucao.status
        ELSE EXCLUDED.status
      END,
      proxima_etapa = COALESCE(execucao.proxima_etapa, EXCLUDED.proxima_etapa),
      proxima_acao = COALESCE(execucao.proxima_acao, EXCLUDED.proxima_acao),
      proximo_followup = COALESCE(execucao.proximo_followup, EXCLUDED.proximo_followup),
      concluida_em = COALESCE(execucao.concluida_em, EXCLUDED.concluida_em),
      atualizada_por = _uid,
      updated_at = now()
  RETURNING execucao.* INTO _resultado;

  -- Validação do agendamento: é ela que alimenta visitas realizadas (no dia
  -- da visita) e no-show nos relatórios.
  IF p_concluir THEN
    UPDATE public.agendamentos
    SET status = CASE WHEN _compareceu
                      THEN 'realizado'::public.agendamento_status
                      ELSE 'nao_compareceu'::public.agendamento_status END,
        realizado_em = CASE WHEN _compareceu THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _agenda.id;

    -- A visita passa a deixar rastro no histórico do lead. Mesma forma do
    -- validar_visita (modal do Kanban), para as duas portas contarem a
    -- mesma história.
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (
      _agenda.lead_id,
      _uid,
      'visita'::public.interacao_tipo,
      'interna',
      CASE WHEN _compareceu THEN 'Visita realizada' ELSE 'Cliente não compareceu' END,
      COALESCE(
        NULLIF(btrim(p_nota_transcrita), ''),
        NULLIF(btrim(p_observacoes), ''),
        '(sem observações)'
      ),
      jsonb_build_object(
        'agendamento_id', _agenda.id,
        'compareceu', _compareceu,
        'origem', 'modo_visita',
        'checklist', _checklist,
        'data_visita', _agenda.data_inicio,
        'observacoes', NULLIF(btrim(p_observacoes), '')
      )
    );
  END IF;

  IF p_concluir AND _lead.status IS DISTINCT FROM p_proxima_etapa THEN
    PERFORM public.transicionar_lead(
      _agenda.lead_id,
      p_proxima_etapa,
      CASE WHEN _compareceu
           THEN 'Conclusão registrada no Modo Visita'
           ELSE 'Cliente não compareceu à visita (Modo Visita)' END,
      NULLIF(btrim(p_proxima_acao), ''),
      p_proximo_followup
    );
  END IF;

  RETURN _resultado;
END;
$$;

COMMENT ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean
) IS
  'Salva o Modo Visita e, ao concluir, valida o agendamento (realizado ou não compareceu), registra a visita na timeline do lead e move o status — tudo numa transação. p_compareceu=false exige follow-up futuro e nunca vira visita realizada.';

REVOKE ALL ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean
) TO authenticated;
