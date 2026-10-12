-- =============================================================================
-- Presença exigida e fallback por velocidade — o que entrou direto em
-- produção em 12/10/2026 vem para o repositório; o fallback passa a exigir o
-- check-in de hoje (e deixa de fora quem a localização barrou); o check-in
-- guarda por que o celular não deu a localização
-- =============================================================================
-- Decisões do dono (12/10/2026), literais:
--
--   1. "sim" — as mudanças feitas DIRETO em produção hoje (outra conversa
--      dele, pela ferramenta de banco) FICAM. Nada disso estava no
--      repositório; esta migration traz, sem mudar uma linha:
--        * a tabela corretor_velocidade e recalcular_velocidade_contato(): a
--          velocidade REAL de primeiro contato de cada corretor (WhatsApp ou
--          ligação de saída dele mesmo, em até 15 min úteis), recalculada de
--          hora em hora pelo cron 'recalcular-velocidade-contato' (7 * * * *);
--        * _fallback_velocidade(): roleta sem ninguém apto → o lead vai para o
--          corretor mais rápido do ranking (seção 4);
--        * processar_distribuicao_automatica() reescrita: só reprocessa lead
--          dos últimos 7 dias, o mais novo primeiro, e chama o fallback;
--        * _dono_ativo(), de que _fallback_velocidade depende desde ~15:27;
--        * as chaves fallback_velocidade_ativo (true),
--          fallback_velocidade_atividade_min (30) e velocidade_janela_dias (14).
--      Linha do tempo (BRT): 11:20–12:18 tabela, funções, cron e chaves;
--      14:19 presenca_loja_exige_localizacao = true; 14:50–14:53 as três
--      funções do fallback recriadas só com comentários novos; ~15:27
--      _fallback_velocidade passa a aceitar também lead com dono
--      inativo/bloqueado (_dono_ativo) — na mesma transação entraram
--      _reatribuir_se_dono_inativo() e registrar_volta_campanha() novas, que
--      NÃO são do fallback e ficam para uma migration própria (doc §8c).
--      Também de hoje, e que esta migration NÃO toca: o mínimo de vendas para
--      trabalhar em casa (presenca_casa_min_vendas_mes_anterior) foi a 0 só
--      por 12/10; o cron one-shot 'restaurar-presenca-casa-1310' devolve 3 em
--      13/10 às 00:00 BRT ('0 3 13 10 *', junto do reset diário; movido às
--      ~15:30 por decisão do dono) e se desagenda. Registrar 0 aqui reabriria
--      a casa para todos em qualquer ambiente novo; registrar 3 brigaria com o
--      0 que o dono quis hoje em produção. Fica com o cron.
--
--   2. "checkin obrigatório" — para usar o CRM, quem tem papel corretor faz
--      o check-in (Barra Funda, Liberdade, Belém ou Em casa). A trava é da
--      TELA; no banco, sem check-in ele já não recebia de fila nenhuma (0074)
--      e, com a seção 4, também não recebe pelo fallback.
--
--   3. "localização deve barrar caso não esteja na filial" — a chave
--      presenca_loja_exige_localizacao foi ligada em produção às 14:19 BRT
--      (com linha em audit_log). Aqui ela fica registrada (seção 9). Ligada,
--      check-in na filial fora do raio ou sem localização grava
--      apto_roleta = false com motivo 'fora_da_filial' ou 'sem_localizacao'.
--
--   4. Fallback × localização: quem escolheu uma filial e foi barrado pelo GPS
--      fica FORA do fallback no dia; o "Em casa" sincero (mesmo recusado por
--      casa_abaixo_minimo_vendas) pode receber pelo fallback.
--
--   5. O fallback só vale com check-in de HOJE AINDA ABERTO: na filial
--      liberado (GPS confirmado ou "Confirmar no plantão"), liberado pela
--      gestão (interruptor) ou "Em casa" (liberado, ou recusado só pelas
--      vendas). Sem check-in hoje, check-in encerrado, check-in de ontem ou
--      desligado pela gestão = fora.
--
--   Destrave do barrado (orquestração, pela letra da decisão 4): só um
--   check-in POSTERIOR, no mesmo dia, liberado na filial (GPS ou gestão) ou
--   pelo interruptor da gestão. "Em casa" depois NÃO devolve o fallback
--   (mesmo liberado, com o mínimo 0) — devolve a roleta normal, que é regra
--   da presença, não do fallback.
--
--   Mantido (09/10): a fila Agendados do SDR não exige presença — e o
--   fallback não mexe nela (só reprocessa lead sem SDR; o ranking ignora as
--   roletas 'base' e 'agendados-sdr').
--
-- Diagnóstico do GPS (seção 7): em produção, 3 de 3 check-ins reais na filial
-- chegaram sem localização, e ninguém sabe por quê — a tela sabe (permissão
-- negada, GPS indisponível, demorou, navegador sem suporte), mas descartava.
-- presenca_checkin ganha o parâmetro opcional _falha_localizacao, gravado em
-- presenca_checkins.falha_localizacao só quando a localização não veio. A
-- assinatura antiga é APAGADA (DROP) e a nova criada: duas versões ao mesmo
-- tempo deixariam o PostgREST sem saber qual chamar. O front publicado, que
-- chama sem o parâmetro, continua funcionando (o parâmetro tem DEFAULT NULL).
--
-- Verbatim: recalcular_velocidade_contato, _dono_ativo, _fallback_velocidade e
-- processar_distribuicao_automatica são o pg_get_functiondef de produção
-- relido às 15:32 BRT de 12/10 e conferido de novo às 15:52 (md5 7f00c496…,
-- 4e1cd9bb…, 2317edb2…, 700bd6b2…; os mesmos no harness depois de aplicar).
-- fallback_velocidade_ranking é a de produção (a94e8164…) mais o bloco
-- [PRESENÇA 12/10].
-- presenca_checkin, _presenca_status e presenca_hoje_v1 são as da 0074 (iguais
-- às de produção) com só o acréscimo da falha_localizacao (e, no quadro da
-- gestão, também da precisao_m). ATENÇÃO NO DEPLOY:
-- quem mexer nessas funções direto em produção antes do merge perde a mudança
-- em silêncio — reler os md5 antes de aplicar (doc §6).
--
-- Em produção, aplicar muda: a regra do ranking (itens 4 e 5), a coluna e o
-- parâmetro do diagnóstico, a chave nova no JSON da presença, as duas
-- colunas novas no quadro da gestão e o REVOKE de anon/authenticated em
-- corretor_velocidade (a tabela nasceu com os grants padrão da plataforma;
-- o RLS sem policy já negava a leitura). O resto já está lá e vira no-op.
--
-- presenca_loja_exige_localizacao: a seção 9 GRAVA true. Se alguém desligar
-- a exigência em produção antes desta migration chegar, o deploy a RELIGA
-- (sem linha em audit_log). Conferir o valor antes de aplicar (doc §6).
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
     OR to_regprocedure('public.get_dist_setting(text)') IS NULL
     OR to_regprocedure('public._presenca_encerrar_aberto(uuid)') IS NULL
     OR to_regprocedure('public._presenca_aplicar(uuid, boolean)') IS NULL THEN
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
-- 2) recalcular_velocidade_contato() — VERBATIM de produção (12/10/2026;
--    recriada às 14:50 com o mesmo texto). md5 7f00c496551ff1d3fbd5b7a57c90ff83.
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
-- 3) _dono_ativo(corretor) — VERBATIM de produção (12/10/2026, ~15:27).
--    md5 4e1cd9bb3a0ecec9c0118139b72bf93c. Vem aqui porque
--    _fallback_velocidade (seção 5) a chama: corretor com perfil ativo e conta
--    'ativa' (não pendente nem bloqueada).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._dono_ativo(_corretor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _corretor AND p.ativo AND p.status_conta::text = 'ativa');
$function$;

