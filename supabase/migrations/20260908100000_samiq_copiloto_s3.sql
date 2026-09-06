-- =============================================================================
-- SamiQ copiloto — Onda S3: presença (decisão D13 — briefing + alertas).
--
-- O briefing ao abrir o painel é calculado no servidor sem o modelo. Aqui
-- entram os dois avisos que chegam SEM o corretor abrir a Sami:
--  1) samiq_gerar_briefing_alertas — um alerta por corretor por dia (08:00 em
--     São Paulo, seg–sáb) com o resumo do que exige ação: visitas hoje, visitas
--     sem confirmar (hoje/amanhã), follow-ups vencidos, clientes esfriando.
--     Só quando há algo; dedup por dia no fuso de SP (mesmo padrão dos alertas
--     de tarefa/lead parado).
--  2) samiq_alertar_credito_reprovado — gatilho em analises_credito: análise
--     que volta 'reprovada' avisa o corretor na hora, com link para o dossiê.
--
-- Reusa a tabela `alertas` (sino + realtime já existentes); tipo 'sistema'.
-- Triggers trocados com CREATE OR REPLACE (lição do #173: DROP TRIGGER pede
-- AccessExclusive e trava contra leituras do app). lock_timeout curto: falha
-- limpa em vez de enfileirar a operação.
-- =============================================================================

SET LOCAL lock_timeout = '10s';

-- 1) Briefing diário ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.samiq_gerar_briefing_alertas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _ini_hoje timestamptz := (_hoje::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim_amanha timestamptz := ((_hoje + 2)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _inseridos integer := 0;
BEGIN
  WITH corretores AS (
    SELECT p.id
    FROM public.profiles AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id AND ur.role = 'corretor'
    WHERE p.ativo = true AND p.status_conta = 'ativa'
  ),
  visitas AS (
    SELECT ag.corretor_id,
           count(*) FILTER (WHERE ag.data_inicio < _ini_hoje + interval '1 day')::int AS hoje,
           count(*) FILTER (WHERE ag.status = 'agendado')::int AS sem_confirmar
    FROM public.agendamentos AS ag
    WHERE ag.tipo = 'visita'
      AND ag.deleted_at IS NULL
      AND ag.status IN ('agendado', 'confirmado')
      AND ag.data_inicio >= _ini_hoje
      AND ag.data_inicio < _fim_amanha
    GROUP BY ag.corretor_id
  ),
  vencidas AS (
    SELECT t.corretor_id, count(*)::int AS n
    FROM public.tarefas AS t
    WHERE t.status IN ('pendente', 'em_andamento')
      AND t.deleted_at IS NULL
      AND t.data_vencimento IS NOT NULL
      AND t.data_vencimento < now()
    GROUP BY t.corretor_id
  ),
  esfriando AS (
    SELECT l.corretor_id, count(*)::int AS n
    FROM public.leads AS l
    WHERE l.corretor_id IS NOT NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.temperatura IN ('quente', 'morno')
      AND l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido', 'novo', 'aguardando_corretor')
      AND COALESCE(l.ultima_interacao, l.created_at) < now() - interval '3 days'
    GROUP BY l.corretor_id
  ),
  resumo AS (
    SELECT c.id AS user_id,
           COALESCE(v.hoje, 0) AS visitas_hoje,
           COALESCE(v.sem_confirmar, 0) AS sem_confirmar,
           COALESCE(t.n, 0) AS vencidas,
           COALESCE(e.n, 0) AS esfriando
    FROM corretores AS c
    LEFT JOIN visitas AS v ON v.corretor_id = c.id
    LEFT JOIN vencidas AS t ON t.corretor_id = c.id
    LEFT JOIN esfriando AS e ON e.corretor_id = c.id
  ),
  com_pauta AS (
    SELECT r.*,
           array_to_string(ARRAY[
             CASE WHEN r.visitas_hoje > 0
               THEN r.visitas_hoje || CASE WHEN r.visitas_hoje = 1 THEN ' visita hoje' ELSE ' visitas hoje' END END,
             CASE WHEN r.sem_confirmar > 0
               THEN r.sem_confirmar || CASE WHEN r.sem_confirmar = 1 THEN ' visita sem confirmar' ELSE ' visitas sem confirmar' END END,
             CASE WHEN r.vencidas > 0
               THEN r.vencidas || CASE WHEN r.vencidas = 1 THEN ' follow-up vencido' ELSE ' follow-ups vencidos' END END,
             CASE WHEN r.esfriando > 0
               THEN r.esfriando || CASE WHEN r.esfriando = 1 THEN ' cliente esfriando' ELSE ' clientes esfriando' END END
           ], ' · ') AS mensagem
    FROM resumo AS r
    WHERE r.visitas_hoje > 0 OR r.sem_confirmar > 0 OR r.vencidas > 0 OR r.esfriando > 0
  ),
  inseridos AS (
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    SELECT cp.user_id,
           'sistema',
           'Sami: seu dia ' || to_char(_hoje, 'DD/MM'),
           cp.mensagem || '. Abra a Sami para ver por quem começar.',
           '/atendimento',
           NULL
    FROM com_pauta AS cp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.alertas AS a
      WHERE a.user_id = cp.user_id
        AND a.tipo = 'sistema'
        AND a.titulo LIKE 'Sami: seu dia%'
        AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date = _hoje
    )
    RETURNING 1
  )
  SELECT count(*) INTO _inseridos FROM inseridos;

  RETURN _inseridos;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_gerar_briefing_alertas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_gerar_briefing_alertas() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'samiq-briefing-diario';
    -- 08:00 em São Paulo (UTC-3), segunda a sábado.
    PERFORM cron.schedule(
      'samiq-briefing-diario',
      '0 11 * * 1-6',
      $job$SELECT public.samiq_gerar_briefing_alertas();$job$
    );
  END IF;
END $$;

-- 2) Crédito reprovado → aviso imediato ao corretor -----------------------------
CREATE OR REPLACE FUNCTION public.samiq_alertar_credito_reprovado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _dono uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'reprovada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'reprovada' THEN RETURN NEW; END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = NEW.lead_id;
  _dono := COALESCE(NEW.corretor_id, _lead.corretor_id);
  IF _dono IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT _dono,
         'sistema',
         'Crédito reprovado: ' || COALESCE(_lead.nome, 'cliente'),
         'A análise voltou reprovada. Veja o parecer no dossiê e combine o próximo passo — a Sami ajuda a montar a conversa.',
         '/leads/' || NEW.lead_id::text,
         NEW.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.alertas AS a
    WHERE a.ref_id = NEW.id AND a.titulo LIKE 'Crédito reprovado:%'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_samiq_alerta_credito_reprovado
  AFTER INSERT OR UPDATE OF status ON public.analises_credito
  FOR EACH ROW
  EXECUTE FUNCTION public.samiq_alertar_credito_reprovado();
