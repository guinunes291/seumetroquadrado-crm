-- =============================================================================
-- Fallback por velocidade + cron de redistribuição só da última semana
-- =============================================================================
-- Contexto (12/10/2026, feriado): só 1 corretor fez check-in e nenhum ficou
-- apto (regra de 3 vendas para receber de casa). Os leads do dia caíram em
-- "novo" sem corretor e o cron de 5 em 5 minutos nunca chegava neles: ele
-- pegava os 200 MAIS ANTIGOS sem dono, e havia ~48 mil desde março na frente.
-- Estas mudanças já estão aplicadas em produção (direto no banco, 12/10); esta
-- migration as versiona para o replay e para nenhuma migração futura do
-- Lovable desfazer o que está rodando.
--
-- Decisões do dono (12/10/2026):
--   1. "sempre que faltarem corretores, os leads vão para o Marquinhos": sem
--      plantão de pessoas; lead antigo sem dono não cai em corretor pelo cron.
--   2. "lead vai para quem está ativo no CRM nos últimos 30 minutos, após
--      isso, escolha o mais rápido entre eles".
--
-- O que muda:
--   a) processar_distribuicao_automatica: só reprocessa lead criado nos
--      últimos 7 dias, do mais novo para o mais antigo. Lead mais velho sem
--      dono (base, importação) segue com o Marquinhos pelo escalonado da base.
--   b) Quando a roleta devolve "sem corretor" (ninguém apto: falta de
--      check-in), o cron chama _fallback_velocidade: o lead vai para o
--      corretor ATIVO NO CRM nos últimos N minutos (ação auditada ou
--      interação registrada por ele) com a melhor velocidade REAL de primeiro
--      contato. Todas as outras réguas da roleta valem (pausa, cota diária,
--      regra dos 65, % trabalhado, telefone, papel corretor, quem já teve o
--      lead); só a falta de check-in é ignorada. Ninguém ativo: o lead fica
--      com o Marquinhos. Fora do horário da roleta (adiado) não entra: é
--      espera intencional.
--   c) corretor_velocidade + recalcular_velocidade_contato (cron de hora em
--      hora): % de leads da roleta contatados por WhatsApp/ligação do próprio
--      corretor em até 15 minutos úteis, janela de 14 dias; lead nunca
--      contatado conta como falha. Score suavizado para a média do time
--      (k=10). Por que não as faixas de recalcular_faixas_velocidade: elas
--      contam QUALQUER interação como contato, inclusive mudança de status
--      (730 "contatos" em menos de 1 min nos 14 dias medidos eram o corretor
--      marcando o lead como perdido), e não têm cron.
-- =============================================================================

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
 ('fallback_velocidade_ativo', 'true'::jsonb,
  'Fallback por velocidade (12/10/2026): sem corretor apto na roleta, o lead vai para o corretor ativo no CRM nos últimos fallback_velocidade_atividade_min minutos com melhor taxa de contato em até 15 min úteis. false = desligado.'),
 ('fallback_velocidade_atividade_min', '30'::jsonb,
  'Minutos desde a última ação no CRM (interação registrada ou alteração auditada) para o corretor contar como ativo no fallback por velocidade.'),
 ('velocidade_janela_dias', '14'::jsonb,
  'Janela (dias) da métrica de velocidade real de primeiro contato (WhatsApp/ligação do próprio corretor).')
