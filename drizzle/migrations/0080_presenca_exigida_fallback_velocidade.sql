-- =============================================================================
-- Presença exigida e fallback por velocidade — o que entrou direto em
-- produção em 12/10/2026 vem para o repositório, e quem a localização barrou
-- fica fora também do fallback
-- =============================================================================
-- Decisões do dono (12/10/2026, tarde), literais:
--
--   1. "sim" — as mudanças feitas DIRETO em produção hoje, entre 11:20 e
--      12:18 BRT (outra conversa dele, pela ferramenta de banco), FICAM. Nada
--      disso estava no repositório; esta migration traz, sem mudar uma linha:
--        * a tabela corretor_velocidade e recalcular_velocidade_contato(): a
--          velocidade REAL de primeiro contato de cada corretor (WhatsApp ou
--          ligação de saída dele mesmo, em até 15 min úteis), recalculada de
--          hora em hora pelo cron 'recalcular-velocidade-contato' (7 * * * *);
--        * fallback_velocidade_ranking() e _fallback_velocidade(): roleta sem
--          ninguém apto (falta de check-in) → o lead vai para o corretor mais
--          rápido entre os ativos no CRM nos últimos 30 minutos;
--        * processar_distribuicao_automatica() reescrita: só reprocessa lead
--          dos últimos 7 dias, o mais novo primeiro, e chama o fallback;
--        * as chaves fallback_velocidade_ativo (true),
--          fallback_velocidade_atividade_min (30) e velocidade_janela_dias (14).
--      Também de hoje, e que esta migration NÃO toca: o mínimo de vendas para
--      trabalhar em casa (presenca_casa_min_vendas_mes_anterior) foi a 0 só
--      por hoje; o cron one-shot 'restaurar-presenca-casa-1310' devolve 3 em
--      13/10 às 06:00 BRT e se desagenda. Registrar 0 aqui reabriria a casa
--      para todos em qualquer ambiente novo; registrar 3 brigaria com o 0 que
--      o dono quis hoje em produção. Fica com o cron.
--
--   2. "checkin obrigatório" — o corretor faz o check-in (Barra Funda,
--      Liberdade, Belém ou Em casa) para usar o CRM. É a TELA; no banco nada
--      muda: sem check-in ele já não recebe de fila nenhuma (0074).
--
--   3. "localização deve barrar caso não esteja na filial" — a chave
--      presenca_loja_exige_localizacao foi ligada em produção às 14:19 BRT
--      (com linha em audit_log). Aqui ela fica registrada (seção 7). Ligada,
--      check-in na filial fora do raio ou sem localização grava
--      apto_roleta = false com motivo 'fora_da_filial' ou 'sem_localizacao'
--      (presenca_checkin, 20261013120000, sem mudança).
--
--   4. Fallback × localização: "Barrado pela localização fica fora". É a
--      ÚNICA mudança de comportamento desta migration (seção 3): quem
--      escolheu uma filial hoje e foi barrado pelo GPS não recebe nem pelo
--      fallback; quem marcou "Em casa" com sinceridade (mesmo recusado por
--      casa_abaixo_minimo_vendas) continua podendo receber pelo fallback
--      quando a roleta está vazia.
--
--   Mantido (09/10): a fila Agendados do SDR não exige presença — e o
--   fallback não mexe nela (só reprocessa lead sem SDR; o ranking ignora as
--   roletas 'base' e 'agendados-sdr').
--
-- Verbatim: recalcular_velocidade_contato, _fallback_velocidade e
-- processar_distribuicao_automatica são o pg_get_functiondef de produção de
-- 12/10 (md5 conferido contra o harness depois de aplicar).
-- fallback_velocidade_ranking é a de produção mais o bloco [PRESENÇA 12/10].
--
-- Em produção, aplicar só muda duas coisas: a exclusão no ranking (item 4) e
-- o REVOKE de anon/authenticated em corretor_velocidade (a tabela nasceu com
-- os grants padrão da plataforma; o RLS sem policy já negava a leitura). O
-- resto já está lá e vira no-op.
--
-- Rollback sem deploy (Central de Distribuição → Configurações, ou SQL):
--   * fallback desligado ............ fallback_velocidade_ativo = false
--   * localização volta a só informar  presenca_loja_exige_localizacao = false
--
-- Idempotente. Espelhada em drizzle/migrations/0080.
-- =============================================================================

