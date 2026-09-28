-- =============================================================================
-- Academia SMQ · Fatia 0 · Diagnóstico em UMA consulta (modo console)
--
-- GERADO a partir de fatia0-diagnostico.sql (mesmas 20 consultas, mesmo texto).
-- Não edite aqui: edite o original e gere de novo.
--
-- Para quem não tem acesso programático ao banco:
--   1. cole o arquivo INTEIRO no SQL Editor do Supabase do CRM;
--   2. clique Run uma vez;
--   3. exporte o resultado (Download CSV / Export).
-- Volta 20 linhas: uma por bloco, com o resultado do bloco em JSON.
-- Somente leitura: é um único SELECT.
-- =============================================================================

-- ---------------------------------------------------------------- 0.1
SELECT 1 AS ordem, '0.1' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  to_char(date_trunc('month', x.quando AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes_brt,
  x.fonte,
  count(*) AS n
FROM (
  SELECT 'a) leads criados'::text AS fonte, l.created_at AS quando
    FROM public.leads l WHERE l.deleted_at IS NULL
  UNION ALL
  SELECT 'b) agendamentos de visita criados (sem sintéticos)', a.created_at
    FROM public.agendamentos a
   WHERE a.deleted_at IS NULL AND a.tipo = 'visita' AND NOT a.auto_gerado
  UNION ALL
  SELECT 'c) visitas validadas como realizadas (pela data da visita)', a.data_inicio
    FROM public.agendamentos a
   WHERE a.deleted_at IS NULL AND a.tipo = 'visita' AND a.status = 'realizado'
  UNION ALL
  SELECT 'd) transições para agendado', t.created_at
    FROM public.lead_status_transitions t WHERE t.para_status = 'agendado'
  UNION ALL
  SELECT 'e) vendas não distratadas (pela assinatura)', v.data_assinatura::timestamptz
    FROM public.vendas v WHERE NOT v.distrato
  UNION ALL
  SELECT 'f) distribuições com sucesso', d.created_at
    FROM public.distribution_log d
   WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
) AS x
WHERE x.quando >= timestamptz '2026-06-01 00:00:00-03'
GROUP BY 1, 2
ORDER BY 2, 1
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.2
SELECT 2 AS ordem, '0.2' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH ag AS (
  SELECT DISTINCT a.lead_id
    FROM public.agendamentos a
   WHERE a.deleted_at IS NULL AND a.tipo = 'visita' AND NOT a.auto_gerado
     AND a.lead_id IS NOT NULL
     AND a.created_at >= now() - interval '60 days'
)
SELECT
  count(*) AS leads_com_agendamento_de_visita_60d,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
     WHERE t.lead_id = ag.lead_id
       AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('agendado')
                                                AND public.funil_ordem('contrato_fechado')
  )) AS com_transicao_para_agendado_ou_alem,
  count(*) FILTER (WHERE public.funil_ordem(l.status) BETWEEN public.funil_ordem('agendado')
                                                         AND public.funil_ordem('contrato_fechado'))
    AS status_atual_agendado_ou_alem,
  count(*) FILTER (WHERE l.status = 'perdido') AS status_atual_perdido
FROM ag
JOIN public.leads l ON l.id = ag.lead_id
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.3
SELECT 3 AS ordem, '0.3' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  date_trunc('second', t.created_at) AS instante,
  t.para_status,
  count(*) AS linhas,
  count(*) FILTER (WHERE t.alterado_por IS NULL) AS sem_autor_humano,
  count(DISTINCT t.corretor_id) AS corretores
FROM public.lead_status_transitions t
WHERE t.created_at >= now() - interval '120 days'
GROUP BY 1, 2
HAVING count(*) >= 20
ORDER BY linhas DESC
LIMIT 30
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.4
SELECT 4 AS ordem, '0.4' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  t.para_status,
  count(*) FILTER (WHERE t.created_at >= now() - interval '30 days')  AS ult_30d,
  count(*) FILTER (WHERE t.created_at >= now() - interval '90 days')  AS ult_90d,
  count(*)                                                             AS desde_sempre,
  public.funil_ordem(t.para_status)                                    AS degrau_funil
