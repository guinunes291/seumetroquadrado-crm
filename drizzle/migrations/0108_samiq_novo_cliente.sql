ALTER TABLE public.samiq_propostas DROP CONSTRAINT samiq_propostas_tipo_check;
ALTER TABLE public.samiq_propostas ADD CONSTRAINT samiq_propostas_tipo_check CHECK (tipo = ANY (ARRAY['registrar_contato','anotar','criar_tarefa','atualizar_qualificacao','agendar_visita','mudar_etapa','criar_lead']));

CREATE OR REPLACE FUNCTION public.samiq_desfazer_proposta(_user_id uuid, _proposta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _p public.samiq_propostas%ROWTYPE;
  _r jsonb;
  _snap jsonb;
  _now timestamptz := clock_timestamp();
  _feito jsonb := '[]'::jsonb;
  _id uuid;
  _lead uuid;
BEGIN
  SELECT * INTO _p
  FROM public.samiq_propostas AS p
  WHERE p.id = _proposta_id AND p.user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposta nao encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _p.status NOT IN ('aceita', 'editada') THEN
    RAISE EXCEPTION 'proposta nao esta confirmada' USING ERRCODE = '22023';
  END IF;
  IF _p.tipo = 'mudar_etapa' THEN
    RAISE EXCEPTION 'mudanca de etapa nao se desfaz pelo botao' USING ERRCODE = '22023';
  END IF;
  IF _p.desfazer_ate IS NULL OR _p.desfazer_ate < _now THEN
    RAISE EXCEPTION 'janela de desfazer expirada' USING ERRCODE = '22023';
  END IF;

  _r := COALESCE(_p.resultado, '{}'::jsonb);

  IF _r ? 'interacao_id' THEN
    _id := (_r ->> 'interacao_id')::uuid;
    UPDATE public.interacoes SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"interacao"'::jsonb; END IF;
  END IF;

  IF _r ? 'tarefa_id' THEN
    _id := (_r ->> 'tarefa_id')::uuid;
    UPDATE public.tarefas SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"tarefa"'::jsonb; END IF;
  END IF;

  IF _r ? 'agendamento_id' THEN
    _id := (_r ->> 'agendamento_id')::uuid;
    UPDATE public.agendamentos
       SET status = 'cancelado',
           motivo_cancelamento = COALESCE(motivo_cancelamento, 'Desfeito via Sami'),
           deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"agendamento"'::jsonb; END IF;
  END IF;

  IF _r ? 'lead_criado_id' THEN
    _id := (_r ->> 'lead_criado_id')::uuid;
    UPDATE public.leads SET na_lixeira = true, data_movido_lixeira = _now
     WHERE id = _id AND na_lixeira = false AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"lead_criado"'::jsonb; END IF;
  END IF;

  IF _r ? 'lead_anterior' AND jsonb_typeof(_r -> 'lead_anterior') = 'object' THEN
    _snap := _r -> 'lead_anterior';
    _lead := COALESCE(_p.lead_id, NULLIF(_r ->> 'lead_id', '')::uuid);
    IF _lead IS NOT NULL THEN
      UPDATE public.leads
         SET renda_informada = CASE WHEN _snap ? 'renda_informada'
               THEN _snap ->> 'renda_informada' ELSE renda_informada END,
             entrada_disponivel = CASE WHEN _snap ? 'entrada_disponivel'
               THEN _snap ->> 'entrada_disponivel' ELSE entrada_disponivel END,
             usa_fgts = CASE WHEN _snap ? 'usa_fgts' AND jsonb_typeof(_snap -> 'usa_fgts') = 'boolean'
               THEN (_snap ->> 'usa_fgts')::boolean ELSE usa_fgts END,
             tem_fgts = CASE WHEN _snap ? 'tem_fgts'
               THEN (_snap ->> 'tem_fgts')::boolean ELSE tem_fgts END,
             tipo_renda = CASE WHEN _snap ? 'tipo_renda'
               THEN _snap ->> 'tipo_renda' ELSE tipo_renda END,
             temperatura = CASE WHEN _snap ? 'temperatura'
               THEN (_snap ->> 'temperatura')::public.lead_temperatura ELSE temperatura END,
             projeto_nome = CASE WHEN _snap ? 'projeto_nome'
               THEN _snap ->> 'projeto_nome' ELSE projeto_nome END,
             resumo_qualificacao = CASE WHEN _snap ? 'resumo_qualificacao'
               THEN _snap ->> 'resumo_qualificacao' ELSE resumo_qualificacao END,
             objecoes = CASE WHEN _snap ? 'objecoes' AND jsonb_typeof(_snap -> 'objecoes') = 'array'
               THEN ARRAY(SELECT jsonb_array_elements_text(_snap -> 'objecoes')) ELSE objecoes END
       WHERE id = _lead;
      IF FOUND THEN _feito := _feito || '"lead"'::jsonb; END IF;
    END IF;
  END IF;

  UPDATE public.samiq_propostas
     SET status = 'desfeita', desfeito_em = _now
   WHERE id = _proposta_id;

  RETURN jsonb_build_object('desfeito', true, 'itens', _feito);
END;
$function$;
