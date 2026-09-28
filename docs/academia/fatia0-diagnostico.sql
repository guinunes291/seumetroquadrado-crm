-- =============================================================================
-- Academia SMQ · Fatia 0 · Diagnóstico (SOMENTE LEITURA)
--
-- ONDE RODAR: SQL Editor do Supabase do CRM (projeto rldnprwjlomjmjvinxuh).
-- COMO RODAR: um bloco por vez (cada bloco termina em ';'). Me devolva a saída
--             de cada um, na ordem. Nenhum bloco escreve: todos são SELECT e as
--             funções chamadas são STABLE/IMMUTABLE (funil_ordem,
--             lead_sem_proximo_passo, _minutos_uteis_entre).
-- VALIDAÇÃO: todos os blocos rodaram sem erro contra o replay das 401
--            migrations do repo (Postgres 16, scripts/db-harness), e os blocos
--            de indicador foram checados com dados sintéticos plantados
--            (controle positivo do próprio SQL). Produção pode ter objetos
--            fora de migration: se algum bloco der erro de objeto inexistente,
--            isso já é um achado. Me mande o erro.
--
-- Parâmetros: cada bloco de indicador abre com um CTE "params". A janela
-- padrão é 30 dias. Mude ali, não no meio da consulta.
-- =============================================================================


-- =============================================================================
-- BLOCO 0 · O instrumento está enxergando?
-- =============================================================================

-- 0.1 · Caminho independente do MCP.
-- O MCP devolve 0 agendamentos e 0 vendas em ago-set/2026. Aqui é contagem
-- direta nas tabelas. Se estas linhas vierem > 0, o defeito está no MCP, não
-- na operação, e fica provado que o MCP não serve de fonte para a Academia.
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
ORDER BY 2, 1;


-- 0.2 · O histórico de status (lead_status_transitions) cobre o funil?
-- O gatilho grava só em UPDATE de status. Lead que NASCE num status não deixa
-- linha. Aqui cruzo com um caminho independente: a tabela agendamentos.
-- Se "com_transicao" for bem menor que o total, "passou por agendado" lido só
-- pelo histórico vai subcontar, e a Academia precisa ler os dois caminhos.
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
JOIN public.leads l ON l.id = ag.lead_id;


-- 0.3 · Escrita em lote no histórico de status (regra 5).
-- Instantes com 20+ transições no mesmo segundo nos últimos 120 dias. Se
-- aparecerem blocos grandes com alterado_por nulo, são carga/automação e
-- precisam sair do cálculo de taxa.
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
LIMIT 30;


-- 0.4 · Status legados ainda recebem tráfego?
-- A especificação usa 'qualificado' e 'proposta_enviada'. Em funil_ordem os
-- dois são legados (qualificado = em_atendimento; proposta_enviada fica no
-- mesmo degrau de visita_realizada). Se vierem ~0, indicador que depende
-- deles mede nada.
SELECT
  t.para_status,
  count(*) FILTER (WHERE t.created_at >= now() - interval '30 days')  AS ult_30d,
  count(*) FILTER (WHERE t.created_at >= now() - interval '90 days')  AS ult_90d,
  count(*)                                                             AS desde_sempre,
  public.funil_ordem(t.para_status)                                    AS degrau_funil
FROM public.lead_status_transitions t
GROUP BY t.para_status
ORDER BY degrau_funil, t.para_status;


-- 0.5 · pg_cron: o que está agendado DE VERDADE (camada de execução).
-- Nas migrations não existe job às 04:30 nem função sla_*. A doc da Higiene
-- (3.1) já registrou job criado fora de migration, então só esta consulta
-- responde. ATENÇÃO: pg_cron no Supabase roda em UTC; 04:30 BRT = 07:30 UTC.
SELECT
  j.jobid, j.jobname, j.schedule, j.active,
  left(regexp_replace(j.command, '\s+', ' ', 'g'), 140) AS comando
FROM cron.job j
ORDER BY j.schedule, j.jobname;


-- 0.6 · Extensões e fuso do agendador.
SELECT e.extname, e.extversion, current_setting('cron.timezone', true) AS cron_timezone
FROM pg_extension e
WHERE e.extname IN ('pg_cron', 'pg_net');


-- 0.7 · Objetos que a Academia assume ou não pode tocar. Existem em produção?
-- (compara a camada de execução com o que está no repo)
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
ORDER BY p.proname;


-- 0.8 · Já existe algo "academia_*" no banco? (tabela, view)
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'academia%';


-- 0.9 · O gate de onboarding da roleta v2 está ligado?
-- _apto_extra_v2 tira da roleta quem tem profiles.onboarding_concluido_em
-- nulo, mas só quando o modelo v2 está ativo. A Academia desenha um "Apto"
-- próprio; preciso saber se o gate atual já bloqueia gente hoje.
SELECT
  public._modelo_v2_ativo() AS modelo_v2_ativo,
  count(*) FILTER (WHERE rp.ativo)                                              AS participacoes_ativas,
  count(*) FILTER (WHERE rp.ativo AND p.onboarding_concluido_em IS NULL)        AS ativas_sem_onboarding,
  count(*) FILTER (WHERE rp.ativo AND p.onboarding_concluido_origem = 'manual') AS ativas_onboarding_manual
FROM public.roleta_participantes rp
JOIN public.profiles p ON p.id = rp.corretor_id;


-- =============================================================================
-- BLOCO P · Perfis. Eu mostro sinais; você decide quem entra na Academia.
-- =============================================================================
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
ORDER BY p.status_conta, p.nome;


-- =============================================================================
-- BLOCO I · Indicadores da Fatia 5. Cada um traz o controle positivo junto.
--
-- Base comum: "corretor elegível" = papel corretor + conta ativa + não é bot
-- de serviço + não é identidade MCP. É PROVISÓRIO: a lista final é a sua.
-- =============================================================================

