-- Distribuição automática observável: mantém a regra de elegibilidade (inclusive
-- os 70% de carteira trabalhada), mas passa a RETORNAR e LOGAR o motivo quando
-- distribui pouco/nada — para diagnosticar por que a base não está distribuindo.
-- Não altera corretor_elegivel nem distribuir_lead_elegivel.

CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _novo uuid;
  _dist int := 0;
  _redist int := 0;
  _pendentes int := 0;
  _motivo text := 'ok';
  _corretores_fila int;
  _ativos int;
  _presentes int;
  _dentro_cota int;
  _elegiveis int;
BEGIN
  FOR _lead_id IN
    SELECT id FROM public.leads
    WHERE corretor_id IS NULL
      AND status = 'novo'
      AND deleted_at IS NULL
      AND na_lixeira = false
    ORDER BY created_at DESC
    LIMIT 200
  LOOP
    _novo := public.distribuir_lead_elegivel(_lead_id);
    IF _novo IS NOT NULL THEN
      _dist := _dist + 1;
    ELSE
      -- Nenhum corretor elegível agora: não adianta seguir o lote.
      EXIT;
    END IF;
  END LOOP;

  _redist := public.redistribuir_leads_parados();

  SELECT count(*) INTO _pendentes
  FROM public.leads
  WHERE corretor_id IS NULL AND status = 'novo' AND deleted_at IS NULL AND na_lixeira = false;

  -- Diagnóstico da fila: por que distribuiu pouco/nada.
  SELECT
    count(*),
    count(*) FILTER (WHERE fd.ativo),
    count(*) FILTER (WHERE fd.ativo AND p.presente AND p.presente_em::date = current_date),
    count(*) FILTER (WHERE fd.ativo AND fd.leads_recebidos_hoje < fd.max_leads_dia),
    count(*) FILTER (WHERE public.corretor_elegivel(fd.corretor_id))
  INTO _corretores_fila, _ativos, _presentes, _dentro_cota, _elegiveis
  FROM public.fila_distribuicao fd
  JOIN public.profiles p ON p.id = fd.corretor_id;

  IF _dist > 0 THEN
    _motivo := 'ok';
  ELSIF _pendentes = 0 THEN
    _motivo := 'sem leads novos para distribuir';
  ELSIF COALESCE(_corretores_fila, 0) = 0 THEN
    _motivo := 'fila de distribuição vazia (nenhum corretor na roleta)';
  ELSIF COALESCE(_presentes, 0) = 0 THEN
    _motivo := 'nenhum corretor presente hoje (sem check-in)';
  ELSIF COALESCE(_dentro_cota, 0) = 0 THEN
    _motivo := 'todos os corretores atingiram a cota diária';
  ELSIF COALESCE(_elegiveis, 0) = 0 THEN
    _motivo := 'nenhum corretor elegível: carteira com menos de 70% trabalhada';
  ELSE
    _motivo := 'nenhum lead distribuído (verificar fila/elegibilidade)';
  END IF;

  RAISE LOG 'distribuicao_automatica: distribuidos=%, redistribuidos=%, pendentes=%, motivo=%',
    _dist, _redist, _pendentes, _motivo;

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'redistribuidos', _redist,
    'pendentes', _pendentes,
    'motivo', _motivo,
    'diagnostico', jsonb_build_object(
      'corretores_fila', COALESCE(_corretores_fila, 0),
      'ativos', COALESCE(_ativos, 0),
      'presentes_hoje', COALESCE(_presentes, 0),
      'dentro_cota', COALESCE(_dentro_cota, 0),
      'elegiveis', COALESCE(_elegiveis, 0)
    ),
    'em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_distribuicao_automatica() TO authenticated;
