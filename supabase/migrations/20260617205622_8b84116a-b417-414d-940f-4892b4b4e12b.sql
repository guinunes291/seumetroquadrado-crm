
-- Separate rotation queue for Facebook ADS leads.
-- Keeps daily caps shared but maintains an independent round-robin
-- so consecutive Facebook leads don't all land on the same broker.

ALTER TABLE public.fila_distribuicao
  ADD COLUMN IF NOT EXISTS posicao_facebook integer;

-- Initialize Facebook positions from current general posicao
UPDATE public.fila_distribuicao
SET posicao_facebook = posicao
WHERE posicao_facebook IS NULL;

CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo,
  _distribuido_por uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _corretor uuid;
  _max_pos int;
  _caller uuid := auth.uid();
  _atual uuid;
  _origem text;
  _is_fb boolean;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT corretor_id, origem::text INTO _atual, _origem
  FROM public.leads WHERE id = _lead_id;

  IF _atual IS NOT NULL AND _tipo = 'automatica' THEN
    RETURN _atual;
  END IF;

  _is_fb := (_origem = 'facebook');

  IF _is_fb THEN
    SELECT corretor_id INTO _corretor
    FROM public.fila_distribuicao
    WHERE ativo = true
      AND leads_recebidos_hoje < max_leads_dia
    ORDER BY COALESCE(posicao_facebook, posicao) ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  ELSE
    SELECT corretor_id INTO _corretor
    FROM public.fila_distribuicao
    WHERE ativo = true
      AND leads_recebidos_hoje < max_leads_dia
    ORDER BY posicao ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF _corretor IS NULL THEN
    RETURN NULL;
  END IF;

  IF _is_fb THEN
    SELECT COALESCE(MAX(posicao_facebook), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
    SET posicao_facebook = _max_pos + 1,
        leads_recebidos_hoje = leads_recebidos_hoje + 1,
        ultima_distribuicao = now()
    WHERE corretor_id = _corretor;
  ELSE
    SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
    SET posicao = _max_pos + 1,
        leads_recebidos_hoje = leads_recebidos_hoje + 1,
        ultima_distribuicao = now()
    WHERE corretor_id = _corretor;
  END IF;

  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
      corretores_que_tentaram = array_append(corretores_que_tentaram, _corretor)
  WHERE id = _lead_id;

  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, distribuido_por_id, motivo)
  VALUES (_lead_id, _corretor, _tipo, COALESCE(_distribuido_por, _caller),
          CASE
            WHEN _tipo = 'automatica' AND _is_fb THEN 'Roleta automática (Facebook ADS)'
            WHEN _tipo = 'automatica' THEN 'Roleta automática'
            ELSE 'Distribuição ' || _tipo::text
          END);

  RETURN _corretor;
END;
$function$;