FROM public.lead_status_transitions t
GROUP BY t.para_status
ORDER BY degrau_funil, t.para_status
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.5
SELECT 5 AS ordem, '0.5' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  j.jobid, j.jobname, j.schedule, j.active,
  left(regexp_replace(j.command, '\s+', ' ', 'g'), 140) AS comando
FROM cron.job j
ORDER BY j.schedule, j.jobname
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.6
SELECT 6 AS ordem, '0.6' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT e.extname, e.extversion, current_setting('cron.timezone', true) AS cron_timezone
FROM pg_extension e
WHERE e.extname IN ('pg_cron', 'pg_net')
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.7
SELECT 7 AS ordem, '0.7' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (   p.proname LIKE 'sla\_%'
       OR p.proname LIKE 'mcp\_g%'
       OR p.proname LIKE 'academia\_%'
       OR p.proname IN ('has_role', 'is_active_member', 'transicionar_lead',
                        'distribuir_lead_ponderado', 'atribuir_lead_a_corretor',
                        '_distribuir_lead_v3', '_apto_extra_v2', 'funil_ordem',
                        'lead_sem_proximo_passo', '_minutos_uteis_entre',
                        'higiene_dias_parado', 'corretores_do_gestor',
                        've_carteira_completa'))
ORDER BY p.proname
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.8
SELECT 8 AS ordem, '0.8' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'academia%'
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- 0.9
SELECT 9 AS ordem, '0.9' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  public._modelo_v2_ativo() AS modelo_v2_ativo,
  count(*) FILTER (WHERE rp.ativo)                                              AS participacoes_ativas,
  count(*) FILTER (WHERE rp.ativo AND p.onboarding_concluido_em IS NULL)        AS ativas_sem_onboarding,
  count(*) FILTER (WHERE rp.ativo AND p.onboarding_concluido_origem = 'manual') AS ativas_onboarding_manual
