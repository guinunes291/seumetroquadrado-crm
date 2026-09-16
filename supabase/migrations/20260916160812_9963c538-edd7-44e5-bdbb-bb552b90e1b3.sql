-- ============================================================================
-- Fase 2 — Passo 3: a base do SDR não reescreve o relógio da entrega
-- ============================================================================
-- distribuir_estoque_sdr empurrava data_distribuicao = now() a cada passagem.
-- Como o mesmo lead pode voltar à base do SDR, isso apagava a data em que o
-- lead virou responsabilidade de alguém pela primeira vez e destruía qualquer
-- medição de SLA sobre o estoque. Agora só preenche quando está vazio.
-- timestamp_recebimento continua now() (é o carimbo desta passagem), e o
-- status = 'aguardando_atendimento' que a função força é decisão de política
-- registrada — não se toca.
-- Reverter: trocar COALESCE(leads.data_distribuicao, now()) de volta por now().
CREATE OR REPLACE FUNCTION public.distribuir_estoque_sdr(_limite int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead record;
  _sdr uuid;
  _ok int := 0;
  _lote int := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads' USING ERRCODE = '42501';
  END IF;

  FOR _lead IN
    SELECT l.id
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND COALESCE(l.na_lixeira, false) = false
      AND l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status = 'aguardando_corretor'::public.lead_status
    ORDER BY l.created_at ASC
    LIMIT _lote
  LOOP
    _sdr := public._proximo_sdr();
    EXIT WHEN _sdr IS NULL;

    PERFORM set_config('app.sdr_motor', 'on', true);
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET sdr_id = _sdr,
           status = 'aguardando_atendimento'::public.lead_status,
           classe_lead = 'base',
           sdr_interesse_confirmado = false,
           sdr_entregue_em = NULL,
           data_distribuicao = COALESCE(leads.data_distribuicao, now()),
           timestamp_recebimento = now()
     WHERE id = _lead.id AND sdr_id IS NULL AND corretor_id IS NULL;
    IF FOUND THEN
      PERFORM public._sdr_log_base(_lead.id, _sdr, 'Estoque sem dono para a base do SDR', 'base_sdr:estoque', 'estoque');
      _ok := _ok + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'modelo', 'sdr', 'distribuidos', _ok, 'lote', _lote,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor'::public.lead_status));
END; $$;

REVOKE ALL ON FUNCTION public.distribuir_estoque_sdr(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_sdr(int) TO authenticated, service_role;

-- ============================================================================
-- Fase 2 — Passo 4: o funil comercial não mistura a base do SDR
-- ============================================================================
-- fila_funil_v1 somava numa única etapa 'aguardando_atendimento' duas
-- populações que não têm nada a ver uma com a outra: 4.125 leads na mesa de um
-- corretor e 42.973 leads na base do SDR (sem corretor, com sdr_id, ainda não
-- entregues). Agora:
--   * etapa 'aguardando_atendimento' = SÓ lead com corretor_id;
--   * lead da base do SDR sai do funil e vira a linha 'base_sdr' (ordem 98);
--   * lead sem corretor e sem SDR nessa etapa cai em 'entrada' (ordem 0), que
--     já é o balde de "sem dono" — nenhum lead some da leitura.
-- O escopo é o mesmo da RPC (_corretor / papel do chamador): quem não enxerga
-- lead sem dono continua sem ver 'entrada' nem 'base_sdr'.
-- Reverter: reaplicar o corpo de 20260912190000_fila_funil_v1.sql.
CREATE OR REPLACE FUNCTION public.fila_funil_v1(
  _dias integer DEFAULT 30,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE (
  recorte text,
  etapa text,
  ordem smallint,
  quantidade integer,
  parados integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _gestao boolean;
  _ve_tudo boolean;
  _equipe uuid[];
  _scope uuid := _corretor;
  _janela interval := make_interval(days => LEAST(GREATEST(COALESCE(_dias, 30), 1), 365));
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _gestao := public.has_role(_caller, 'admin')
          OR public.has_role(_caller, 'gestor')
          OR public.has_role(_caller, 'superintendente');
  IF NOT _gestao THEN
    _scope := _caller;
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH carteira AS (
    SELECT
      CASE
        WHEN l.corretor_id IS NULL
         AND l.sdr_id IS NOT NULL
         AND l.sdr_entregue_em IS NULL              THEN 98::smallint
        WHEN l.corretor_id IS NULL
         AND public.funil_ordem(l.status) = 1       THEN 0::smallint
        ELSE public.funil_ordem(l.status)
      END AS ord,
      l.created_at AS criado_em,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (_scope IS NULL OR l.corretor_id = _scope)
      AND (_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))
  ),
  recortes AS (
    SELECT 'base'::text AS rec, c.ord, c.movimento FROM carteira AS c
    UNION ALL
    SELECT 'safra'::text, c.ord, c.movimento FROM carteira AS c
     WHERE c.criado_em >= now() - _janela
  )
  SELECT
    r.rec,
    CASE r.ord
      WHEN 0 THEN 'entrada'
      WHEN 1 THEN 'aguardando_atendimento'
      WHEN 2 THEN 'aguardando_retorno'
      WHEN 3 THEN 'qualificacao_corretor'
      WHEN 4 THEN 'em_atendimento'
      WHEN 5 THEN 'agendado'
      WHEN 6 THEN 'visita_realizada'
      WHEN 7 THEN 'analise_credito'
      WHEN 8 THEN 'venda'
      WHEN 98 THEN 'base_sdr'
      ELSE 'perdido'
    END,
    r.ord,
    count(*)::integer,
    -- Parado só faz sentido no funil comercial (1..7): venda, perdido e a
    -- base do SDR são outra conversa; entrada ainda não tem dono.
    count(*) FILTER (
      WHERE r.ord BETWEEN 1 AND 7 AND r.movimento < now() - interval '5 days'
    )::integer
  FROM recortes AS r
  GROUP BY r.rec, r.ord
  ORDER BY r.rec, r.ord;
END;
$$;

COMMENT ON FUNCTION public.fila_funil_v1(integer, uuid) IS
  'Fila Única: funil das etapas em dois recortes (safra de N dias e base inteira). aguardando_atendimento conta só lead com corretor; a base do SDR (sem corretor, com sdr_id, sdr_entregue_em nulo) sai como linha base_sdr (ordem 98), fora do funil comercial.';

REVOKE ALL ON FUNCTION public.fila_funil_v1(integer, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fila_funil_v1(integer, uuid)
  TO authenticated;