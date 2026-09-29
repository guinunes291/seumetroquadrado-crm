-- ===========================================================================
-- ACADEMIA SMQ · lead novo sem importação e planilha; R02 com 15 dias maduros
-- Decisão do dono em 29/09/2026, depois de ver o R02 por corretor:
--   - lead de origem importacao ou google_sheets sai da conta de lead novo em
--     R01 (1º contato), R02 (agendamento) e R08 (perda por perfil);
--   - R02 passa a olhar 15 dias já maduros (leads que chegaram entre 22 e 7
--     dias atrás), em vez de 90.
-- Troca o corpo de _academia_indicador (CREATE OR REPLACE mantém dono e
-- permissões) e atualiza dados de academia_regras_recomendacao. Idempotente.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public._academia_indicador(_indicador text, _ini timestamptz, _fim timestamptz)
RETURNS TABLE (o_corretor uuid, o_valor numeric, o_amostra integer)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Lead novo = de anúncio. Lead de origem importacao ou google_sheets fica
  -- fora de R01, R02 e R08 (decisão do dono, 29/09/2026): lista importada ou
  -- vinda de planilha não é demanda nova, e distorcia as três contas.
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
                      WHERE l.id = a.lead_id AND l.deleted_at IS NULL
                        AND l.origem NOT IN ('importacao', 'google_sheets'))
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
                           AND l.origem NOT IN ('importacao', 'google_sheets')
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
         AND EXISTS (SELECT 1 FROM public.leads l
                      WHERE l.id = n.lead_id AND l.deleted_at IS NULL
                        AND l.origem NOT IN ('importacao', 'google_sheets'))
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

UPDATE public.academia_regras_recomendacao
   SET janela_dias = 15,
       observacao  = 'Leads que PASSARAM POR agendado / leads novos atribuídos na janela (bool_or no histórico, não último status). Só lead novo de anúncio (gatilho webhook ou sla_webhook); fica de fora quem já chega agendado e lead de origem importacao ou google_sheets. Coorte madura: o lead conta 7 dias depois de chegar, para dar tempo de agendar. Decisões do dono em 29/09/2026: na calibração a janela foi de 30 para 90 dias (com 30 a mediana era 0,0% e a regra nunca disparava); no mesmo dia foi para 15 dias maduros, sem importação e planilha, porque com 90 dias 3 dos 6 marcados tinham cerca de 30 leads e mais de 60% de chance de zerar por acaso.'
 WHERE codigo = 'R02';

UPDATE public.academia_regras_recomendacao
   SET observacao = 'Mediana de MINUTOS UTEIS (public._minutos_uteis_entre, janela comercial 08:00-19:00 de Sao Paulo) entre a atribuicao do lead e a 1a interacao do corretor. Conta SO lead novo (gatilhos webhook, sla_webhook*, agendamento_*): lead puxado do bolsao, transferido ou devolvido nao entra. Lead sem contato registrado entra com o PIOR tempo da janela, senao quem nunca liga termina com mediana boa. Fatia 0: mediana do time 8 min; so 143 das 4.978 atribuicoes em 30 dias eram lead novo pago, por isso a janela subiu para 90 dias. A Fatia 5 exige ainda uma diferenca minima absoluta alem do 1,5x. Desde 29/09/2026 (decisão do dono), lead de origem importacao ou google_sheets fica fora da conta.'
 WHERE codigo = 'R01';

UPDATE public.academia_regras_recomendacao
   SET observacao = 'Perdas com motivo credito_renda, estourou_teto, sem_perfil ou credito_score (decisão do dono, 28/09/2026; ja_possui_imovel fica de FORA) / leads que AVANÇARAM na janela. Avançar = passou por agendado. Só lead novo. Fatia 0: 2.174 perdas em 30 dias, 1.975 pelo próprio corretor, sem_perfil = 49% delas; o volume é limpeza de estoque. Calibração de 29/09/2026 (decisão do dono): exige 10 pontos percentuais acima da mediana. Na conta exata do motor, só 1 corretor tinha a amostra mínima (0 de 1); a diferença mínima evita que uma perda isolada dispare quando mais gente atingir a amostra. Desde 29/09/2026 (decisão do dono), lead de origem importacao ou google_sheets fica fora da conta.'
 WHERE codigo = 'R08';

NOTIFY pgrst, 'reload schema';