-- ---------------------------------------------------------------------------
-- 4) fallback_velocidade_ranking(lead) — produção + as regras do dono.
--    Quem entra (produção): corretor ativo, com ação no CRM nos últimos
--    fallback_velocidade_atividade_min minutos (audit_log ou interação
--    registrada), participante ativo de alguma roleta ativa que não seja
--    'base' nem 'agendados-sdr', e cujo único motivo de não estar apto nela é
--    a ausência (motivos ⊆ {ausente_hoje}: pausado, cota, regra dos 65 etc.
--    continuam barrando), e que ainda não teve este lead. Ordem: score de
--    velocidade, depois quem está há mais tempo sem receber.
--
--    [PRESENÇA 12/10] (decisões 4 e 5) — por que: o fallback nasceu aceitando
--    "ausente", para a roleta vazia por falta de check-in. Com o check-in
--    obrigatório (decisão 2) e a localização barrando (decisão 3), "ausente"
--    passou a esconder três pessoas diferentes: quem não disse onde está,
--    quem disse e encerrou (ou a gestão desligou), e quem disse uma filial e
--    o GPS desmentiu. O reforço era justamente o atalho para as três: quem
--    nunca fez check-in recebia e quem fez com sinceridade e foi barrado,
--    não. Agora dizer onde está é a condição — check-in de hoje, aberto e
--    válido (na filial liberado, liberado pela gestão, ou "Em casa" mesmo
--    recusado pelas vendas, porque disse a verdade) — e mentir a filial não
--    compensa: o barrado pelo GPS fica fora no dia, a menos que um check-in
--    POSTERIOR prove a loja (GPS confirmado, "Confirmar no plantão") ou a
--    gestão o libere no interruptor. Trocar para "Em casa" depois não
--    devolve o reforço — senão escolher uma filial longe dela não custaria
--    nada. Filtros por dia: o barrado de ontem não pesa hoje, e o check-in
--    de ontem (aberto por falha do reset) não vale hoje.
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
     -- [PRESENÇA 12/10] Decisões do dono (12/10/2026). Dizer onde está é a
     -- condição para o reforço: só entra quem tem o check-in de HOJE ainda
     -- aberto e válido — na filial liberado (o GPS confirmou, ou a gestão
     -- usou "Confirmar no plantão"), liberado pela gestão (interruptor) ou
     -- "Em casa" (liberado, ou recusado só pelas vendas: disse a verdade).
     -- Sem check-in hoje, check-in encerrado ("Encerrar presença", o
     -- interruptor desligado pela gestão, o reset da meia-noite) ou só de
     -- ontem: fora.
     AND EXISTS (
       SELECT 1 FROM public.presenca_checkins a
        WHERE a.corretor_id = p.id
          AND a.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
          AND a.encerrado_em IS NULL
          AND (a.apto_roleta OR (a.modo = 'casa' AND a.motivo = 'casa_abaixo_minimo_vendas')))
     -- E quem escolheu uma filial hoje e o GPS barrou (fora do raio ou sem
     -- localização, com presenca_loja_exige_localizacao ligada) fica fora no
     -- dia: mentir a filial não pode compensar. Volta só com um check-in
     -- POSTERIOR que prove a loja (o GPS confirmou, ou "Confirmar no
     -- plantão") ou com a gestão ligando o interruptor. "Em casa" depois do
     -- barrado não devolve o reforço (com o mínimo 0 devolve a roleta — isso
     -- é regra da presença, não daqui). O barrado de ontem não pesa hoje.
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
               AND d.apto_roleta
               AND d.modo IN ('loja', 'liberado_gestao')))
   ORDER BY COALESCE(v.score, 0) DESC, p.last_lead_assigned_at ASC NULLS FIRST, p.id;
