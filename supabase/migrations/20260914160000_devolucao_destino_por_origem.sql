-- ============================================================================
-- Devolução com destino por origem: lead pago volta para um corretor
-- ============================================================================
-- Desenho: docs/ops/bolsao-oportunidades-fatia4.md §6.
--
-- `devolver_leads_posse_expirada` (20260826121000) devolve TODO lead de posse
-- expirada para a base — `corretor_id = NULL`, `classe_lead = 'base'`, e, com
-- o SDR ligado, com `sdr_id` preenchido. Um destino só para origens que não
-- têm o mesmo valor.
--
-- O problema é de dinheiro, não de arquitetura: um lead de Facebook custou
-- mídia. Mandá-lo para a fila do discador quando um corretor o abandona é
-- jogar fora o que a casa pagou. Ele precisa de outro humano, não de um robô.
--
-- Três destinos, pela origem:
--
--   PAGO (facebook, chatbot/Marquinhos, impulso_smq — custeado pela empresa —
--   e o que veio do SDR) → OUTRO CORRETOR. Não se chama o distribuidor aqui
--   dentro: basta deixar o lead no estado que o cron de distribuição já
--   consome (`corretor_id IS NULL`, `sdr_id IS NULL`, status
--   `aguardando_atendimento`) e ele é redistribuído em até um minuto.
--   `corretores_que_tentaram` impede que volte para quem o abandonou. Reusar
--   o trilho existente evita reentrância — esta função roda dentro de um
--   cron, e chamar o distribuidor em loop seria a forma mais fácil de criar
--   uma tempestade de escrita difícil de auditar.
--
--   CONQUISTADO PELO CORRETOR (captação, indicação, plantão, whatsapp,
--   telefone, site, ação de rua) → NÃO SAI. Ele trouxe o cliente; tirar por
--   decurso de prazo é confisco, e é a regra que mais rápido destrói a
--   confiança na ferramenta. Se estiver parado, é conversa de gestão, não
--   rotina automática.
--
--   ESTOQUE (importação, google_sheets, outro) → BASE, como hoje. É o
--   material do discador e do SDR, e ninguém pagou por ele.
--
-- Também fecha uma brecha da versão anterior: lead com VENDA VIVA não sai,
-- mesmo que o status ainda seja de fase anterior (uma venda em rascunho num
-- lead em análise de crédito). O filtro antigo só olhava
-- `contrato_fechado`/`pos_venda`, que são consequência da venda, não a venda.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Quem pagou pelo lead
-- ---------------------------------------------------------------------------
-- Uma fonte só, como `motivo_perda_sem_retrabalho` (20260914150000): a mesma
-- pergunta aparece na devolução, no Bolsão e na virada, e três cópias dela
-- divergiriam em silêncio.
CREATE OR REPLACE FUNCTION public.lead_origem_paga(
  _origem public.lead_origem,
  _sdr_entregue_em timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _sdr_entregue_em IS NOT NULL
      OR _origem IN ('facebook'::public.lead_origem,
                     'chatbot'::public.lead_origem,
                     'impulso_smq'::public.lead_origem);
$$;

COMMENT ON FUNCTION public.lead_origem_paga(public.lead_origem, timestamptz) IS
  'Lead que a casa pagou ou trabalhou: mídia (facebook), Marquinhos '
  '(chatbot), impulso_smq (custeado pela empresa) ou triagem de SDR. '
  'Quando devolvido, vai para outro corretor — nunca para o discador.';

CREATE OR REPLACE FUNCTION public.lead_origem_conquistada(_origem public.lead_origem)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _origem IN ('captacao_corretor'::public.lead_origem,
                     'indicacao'::public.lead_origem,
                     'plantao'::public.lead_origem,
                     'whatsapp'::public.lead_origem,
                     'telefone'::public.lead_origem,
                     'site'::public.lead_origem,
                     'acao_rua'::public.lead_origem);
$$;

COMMENT ON FUNCTION public.lead_origem_conquistada(public.lead_origem) IS
  'Lead que o próprio corretor trouxe. Nunca sai por decurso de prazo: '
  'tirar seria confisco. Parado, é conversa de gestão.';

-- ---------------------------------------------------------------------------
-- 2) A devolução, com destino
-- ---------------------------------------------------------------------------
-- O corpo abaixo é o corpo VIVO da função, com três mudanças marcadas.
CREATE OR REPLACE FUNCTION public.devolver_leads_posse_expirada()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _lead record; _qtd int := 0; _log_id uuid;
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
  _sdr_on boolean := public._sdr_ativo();
  _sdr uuid;