FROM public.roleta_participantes rp
JOIN public.profiles p ON p.id = rp.corretor_id
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- P
SELECT 10 AS ordem, 'P' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  p.nome,
  split_part(p.email, '@', 2) AS email_dominio,  -- só o domínio: a saída vai para o GitHub
  p.cargo,
  p.ativo            AS profiles_ativo,
  p.status_conta,
  (SELECT string_agg(ur.role::text, ',' ORDER BY ur.role::text)
     FROM public.user_roles ur WHERE ur.user_id = p.id)                 AS papeis,
  EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id) AS eh_service_bot,
  EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)     AS eh_identidade_mcp,
  e.nome                                                                 AS equipe,
  to_char(u.last_sign_in_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ultimo_login_brt,
  to_char(p.onboarding_concluido_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS onboarding_em,
  p.onboarding_concluido_origem,
  (SELECT count(*) FROM public.leads l
    WHERE l.corretor_id = p.id AND l.deleted_at IS NULL
      AND l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido'))            AS leads_vivos,
  (SELECT to_char(max(d.created_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
     FROM public.distribution_log d
    WHERE d.corretor_id = p.id AND d.resultado = 'sucesso')                        AS ultima_distribuicao,
  (SELECT to_char(max(i.created_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
     FROM public.interacoes i
    WHERE i.autor_id = p.id AND i.deleted_at IS NULL AND i.tipo <> 'mudanca_status') AS ultima_interacao_propria,
  (SELECT count(*) FROM public.roleta_participantes rp
    WHERE rp.corretor_id = p.id AND rp.ativo)                                      AS roletas_ativas,
  (SELECT count(*) FROM public.vendas v
    WHERE v.corretor_id = p.id AND NOT v.distrato
      AND v.data_assinatura >= (now() - interval '180 days')::date)                AS vendas_180d,
  count(*) OVER (PARTITION BY NULLIF(regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g'), '')) AS perfis_com_mesmo_telefone,
  concat_ws(', ',
    CASE WHEN p.email ILIKE '%.local' THEN 'e-mail .local' END,
    CASE WHEN COALESCE(p.email, '') = '' THEN 'e-mail vazio' END,
    CASE WHEN p.nome ILIKE '%teste%' THEN 'nome com teste' END,
    CASE WHEN p.nome ILIKE '%bot%' OR p.email ILIKE '%bot%' THEN 'bot no nome/e-mail' END,
    CASE WHEN p.email ILIKE '%@seumetroquadrado.com%' THEN 'e-mail institucional' END,
    CASE WHEN split_part(p.email, '@', 2) IN ('uorak.com', 'dysonc.com', 'tozya.com', 'ezimb.com')
         THEN 'e-mail descartável' END
  ) AS sinais
FROM public.profiles p
LEFT JOIN auth.users u     ON u.id = p.id
LEFT JOIN public.equipes e ON e.id = p.equipe_id
ORDER BY p.status_conta, p.nome
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I1a
SELECT 11 AS ordem, 'I1a' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '30 days' AS ini, now() AS fim
),
corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
atrib AS (
  SELECT d.id, d.lead_id, d.corretor_id, d.created_at AS atribuido_em,
         COALESCE(c.contexto ->> 'gatilho', '(sem contexto)') AS gatilho,
         lead(d.created_at) OVER (PARTITION BY d.lead_id ORDER BY d.created_at) AS fim_posse
    FROM public.distribution_log d
    JOIN public.leads l ON l.id = d.lead_id AND l.deleted_at IS NULL
    LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
   WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
),
janela AS (
  SELECT a.*
    FROM atrib a, params pr
   WHERE a.atribuido_em >= pr.ini AND a.atribuido_em < pr.fim
     AND a.corretor_id IN (SELECT id FROM corretores)
),
contato AS (
  SELECT j.*,
    (SELECT min(i.created_at) FROM public.interacoes i
      WHERE i.lead_id = j.lead_id AND i.autor_id = j.corretor_id AND i.deleted_at IS NULL
        AND i.tipo IN ('ligacao', 'whatsapp', 'email', 'sms', 'visita', 'reuniao', 'proposta')
        AND i.created_at >= j.atribuido_em
        AND i.created_at <  COALESCE(j.fim_posse, 'infinity'))            AS via_interacao,
    (SELECT min(ch.criado_em) FROM public.chamadas ch
      WHERE ch.lead_id = j.lead_id AND ch.corretor_id = j.corretor_id AND ch.direcao = 'saida'
        AND ch.criado_em >= j.atribuido_em
        AND ch.criado_em <  COALESCE(j.fim_posse, 'infinity'))            AS via_chamada,
    (SELECT min(m.criado_em) FROM public.mensagens m
      WHERE m.lead_id = j.lead_id AND m.corretor_id = j.corretor_id AND m.direcao = 'saida'
        AND m.criado_em >= j.atribuido_em
        AND m.criado_em <  COALESCE(j.fim_posse, 'infinity'))             AS via_mensagem,
    (SELECT min(t.created_at) FROM public.lead_status_transitions t
      WHERE t.lead_id = j.lead_id AND t.de_status = 'aguardando_atendimento'
        AND t.alterado_por = j.corretor_id
        AND t.created_at >= j.atribuido_em
        AND t.created_at <  COALESCE(j.fim_posse, 'infinity'))            AS via_saida_da_fila
  FROM janela j
)
SELECT
  gatilho,
  count(*)                                         AS atribuicoes,
  count(via_interacao)                             AS com_interacao,
  count(via_chamada)                               AS com_chamada,
  count(via_mensagem)                              AS com_mensagem,
  count(via_saida_da_fila)                         AS com_saida_da_fila,
  count(*) FILTER (WHERE COALESCE(via_interacao, via_chamada, via_mensagem, via_saida_da_fila) IS NOT NULL)
                                                   AS com_algum_contato
FROM contato
GROUP BY gatilho
ORDER BY atribuicoes DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I1b
SELECT 12 AS ordem, 'I1b' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '30 days' AS ini, now() AS fim
),
corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
atrib AS (
  SELECT d.id, d.lead_id, d.corretor_id, d.created_at AS atribuido_em,
         COALESCE(c.contexto ->> 'gatilho', '(sem contexto)') AS gatilho,
         lead(d.created_at) OVER (PARTITION BY d.lead_id ORDER BY d.created_at) AS fim_posse
    FROM public.distribution_log d
    JOIN public.leads l ON l.id = d.lead_id AND l.deleted_at IS NULL
    LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
   WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
),
janela AS (
  SELECT a.*
    FROM atrib a, params pr
   WHERE a.atribuido_em >= pr.ini AND a.atribuido_em < pr.fim
     AND a.corretor_id IN (SELECT id FROM corretores)
),
contato AS (
  SELECT j.*,
    (SELECT min(i.created_at) FROM public.interacoes i
      WHERE i.lead_id = j.lead_id AND i.autor_id = j.corretor_id AND i.deleted_at IS NULL
        AND i.tipo IN ('ligacao', 'whatsapp', 'email', 'sms', 'visita', 'reuniao', 'proposta')
        AND i.created_at >= j.atribuido_em
        AND i.created_at <  COALESCE(j.fim_posse, 'infinity'))            AS via_interacao,
    (SELECT min(ch.criado_em) FROM public.chamadas ch
      WHERE ch.lead_id = j.lead_id AND ch.corretor_id = j.corretor_id AND ch.direcao = 'saida'
        AND ch.criado_em >= j.atribuido_em
        AND ch.criado_em <  COALESCE(j.fim_posse, 'infinity'))            AS via_chamada,
    (SELECT min(m.criado_em) FROM public.mensagens m
      WHERE m.lead_id = j.lead_id AND m.corretor_id = j.corretor_id AND m.direcao = 'saida'
        AND m.criado_em >= j.atribuido_em
        AND m.criado_em <  COALESCE(j.fim_posse, 'infinity'))             AS via_mensagem,
    (SELECT min(t.created_at) FROM public.lead_status_transitions t
      WHERE t.lead_id = j.lead_id AND t.de_status = 'aguardando_atendimento'
        AND t.alterado_por = j.corretor_id
        AND t.created_at >= j.atribuido_em
        AND t.created_at <  COALESCE(j.fim_posse, 'infinity'))            AS via_saida_da_fila
  FROM janela j
),
por_atribuicao AS (
  SELECT c.corretor_id,
         LEAST(c.via_interacao, c.via_chamada, c.via_mensagem, c.via_saida_da_fila) AS primeiro,
         public._minutos_uteis_entre(c.atribuido_em,
           LEAST(c.via_interacao, c.via_chamada, c.via_mensagem, c.via_saida_da_fila)) AS min_uteis
    FROM contato c
   WHERE c.gatilho <> 'estoque'
),
agregado AS (
  SELECT pa.corretor_id,
         count(*)                                   AS atribuicoes,
         count(pa.primeiro)                         AS contatadas,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY pa.min_uteis)
           FILTER (WHERE pa.primeiro IS NOT NULL)   AS mediana_min
    FROM por_atribuicao pa
   GROUP BY pa.corretor_id
)
SELECT
  co.nome,
  ag.atribuicoes,
  ag.contatadas,
  round(100.0 * (ag.atribuicoes - ag.contatadas) / ag.atribuicoes, 1) AS pct_sem_contato_registrado,
  lpad((floor(ag.mediana_min)::int / 60)::text, 2, '0') || ':' ||
  lpad((floor(ag.mediana_min)::int % 60)::text, 2, '0')              AS mediana_hhmm_uteis
FROM agregado ag
JOIN corretores co ON co.id = ag.corretor_id
ORDER BY ag.atribuicoes DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I2
SELECT 13 AS ordem, 'I2' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '37 days' AS ini, now() - interval '7 days' AS fim
),
corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
primeira AS (
  SELECT DISTINCT ON (d.lead_id, d.corretor_id)
         d.lead_id, d.corretor_id, d.created_at AS atribuido_em,
         COALESCE(c.contexto ->> 'gatilho', '(sem contexto)') AS gatilho
    FROM public.distribution_log d
    LEFT JOIN public.distribuicao_log_contexto c ON c.log_id = d.id
   WHERE d.resultado = 'sucesso' AND d.corretor_id IS NOT NULL
   ORDER BY d.lead_id, d.corretor_id, d.created_at
),
coorte AS (
  SELECT pr.*, l.status, l.corretor_id AS dono_atual
    FROM primeira pr
    JOIN public.leads l ON l.id = pr.lead_id AND l.deleted_at IS NULL
    CROSS JOIN params pa
   WHERE pr.atribuido_em >= pa.ini AND pr.atribuido_em < pa.fim
     AND pr.corretor_id IN (SELECT id FROM corretores)
),
marcado AS (
  SELECT c.*,
    EXISTS (SELECT 1 FROM public.lead_status_transitions t
             WHERE t.lead_id = c.lead_id AND t.corretor_id = c.corretor_id
               AND t.created_at >= c.atribuido_em
               AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('agendado')
                                                        AND public.funil_ordem('contrato_fechado')) AS t_hist,
    EXISTS (SELECT 1 FROM public.agendamentos a
             WHERE a.lead_id = c.lead_id AND a.corretor_id = c.corretor_id
               AND a.deleted_at IS NULL AND a.tipo = 'visita' AND NOT a.auto_gerado
               AND a.created_at >= c.atribuido_em) AS a_agenda,
    (c.dono_atual = c.corretor_id
     AND public.funil_ordem(c.status) BETWEEN public.funil_ordem('agendado')
                                         AND public.funil_ordem('contrato_fechado')) AS s_piso
  FROM coorte c
)
SELECT
  co.nome,
  count(*)                                                        AS leads_coorte,
  count(*) FILTER (WHERE m.gatilho = 'estoque')                   AS dos_quais_estoque,
  count(*) FILTER (WHERE t_hist OR a_agenda OR s_piso)            AS passou_por_agendado,
  count(*) FILTER (WHERE t_hist AND NOT a_agenda)                 AS so_historico,
  count(*) FILTER (WHERE a_agenda AND NOT t_hist)                 AS so_agenda,
  count(*) FILTER (WHERE s_piso AND NOT t_hist AND NOT a_agenda)  AS so_status_atual,
  round(100.0 * count(*) FILTER (WHERE t_hist OR a_agenda OR s_piso) / count(*), 1) AS taxa_pct_tudo,
  round(100.0 * count(*) FILTER (WHERE (t_hist OR a_agenda OR s_piso) AND m.gatilho <> 'estoque')
        / NULLIF(count(*) FILTER (WHERE m.gatilho <> 'estoque'), 0), 1)            AS taxa_pct_sem_estoque
FROM marcado m
JOIN corretores co ON co.id = m.corretor_id
GROUP BY co.nome
ORDER BY leads_coorte DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I3
SELECT 14 AS ordem, 'I3' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '30 days' AS ini, now() AS fim
),
corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
ag AS (
  SELECT a.corretor_id, a.status, a.auto_gerado
    FROM public.agendamentos a, params pr
   WHERE a.deleted_at IS NULL AND a.tipo = 'visita'
     AND a.data_inicio >= pr.ini AND a.data_inicio < pr.fim
),
hist AS (
  SELECT t.corretor_id,
         count(DISTINCT t.lead_id) FILTER (WHERE t.para_status = 'agendado')         AS hist_agendados,
         count(DISTINCT t.lead_id) FILTER (WHERE t.para_status = 'visita_realizada') AS hist_visitas
    FROM public.lead_status_transitions t, params pr
   WHERE t.created_at >= pr.ini AND t.created_at < pr.fim
   GROUP BY t.corretor_id
)
SELECT
  co.nome,
  count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status = 'realizado')                     AS realizadas,
  count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status = 'nao_compareceu')                AS nao_compareceu,
  count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status IN ('agendado', 'confirmado'))     AS pendente_validacao,
  count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status IN ('cancelado', 'remarcado'))     AS canceladas_ou_remarcadas,
  count(*) FILTER (WHERE ag.auto_gerado)                                                     AS sinteticas_fora,
  round(100.0 * count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status = 'realizado')
        / NULLIF(count(*) FILTER (WHERE NOT ag.auto_gerado AND ag.status IN ('realizado', 'nao_compareceu')), 0), 1)
                                                                                             AS taxa_pct_regua_casa,
  max(h.hist_agendados)                                                                      AS espec_passou_agendado,
  max(h.hist_visitas)                                                                        AS espec_passou_visita
