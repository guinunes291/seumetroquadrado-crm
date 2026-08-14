-- ============================================================================
-- CONTENÇÃO DO REPROCESSO DE EXCEÇÕES — backoff exponencial com teto
-- (Fatia 1 / Passo 1 do conserto da distribuição)
--
-- MEDIDO (14/08, distribution_log):
--   676.394 tentativas resultado='sem_corretor' em 14 dias (pico 71.915/dia
--   em 01/08, 17.428/dia em 13/08). Com ~125–310 leads no escopo vivo da
--   varredura, isso dá ~48–136 tentativas por lead POR DIA.
--
-- CAUSA: o backoff atual é fixo — depois de `reprocesso_max_tentativas` (3),
-- o lead é retentado a cada 30 minutos PARA SEMPRE (cláusula
-- `updated_at > now() - interval '30 minutes'` em processar_distribuicao_automatica
-- e redistribuir_sla_webhook). Cada giro em vazio grava 1 linha em
-- distribution_log + 1 em distribuicao_log_contexto e toca a exceção.
--
-- MUDANÇA: a janela de descanso passa a CRESCER com as tentativas:
--   tent. 3 → 30min · 4 → 1h · 5 → 2h · 6 → 4h · 7 → 8h · 8+ → teto
--   (teto configurável em distribuicao_settings.reprocesso_backoff_teto_minutos,
--   default 720 = 12h).
-- O auto-resgate continua ("corretores voltam de manhã, o lead se recupera
-- sozinho"): nenhum lead entra em estado terminal — só descansa mais.
-- A exceção continua pendente e visível na fila; nenhum alerta é removido.
--
-- ROLLBACK (sem deploy do app; ver docs/ops/fatia1-distribuicao-runbook.md):
--   re-aplicar os corpos anteriores das duas funções (seção "Rollback P1" do
--   runbook) — o helper _excecao_em_backoff fica inerte se não for chamado.
-- ============================================================================

-- 1) Teto do backoff (minutos). Ajustável por UPDATE, sem deploy.
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('reprocesso_backoff_teto_minutos', '720'::jsonb,
   'Teto (minutos) da janela de descanso do reprocesso de exceções. A janela dobra a cada tentativa após reprocesso_max_tentativas: 30min, 1h, 2h, 4h... até este teto.')
ON CONFLICT (chave) DO NOTHING;

-- 2) Critério único de descanso — usado pela varredura E pelo repasse de SLA.
CREATE OR REPLACE FUNCTION public._excecao_em_backoff(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.distribuicao_excecoes e
    CROSS JOIN LATERAL (
      SELECT
        COALESCE((public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int, 3) AS max_tent,
        COALESCE((public.get_dist_setting('reprocesso_backoff_teto_minutos') #>> '{}')::int, 720) AS teto_min
    ) s
    WHERE e.lead_id = _lead_id
      AND e.status IN ('pendente','em_analise')
      AND e.tentativas >= s.max_tent
      AND e.updated_at > now() - LEAST(
            interval '30 minutes' * power(2, LEAST(e.tentativas - s.max_tent, 6)),
            make_interval(mins => s.teto_min))
  );
$$;

REVOKE ALL ON FUNCTION public._excecao_em_backoff(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._excecao_em_backoff(uuid) TO service_role;

-- 3) Varredura automática — corpo idêntico ao vigente (20260709120300),
--    trocando SÓ a cláusula de backoff fixo pelo helper. A regra de respeitar
--    exceção ARQUIVADA permanece intacta.
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _dist int := 0;
  _falhas int := 0;
  _sla int := 0;
  _redist int := 0;
BEGIN
  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- Exceção aberta em janela de descanso: backoff EXPONENCIAL (30min,
      -- 1h, 2h, 4h... até o teto) em vez de 30min fixos para sempre — quando
      -- corretores voltarem a ficar aptos, o lead se recupera SOZINHO.
      AND NOT public._excecao_em_backoff(l.id)
      -- Exceção ARQUIVADA depois da última movimentação do lead = decisão
      -- humana de deixá-lo sem corretor; o cron respeita (re-triagem manual
      -- pela roleta/lista continua possível).
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          -- >= : arquivamento na MESMA transação da última movimentação
          -- ainda conta como posterior (now() é constante por transação).
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at ASC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      -- SEM EXIT: a falha vira exceção e o lote continua (outras roletas /
      -- outros leads não podem ficar reféns de uma roleta travada).
      _falhas := _falhas + 1;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$$;

-- 4) Repasse por SLA de minutos — mesma troca de cláusula, resto intacto.
CREATE OR REPLACE FUNCTION public.redistribuir_sla_webhook()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _res jsonb;
  _qtd int := 0;
BEGIN
  FOR _lead IN
    SELECT l.id, l.corretor_id, l.corretores_que_tentaram, dc.timeout_minutos
    FROM public.leads l
    JOIN public.distribuicao_config dc
      ON dc.origem = l.origem
     AND dc.timeout_minutos IS NOT NULL
    WHERE l.via_webhook = true
      AND l.status = 'aguardando_atendimento'
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id IS NOT NULL
      AND l.data_distribuicao IS NOT NULL
      AND COALESCE(l.tentativas_redistribuicao, 0) < 3
      AND l.data_distribuicao < now() - (dc.timeout_minutos || ' minutes')::interval
      AND NOT public._excecao_em_backoff(l.id)
    ORDER BY l.data_distribuicao ASC
    LIMIT 50
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- Garante que o corretor atual não recebe o próprio repasse.
    UPDATE public.leads
       SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
     WHERE id = _lead.id
       AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

    -- Motor único: respeita cota, presença, pausa e % trabalhado da roleta
    -- do lead (antes o repasse ignorava tudo isso — bug #3).
    _res := public._distribuir_lead_v3(
      _lead.id, 'redistribuicao', NULL, NULL, NULL, 'sla_webhook',
      jsonb_build_object('sla_minutos', _lead.timeout_minutos,
                         'corretor_anterior_sla', _lead.corretor_id));

    IF (_res->>'ok')::boolean THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento',
             tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
       WHERE id = _lead.id;
      _qtd := _qtd + 1;
    END IF;
    -- Falha → exceção aberta pelo motor dá visibilidade ao gestor; o lead
    -- permanece com o corretor atual sem queimar tentativa.
  END LOOP;

  RETURN _qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.processar_distribuicao_automatica() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redistribuir_sla_webhook() FROM PUBLIC, anon, authenticated;
