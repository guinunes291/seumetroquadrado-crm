-- ===========================================================================
-- ACADEMIA SMQ · gestão: indicadores e recomendações em sombra (Fatia 5),
-- encontros e presença (Fatia 6), gate da roleta em sombra (Fatia 7) e a
-- lista de candidatos da tela de Participantes (Fatia 3).
--
-- Tudo idempotente: pode rodar de novo sem erro e sem duplicar nada.
-- Nenhuma função de distribuição, roleta, SLA ou transição é tocada: o motor
-- só LÊ distribution_log, histórico de status, agenda e interações.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Regras: diferença mínima absoluta (a R01 pede, além do 1,5x)
-- ---------------------------------------------------------------------------
ALTER TABLE public.academia_regras_recomendacao
  ADD COLUMN IF NOT EXISTS diferenca_minima numeric;

COMMENT ON COLUMN public.academia_regras_recomendacao.diferenca_minima IS
  'Academia: além do limiar relativo, a distância absoluta mínima até a mediana do time para a regra disparar. Na R01 é em minutos úteis.';

UPDATE public.academia_regras_recomendacao
   SET diferenca_minima = 5
 WHERE codigo = 'R01' AND diferenca_minima IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Quem é corretor para efeito de medida (a mesma base da Fatia 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._academia_corretores()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p.id
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id);
$$;