$function$;

-- ---------------------------------------------------------------------------
-- 5) _fallback_velocidade(lead) — VERBATIM de produção (12/10/2026, ~15:27).
--    md5 2317edb2460317f7ef4f7f96e5958b23.
--    Desligado pela chave → 'fallback_desligado'. Só lead sem corretor (ou com
--    dono inativo/bloqueado, para quem o chamar com esse lead), sem SDR, fora
--    da lixeira e que não seja da base. Entrega pelo motor
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

  -- Só lead quente, sem dono ou com dono inativo/bloqueado (12/10/2026).
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id
                    AND (l.corretor_id IS NULL OR NOT public._dono_ativo(l.corretor_id))
                    AND l.sdr_id IS NULL
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

-- ---------------------------------------------------------------------------
-- 6) processar_distribuicao_automatica() — VERBATIM de produção (12/10/2026).
--    md5 700bd6b2163aae1649901b4ba0d5ec82.
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
-- 7) Diagnóstico do GPS: por que a localização não veio.
--    A tela já sabe o motivo (GeolocationPositionError: 1 negada, 2
--    indisponível, 3 tempo; sem navigator.geolocation = sem suporte) e agora
--    o manda. O banco guarda só quando a localização faltou
--    (localizacao = 'sem_localizacao'); com coordenada, em casa ou feito pela
--    gestão, fica NULL. Valor fora da lista também vira NULL: o diagnóstico
--    nunca impede o check-in.
--    presenca_checkin: DROP da assinatura de 6 argumentos e CREATE da de 7
--    (corpo igual ao de produção, md5 5029000a…, mais a coluna no INSERT).
--    _presenca_status (e, por ela, presenca_minha_v1 e o retorno do
--    check-in) e presenca_hoje_v1 ganham a chave/coluna falha_localizacao —
--    só um acréscimo; presenca_hoje_v1 muda o tipo de retorno, por isso
--    também é recriada.
--    presenca_hoje_v1 ganha ainda, por último, precisao_m: a precisão que o
--    aparelho informou (a coluna já é gravada desde a 0074; presenca_minha_v1
--    já a devolve ao corretor). Sem ela, o quadro da gestão mostrava o
--    computador com localização por Wi-Fi/IP (±5 km) como "Barrado: a 8 km
--    da filial", o que parece mentira do corretor; com ela, a tela diz
--    "localização imprecisa (±X km)".
-- ---------------------------------------------------------------------------
ALTER TABLE public.presenca_checkins
  ADD COLUMN IF NOT EXISTS falha_localizacao text
    CONSTRAINT presenca_checkins_falha_localizacao_check
    CHECK (falha_localizacao IN ('negada', 'indisponivel', 'tempo', 'sem_suporte'));

