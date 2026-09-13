-- ============================================================================
-- Distribuição por VAGA LIVRE, não só por cota diária
-- ============================================================================
-- Desenho: docs/ops/carteira-ativa-40-fatia3.md §3.1 e §8.3.
--
-- Medido em 13/09/2026: os 49 corretores ativos têm todos
-- `limite_diario_leads = 50`, e o teto de carteira é 40. Os dois números
-- brigam — um corretor pode receber 50 leads num dia e só conseguir trabalhar
-- 40 no total. Enquanto a roleta olhar só a cota diária, o teto de carteira é
-- decorativo: `distribuir-estoque-plantao` roda de 10 em 10 minutos com lote
-- de 30 (4.320/dia de vazão máxima) e reenche o denominador mais rápido do
-- que qualquer time o esvazia.
--
-- A mudança é cirúrgica: o lote de cada corretor passa a ser
-- LEAST(lote, carteira_vagas_entrada_v1). Note que é a vaga de ENTRADA, não a
-- vaga global: o lead distribuído nasce em `aguardando_atendimento`, na faixa
-- SLA, que tem cap próprio — usar a vaga global aqui despejaria 40 leads numa
-- carteira vazia e 28 deles cairiam na Reserva no mesmo instante.
-- Corretor sem vaga é PULADO, não interrompe a rodada — ver a armadilha do
-- EXIT abaixo.
--
-- O que NÃO muda: a elegibilidade da roleta, o desvio do SDR, o caminho
-- `_distribuir_lead_v3` e a ordem de atendimento. Reverter = reaplicar
-- 20260908195600.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(
  _roleta text DEFAULT 'plantao'::text,
  _limite integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _sem_vaga int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _lote int;
  _vagas int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  -- Modelo SDR ligado: o pré-atendimento recebe um lote POR RODADA, limitado
  -- pelo teto de base ativa (sdr_teto_leads_ativos; 0 = sem teto). O que
  -- sobra do estoque segue para os corretores aptos na mesma rodada — os
  -- dois caminhos recebem (decisão 2026-09-08).
  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    -- A VAGA manda. Um corretor com a carteira cheia não recebe — e isso não
    -- é falta de estoque: ele é PULADO com CONTINUE, nunca com o EXIT do fim
    -- do laço. Sair aqui starvaria todo mundo depois dele na ordem da roleta
    -- (quem tem 45 no fundo apareceria cedo e travaria a rodada inteira).
    _vagas := public.carteira_vagas_entrada_v1(_c.corretor_id);
    IF _vagas <= 0 THEN
      _sem_vaga := _sem_vaga + 1;
      CONTINUE;
    END IF;

    _corretores := _corretores + 1;
    _entregues := 0;
    _lote := LEAST(_por_corretor, _vagas);

    FOR _lead IN
      SELECT l.id
        FROM public.leads l
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
       ORDER BY l.created_at ASC
       LIMIT _lote
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _lote,
                                      'vagas_na_carteira', _vagas), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    -- Aqui sim: tentou com vaga aberta e não veio nada = o estoque acabou.
    EXIT WHEN _entregues = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'corretores_sem_vaga', _sem_vaga,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor')
  );
END;
$function$;

COMMENT ON FUNCTION public.distribuir_estoque_roleta(text, int) IS
  'Escoa o estoque aguardando_corretor pela roleta, com o lote de cada corretor limitado pela vaga de ENTRADA da carteira ativa (carteira_vagas_entrada_v1: o menor entre o teto e o cap da faixa SLA). Corretor sem vaga e pulado e contado em corretores_sem_vaga. O desvio do SDR e o caminho _distribuir_lead_v3 seguem intactos.';

-- Sanidade: o mesmo estilo de guard do motor SDR — aborta o deploy se algum
-- ramo sumiu numa edição futura.
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.distribuir_estoque_roleta(text,int)'::regprocedure);
  IF position('_sdr_ativo' IN _def) = 0 OR position('_distribuir_lead_v3' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta sem o desvio do SDR ou sem o caminho vigente';
  END IF;
  IF position('carteira_vagas_entrada_v1' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta sem o limite por vaga da carteira ativa';
  END IF;
  IF position('CONTINUE' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta: corretor sem vaga precisa ser pulado, nao encerrar a rodada';
  END IF;
END $$;