FROM corretores co
LEFT JOIN ag   ON ag.corretor_id = co.id
LEFT JOIN hist h ON h.corretor_id = co.id
GROUP BY co.nome
ORDER BY realizadas DESC NULLS LAST
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I4
SELECT 15 AS ordem, 'I4' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '44 days' AS ini, now() - interval '14 days' AS fim
),
corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
visita AS (
  SELECT DISTINCT ON (a.lead_id, a.corretor_id)
         a.lead_id, a.corretor_id, a.data_inicio AS visitou_em
    FROM public.agendamentos a, params pr
   WHERE a.deleted_at IS NULL AND a.tipo = 'visita' AND a.status = 'realizado'
     AND a.lead_id IS NOT NULL
     AND a.data_inicio >= pr.ini AND a.data_inicio < pr.fim
   ORDER BY a.lead_id, a.corretor_id, a.data_inicio
),
marcado AS (
  SELECT v.*,
    EXISTS (SELECT 1 FROM public.lead_status_transitions t
             WHERE t.lead_id = v.lead_id AND t.created_at >= v.visitou_em
               AND public.funil_ordem(t.para_status) BETWEEN public.funil_ordem('analise_credito')
                                                        AND public.funil_ordem('contrato_fechado')) AS h,
    EXISTS (SELECT 1 FROM public.leads l
             WHERE l.id = v.lead_id AND l.pasta_montada_em >= v.visitou_em)                        AS p,
    EXISTS (SELECT 1 FROM public.analises_credito ac
             WHERE ac.lead_id = v.lead_id AND ac.created_at >= v.visitou_em)                       AS c,
    EXISTS (SELECT 1 FROM public.propostas pp
             WHERE pp.lead_id = v.lead_id AND pp.deleted_at IS NULL AND pp.created_at >= v.visitou_em) AS r
  FROM visita v
)
SELECT
  co.nome,
  count(*)                                   AS visitas_coorte,
  count(*) FILTER (WHERE h)                  AS via_historico,
  count(*) FILTER (WHERE p)                  AS via_pasta,
  count(*) FILTER (WHERE c)                  AS via_analise,
  count(*) FILTER (WHERE r)                  AS via_proposta,
  count(*) FILTER (WHERE h OR p OR c)        AS avancou,
  round(100.0 * count(*) FILTER (WHERE h OR p OR c) / count(*), 1) AS taxa_pct
