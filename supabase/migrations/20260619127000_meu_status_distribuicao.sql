-- Status de distribuição do PRÓPRIO corretor (auth.uid()), para mostrar no "Meu Dia"
-- por que ele está (ou não) recebendo novos leads. Espelha public.corretor_elegivel.
-- Mantém a regra dos 70% sobre toda a carteira ativa (definição: "trabalhado" =
-- status fora de 'aguardando_atendimento').

CREATE OR REPLACE FUNCTION public.meu_status_distribuicao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _na_fila boolean;
  _ativo boolean;
  _recebidos int;
  _max int;
  _presente_hoje boolean;
  _ativos int;
  _trabalhados int;
  _pct numeric;
  _faltam int;
  _elegivel boolean;
  _motivo text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT true, fd.ativo, fd.leads_recebidos_hoje, fd.max_leads_dia
  INTO _na_fila, _ativo, _recebidos, _max
  FROM public.fila_distribuicao fd WHERE fd.corretor_id = _uid;

  SELECT (p.presente AND p.presente_em IS NOT NULL AND p.presente_em::date = current_date)
  INTO _presente_hoje FROM public.profiles p WHERE p.id = _uid;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'aguardando_atendimento')
  INTO _ativos, _trabalhados
  FROM public.leads
  WHERE corretor_id = _uid AND deleted_at IS NULL AND na_lixeira = false
    AND status NOT IN ('contrato_fechado', 'pos_venda', 'perdido');

  _pct := CASE WHEN COALESCE(_ativos, 0) = 0 THEN 100
               ELSE round(_trabalhados::numeric / _ativos::numeric * 100, 0) END;
  -- Quantos leads ainda precisam ser avançados para atingir 70%.
  _faltam := GREATEST(0, CEIL(0.7 * COALESCE(_ativos, 0)) - COALESCE(_trabalhados, 0));
  _elegivel := public.corretor_elegivel(_uid);

  _motivo := CASE
    WHEN NOT COALESCE(_na_fila, false) THEN 'fora_da_roleta'
    WHEN NOT COALESCE(_ativo, false) THEN 'inativo'
    WHEN NOT COALESCE(_presente_hoje, false) THEN 'sem_checkin'
    WHEN COALESCE(_recebidos, 0) >= COALESCE(_max, 0) THEN 'cota_atingida'
    WHEN _elegivel THEN 'elegivel'
    ELSE 'carteira_abaixo_70'
  END;

  RETURN jsonb_build_object(
    'na_fila', COALESCE(_na_fila, false),
    'elegivel', COALESCE(_elegivel, false),
    'motivo', _motivo,
    'pct_trabalhada', _pct,
    'ativos', COALESCE(_ativos, 0),
    'trabalhados', COALESCE(_trabalhados, 0),
    'faltam_trabalhar', _faltam,
    'recebidos_hoje', COALESCE(_recebidos, 0),
    'max_leads_dia', COALESCE(_max, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.meu_status_distribuicao() TO authenticated;
