-- Qualidade da distribuição/ingestão:
-- (1) guard para não reatribuir automaticamente um lead que já tem corretor
--     (ex.: webhook reenviado); (2) RPC de dedup por telefone normalizado por projeto.

CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _distribuido_por uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _corretor uuid;
  _max_pos int;
  _caller uuid := auth.uid();
  _atual uuid;
BEGIN
  -- Apenas service_role (sem auth.uid) ou admin/gestor podem distribuir
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Não reatribuir automaticamente um lead que já tem corretor (idempotência do webhook).
  SELECT corretor_id INTO _atual FROM public.leads WHERE id = _lead_id;
  IF _atual IS NOT NULL AND _tipo = 'automatica' THEN
    RETURN _atual;
  END IF;

  SELECT corretor_id INTO _corretor
  FROM public.fila_distribuicao
  WHERE ativo = true
    AND leads_recebidos_hoje < max_leads_dia
  ORDER BY posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _corretor IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;

  UPDATE public.fila_distribuicao
  SET posicao = _max_pos + 1,
      leads_recebidos_hoje = leads_recebidos_hoje + 1,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor;

  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
      corretores_que_tentaram = array_append(corretores_que_tentaram, _corretor)
  WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, distribuido_por_id, motivo)
  VALUES (_lead_id, _corretor, _tipo, COALESCE(_distribuido_por, _caller),
          CASE WHEN _tipo = 'automatica' THEN 'Roleta automática'
               ELSE 'Distribuição ' || _tipo::text END);

  RETURN _corretor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribuir_lead(uuid, public.distribuicao_tipo, uuid) TO authenticated, service_role;

-- Dedup: retorna o id de um lead existente no mesmo projeto com o mesmo telefone
-- (comparado apenas pelos dígitos). Usado pelo webhook antes de inserir.
CREATE OR REPLACE FUNCTION public.buscar_lead_duplicado(_projeto_id uuid, _telefone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.leads
  WHERE projeto_id = _projeto_id
    AND deleted_at IS NULL
    AND length(regexp_replace(_telefone, '\D', '', 'g')) >= 8
    AND regexp_replace(telefone, '\D', '', 'g') = regexp_replace(_telefone, '\D', '', 'g')
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) TO authenticated, service_role;
