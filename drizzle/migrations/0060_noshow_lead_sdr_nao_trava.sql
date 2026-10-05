CREATE OR REPLACE FUNCTION public.salvar_modo_visita(p_agendamento_id uuid, p_checklist jsonb DEFAULT '{}'::jsonb, p_nota_transcrita text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_concluir boolean DEFAULT false, p_proxima_etapa lead_status DEFAULT NULL::lead_status, p_proxima_acao text DEFAULT NULL::text, p_proximo_followup timestamp with time zone DEFAULT NULL::timestamp with time zone, p_compareceu boolean DEFAULT true, p_interesse text DEFAULT NULL::text, p_objecao_principal text DEFAULT NULL::text, p_reagendar_para timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS visita_execucoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _agenda public.agendamentos%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _resultado public.visita_execucoes%ROWTYPE;
  _checklist jsonb := COALESCE(p_checklist, '{}'::jsonb);
  _ja_concluida boolean := false;
  _compareceu boolean := COALESCE(p_compareceu, true);
  _interesse text := NULLIF(btrim(p_interesse), '');
  _objecao text := NULLIF(btrim(p_objecao_principal), '');
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

  SELECT * INTO _lead FROM public.leads WHERE id = _agenda.lead_id FOR UPDATE;

  SELECT * INTO _resultado
  FROM public.visita_execucoes
  WHERE agendamento_id = _agenda.id
  FOR UPDATE;
  _ja_concluida := FOUND AND _resultado.status = 'concluida';

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

  IF p_concluir AND NOT _compareceu AND _interesse IS NOT NULL THEN
    RAISE EXCEPTION 'sem comparecimento não há leitura de interesse'
      USING ERRCODE = '22023';
  END IF;

  IF p_reagendar_para IS NOT NULL AND p_reagendar_para <= now() THEN
    RAISE EXCEPTION 'reagendamento precisa ser no futuro' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visita_execucoes AS execucao (
    agendamento_id, lead_id, corretor_id, checklist, nota_transcrita, observacoes,
    status, proxima_etapa, proxima_acao, proximo_followup, concluida_em,
    interesse, objecao_principal, criada_por, atualizada_por
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
    _interesse,
    _objecao,
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
      interesse = COALESCE(EXCLUDED.interesse, execucao.interesse),
      objecao_principal = COALESCE(EXCLUDED.objecao_principal, execucao.objecao_principal),
      atualizada_por = _uid,
      updated_at = now()
  RETURNING execucao.* INTO _resultado;

  IF p_concluir THEN
    UPDATE public.agendamentos
    SET status = CASE WHEN _compareceu
                      THEN 'realizado'::public.agendamento_status
                      ELSE 'nao_compareceu'::public.agendamento_status END,
        realizado_em = CASE WHEN _compareceu THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _agenda.id;

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
        'observacoes', NULLIF(btrim(p_observacoes), ''),
        'interesse', _interesse,
        'objecao_principal', _objecao
      )
    );

    IF p_reagendar_para IS NOT NULL THEN
      INSERT INTO public.agendamentos (
        lead_id, corretor_id, titulo, descricao, tipo, status,
        data_inicio, data_fim, local
      ) VALUES (
        _agenda.lead_id,
        COALESCE(_agenda.corretor_id, _lead.corretor_id, _uid),
        _agenda.titulo,
        CASE WHEN _compareceu
             THEN 'Reagendada a partir do Modo Visita.'
             ELSE 'Reagendada após não comparecimento.' END,
        'visita'::public.agendamento_tipo,
        'agendado'::public.agendamento_status,
        p_reagendar_para,
        p_reagendar_para + (_agenda.data_fim - _agenda.data_inicio),
        _agenda.local
      );
    END IF;
  END IF;

  -- No-show de lead do SDR: o gatilho sdr_devolver_apos_no_show já devolveu o
  -- lead ao SDR (sem corretor). Não move a etapa: o corretor perdeu o acesso
  -- e a transição derrubaria todo o registro.
  SELECT * INTO _lead FROM public.leads WHERE id = _agenda.lead_id;
  IF p_concluir AND NOT _compareceu AND _lead.corretor_id IS NULL THEN
    RETURN _resultado;
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
$function$;