BEGIN
  IF NOT public._modelo_v2_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.status, l.ultima_atividade_em, l.sdr_id,
             -- (1) o destino, decidido aqui e usado lá embaixo
             public.lead_origem_paga(l.origem, l.sdr_entregue_em) AS paga,
             CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                  THEN _d_av ELSE _d_ini END AS regra_dias,
             row_number() OVER (PARTITION BY l.corretor_id ORDER BY l.ultima_atividade_em ASC) AS rn
      FROM public.leads l
      WHERE l.corretor_id IS NOT NULL
        AND l.na_lixeira = false
        AND l.deleted_at IS NULL
        AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
        -- (2) o corretor trouxe: não sai por decurso de prazo
        AND NOT public.lead_origem_conquistada(l.origem)
        -- (3) venda viva não se mexe, mesmo em status anterior
        AND NOT public._lead_venda_viva(l.id)
        AND l.ultima_atividade_em < now() - (
              CASE WHEN l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')
                   THEN _d_av ELSE _d_ini END || ' days')::interval
    )
    SELECT id, corretor_id, status, regra_dias, sdr_id, paga
    FROM candidatos
    WHERE rn <= 10
    ORDER BY ultima_atividade_em ASC
    LIMIT 50
  LOOP
    -- Lead pago não vai para o SDR: deixar `sdr_id` nulo é o que faz o cron
    -- de distribuição (que exige `sdr_id IS NULL`) pegá-lo para outro
    -- corretor no minuto seguinte.
    IF _lead.paga THEN
      _sdr := NULL;
    ELSIF _sdr_on THEN
      _sdr := COALESCE(_lead.sdr_id, public._proximo_sdr());
    ELSE
      _sdr := _lead.sdr_id;
    END IF;

    PERFORM set_config('app.sdr_motor', 'on', true);
    UPDATE public.leads
       SET corretor_anterior_id = corretor_id,
           corretor_id = NULL,
           -- 'quente' devolve o lead à esteira de corretor; 'base' é o
           -- material de discador e SDR.
           classe_lead = CASE WHEN _lead.paga THEN 'quente' ELSE 'base' END,
           status = 'aguardando_atendimento',
           tentativas_redistribuicao = 0,
           corretores_que_tentaram = ARRAY[corretor_id],
           sdr_id = _sdr,
           sdr_entregue_em = NULL,
           sdr_interesse_confirmado = CASE WHEN _lead.sdr_id IS NULL THEN false ELSE sdr_interesse_confirmado END
     WHERE id = _lead.id AND corretor_id = _lead.corretor_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead.id, NULL, 'redistribuicao',
       'Posse expirada (' || _lead.regra_dias || ' dias sem registro) — '
         || CASE WHEN _lead.paga THEN 'lead pago, volta para a roleta de corretores'
                 WHEN _sdr IS NOT NULL THEN 'devolvido para a base do SDR'
                 ELSE 'devolvido para a base' END,
       CASE WHEN _lead.paga THEN 'plantao' ELSE 'base' END,
       'posse_expirada', 'sucesso')
    RETURNING id INTO _log_id;

    INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
    VALUES (_log_id, jsonb_strip_nulls(jsonb_build_object(
      'gatilho', 'posse_expirada',
      'corretor_anterior', _lead.corretor_id,
      'status_no_momento', _lead.status,
      'regra_dias', _lead.regra_dias,
      'destino', CASE WHEN _lead.paga THEN 'corretor' ELSE 'base' END,
      'sdr_id', _sdr)));

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $function$;

REVOKE ALL ON FUNCTION public.devolver_leads_posse_expirada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_leads_posse_expirada() TO service_role;

DO $guard$
BEGIN
  IF to_regprocedure('public.lead_origem_paga(public.lead_origem, timestamptz)') IS NULL
     OR to_regprocedure('public.lead_origem_conquistada(public.lead_origem)') IS NULL THEN
    RAISE EXCEPTION 'Devolução por origem: função de classificação não foi criada.';
  END IF;
END;
$guard$;