FROM marcado m
JOIN corretores co ON co.id = m.corretor_id
GROUP BY co.nome
ORDER BY visitas_coorte DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I5_I6
SELECT 16 AS ordem, 'I5_I6' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH corretores AS (
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE p.status_conta = 'ativa'
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'corretor')
     AND NOT EXISTS (SELECT 1 FROM public.service_bots sb WHERE sb.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.mcp_identidade m WHERE m.uid = p.id)
),
relogio AS (
  SELECT l.id, l.corretor_id, l.status, l.cadencia_etapa, l.na_lixeira,
         COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS mov,
         count(*) OVER (PARTITION BY date_trunc('second',
           COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at))) AS mesmo_segundo
    FROM public.leads l
   WHERE l.deleted_at IS NULL
),
carteira AS (
  SELECT r.*,
         r.mesmo_segundo >= (SELECT hc.lote_min_leads FROM public.higiene_config hc WHERE hc.id) AS em_lote,
         (r.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')) AS eh_fundo
    FROM relogio r
   WHERE r.na_lixeira = false
     AND r.corretor_id IN (SELECT id FROM corretores)
     AND r.status NOT IN ('novo', 'aguardando_atendimento', 'aguardando_corretor',
                          'contrato_fechado', 'pos_venda', 'perdido')
     AND NOT COALESCE(r.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3'), false)
)
SELECT
  co.nome,
  count(*)                                                    AS carteira_ativa,
  count(*) FILTER (WHERE c.em_lote)                           AS em_lote_fora,
  count(*) FILTER (WHERE NOT c.em_lote)                       AS base,
  count(*) FILTER (WHERE NOT c.em_lote AND c.mov < now() - interval '5 days')  AS parado_5d_higiene,
  count(*) FILTER (WHERE NOT c.em_lote AND c.mov < now() - interval '7 days')  AS parado_7d_espec,
  count(*) FILTER (WHERE NOT c.em_lote AND c.mov < now() - CASE WHEN c.eh_fundo THEN interval '30 days'
                                                                ELSE interval '7 days' END) AS parado_7_30_carteira,
  round(100.0 * count(*) FILTER (WHERE NOT c.em_lote AND c.mov < now() - interval '7 days')
        / NULLIF(count(*) FILTER (WHERE NOT c.em_lote), 0), 1)                AS pct_parada_7d,
  count(*) FILTER (WHERE NOT c.em_lote AND public.lead_sem_proximo_passo(c.id)) AS sem_proximo_passo,
  round(100.0 * count(*) FILTER (WHERE NOT c.em_lote AND public.lead_sem_proximo_passo(c.id))
        / NULLIF(count(*) FILTER (WHERE NOT c.em_lote), 0), 1)                AS pct_sem_passo
FROM carteira c
JOIN corretores co ON co.id = c.corretor_id
GROUP BY co.nome
ORDER BY carteira_ativa DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I5_I6_controle
SELECT 17 AS ordem, 'I5_I6_controle' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT * FROM public.v_higiene_resumo
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I7a
SELECT 18 AS ordem, 'I7a' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT
  to_char(date_trunc('month', l.pasta_montada_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes_brt,
  count(*) AS pastas_montadas,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.analises_credito ac WHERE ac.lead_id = l.id)) AS com_analise,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.analises_credito ac
                                  WHERE ac.lead_id = l.id AND ac.status = 'pendente'))          AS com_analise_pendente_docs,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.documentacoes d
                                  WHERE d.lead_id = l.id AND d.status = 'reprovado'
                                    AND d.updated_at > l.pasta_montada_em))                    AS com_doc_reprovado_depois,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.documentacao_versoes dv
                                  WHERE dv.lead_id = l.id AND dv.versao > 1
                                    AND dv.created_at > l.pasta_montada_em))                   AS com_reenvio_de_doc_depois