COMMENT ON COLUMN public.presenca_checkins.falha_localizacao IS
  'Por que o navegador não deu a localização no check-in na filial (negada, indisponivel, tempo, sem_suporte). Só quando localizacao = sem_localizacao; diagnóstico (12/10/2026), não regra.';

DROP FUNCTION IF EXISTS public.presenca_checkin(text, text, double precision, double precision, double precision, uuid);

CREATE OR REPLACE FUNCTION public.presenca_checkin(_modo text, _filial text DEFAULT NULL::text, _latitude double precision DEFAULT NULL::double precision, _longitude double precision DEFAULT NULL::double precision, _precisao_m double precision DEFAULT NULL::double precision, _corretor_id uuid DEFAULT NULL::uuid, _falha_localizacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid      uuid := auth.uid();
  _alvo     uuid := coalesce(_corretor_id, auth.uid());
  _por_gestao boolean;
  _hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _f        public.filiais%ROWTYPE;
  _min      integer := public._presenca_min_vendas_casa();
  _vendas   integer;
  _loc      text;
  _dist     integer;
  _prec     integer;
  _apto     boolean;
  _motivo   text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '28000';
  END IF;

  _por_gestao := _alvo <> _uid;
  IF _por_gestao AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Só a gestão faz check-in por outro corretor.' USING ERRCODE = '42501';
  END IF;

  IF _modo IS NULL OR _modo NOT IN ('loja', 'casa') THEN
    RAISE EXCEPTION 'Check-in inválido: escolha uma filial ou "em casa".' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _alvo AND ativo) THEN
    RAISE EXCEPTION 'Corretor não encontrado ou inativo.' USING ERRCODE = '22023';
  END IF;

  IF _modo = 'loja' THEN
    SELECT * INTO _f FROM public.filiais WHERE slug = _filial AND ativa;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Filial não encontrada ou inativa: %', coalesce(_filial, '(vazia)')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF (_latitude IS NULL) <> (_longitude IS NULL)
     OR _latitude NOT BETWEEN -90 AND 90
     OR _longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = '22023';
  END IF;

  -- Serializa cliques simultâneos do mesmo corretor (dois aparelhos, duplo
  -- clique): o índice de "um aberto por dia" não vira erro na cara dele.
  PERFORM pg_advisory_xact_lock(hashtext('presenca_checkin:' || _alvo::text));

  _vendas := public._corretor_vendas_mes_anterior(_alvo, _hoje);

  IF _modo = 'loja' THEN
    IF _por_gestao THEN
      _loc := 'confirmada_gestao';
    ELSIF _f.latitude IS NULL THEN
      _loc := 'filial_sem_coordenadas';
    ELSIF _latitude IS NULL THEN
      _loc := 'sem_localizacao';
    ELSE
      _dist := round(public._distancia_metros(_latitude, _longitude, _f.latitude, _f.longitude));
      _prec := CASE WHEN _precisao_m IS NULL OR _precisao_m < 0 THEN NULL ELSE round(_precisao_m) END;
      -- A precisão do aparelho conta a favor até 150 m (GPS dentro de prédio).
      _loc := CASE WHEN _dist <= _f.raio_metros + least(coalesce(_prec, 0), 150)
                   THEN 'confirmada' ELSE 'fora_do_raio' END;
    END IF;

    IF public._presenca_loja_exige_localizacao() AND _loc IN ('sem_localizacao', 'fora_do_raio') THEN
      _apto := false;
      _motivo := CASE _loc WHEN 'fora_do_raio' THEN 'fora_da_filial' ELSE 'sem_localizacao' END;
    ELSE
      _apto := true;
    END IF;
  ELSE
    -- Em casa: nunca pede localização. Libera só com o mínimo de vendas do mês
    -- anterior.
    _apto := _vendas >= _min;
    _motivo := CASE WHEN _apto THEN NULL ELSE 'casa_abaixo_minimo_vendas' END;
  END IF;

  PERFORM public._presenca_encerrar_aberto(_alvo);

  INSERT INTO public.presenca_checkins (
    corretor_id, dia, modo, filial_id, apto_roleta, motivo, vendas_mes_anterior, vendas_minimas,
    localizacao, distancia_m, precisao_m, origem, registrado_por, falha_localizacao)
  VALUES (
    _alvo, _hoje, _modo, CASE WHEN _modo = 'loja' THEN _f.id END, _apto, _motivo, _vendas, _min,
    _loc, _dist, _prec, CASE WHEN _por_gestao THEN 'gestao' ELSE 'corretor' END, _uid,
    -- [DIAGNÓSTICO GPS 12/10] Por que o navegador não deu a posição (a
    -- tela sabe e manda). Só quando a localização não veio; valor fora da
    -- lista vira NULL: o diagnóstico nunca impede o check-in.
    CASE WHEN _loc = 'sem_localizacao'
              AND _falha_localizacao IN ('negada', 'indisponivel', 'tempo', 'sem_suporte')
         THEN _falha_localizacao END);

  PERFORM public._presenca_aplicar(_alvo, _apto);

  RETURN public._presenca_status(_alvo);