ON CONFLICT (chave) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Métrica de velocidade REAL
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corretor_velocidade (
  corretor_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  recebidos        int     NOT NULL,
  contatados       int     NOT NULL,
  contatados_15min int     NOT NULL,
  pct_15min        numeric NOT NULL,
  pct_contato      numeric NOT NULL,
  score            numeric NOT NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.corretor_velocidade IS
 'Velocidade real de primeiro contato por corretor (12/10/2026). Conta só WhatsApp/ligação de saída feitos pelo próprio corretor após receber o lead pela roleta; lead nunca contatado conta como falha. score = taxa em até 15 min úteis suavizada para a média do time (k=10), para quem tem pouca amostra não disparar no topo nem no fim.';
ALTER TABLE public.corretor_velocidade ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.recalcular_velocidade_contato()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _janela int := COALESCE((public.get_dist_setting('velocidade_janela_dias') #>> '{}')::int, 14);
  _k numeric := 10;
  _media numeric;
  _n int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _vel (corretor_id uuid, recebidos int, contatados int, ate15 int) ON COMMIT DROP;
  TRUNCATE _vel;

  INSERT INTO _vel
  WITH base AS (
    SELECT dl.corretor_id, dl.created_at,
           (SELECT min(i.ocorreu_em) FROM public.interacoes i
             WHERE i.lead_id = dl.lead_id AND i.autor_id = dl.corretor_id
               AND i.deleted_at IS NULL
               AND i.ocorreu_em >= dl.created_at
               AND i.direcao::text = 'saida'
               AND i.tipo::text IN ('whatsapp','ligacao')) AS pc
      FROM public.distribution_log dl
     WHERE dl.resultado = 'sucesso'
       AND dl.corretor_id IS NOT NULL
       AND (dl.tipo::text IN ('automatica','redistribuicao') OR dl.regra_aplicada = 'fallback_velocidade')
       AND dl.created_at >= now() - make_interval(days => _janela)
       AND dl.created_at <  now() - interval '2 hours'
  )
  SELECT corretor_id, count(*), count(pc),
         count(*) FILTER (WHERE pc IS NOT NULL AND public._minutos_uteis_entre(created_at, pc) <= 15)
    FROM base GROUP BY corretor_id;

  SELECT COALESCE(sum(ate15)::numeric / NULLIF(sum(recebidos), 0), 0) INTO _media FROM _vel;

  DELETE FROM public.corretor_velocidade;
  INSERT INTO public.corretor_velocidade
    (corretor_id, recebidos, contatados, contatados_15min, pct_15min, pct_contato, score, atualizado_em)
  SELECT v.corretor_id, v.recebidos, v.contatados, v.ate15,
         round(100.0 * v.ate15 / v.recebidos, 1),
         round(100.0 * v.contatados / v.recebidos, 1),
         round(100.0 * (v.ate15 + _k * _media) / (v.recebidos + _k), 2),
         now()
    FROM _vel v
    JOIN public.profiles p ON p.id = v.corretor_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Ranking do fallback para um lead. Só lê: é também a simulação ("quem
-- receberia este lead agora?").
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fallback_velocidade_ranking(_lead_id uuid)
 RETURNS TABLE(corretor_id uuid, nome text, min_desde_ultima_acao numeric, score numeric,
               pct_15min numeric, recebidos_14d int, roleta_ok text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT COALESCE((public.get_dist_setting('fallback_velocidade_atividade_min') #>> '{}')::int, 30) AS min_ativo
  ),
  ativ AS (
    SELECT x.uid, max(x.t) AS ultima
      FROM (
        SELECT a.usuario_id AS uid, a.created_at AS t
          FROM public.audit_log a, cfg
         WHERE a.created_at >= now() - make_interval(mins => cfg.min_ativo)
           AND a.usuario_id IS NOT NULL
        UNION ALL
        SELECT i.autor_id, i.created_at
          FROM public.interacoes i, cfg
         WHERE i.ocorreu_em >= now() - interval '2 days'
           AND i.created_at >= now() - make_interval(mins => cfg.min_ativo)
           AND i.autor_id IS NOT NULL AND i.deleted_at IS NULL
      ) x
     GROUP BY x.uid
  ),
  lead AS (
    SELECT COALESCE(l.corretores_que_tentaram, ARRAY[]::uuid[]) AS tentaram
      FROM public.leads l WHERE l.id = _lead_id
  ),
  -- Elegível = passa em TODOS os critérios de pelo menos uma roleta ativa
  -- em que participa, ignorando apenas a falta de check-in.
  eleg AS (
    SELECT DISTINCT ON (e.corretor_id) e.corretor_id, r.slug
      FROM ativ a
      JOIN public.roleta_participantes rp ON rp.corretor_id = a.uid AND rp.ativo
      JOIN public.roletas r ON r.id = rp.roleta_id AND r.ativo AND r.slug NOT IN ('base','agendados-sdr')
      CROSS JOIN LATERAL public._elegibilidade_roleta(r.slug, a.uid) e
     WHERE e.motivos <@ ARRAY['ausente_hoje']::text[]
     ORDER BY e.corretor_id, r.slug
  )
  SELECT p.id, p.nome,
         round(extract(epoch FROM now() - a.ultima) / 60, 1),
         COALESCE(v.score, 0),
         COALESCE(v.pct_15min, 0),
         COALESCE(v.recebidos, 0),
         el.slug
    FROM eleg el
    JOIN ativ a ON a.uid = el.corretor_id
    JOIN public.profiles p ON p.id = el.corretor_id AND p.ativo
    LEFT JOIN public.corretor_velocidade v ON v.corretor_id = p.id
    CROSS JOIN lead
   WHERE NOT (p.id = ANY(lead.tentaram))
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role)
   ORDER BY COALESCE(v.score, 0) DESC, p.last_lead_assigned_at ASC NULLS FIRST, p.id;
$function$;

-- -----------------------------------------------------------------------------
-- Execução do fallback para um lead
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fallback_velocidade(_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _res jsonb;
  _log uuid;
BEGIN
  IF NOT COALESCE((public.get_dist_setting('fallback_velocidade_ativo') #>> '{}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fallback_desligado');
  END IF;

  -- Só lead quente, ainda sem dono.
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id AND l.corretor_id IS NULL AND l.sdr_id IS NULL
                    AND l.deleted_at IS NULL AND NOT l.na_lixeira
                    AND COALESCE(l.classe_lead, 'quente') <> 'base') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_do_escopo');
  END IF;

  SELECT * INTO _c FROM public.fallback_velocidade_ranking(_lead_id) LIMIT 1;
  IF _c.corretor_id IS NULL THEN
    -- Ninguém ativo: o lead fica com o Marquinhos.
    RETURN jsonb_build_object('ok', false, 'motivo', 'ninguem_ativo_no_crm');
  END IF;

  _res := public._distribuir_lead_v3(
    _lead_id, 'automatica'::public.distribuicao_tipo, NULL, _c.corretor_id, NULL, 'fallback_velocidade',
    jsonb_build_object(
      'forcar_fora_da_zona', 'true',
      'motivo_fora_da_zona', 'Fallback por velocidade: ninguém apto na roleta',
      'fallback_velocidade', jsonb_build_object(
        'score', _c.score, 'pct_15min', _c.pct_15min,
        'min_desde_ultima_acao', _c.min_desde_ultima_acao, 'roleta_ok', _c.roleta_ok)),
    false);

  IF (_res->>'ok')::boolean THEN
    SELECT id INTO _log FROM public.distribution_log
     WHERE lead_id = _lead_id AND corretor_id = _c.corretor_id AND resultado = 'sucesso'
     ORDER BY created_at DESC LIMIT 1;
    UPDATE public.distribution_log
       SET regra_aplicada = 'fallback_velocidade',
           motivo = 'Fallback por velocidade: ninguém apto na roleta; foi para o mais rápido ativo no CRM ('
                    || _c.nome || ', ' || _c.pct_15min || '% contatados em até 15 min, última ação há '
                    || _c.min_desde_ultima_acao || ' min)'
     WHERE id = _log;
  END IF;
  RETURN _res || jsonb_build_object('fallback', 'velocidade', 'score', _c.score);
END;
$function$;

REVOKE ALL ON FUNCTION public._fallback_velocidade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_velocidade_contato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fallback_velocidade_ranking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fallback_velocidade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_velocidade_contato() TO service_role;
GRANT EXECUTE ON FUNCTION public.fallback_velocidade_ranking(uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- Cron: a métrica de velocidade se recalcula de hora em hora (minuto 7, fora
-- do minuto cheio dos outros jobs).
-- -----------------------------------------------------------------------------
SELECT cron.schedule('recalcular-velocidade-contato', '7 * * * *',
                     $$SELECT public.recalcular_velocidade_contato();$$);

-- -----------------------------------------------------------------------------
-- Cron de redistribuição: só a última semana e, sem apto, o fallback.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _fb jsonb;
  _dist int := 0;
  _falhas int := 0;
  _fallback int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  -- Rodada manual ("Rodar distribuição" da Central) é de ADMIN. Sem JWT é o
  -- pg_cron (dono da função) ou service_role — o anon perdeu o EXECUTE abaixo,
  -- então "auth.uid() nulo" volta a significar só "sistema".
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- [12/10/2026] Só reprocessa lead dos últimos 7 dias. Lead mais antigo sem
      -- corretor (base, importação) fica com o Marquinhos pelo escalonado da base.
      AND l.created_at > now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at DESC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      -- [FALLBACK VELOCIDADE 12/10/2026] Roleta sem ninguém apto (falta de
      -- check-in): vai para o mais rápido ativo no CRM nos últimos 30 min.
      -- Ninguém ativo: o lead fica com o Marquinhos. Fora do horário da
      -- roleta (adiado) não entra aqui: é espera intencional.
      IF COALESCE(_res->>'motivo','') IN ('sem_corretor_na_zona','sem_corretor_elegivel','sem_corretor_ativo','zona_sem_time') THEN
        BEGIN
          _fb := public._fallback_velocidade(_lead_id);
          IF (_fb->>'ok')::boolean THEN
            _fallback := _fallback + 1;
          ELSE
            _falhas := _falhas + 1;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          _falhas := _falhas + 1;
        END;
      ELSE
        _falhas := _falhas + 1;
      END IF;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'fallback_velocidade', _fallback,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- Sanidade
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF public.get_dist_setting('fallback_velocidade_ativo') IS NULL THEN
    RAISE EXCEPTION 'fallback_velocidade_ativo ausente';
  END IF;
  IF to_regclass('public.corretor_velocidade') IS NULL THEN
    RAISE EXCEPTION 'corretor_velocidade ausente';
  END IF;
  IF pg_get_functiondef('public.processar_distribuicao_automatica()'::regprocedure)
       NOT LIKE '%_fallback_velocidade%' THEN
    RAISE EXCEPTION 'processar_distribuicao_automatica sem o fallback';
  END IF;
END $$;