FROM public.leads l
WHERE l.deleted_at IS NULL AND l.pasta_montada_em IS NOT NULL
GROUP BY 1
ORDER BY 1
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I7b
SELECT 19 AS ordem, 'I7b' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
SELECT ac.status, count(*) AS linhas, count(DISTINCT ac.lead_id) AS leads,
       min(ac.created_at)::date AS primeira, max(ac.created_at)::date AS ultima
FROM public.analises_credito ac
GROUP BY ac.status
ORDER BY linhas DESC
  ) AS t) AS resultado
UNION ALL
-- ---------------------------------------------------------------- I8
SELECT 20 AS ordem, 'I8' AS bloco,
  (SELECT coalesce(json_agg(t), '[]'::json) FROM (
WITH params AS (
  SELECT now() - interval '30 days' AS ini, now() AS fim
),
perdas AS (
  SELECT t.lead_id, t.corretor_id, t.alterado_por, t.created_at,
         (SELECT max(public.funil_ordem(t2.para_status))
            FROM public.lead_status_transitions t2
           WHERE t2.lead_id = t.lead_id AND t2.created_at < t.created_at
             AND public.funil_ordem(t2.para_status) < 99)                       AS degrau_antes,
         (SELECT e.payload ->> 'motivo_categoria'
            FROM public.lead_eventos e
           WHERE e.lead_id = t.lead_id AND e.tipo = 'transicao_lead'
             AND e.payload ->> 'para_status' = 'perdido'
             AND e.created_at BETWEEN t.created_at - interval '5 seconds'
                                  AND t.created_at + interval '5 seconds'
           ORDER BY e.created_at DESC LIMIT 1)                                  AS categoria_no_evento
    FROM public.lead_status_transitions t, params pr
   WHERE t.para_status = 'perdido'
     AND t.created_at >= pr.ini AND t.created_at < pr.fim
)
SELECT
  CASE WHEN alterado_por IS NULL THEN 'automação (sem autor)'
       WHEN alterado_por = corretor_id THEN 'o próprio corretor'
       ELSE 'outra pessoa' END                                   AS quem_perdeu,
  COALESCE(categoria_no_evento, '(sem evento)')                  AS categoria_no_momento,
  count(*)                                                        AS perdas,
  count(*) FILTER (WHERE degrau_antes >= public.funil_ordem('qualificacao_corretor')) AS depois_de_qualificacao
FROM perdas
GROUP BY 1, 2
ORDER BY 1, perdas DESC
  ) AS t) AS resultado
ORDER BY ordem;
