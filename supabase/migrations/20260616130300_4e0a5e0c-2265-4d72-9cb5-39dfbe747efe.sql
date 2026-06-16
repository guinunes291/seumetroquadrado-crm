-- Correção: erro "Could not find the function public.marcar_lead_perdido(...) in
-- the schema cache" ao marcar lead como perdido. Reafirma a função (idempotente),
-- garante a coluna usada por ela e força o recarregamento do schema do PostgREST.
-- Cobre os dois cenários: função ausente na base OU cache do PostgREST desatualizado.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS motivo_perda_categoria text;

CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(
  _lead_id uuid,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _proximo uuid;
  _max_pos int;
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria, 'Sem motivo informado');
BEGIN
  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

  -- Autorização: dono do lead, ou admin/gestor.
  IF _caller IS NOT NULL
     AND _caller <> COALESCE(_atual, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.has_role(_caller,'admin')
     AND NOT public.has_role(_caller,'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _atual IS NOT NULL AND NOT (_atual = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _atual);
  END IF;

  SELECT fd.corretor_id INTO _proximo
  FROM public.fila_distribuicao fd
  WHERE fd.ativo = true
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND NOT (fd.corretor_id = ANY(_tentou))
    AND public.corretor_elegivel(fd.corretor_id) = true
  ORDER BY fd.posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _proximo IS NOT NULL THEN
    SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;

    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _proximo;

    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = _proximo,
           status = 'aguardando_atendimento',
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao,0) + 1,
           corretores_que_tentaram = array_append(_tentou, _proximo)
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, _proximo, 'manual', 'Redistribuído após perda: ' || _motivo, _caller);

    RETURN _proximo;
  ELSE
    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = NULL,
           status = 'perdido',
           na_lixeira = true,
           data_movido_lixeira = now(),
           corretores_que_tentaram = _tentou,
           motivo_perdido = _motivo,
           motivo_perda_categoria = _categoria
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller);

    RETURN NULL;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) TO authenticated, service_role;

-- Força o PostgREST a recarregar o schema (resolve o "schema cache").
NOTIFY pgrst, 'reload schema';