REVOKE ALL ON FUNCTION public._academia_corretores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._academia_corretores() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Um indicador, para todos os corretores, numa janela [_ini, _fim)
--    Devolve valor e amostra por corretor. As definições são as validadas na
--    Fatia 0 (docs/academia/fatia0-diagnostico.sql, bloco I), com as decisões
--    do dono gravadas na observação de cada regra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._academia_indicador(_indicador text, _ini timestamptz, _fim timestamptz)
RETURNS TABLE (o_corretor uuid, o_valor numeric, o_amostra integer)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF _indicador = 'tempo_primeiro_contato' THEN
    -- Mediana de minutos úteis entre a atribuição de lead NOVO e o primeiro
    -- contato do próprio corretor dentro da posse. Sem contato registrado
    -- conta como o pior tempo possível (até o fim da posse ou da janela).
    RETURN QUERY
    WITH leads_da_janela AS (
      SELECT DISTINCT d.lead_id
        FROM public.distribution_log d
       WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
         AND d.created_at >= _ini AND d.created_at < _fim
    ),
    atrib AS (
      SELECT d.lead_id, d.corretor_id, d.created_at AS atribuido_em,
             COALESCE(c.contexto ->> 'gatilho', '') AS gatilho,
             lead(d.created_at) OVER (PARTITION BY d.lead_id ORDER BY d.created_at) AS fim_posse
        FROM public.distribution_log d
        LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
       WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
         AND d.lead_id IN (SELECT lj.lead_id FROM leads_da_janela lj)
    ),
    janela AS (
      SELECT a.*, LEAST(COALESCE(a.fim_posse, _fim), _fim) AS limite
        FROM atrib a
       WHERE a.atribuido_em >= _ini AND a.atribuido_em < _fim
         AND a.corretor_id IN (SELECT public._academia_corretores())
         AND (a.gatilho LIKE 'webhook%' OR a.gatilho LIKE 'sla\_webhook%'
              OR a.gatilho LIKE 'agendamento\_%')
         AND EXISTS (SELECT 1 FROM public.leads l
                      WHERE l.id = a.lead_id AND l.deleted_at IS NULL)
    ),
    contato AS (
      SELECT j.corretor_id, j.atribuido_em, j.limite,
        LEAST(
          (SELECT min(i.created_at) FROM public.interacoes i
            WHERE i.lead_id = j.lead_id AND i.autor_id = j.corretor_id AND i.deleted_at IS NULL
              AND i.tipo IN ('ligacao', 'whatsapp', 'email', 'sms', 'visita', 'reuniao', 'proposta')
              AND i.created_at >= j.atribuido_em AND i.created_at < j.limite),
          (SELECT min(ch.criado_em) FROM public.chamadas ch
            WHERE ch.lead_id = j.lead_id AND ch.corretor_id = j.corretor_id AND ch.direcao = 'saida'
              AND ch.criado_em >= j.atribuido_em AND ch.criado_em < j.limite),
          (SELECT min(m.criado_em) FROM public.mensagens m
            WHERE m.lead_id = j.lead_id AND m.corretor_id = j.corretor_id AND m.direcao = 'saida'
              AND m.criado_em >= j.atribuido_em AND m.criado_em < j.limite),
          (SELECT min(t.created_at) FROM public.lead_status_transitions t
            WHERE t.lead_id = j.lead_id AND t.de_status = 'aguardando_atendimento'
              AND t.alterado_por = j.corretor_id
              AND t.created_at >= j.atribuido_em AND t.created_at < j.limite)
        ) AS primeiro
      FROM janela j
    )
    SELECT c.corretor_id,
           (percentile_cont(0.5) WITHIN GROUP (
              ORDER BY public._minutos_uteis_entre(c.atribuido_em, COALESCE(c.primeiro, c.limite))
           ))::numeric,
           count(*)::integer
      FROM contato c
     GROUP BY c.corretor_id;

  ELSIF _indicador = 'taxa_agendamento' THEN
    -- Coorte madura (7 dias): primeira atribuição do lead NOVO a este
    -- corretor. Fica de fora quem já chega agendado (gatilho agendamento_*).
    -- Passou por agendado: histórico, agenda de visita ou status atual.
    RETURN QUERY
    WITH primeira AS (
      SELECT DISTINCT ON (d.lead_id, d.corretor_id)
             d.lead_id, d.corretor_id, d.created_at AS atribuido_em,
             COALESCE(c.contexto ->> 'gatilho', '') AS gatilho
        FROM public.distribution_log d
        LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
       WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
       ORDER BY d.lead_id, d.corretor_id, d.created_at
    ),
    coorte AS (
      SELECT pr.lead_id, pr.corretor_id, pr.atribuido_em, l.status, l.corretor_id AS dono_atual
        FROM primeira pr
        JOIN public.leads l ON l.id = pr.lead_id AND l.deleted_at IS NULL
       WHERE pr.atribuido_em >= _ini - interval '7 days'
         AND pr.atribuido_em <  _fim - interval '7 days'
         AND pr.corretor_id IN (SELECT public._academia_corretores())
         AND (pr.gatilho LIKE 'webhook%' OR pr.gatilho LIKE 'sla\_webhook%')
    ),
    marcado AS (
      SELECT c.corretor_id,
        (EXISTS (SELECT 1 FROM public.lead_status_transitions t
                  WHERE t.lead_id = c.lead_id AND t.corretor_id = c.corretor_id
                    AND t.created_at >= c.atribuido_em
                    AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('agendado')
                                                             AND public.funil_ordem('contrato_fechado'))
         OR EXISTS (SELECT 1 FROM public.agendamentos a
                     WHERE a.lead_id = c.lead_id AND a.corretor_id = c.corretor_id
                       AND a.deleted_at IS NULL AND a.tipo = 'visita'
                       AND NOT COALESCE(a.auto_gerado, false)
                       AND a.created_at >= c.atribuido_em)
         OR (c.dono_atual = c.corretor_id
             AND public.funil_ordem(c.status) BETWEEN public.funil_ordem('agendado')
                                                  AND public.funil_ordem('contrato_fechado'))
        ) AS passou
      FROM coorte c
    )
    SELECT m.corretor_id,
           round(100.0 * count(*) FILTER (WHERE m.passou) / count(*), 2),
           count(*)::integer
      FROM marcado m
     GROUP BY m.corretor_id;

  ELSIF _indicador = 'taxa_comparecimento' THEN
    -- Régua da casa: visita validada pelo agendamento, contada na data da
    -- visita. Sintéticos (auto_gerado) ficam fora.
    RETURN QUERY
    SELECT a.corretor_id,
           round(100.0 * count(*) FILTER (WHERE a.status = 'realizado') / count(*), 2),
           count(*)::integer
      FROM public.agendamentos a
     WHERE a.deleted_at IS NULL AND a.tipo = 'visita'
       AND NOT COALESCE(a.auto_gerado, false)
       AND a.status IN ('realizado', 'nao_compareceu')
       AND a.data_inicio >= _ini AND a.data_inicio < _fim
       AND a.corretor_id IN (SELECT public._academia_corretores())
     GROUP BY a.corretor_id;

  ELSIF _indicador = 'taxa_visita_para_avanco' THEN
    -- Visitas realizadas com 14 dias de maturação. Avançou = chegou a análise
    -- de crédito ou pasta montada depois da visita (decisão do dono).
    RETURN QUERY
    WITH visita AS (
      SELECT DISTINCT ON (a.lead_id, a.corretor_id)
             a.lead_id, a.corretor_id, a.data_inicio AS visitou_em
        FROM public.agendamentos a
       WHERE a.deleted_at IS NULL AND a.tipo = 'visita' AND a.status = 'realizado'
         AND NOT COALESCE(a.auto_gerado, false)
         AND a.lead_id IS NOT NULL
         AND a.data_inicio >= _ini - interval '14 days'
         AND a.data_inicio <  _fim - interval '14 days'
         AND a.corretor_id IN (SELECT public._academia_corretores())
       ORDER BY a.lead_id, a.corretor_id, a.data_inicio
    ),
    marcado AS (
      SELECT v.corretor_id,
        (EXISTS (SELECT 1 FROM public.lead_status_transitions t
                  WHERE t.lead_id = v.lead_id AND t.created_at >= v.visitou_em
                    AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('analise_credito')
                                                             AND public.funil_ordem('contrato_fechado'))
         OR EXISTS (SELECT 1 FROM public.leads l
                     WHERE l.id = v.lead_id AND l.pasta_montada_em >= v.visitou_em)
         OR EXISTS (SELECT 1 FROM public.analises_credito ac
                     WHERE ac.lead_id = v.lead_id AND ac.created_at >= v.visitou_em)
        ) AS avancou
      FROM visita v
    )
    SELECT m.corretor_id,
           round(100.0 * count(*) FILTER (WHERE m.avancou) / count(*), 2),
           count(*)::integer
      FROM marcado m
     GROUP BY m.corretor_id;

  ELSIF _indicador IN ('pct_carteira_parada', 'pct_sem_proximo_passo') THEN
    -- Retrato da carteira ativa agora (não depende da janela). Relógio e lote
    -- são os da Higiene; "parado" é a régua 7/30 da Carteira Ativa.
    RETURN QUERY
    WITH relogio AS (
      SELECT l.id, l.corretor_id, l.status, l.cadencia_etapa, l.na_lixeira,
             COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS mov,
             count(*) OVER (PARTITION BY date_trunc('second',
               COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at))) AS mesmo_segundo
        FROM public.leads l
       WHERE l.deleted_at IS NULL
    ),
    carteira AS (
      SELECT r.*,
             r.mesmo_segundo >= COALESCE((SELECT hc.lote_min_leads FROM public.higiene_config hc
                                           WHERE hc.id LIMIT 1), 50) AS em_lote,
             r.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito') AS eh_fundo
        FROM relogio r
       WHERE r.na_lixeira = false
         AND r.corretor_id IN (SELECT public._academia_corretores())
         AND r.status NOT IN ('novo', 'aguardando_atendimento', 'aguardando_corretor',
                              'contrato_fechado', 'pos_venda', 'perdido')
         AND NOT COALESCE(r.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'), false)
    ),
    base AS (
      SELECT c.* FROM carteira c WHERE NOT c.em_lote
    )
    SELECT b.corretor_id,
           CASE WHEN _indicador = 'pct_carteira_parada' THEN
             round(100.0 * count(*) FILTER (
               WHERE b.mov < now() - CASE WHEN b.eh_fundo THEN interval '30 days'
                                          ELSE interval '7 days' END) / count(*), 2)
           ELSE
             round(100.0 * count(*) FILTER (WHERE public.lead_sem_proximo_passo(b.id)) / count(*), 2)
           END,
           count(*)::integer
      FROM base b
     GROUP BY b.corretor_id;

  ELSIF _indicador = 'taxa_perda_por_qualificacao' THEN
    -- Leads NOVOS que avançaram (passaram por agendado com este corretor) na
    -- janela; quantos foram perdidos depois por perfil ou renda. A categoria
    -- é a gravada no momento da perda (lead_eventos), não o rótulo atual.
    RETURN QUERY
    WITH novos AS (
      SELECT DISTINCT ON (d.lead_id, d.corretor_id)
             d.lead_id, d.corretor_id, d.created_at AS atribuido_em
        FROM public.distribution_log d
        LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
       WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
         AND (COALESCE(c.contexto ->> 'gatilho', '') LIKE 'webhook%'
              OR COALESCE(c.contexto ->> 'gatilho', '') LIKE 'sla\_webhook%'
              OR COALESCE(c.contexto ->> 'gatilho', '') LIKE 'agendamento\_%')
       ORDER BY d.lead_id, d.corretor_id, d.created_at
    ),
    avancou AS (
      SELECT n.lead_id, n.corretor_id,
             LEAST(
               (SELECT min(t.created_at) FROM public.lead_status_transitions t
                 WHERE t.lead_id = n.lead_id AND t.corretor_id = n.corretor_id
                   AND t.created_at >= n.atribuido_em
                   AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('agendado')
                                                            AND public.funil_ordem('contrato_fechado')),
               (SELECT min(a.created_at) FROM public.agendamentos a
                 WHERE a.lead_id = n.lead_id AND a.corretor_id = n.corretor_id
                   AND a.deleted_at IS NULL AND a.tipo = 'visita'
                   AND NOT COALESCE(a.auto_gerado, false)
                   AND a.created_at >= n.atribuido_em)
             ) AS avancou_em
        FROM novos n
       WHERE n.corretor_id IN (SELECT public._academia_corretores())
         AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = n.lead_id AND l.deleted_at IS NULL)
    ),
    coorte AS (
      SELECT a.* FROM avancou a
       WHERE a.avancou_em >= _ini AND a.avancou_em < _fim
    ),
    marcado AS (
      SELECT c.corretor_id,
        EXISTS (
          SELECT 1
            FROM public.lead_status_transitions t
            JOIN public.lead_eventos e
              ON e.lead_id = t.lead_id AND e.tipo = 'transicao_lead'
             AND e.payload ->> 'para_status' = 'perdido'
             AND e.created_at BETWEEN t.created_at - interval '5 seconds'
                                  AND t.created_at + interval '5 seconds'
           WHERE t.lead_id = c.lead_id AND t.para_status = 'perdido'
             AND t.created_at >= c.avancou_em AND t.created_at < _fim
             AND e.payload ->> 'motivo_categoria'
                 IN ('credito_renda', 'estourou_teto', 'sem_perfil', 'credito_score')
        ) AS perdeu
      FROM coorte c
    )
    SELECT m.corretor_id,
           round(100.0 * count(*) FILTER (WHERE m.perdeu) / count(*), 2),
           count(*)::integer
      FROM marcado m
     GROUP BY m.corretor_id;

  END IF;
  -- Indicador sem definição (ex.: taxa_pasta_devolvida, sem fonte): nada.