-- O ranking lê presenca_checkins (0074) e o fallback entrega pelo motor de
-- 8 argumentos (com _registrar_excecao). Sem eles, a função nasceria
-- quebrada — e, no migrador do Drizzle, que aplica as pendentes numa
-- transação só, levaria as outras junto.
DO $$
BEGIN
  IF to_regclass('public.presenca_checkins') IS NULL THEN
    RAISE EXCEPTION 'fallback por velocidade: aplique antes a 0074 (20261013120000_presenca_por_filial)';
  END IF;
  IF to_regprocedure('public._distribuir_lead_v3(uuid, distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean)') IS NULL
     OR to_regprocedure('public._elegibilidade_roleta(text, uuid)') IS NULL
     OR to_regprocedure('public._minutos_uteis_entre(timestamptz, timestamptz)') IS NULL
     OR to_regprocedure('public.triar_e_distribuir_lead(uuid, text)') IS NULL
     OR to_regprocedure('public.redistribuir_sla_webhook()') IS NULL
     OR to_regprocedure('public.redistribuir_leads_parados()') IS NULL
     OR to_regprocedure('public.get_dist_setting(text)') IS NULL THEN
    RAISE EXCEPTION 'fallback por velocidade: o motor da distribuição não está na versão esperada';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1) corretor_velocidade — a foto da velocidade de cada corretor.
--    Por que tabela, e não cálculo na hora: o ranking roda dentro do cron da
--    distribuição, lead a lead; a janela de 14 dias de distribution_log ×
--    interacoes custaria uma varredura por lead. O cron de hora em hora
--    recalcula a foto inteira.
--    Idêntica à de produção (colunas, NOT NULL, default, PK, FK com CASCADE,
--    comentário). Escrita só por recalcular_velocidade_contato (dona da
--    tabela, SECURITY DEFINER); leitura só pelo ranking. RLS ligado e sem
--    policy: pela API ninguém lê nem escreve — e os grants dizem o mesmo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corretor_velocidade (
  corretor_id      uuid        NOT NULL,
  recebidos        integer     NOT NULL,
  contatados       integer     NOT NULL,
  contatados_15min integer     NOT NULL,
  pct_15min        numeric     NOT NULL,
  pct_contato      numeric     NOT NULL,
  score            numeric     NOT NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corretor_velocidade_pkey PRIMARY KEY (corretor_id),
  CONSTRAINT corretor_velocidade_corretor_id_fkey
    FOREIGN KEY (corretor_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.corretor_velocidade IS
  'Velocidade real de primeiro contato por corretor (12/10/2026). Conta só WhatsApp/ligação de saída feitos pelo próprio corretor após receber o lead pela roleta; lead nunca contatado conta como falha. score = taxa em até 15 min úteis suavizada para a média do time (k=10), para quem tem pouca amostra não disparar no topo nem no fim.';

ALTER TABLE public.corretor_velocidade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.corretor_velocidade FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.corretor_velocidade TO service_role;

-- ---------------------------------------------------------------------------
-- 2) recalcular_velocidade_contato() — VERBATIM de produção (12/10/2026).
--    Janela: velocidade_janela_dias (14), sem as 2 últimas horas (o lead de
--    agora ainda não teve tempo de ser contatado). Conta lead de roleta
--    (automatica/redistribuicao) e o que o próprio fallback entregou.
--    score = 100 × (contatados em 15 min úteis + k × média do time) /
--            (recebidos + k), k = 10.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) fallback_velocidade_ranking(lead) — produção + a exclusão do dono.
--    Quem entra (produção): corretor ativo, com ação no CRM nos últimos
--    fallback_velocidade_atividade_min minutos (audit_log ou interação
--    registrada), participante ativo de alguma roleta ativa que não seja
--    'base' nem 'agendados-sdr', e cujo único motivo de não estar apto nela é
--    a ausência (motivos ⊆ {ausente_hoje}: pausado, cota, regra dos 65 etc.
--    continuam barrando), e que ainda não teve este lead. Ordem: score de
--    velocidade, depois quem está há mais tempo sem receber.
--
--    [PRESENÇA 12/10] (decisão 4) — por que: o fallback existe para quando a
--    roleta está vazia por falta de check-in, e nasceu aceitando "ausente".
--    Com a localização exigindo (decisão 3), quem escolheu uma filial e o GPS
--    mostrou longe (ou não mostrou) aparece como ausente — e o fallback
--    entregaria a ele justamente o lead que a exigência quis segurar. Fica
--    fora no dia. Volta só se um check-in POSTERIOR, no mesmo dia, liberou a
--    roleta: chegou na loja e o GPS confirmou, ou a gestão usou "Confirmar no
--    plantão" — aí ele deixou de ser "barrado", e já está apto nas filas dele
--    de qualquer forma. Trocar para "Em casa" depois de barrado, sem a meta,
--    não destrava (senão bastaria trocar de opção). O "Em casa" recusado
--    pelas vendas (casa_abaixo_minimo_vendas) não é barrado pela localização:
--    segue no fallback, como o dono pediu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fallback_velocidade_ranking(_lead_id uuid)
 RETURNS TABLE(corretor_id uuid, nome text, min_desde_ultima_acao numeric, score numeric, pct_15min numeric, recebidos_14d integer, roleta_ok text)
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
     -- [PRESENÇA 12/10] Barrado pela localização fica fora (decisão do dono,
     -- 12/10/2026): quem escolheu uma filial hoje e o GPS barrou (fora do raio
     -- ou sem localização, com presenca_loja_exige_localizacao ligada) não
     -- recebe nem pelo fallback no dia. Volta só com um check-in posterior, no
     -- mesmo dia, que liberou a roleta (o GPS confirmou na loja, ou a gestão
     -- usou "Confirmar no plantão"). "Em casa" recusado pelas vendas
     -- (casa_abaixo_minimo_vendas) não é barrado pela localização: segue aqui.
     AND NOT EXISTS (
       SELECT 1 FROM public.presenca_checkins b
        WHERE b.corretor_id = p.id
          AND b.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
          AND b.modo = 'loja'
          AND NOT b.apto_roleta
          AND b.motivo IN ('fora_da_filial', 'sem_localizacao')
          AND NOT EXISTS (
            SELECT 1 FROM public.presenca_checkins d
             WHERE d.corretor_id = b.corretor_id
               AND d.dia = b.dia
               AND d.created_at > b.created_at
               AND d.apto_roleta))
   ORDER BY COALESCE(v.score, 0) DESC, p.last_lead_assigned_at ASC NULLS FIRST, p.id;