END;
$function$;

CREATE OR REPLACE FUNCTION public._presenca_status(_corretor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
           public._presenca_min_vendas_casa() AS minimo,
           public._presenca_loja_exige_localizacao() AS exige_loc
  ),
  ult AS (
    SELECT c.*, f.slug AS filial_slug, f.nome AS filial_nome
      FROM public.presenca_checkins c
      LEFT JOIN public.filiais f ON f.id = c.filial_id
      CROSS JOIN cfg
     WHERE c.corretor_id = _corretor
       AND c.dia = cfg.hoje
     ORDER BY c.created_at DESC
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'dia', cfg.hoje,
    'presente', coalesce(p.presente AND p.presente_em IS NOT NULL
                         AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje,
                         false),
    'mes_referencia', public._presenca_mes_referencia(cfg.hoje),
    'vendas_mes_anterior', public._corretor_vendas_mes_anterior(_corretor, cfg.hoje),
    'vendas_minimas', cfg.minimo,
    'casa_liberada', public._corretor_vendas_mes_anterior(_corretor, cfg.hoje) >= cfg.minimo,
    'exige_localizacao', cfg.exige_loc,
    'checkin', (
      SELECT jsonb_build_object(
        'id', u.id, 'modo', u.modo, 'filial_slug', u.filial_slug, 'filial_nome', u.filial_nome,
        'apto_roleta', u.apto_roleta, 'motivo', u.motivo,
        'localizacao', u.localizacao, 'distancia_m', u.distancia_m, 'precisao_m', u.precisao_m,
        'falha_localizacao', u.falha_localizacao,
        'origem', u.origem, 'criado_em', u.created_at, 'encerrado_em', u.encerrado_em)
        FROM ult u)
  )
  FROM cfg
  LEFT JOIN public.profiles p ON p.id = _corretor;