-- I1 · tempo_primeiro_contato (maior é pior). Exibido em hh:mm de minutos
--      ÚTEIS (08:00-19:00 BRT, mesma régua do SLA de 15 min).
-- Posse = do registro em distribution_log até a próxima atribuição do lead.
-- Primeiro contato = o mais cedo entre 4 caminhos, todos DO PRÓPRIO corretor
-- e dentro da posse: interação real (exclui mudanca_status e nota), chamada
-- de saída, mensagem de saída, e saída de aguardando_atendimento (definição
-- do SLA). I1a mostra quanto cada caminho enxerga (controle). I1b é o indicador.
-- I1a · Controle: por gatilho, quanto cada caminho enxerga.
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
ORDER BY atribuicoes DESC;


-- I1b · O indicador: por corretor, sem o estoque reciclado. Mediana só entre
-- as atribuições com contato; pct_sem_contato_registrado mostra o resto.
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
ORDER BY ag.atribuicoes DESC;


-- I2 · taxa_agendamento (menor é pior).
-- Coorte MADURA: primeira atribuição do lead a ESTE corretor entre 37 e 7 dias
-- atrás (7 dias de maturação: lead que chegou ontem não teve tempo de agendar).
-- "Passou por agendado" com este corretor, por 3 caminhos independentes:
--   T = transição para agendado ou além com corretor_id = ele (histórico)
--   A = agendamento de visita dele para o lead (tabela agendamentos)
--   S = status atual agendado ou além e o lead ainda é dele (piso, igual à
--       régua de metrics.funil_coorte_mensal)
-- A saída mostra quanto cada caminho acha sozinho: é o controle.
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
ORDER BY leads_coorte DESC;


-- I3 · taxa_comparecimento (menor é pior).
-- Régua da casa desde 31/07: visita é validada POR AGENDAMENTO
-- (realizado / nao_compareceu), contada na data da visita. Sintéticos
-- (auto_gerado) ficam fora: nascem "realizado" e inflariam a taxa.
-- "pendente_validacao" = visita que já passou e ninguém validou. Se for
-- grande, a taxa daquele corretor não é confiável e a tela tem que dizer.
-- Ao lado, a definição da especificação (histórico de status) para comparar.
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
ORDER BY realizadas DESC NULLS LAST;


-- I4 · taxa_visita_para_avanco (menor é pior).
-- Coorte: visitas validadas como realizadas entre 44 e 14 dias atrás (14 dias
-- de maturação para a pasta andar). "Avançou" por 4 caminhos independentes:
--   H = transição para analise_credito ou além, depois da visita
--   P = pasta montada (leads.pasta_montada_em) depois da visita
--   C = linha em analises_credito criada depois da visita
--   R = proposta criada depois da visita (tabela propostas)
-- Não uso proposta_enviada do histórico: em funil_ordem ela está no MESMO
-- degrau da visita (6), então "chegou a proposta_enviada" não é avanço.
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
ORDER BY visitas_coorte DESC;


-- I5 + I6 · pct_carteira_parada e pct_sem_proximo_passo (maior é pior).
-- Retrato de agora. Mesmas peças da casa:
--   relógio  = COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)  (Higiene 2.2)
--   formação = cadencia_etapa D0..D3, conta como prospecção            (carteira_stats_por_corretor_v1)
--   lote     = 50+ leads no mesmo segundo do relógio, calculado sobre a
--              tabela INTEIRA, não só sobre os vivos                   (Higiene 4.1)
--   sem passo = lead_sem_proximo_passo(id)                            (fonte única de 3 telas)
-- Mostro "parado" em 3 réguas porque a casa tem 3: 5 dias (Higiene),
-- 7 dias (especificação da Academia) e 7/30 por fase (Carteira Ativa).
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
ORDER BY carteira_ativa DESC;


-- I5/I6 · Controle positivo: a mesma partição tem que bater com a tela da
-- Higiene. Se "vivos_parados_5d_higiene" daqui divergir de
-- v_higiene_resumo, o recorte está errado antes de virar indicador.
SELECT * FROM public.v_higiene_resumo;


-- I7 · taxa_pasta_devolvida (maior é pior). NÃO achei a fonte.
-- "Pasta" existe como marco (leads.pasta_montada_em, 3+ docs resolvidos,
-- desde 31/07). "Devolução/pendência" não existe como evento: documentacoes
-- guarda só o status atual. Abaixo, o que existe, para você me dizer se
-- algum destes É a devolução de verdade ou se ela mora fora do CRM.
-- 7a · Pastas montadas por mês e quantas têm análise registrada.
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
ORDER BY 1;

-- 7b · Status das análises de crédito (a ÚLTIMA linha por lead é o estado).
SELECT ac.status, count(*) AS linhas, count(DISTINCT ac.lead_id) AS leads,
       min(ac.created_at)::date AS primeira, max(ac.created_at)::date AS ultima
FROM public.analises_credito ac
GROUP BY ac.status
ORDER BY linhas DESC;


-- I8 · taxa_perda_por_qualificacao (maior é pior).
-- Perda lida em "passou por" (transição para perdido), com a categoria
-- gravada NO MOMENTO da perda (lead_eventos, payload.motivo_categoria), não
-- o rótulo atual do lead, que é sobrescrito quando o SDR recicla perdidos.
-- Separo quem perdeu: o próprio corretor, automação (sem autor) ou outra
-- pessoa (gestor). Só a primeira é decisão do corretor.
-- ATENÇÃO: transicionar_lead grava 'outro' quando ninguém escolhe. 'outro'
-- está inflado por construção.
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
ORDER BY 1, perdas DESC;