$function$;

-- ---------------------------------------------------------------------------
-- 4) _fallback_velocidade(lead) — VERBATIM de produção (12/10/2026).
--    Desligado pela chave → 'fallback_desligado'. Só lead sem corretor, sem
--    SDR, fora da lixeira e que não seja da base. Entrega pelo motor
--    (_distribuir_lead_v3, atribuição direta, sem abrir exceção nova) com
--    forcar_fora_da_zona — com a zona estrita, o mais rápido pode não atender
--    a zona do lead, e o motivo fica escrito — e regrava o log como
--    regra_aplicada = 'fallback_velocidade', com score e minutos desde a
--    última ação.
-- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id AND l.corretor_id IS NULL AND l.sdr_id IS NULL
                    AND l.deleted_at IS NULL AND NOT l.na_lixeira
                    AND COALESCE(l.classe_lead, 'quente') <> 'base') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_do_escopo');
  END IF;

  SELECT * INTO _c FROM public.fallback_velocidade_ranking(_lead_id) LIMIT 1;
  IF _c.corretor_id IS NULL THEN
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

-- ---------------------------------------------------------------------------
-- 5) processar_distribuicao_automatica() — VERBATIM de produção (12/10/2026).
--    Muda em relação a 20261009120300: (a) só reprocessa lead criado nos
--    últimos 7 dias — o mais antigo sem corretor (base, importação) fica com
--    o Marquinhos pelo escalonado da base; (b) o mais novo primeiro; (c) a
--    triagem que falha por falta de apto (sem_corretor_na_zona,
--    sem_corretor_elegivel, sem_corretor_ativo, zona_sem_time) tenta o
--    fallback, num bloco que nunca derruba a rodada; fora do horário da
--    roleta ('fora_do_horario', adiado) não entra: é espera de propósito;
--    (d) o resultado ganha a contagem 'fallback_velocidade'.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6) Permissões, como em produção.
--    As três peças do fallback são internas: só o pg_cron (dono) e o
--    service_role. processar_distribuicao_automatica segue como em
--    20261009120300: authenticated mantém o EXECUTE para o botão "Rodar
--    distribuição" da Central (a função recusa quem não é admin na entrada).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.recalcular_velocidade_contato() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_velocidade_contato() TO service_role;
REVOKE ALL ON FUNCTION public.fallback_velocidade_ranking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fallback_velocidade_ranking(uuid) TO service_role;
REVOKE ALL ON FUNCTION public._fallback_velocidade(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fallback_velocidade(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.processar_distribuicao_automatica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processar_distribuicao_automatica() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Chaves (Central de Distribuição → Configurações).
--    As três do fallback com o valor e a descrição de produção; quem já as
--    tem (produção) fica como está. A exigência de localização fica ligada,
--    como o dono decidiu (14:19 BRT): ambiente novo nasce como a produção.
--    presenca_casa_min_vendas_mes_anterior não é tocada (ver o cabeçalho).
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('fallback_velocidade_ativo', 'true'::jsonb,
   'Fallback por velocidade (12/10/2026): sem corretor apto na roleta, o lead vai para o corretor ativo no CRM nos últimos fallback_velocidade_atividade_min minutos com melhor taxa de contato em até 15 min úteis. false = desligado.'),
  ('fallback_velocidade_atividade_min', '30'::jsonb,
   'Minutos desde a última ação no CRM (interação registrada ou alteração auditada) para o corretor contar como ativo no fallback por velocidade.'),
  ('velocidade_janela_dias', '14'::jsonb,
   'Janela (dias) da métrica de velocidade real de primeiro contato (WhatsApp/ligação do próprio corretor).')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('presenca_loja_exige_localizacao', 'true'::jsonb,
   'Check-in na filial só libera a roleta com a localização do celular dentro do raio da filial (vale para filial com coordenadas cadastradas).')
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      updated_at = now()
  WHERE public.distribuicao_settings.valor IS DISTINCT FROM EXCLUDED.valor;

-- ---------------------------------------------------------------------------
-- 8) Cron de hora em hora, no minuto 7 (fora do :00 de todos os outros).
--    Mesmo nome, horário e comando de produção. Já igual → não reagenda
--    (o jobid de produção fica o mesmo).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job
                      WHERE jobname = 'recalcular-velocidade-contato'
                        AND schedule = '7 * * * *'
                        AND command = 'SELECT public.recalcular_velocidade_contato();') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'recalcular-velocidade-contato';
    PERFORM cron.schedule('recalcular-velocidade-contato', '7 * * * *',
      $cron$SELECT public.recalcular_velocidade_contato();$cron$);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 9) Guarda: tabela, funções, a exclusão no ranking, a chave e o cron.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regclass('public.corretor_velocidade') IS NULL
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.corretor_velocidade'::regclass)
     OR has_table_privilege('anon', 'public.corretor_velocidade', 'SELECT')
     OR has_table_privilege('authenticated', 'public.corretor_velocidade', 'SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'public.corretor_velocidade'::regclass AND contype = 'f'
                       AND pg_get_constraintdef(oid) LIKE '%REFERENCES %profiles(id) ON DELETE CASCADE') THEN
    RAISE EXCEPTION 'fallback por velocidade: corretor_velocidade fora do esperado (RLS, grants ou FK)';
  END IF;
  IF to_regprocedure('public.recalcular_velocidade_contato()') IS NULL
     OR to_regprocedure('public.fallback_velocidade_ranking(uuid)') IS NULL
     OR to_regprocedure('public._fallback_velocidade(uuid)') IS NULL
     OR to_regprocedure('public.processar_distribuicao_automatica()') IS NULL THEN
    RAISE EXCEPTION 'fallback por velocidade: função ausente';
  END IF;
  IF has_function_privilege('anon', 'public._fallback_velocidade(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fallback_velocidade(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fallback_velocidade_ranking(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.recalcular_velocidade_contato()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.processar_distribuicao_automatica()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fallback por velocidade: EXECUTE indevido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fallback_velocidade_ranking'
       AND p.prosrc LIKE '%[PRESENÇA 12/10]%'
       AND p.prosrc LIKE '%FROM public.presenca_checkins b%'
       AND p.prosrc LIKE '%b.modo = ''loja''%'
       AND p.prosrc LIKE '%b.motivo IN (''fora_da_filial'', ''sem_localizacao'')%'
       AND p.prosrc LIKE '%e.motivos <@ ARRAY[''ausente_hoje'']::text[]%'
  ) THEN
    RAISE EXCEPTION 'fallback por velocidade: o ranking não exclui quem a localização barrou';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'processar_distribuicao_automatica'
       AND p.prosrc LIKE '%public._fallback_velocidade(_lead_id)%'
       AND p.prosrc LIKE '%l.created_at > now() - interval ''7 days''%'
  ) THEN
    RAISE EXCEPTION 'fallback por velocidade: processar_distribuicao_automatica sem o fallback';
  END IF;
  IF (SELECT valor FROM public.distribuicao_settings WHERE chave = 'presenca_loja_exige_localizacao')
       IS DISTINCT FROM 'true'::jsonb
     OR (SELECT count(*) FROM public.distribuicao_settings
          WHERE chave IN ('fallback_velocidade_ativo', 'fallback_velocidade_atividade_min',
                          'velocidade_janela_dias')) <> 3 THEN
    RAISE EXCEPTION 'fallback por velocidade: chaves ausentes ou exigência de localização desligada';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job
                      WHERE jobname = 'recalcular-velocidade-contato'
                        AND schedule = '7 * * * *'
                        AND command LIKE '%public.recalcular_velocidade_contato()%') THEN
    RAISE EXCEPTION 'fallback por velocidade: cron recalcular-velocidade-contato ausente';
  END IF;
END
$guard$;