$function$;

DROP FUNCTION IF EXISTS public.presenca_hoje_v1();

CREATE OR REPLACE FUNCTION public.presenca_hoje_v1()
 RETURNS TABLE(corretor_id uuid, nome text, avatar_url text, presente boolean, modo text, filial_slug text, filial_nome text, apto_roleta boolean, motivo text, localizacao text, distancia_m integer, origem text, checkin_em timestamp with time zone, encerrado_em timestamp with time zone, vendas_mes_anterior integer, vendas_minimas integer, falha_localizacao text, precisao_m integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid  uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _min  integer := public._presenca_min_vendas_casa();
BEGIN
  IF _uid IS NULL OR NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')
                          OR public.has_role(_uid, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.nome,
         coalesce(p.avatar_url, p.foto_url),
         coalesce(p.presente AND p.presente_em IS NOT NULL
                  AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = _hoje, false),
         c.modo,
         f.slug,
         f.nome,
         c.apto_roleta,
         c.motivo,
         c.localizacao,
         c.distancia_m,
         c.origem,
         c.created_at,
         c.encerrado_em,
         public._corretor_vendas_mes_anterior(p.id, _hoje),
         _min,
         c.falha_localizacao,
         c.precisao_m
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT pc.* FROM public.presenca_checkins pc
       WHERE pc.corretor_id = p.id AND pc.dia = _hoje
       ORDER BY pc.created_at DESC
       LIMIT 1
    ) c ON true
    LEFT JOIN public.filiais f ON f.id = c.filial_id
   WHERE p.ativo
     AND lower(coalesce(p.nome, '')) <> 'docs-bot'
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role)
   ORDER BY p.nome;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8) Permissões, como em produção.