END $$;

REVOKE ALL ON FUNCTION public._academia_indicador(text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._academia_indicador(text, timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Motor: indicadores do dia e recomendações
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_calcular_indicadores(_data_ref date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ref   date := COALESCE(_data_ref, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_fim   timestamptz := LEAST(now(), ((v_ref + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'));
  r       record;
  v_n     integer;
  v_total integer := 0;
BEGIN
  -- Sem sessão (pg_cron, service_role) roda; com sessão, só admin.
  IF auth.uid() IS NOT NULL AND NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM public.academia_regras_recomendacao WHERE ativa ORDER BY codigo LOOP
    -- Mediana do time = empresa inteira SEM o próprio corretor, só entre quem
    -- tem amostra mínima (decisão do dono na Fatia 0).
    WITH v AS MATERIALIZED (
      SELECT * FROM public._academia_indicador(r.indicador,
                      v_fim - make_interval(days => r.janela_dias), v_fim)
    )
    INSERT INTO public.academia_indicadores
      (corretor_id, indicador, data_ref, janela_dias, valor, amostra, referencia_time, calculado_em)
    SELECT p.corretor_id, r.indicador, v_ref, r.janela_dias,
           meu.o_valor, COALESCE(meu.o_amostra, 0),
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.o_valor)
              FROM v o
             WHERE o.o_corretor <> p.corretor_id
               AND o.o_amostra >= r.amostra_minima
               AND o.o_valor IS NOT NULL),
           now()
      FROM public.academia_participantes p
      LEFT JOIN v meu ON meu.o_corretor = p.corretor_id
     WHERE p.participa
    ON CONFLICT (corretor_id, indicador, data_ref) DO UPDATE
      SET janela_dias     = excluded.janela_dias,
          valor           = excluded.valor,
          amostra         = excluded.amostra,
          referencia_time = excluded.referencia_time,
          calculado_em    = excluded.calculado_em;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END $$;

COMMENT ON FUNCTION public.academia_calcular_indicadores(date) IS
  'Academia: grava academia_indicadores do dia para cada participante e regra ativa. Só lê o funil.';

CREATE OR REPLACE FUNCTION public.academia_gerar_recomendacoes(_data_ref date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ref    date := COALESCE(_data_ref, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  cfg      public.academia_config%ROWTYPE;
  v_status public.academia_status_recomendacao;
  v_n      integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.academia_config WHERE id;

  -- Recomendação que ninguém decidiu dentro da validade expira.
  UPDATE public.academia_recomendacoes
     SET status = 'expirada'
   WHERE status IN ('sombra', 'aberta')
     AND expira_em IS NOT NULL AND expira_em < v_ref;

  IF cfg.recomendacao_modo = 'desligado' THEN
    RETURN 0;
  END IF;
  v_status := CASE WHEN cfg.recomendacao_modo = 'ativo' THEN 'aberta' ELSE 'sombra' END;

  INSERT INTO public.academia_recomendacoes
    (regra_id, corretor_id, modulo_id, indicador, valor_corretor, valor_referencia,
     amostra, data_ref, status, expira_em)
  SELECT r.id, i.corretor_id, m.id, r.indicador, i.valor, i.referencia_time,
         i.amostra, v_ref, v_status, v_ref + cfg.recomendacao_validade_dias
    FROM public.academia_regras_recomendacao r
    JOIN public.academia_modulos m ON m.codigo = r.modulo_codigo
    JOIN public.academia_indicadores i ON i.indicador = r.indicador AND i.data_ref = v_ref
    JOIN public.academia_participantes p ON p.corretor_id = i.corretor_id AND p.participa
   WHERE r.ativa
     AND i.valor IS NOT NULL
     AND i.referencia_time IS NOT NULL
     AND i.amostra >= r.amostra_minima
     AND CASE r.direcao
           WHEN 'maior_e_pior' THEN
             i.valor > r.limiar_relativo * i.referencia_time
             AND (r.diferenca_minima IS NULL OR i.valor - i.referencia_time >= r.diferenca_minima)
           ELSE
             i.valor < r.limiar_relativo * i.referencia_time
             AND (r.diferenca_minima IS NULL OR i.referencia_time - i.valor >= r.diferenca_minima)
         END
     -- Quem concluiu o módulo nos últimos 30 dias, ou já tem ele atribuído
     -- em aberto, não recebe a mesma recomendação.
     AND NOT EXISTS (SELECT 1 FROM public.v_academia_modulo_status s
                      WHERE s.corretor_id = i.corretor_id AND s.modulo_id = m.id
                        AND s.concluido AND s.concluido_em >= now() - interval '30 days')
     AND NOT EXISTS (SELECT 1 FROM public.academia_atribuicoes a
                      WHERE a.corretor_id = i.corretor_id AND a.modulo_id = m.id
                        AND a.concluida_em IS NULL AND a.cancelada_em IS NULL)
  ON CONFLICT (corretor_id, regra_id) WHERE status IN ('sombra', 'aberta') DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.academia_gerar_recomendacoes(date) IS
  'Academia: cria recomendações (sombra ou abertas, conforme academia_config) a partir dos indicadores do dia. Nunca atribui nada sozinha.';

CREATE OR REPLACE FUNCTION public.academia_rodar_motor(_data_ref date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ind integer;
  v_rec integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_ind := public.academia_calcular_indicadores(_data_ref);
  v_rec := public.academia_gerar_recomendacoes(_data_ref);
  RETURN jsonb_build_object('indicadores', v_ind, 'recomendacoes', v_rec);
END $$;

REVOKE ALL ON FUNCTION public.academia_calcular_indicadores(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academia_gerar_recomendacoes(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academia_rodar_motor(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_calcular_indicadores(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_gerar_recomendacoes(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_rodar_motor(date) TO authenticated, service_role;

-- Agendamento diário: 05:45 UTC (02:45 de Brasília), depois da régua de
-- devolução das 05:00. Só se o pg_cron já estiver habilitado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'academia-motor-diario';
    PERFORM cron.schedule('academia-motor-diario', '45 5 * * *',
      $cron$SELECT public.academia_rodar_motor();$cron$);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Efeito: indicador antes (a janela que disparou) x depois (a mesma
--    janela contada da conclusão do módulo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_academia_efeito
WITH (security_invoker = true) AS
SELECT
  rec.id                AS recomendacao_id,
  rec.corretor_id,
  rg.codigo             AS regra_codigo,
  rec.indicador,
  rg.direcao,
  rg.janela_dias,
  rec.modulo_id,
  m.codigo              AS modulo_codigo,
  m.titulo              AS modulo_titulo,
  rec.data_ref          AS data_antes,
  rec.valor_corretor    AS valor_antes,
  rec.valor_referencia  AS referencia_antes,
  rec.amostra           AS amostra_antes,
  at.concluida_em,
  (at.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date + rg.janela_dias AS data_depois,
  depois.valor          AS valor_depois,
  depois.referencia_time AS referencia_depois,
  depois.amostra        AS amostra_depois
FROM public.academia_recomendacoes rec
JOIN public.academia_regras_recomendacao rg ON rg.id = rec.regra_id
-- LEFT: módulo arquivado ou despublicado depois não apaga o efeito medido.
LEFT JOIN public.academia_modulos m ON m.id = rec.modulo_id
JOIN public.academia_atribuicoes at
  ON at.recomendacao_id = rec.id AND at.concluida_em IS NOT NULL
LEFT JOIN public.academia_indicadores depois
  ON depois.corretor_id = rec.corretor_id
 AND depois.indicador = rec.indicador
 AND depois.data_ref = (at.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date + rg.janela_dias
WHERE rec.status = 'concluida';

REVOKE ALL ON public.v_academia_efeito FROM PUBLIC, anon;
GRANT SELECT ON public.v_academia_efeito TO authenticated;
GRANT ALL ON public.v_academia_efeito TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Encontros e presença
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_salvar_encontro(
  _id uuid, _tipo text, _titulo text, _inicio timestamptz, _duracao_min integer,
  _facilitador uuid, _modulo uuid, _descricao text, _acao_registrada text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'gestor'::public.app_role)
          OR public.has_role(auth.uid(), 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(_titulo), '') = '' THEN RAISE EXCEPTION 'titulo obrigatorio'; END IF;
  IF _inicio IS NULL THEN RAISE EXCEPTION 'data e hora obrigatorias'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.academia_encontros
      (tipo, titulo, inicio, duracao_min, facilitador_id, modulo_id, descricao, acao_registrada, criado_por)
    VALUES (_tipo, trim(_titulo), _inicio, _duracao_min, _facilitador, _modulo,
            nullif(trim(_descricao), ''), nullif(trim(_acao_registrada), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.academia_encontros
       SET tipo = _tipo, titulo = trim(_titulo), inicio = _inicio, duracao_min = _duracao_min,
           facilitador_id = _facilitador, modulo_id = _modulo,
           descricao = nullif(trim(_descricao), ''),
           acao_registrada = nullif(trim(_acao_registrada), '')
     WHERE id = _id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'encontro nao encontrado'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academia_registrar_presenca(
  _encontro uuid, _corretor uuid, _presente boolean, _observacao text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.academia_eh_admin() OR public.academia_pode_gerir(_corretor)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_encontros WHERE id = _encontro) THEN
    RAISE EXCEPTION 'encontro nao encontrado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = _corretor AND participa) THEN
    RAISE EXCEPTION 'pessoa nao participa da Academia';
  END IF;

  -- Presença nula = desmarcar.
  IF _presente IS NULL THEN
    DELETE FROM public.academia_presencas
     WHERE encontro_id = _encontro AND corretor_id = _corretor;
    RETURN;
  END IF;

  INSERT INTO public.academia_presencas (encontro_id, corretor_id, presente, observacao)
  VALUES (_encontro, _corretor, _presente, nullif(trim(_observacao), ''))
  ON CONFLICT (encontro_id, corretor_id) DO UPDATE
    SET presente = excluded.presente,
        observacao = COALESCE(excluded.observacao, public.academia_presencas.observacao);
END $$;

REVOKE ALL ON FUNCTION public.academia_salvar_encontro(uuid, text, text, timestamptz, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academia_registrar_presenca(uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_salvar_encontro(uuid, text, text, timestamptz, integer, uuid, uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_registrar_presenca(uuid, uuid, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Gate da roleta em SOMBRA (só leitura). Quanto dos leads dos últimos 30
--    dias foi para quem ainda não está habilitado. Não bloqueia nada. Liga e
--    desliga por academia_config.gate_roleta_modo ('desligado' | 'sombra').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_academia_gate_sombra AS
WITH atrib AS (
  SELECT d.corretor_id, count(DISTINCT d.lead_id) AS leads_30d
    FROM public.distribution_log d
   WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
     AND d.created_at >= now() - interval '30 days'
   GROUP BY d.corretor_id
),
total AS (
  SELECT sum(a.leads_30d) AS t FROM atrib a
)
SELECT
  a.corretor_id,
  coalesce(nullif(pr.nome, ''), pr.email) AS corretor_nome,
  CASE
    WHEN p.corretor_id IS NULL OR NOT p.participa THEN 'fora_da_academia'
    WHEN coalesce(p.habilitado_override, p.nivel <> 'iniciante') THEN 'habilitado'
    ELSE 'nao_habilitado'
  END AS situacao,
  a.leads_30d::integer AS leads_30d,
  round(100.0 * a.leads_30d / NULLIF(t.t, 0), 1) AS pct_do_total
FROM atrib a
JOIN public.profiles pr ON pr.id = a.corretor_id
LEFT JOIN public.academia_participantes p ON p.corretor_id = a.corretor_id
CROSS JOIN total t;

-- A view lê distribution_log com o dono dela: ninguém a lê direto. A tela
-- passa pela função abaixo, que filtra pela equipe de quem pergunta.
REVOKE ALL ON public.v_academia_gate_sombra FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_academia_gate_sombra TO service_role;

CREATE OR REPLACE FUNCTION public.academia_gate_sombra()
RETURNS SETOF public.v_academia_gate_sombra
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.academia_eh_admin()
          OR public.has_role(auth.uid(), 'gestor'::public.app_role)
          OR public.has_role(auth.uid(), 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- A simulação só roda com academia_config.gate_roleta_modo = 'sombra'
  -- (padrão: desligado). Desligada, devolve vazio: a chave manda de verdade.
  IF coalesce((SELECT c.gate_roleta_modo FROM public.academia_config c WHERE c.id),
              'desligado') <> 'sombra' THEN
    RETURN;
  END IF;

  IF public.academia_eh_admin() THEN
    RETURN QUERY SELECT * FROM public.v_academia_gate_sombra;
  ELSE
    RETURN QUERY SELECT g.* FROM public.v_academia_gate_sombra g
                  WHERE public.pode_acessar_corretor(auth.uid(), g.corretor_id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.academia_gate_sombra() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_gate_sombra() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Candidatos para a tela de Participantes (só admin): conta ativa, papéis
--    e os vetos da inscrição já calculados, para a tela explicar o motivo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_candidatos()
RETURNS TABLE (
  pessoa_id     uuid,
  nome          text,
  email         text,
  papeis        text[],
  conta_ativa   boolean,
  eh_bot        boolean,
  eh_mcp        boolean,
  participa     boolean,
  inicio_trilha date,
  nivel         public.academia_nivel
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pr.id,
         coalesce(nullif(pr.nome, ''), pr.email),
         pr.email,
         coalesce((SELECT array_agg(ur.role::text ORDER BY ur.role::text)
                     FROM public.user_roles ur WHERE ur.user_id = pr.id), '{}'::text[]),
         public.is_active_member(pr.id),
         public.is_service_bot(pr.id),
         EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = pr.id AND m.ativo),
         coalesce(ap.participa, false),
         ap.inicio_trilha,
         ap.nivel
    FROM public.profiles pr
    LEFT JOIN public.academia_participantes ap ON ap.corretor_id = pr.id
   ORDER BY coalesce(ap.participa, false) DESC, coalesce(nullif(pr.nome, ''), pr.email);
END $$;

REVOKE ALL ON FUNCTION public.academia_candidatos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_candidatos() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
