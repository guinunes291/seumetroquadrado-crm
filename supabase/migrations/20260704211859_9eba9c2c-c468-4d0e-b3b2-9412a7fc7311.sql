
-- 1) Recria marcar_lead_perdido exigindo categoria válida e preenchendo data_perda
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(
  _lead_id uuid,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _proximo uuid;
  _max_pos int;
  _motivo text;
  _validos text[] := ARRAY[
    'sem_contato','sumiu_pos_proposta','credito_score','credito_renda',
    'estourou_teto','ja_possui_imovel','preco_parcela','comprou_concorrente',
    'timing_adiou','sem_perfil','outro'
  ];
BEGIN
  IF _categoria IS NULL OR NOT (_categoria = ANY(_validos)) THEN
    RAISE EXCEPTION 'motivo_perda_categoria obrigatório e deve ser um de: %', array_to_string(_validos, ', ');
  END IF;
  IF _categoria = 'outro' AND COALESCE(btrim(_detalhe), '') = '' THEN
    RAISE EXCEPTION 'detalhe é obrigatório quando categoria = ''outro''';
  END IF;

  _motivo := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria);

  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

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
           motivo_perda_categoria = _categoria,
           data_perda = now()
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller);

    RETURN NULL;
  END IF;
END;
$function$;

-- 2) Trigger de enforcement: nenhuma transição para 'perdido' sem categoria
CREATE OR REPLACE FUNCTION public.enforce_motivo_perda_categoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'perdido' THEN
    -- Só bloqueia na TRANSIÇÃO para perdido (INSERT ou UPDATE de outro status
    -- para perdido). Edições em leads já perdidos com categoria NULL histórica
    -- permanecem permitidas para não travar operações rotineiras.
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'perdido') THEN
      IF NEW.motivo_perda_categoria IS NULL THEN
        RAISE EXCEPTION 'motivo_perda_categoria é obrigatório ao marcar lead como perdido';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_enforce_motivo_perda ON public.leads;
CREATE TRIGGER trg_leads_enforce_motivo_perda
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_motivo_perda_categoria();

-- 3) Rotina de arquivamento por 30 dias sem contato — sempre categorizada
CREATE OR REPLACE FUNCTION public.arquivar_leads_sem_contato_30d()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  WITH candidatos AS (
    SELECT id
    FROM public.leads
    WHERE status <> 'perdido'
      AND status <> 'contrato_fechado'
      AND status <> 'pos_venda'
      AND COALESCE(ultima_interacao, ultimo_contato, data_distribuicao, created_at)
          < now() - interval '30 days'
  ),
  upd AS (
    UPDATE public.leads l
       SET status = 'perdido',
           motivo_perda_categoria = 'sem_contato',
           motivo_perdido = 'Sem contato por 30 dias — arquivado automaticamente',
           data_perda = now(),
           na_lixeira = true,
           data_movido_lixeira = now()
      FROM candidatos c
     WHERE l.id = c.id
    RETURNING l.id
  )
  SELECT COUNT(*) INTO _n FROM upd;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.arquivar_leads_sem_contato_30d() FROM PUBLIC, anon, authenticated;