--    As peças do fallback são internas: só o pg_cron (dono) e o
--    service_role. processar_distribuicao_automatica segue como em
--    20261009120300: authenticated mantém o EXECUTE para o botão "Rodar
--    distribuição" da Central (a função recusa quem não é admin na entrada).
--    As de presença, como na 0074.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.recalcular_velocidade_contato() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_velocidade_contato() TO service_role;
REVOKE ALL ON FUNCTION public._dono_ativo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dono_ativo(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fallback_velocidade_ranking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fallback_velocidade_ranking(uuid) TO service_role;
REVOKE ALL ON FUNCTION public._fallback_velocidade(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fallback_velocidade(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.processar_distribuicao_automatica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processar_distribuicao_automatica() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.presenca_checkin(text, text, double precision, double precision, double precision, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presenca_checkin(text, text, double precision, double precision, double precision, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._presenca_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_status(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.presenca_hoje_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presenca_hoje_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) Chaves (Central de Distribuição → Configurações).
--    As três do fallback com o valor e a descrição de produção; quem já as
--    tem (produção) fica como está. A exigência de localização fica ligada,
--    como o dono decidiu (14:19 BRT): ambiente novo nasce como a produção.
--    Este UPDATE religa a exigência se ela estiver desligada (ver o
--    cabeçalho: conferir antes do deploy).
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
-- 10) Cron de hora em hora, no minuto 7 — o de produção. O :00 é dos crons
--     pesados; no minuto 7 roda também o cadencia-encerrar (jobid 34 em
--     produção), que mexe em outras tabelas (cadência), sem disputa de linha.
--     Mesmo nome, horário e comando de produção. Já igual → não reagenda
--     (o jobid de produção fica o mesmo).
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
-- 11) Guarda: tabela, funções, as regras do ranking (com os filtros por dia),
--     o diagnóstico do GPS, a chave e o cron.
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
     OR to_regprocedure('public._dono_ativo(uuid)') IS NULL
     OR to_regprocedure('public.fallback_velocidade_ranking(uuid)') IS NULL
     OR to_regprocedure('public._fallback_velocidade(uuid)') IS NULL
     OR to_regprocedure('public.processar_distribuicao_automatica()') IS NULL THEN
    RAISE EXCEPTION 'fallback por velocidade: função ausente';
  END IF;
  IF has_function_privilege('anon', 'public._fallback_velocidade(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fallback_velocidade(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fallback_velocidade_ranking(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.recalcular_velocidade_contato()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._dono_ativo(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.processar_distribuicao_automatica()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fallback por velocidade: EXECUTE indevido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fallback_velocidade_ranking'
       AND p.prosrc LIKE '%[PRESENÇA 12/10]%'
       AND p.prosrc LIKE '%e.motivos <@ ARRAY[''ausente_hoje'']::text[]%'
       -- decisão 5: check-in de hoje, aberto e válido
       AND p.prosrc LIKE '%FROM public.presenca_checkins a%'
       AND p.prosrc LIKE '%a.dia = (now() AT TIME ZONE ''America/Sao_Paulo'')::date%'
       AND p.prosrc LIKE '%a.encerrado_em IS NULL%'
       AND p.prosrc LIKE '%(a.apto_roleta OR (a.modo = ''casa'' AND a.motivo = ''casa_abaixo_minimo_vendas''))%'
       -- decisão 4: barrado pelo GPS hoje, e o destrave só pela loja ou gestão
       AND p.prosrc LIKE '%FROM public.presenca_checkins b%'
       AND p.prosrc LIKE '%b.dia = (now() AT TIME ZONE ''America/Sao_Paulo'')::date%'
       AND p.prosrc LIKE '%b.modo = ''loja''%'
       AND p.prosrc LIKE '%b.motivo IN (''fora_da_filial'', ''sem_localizacao'')%'
       AND p.prosrc LIKE '%d.created_at > b.created_at%'
       AND p.prosrc LIKE '%d.modo IN (''loja'', ''liberado_gestao'')%'
  ) THEN
    RAISE EXCEPTION 'fallback por velocidade: o ranking não aplica as regras de presença do dono (check-in de hoje aberto; barrado pela localização fora)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'processar_distribuicao_automatica'
       AND p.prosrc LIKE '%public._fallback_velocidade(_lead_id)%'
       AND p.prosrc LIKE '%l.created_at > now() - interval ''7 days''%'
  ) THEN
    RAISE EXCEPTION 'fallback por velocidade: processar_distribuicao_automatica sem o fallback';
  END IF;
  -- Diagnóstico do GPS: uma só presenca_checkin (sem sobrecarga ambígua no
  -- PostgREST), a coluna com a lista fechada e a chave nos dois retornos.
  IF to_regprocedure('public.presenca_checkin(text, text, double precision, double precision, double precision, uuid)') IS NOT NULL
     OR to_regprocedure('public.presenca_checkin(text, text, double precision, double precision, double precision, uuid, text)') IS NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'presenca_checkin') <> 1
     OR NOT has_function_privilege('authenticated',
          'public.presenca_checkin(text, text, double precision, double precision, double precision, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon',
          'public.presenca_checkin(text, text, double precision, double precision, double precision, uuid, text)', 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'public.presenca_checkins'::regclass
                       AND conname = 'presenca_checkins_falha_localizacao_check')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'presenca_checkin'
                       AND p.prosrc LIKE '%falha_localizacao)%'
                       AND p.prosrc LIKE '%WHEN _loc = ''sem_localizacao''%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = '_presenca_status'
                       AND p.prosrc LIKE '%''falha_localizacao'', u.falha_localizacao%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'presenca_hoje_v1'
                       AND 'falha_localizacao' = ANY (p.proargnames)
                       AND 'precisao_m' = ANY (p.proargnames))
     OR NOT has_function_privilege('authenticated', 'public.presenca_hoje_v1()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.presenca_hoje_v1()', 'EXECUTE') THEN
    RAISE EXCEPTION 'presença: diagnóstico do GPS fora do esperado (presenca_checkin, coluna ou retornos)';
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

NOTIFY pgrst, 'reload schema';
