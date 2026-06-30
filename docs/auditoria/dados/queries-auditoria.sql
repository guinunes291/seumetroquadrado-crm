-- ============================================================================
-- AUDITORIA DE QUALIDADE DE DADOS — CRM Seu Metro Quadrado (SMQ)
-- Projeto Supabase (CRM, produção): rldnprwjlomjmjvinxuh
--
-- 100% LEITURA. Nenhum INSERT/UPDATE/DELETE/DDL. Pode rodar no SQL Editor do
-- Supabase ou via MCP (execute_sql). Cada bloco devolve uma contagem; troque o
-- LIMIT/SELECT por amostras quando quiser ver exemplos concretos.
--
-- Normalização de telefone usada aqui (espelha src/lib/external-supabase.server.ts):
--   d = só dígitos; se 10/11 dígitos -> '55'||d ; se 12/13 e começa com 55 -> d.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. INVENTÁRIO / VOLUMETRIA
-- ----------------------------------------------------------------------------

-- 0.1 Contagem de linhas por tabela do schema public (via estatísticas).
SELECT relname AS tabela, n_live_tup AS linhas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- 0.2 Leads: totais e fatias operacionais.
SELECT
  count(*)                                                    AS total,
  count(*) FILTER (WHERE deleted_at IS NULL AND na_lixeira = false) AS ativos,
  count(*) FILTER (WHERE na_lixeira = true)                   AS na_lixeira,
  count(*) FILTER (WHERE deleted_at IS NOT NULL)              AS soft_deleted
FROM leads;


-- ----------------------------------------------------------------------------
-- 1. DUPLICATAS  (somente leads ativos)
-- ----------------------------------------------------------------------------

-- Helper inline: leads ativos com telefone normalizado.
-- 1.1 Duplicatas por telefone normalizado (GLOBAL): nº de grupos e de linhas excedentes.
WITH n AS (
  SELECT id, projeto_id, lower(btrim(coalesce(email,''))) AS email_n,
         regexp_replace(coalesce(telefone,''), '\D', '', 'g') AS d
  FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
), norm AS (
  SELECT *, CASE
    WHEN length(d) IN (10,11) THEN '55'||d
    WHEN length(d) IN (12,13) AND left(d,2)='55' THEN d
    ELSE d END AS tel_norm
  FROM n
)
SELECT
  count(*) FILTER (WHERE c > 1)            AS grupos_duplicados,
  coalesce(sum(c - 1) FILTER (WHERE c > 1), 0) AS linhas_excedentes
FROM (SELECT tel_norm, count(*) c FROM norm WHERE tel_norm <> '' GROUP BY tel_norm) g;

-- 1.2 Duplicatas por telefone normalizado DENTRO DO MESMO projeto_id
--     (é o que a constraint UNIQUE parcial proposta vai impedir).
WITH n AS (
  SELECT id, projeto_id, regexp_replace(coalesce(telefone,''), '\D', '', 'g') AS d
  FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
), norm AS (
  SELECT *, CASE
    WHEN length(d) IN (10,11) THEN '55'||d
    WHEN length(d) IN (12,13) AND left(d,2)='55' THEN d
    ELSE d END AS tel_norm
  FROM n
)
SELECT count(*) FILTER (WHERE c > 1) AS grupos, coalesce(sum(c-1) FILTER (WHERE c>1),0) AS excedentes
FROM (SELECT projeto_id, tel_norm, count(*) c FROM norm WHERE tel_norm <> '' GROUP BY projeto_id, tel_norm) g;

-- 1.3 Duplicatas por e-mail (normalizado lower/trim, ignorando vazios).
SELECT count(*) FILTER (WHERE c>1) AS grupos, coalesce(sum(c-1) FILTER (WHERE c>1),0) AS excedentes
FROM (
  SELECT lower(btrim(email)) e, count(*) c
  FROM leads WHERE deleted_at IS NULL AND na_lixeira = false AND coalesce(btrim(email),'') <> ''
  GROUP BY lower(btrim(email))
) g;

-- 1.4 Amostra de grupos duplicados por telefone (para inspeção visual).
WITH norm AS (
  SELECT id, nome, projeto_id, corretor_id, status, created_at,
         CASE WHEN length(regexp_replace(coalesce(telefone,''),'\D','','g')) IN (10,11)
              THEN '55'||regexp_replace(coalesce(telefone,''),'\D','','g')
              ELSE regexp_replace(coalesce(telefone,''),'\D','','g') END AS tel_norm
  FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
)
SELECT tel_norm, count(*) c, array_agg(id ORDER BY created_at) ids, array_agg(nome ORDER BY created_at) nomes
FROM norm WHERE tel_norm <> '' GROUP BY tel_norm HAVING count(*) > 1
ORDER BY c DESC LIMIT 25;

-- 1.5 Conferência cruzada com a função nativa de detecção (se existir).
-- SELECT * FROM detectar_duplicatas_leads() LIMIT 50;


-- ----------------------------------------------------------------------------
-- 2. CAMPOS OBRIGATÓRIOS VAZIOS  (leads ativos)
-- ----------------------------------------------------------------------------
SELECT
  count(*)                                                          AS ativos,
  count(*) FILTER (WHERE coalesce(btrim(nome),'') = '')             AS sem_nome,
  count(*) FILTER (WHERE coalesce(btrim(telefone),'') = '')         AS sem_telefone,
  count(*) FILTER (WHERE coalesce(btrim(email),'') = '')            AS sem_email,
  count(*) FILTER (WHERE projeto_id IS NULL)                        AS sem_projeto,
  count(*) FILTER (WHERE coalesce(btrim(faixa_mcmv),'') = '')       AS sem_faixa_mcmv,
  count(*) FILTER (WHERE corretor_id IS NULL)                       AS sem_corretor,
  count(*) FILTER (WHERE corretor_id IS NULL AND status <> 'novo')  AS sem_corretor_fora_de_novo,
  count(*) FILTER (WHERE renda_estimada IS NULL
                     AND coalesce(btrim(renda_informada),'') = '')  AS sem_renda
FROM leads WHERE deleted_at IS NULL AND na_lixeira = false;

-- 2.1 Vazios por estágio do funil.
SELECT status,
  count(*) total,
  count(*) FILTER (WHERE corretor_id IS NULL)              sem_corretor,
  count(*) FILTER (WHERE projeto_id IS NULL)               sem_projeto,
  count(*) FILTER (WHERE coalesce(btrim(email),'')='')     sem_email,
  count(*) FILTER (WHERE coalesce(btrim(faixa_mcmv),'')='') sem_faixa
FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
GROUP BY status ORDER BY total DESC;


-- ----------------------------------------------------------------------------
-- 3. STATUS / ESTÁGIO INCONSISTENTE
-- ----------------------------------------------------------------------------

-- 3.1 Distribuição por status (status é enum: valor "fora do padrão" é impossível,
--     mas os LEGADOS fora do funil são o alvo: qualificado/proposta_enviada/pos_venda).
SELECT status, count(*) FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
GROUP BY status ORDER BY 2 DESC;

-- 3.2 Distribuição do "estado" (máquina do agente WhatsApp) e cruzamento com status.
SELECT estado, count(*) FROM leads WHERE deleted_at IS NULL AND na_lixeira = false GROUP BY estado ORDER BY 2 DESC;
SELECT status, estado, count(*) FROM leads WHERE deleted_at IS NULL AND na_lixeira = false
GROUP BY status, estado ORDER BY 3 DESC LIMIT 50;

-- 3.3 Campos texto-livre paralelos ao funil (etapa/fase): valores distintos e frequência.
SELECT 'etapa' campo, etapa valor, count(*) FROM leads GROUP BY etapa
UNION ALL SELECT 'fase', fase, count(*) FROM leads GROUP BY fase
ORDER BY 1, 3 DESC;

-- 3.4 Leads "presos": ganharam corretor mas seguem em aguardando_atendimento.
SELECT count(*) FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND status = 'aguardando_atendimento' AND corretor_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 4. ÓRFÃOS  (foco nas colunas SEM FK declarada: corretor_id, beneficiario_id...)
-- ----------------------------------------------------------------------------

-- 4.1 leads.corretor_id apontando para profile inexistente.
SELECT count(*) FROM leads l
WHERE l.corretor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = l.corretor_id);

-- 4.2 leads.corretor_anterior_id órfão (coluna de auditoria, sem FK).
SELECT count(*) FROM leads l
WHERE l.corretor_anterior_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = l.corretor_anterior_id);

-- 4.3 leads atribuídos a corretor INATIVO/descredenciado.
SELECT count(*) FROM leads l
JOIN profiles p ON p.id = l.corretor_id
WHERE l.deleted_at IS NULL AND l.na_lixeira = false
  AND (p.ativo = false OR p.data_descredenciamento IS NOT NULL);

-- 4.4 leads.projeto_id órfão (deveria ser 0 se a FK leads_projeto_id_fkey está ativa).
SELECT count(*) FROM leads l
WHERE l.projeto_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM projetos pr WHERE pr.id = l.projeto_id);

-- 4.5 vendas sem lead, ou com corretor inexistente.
SELECT
  count(*) FILTER (WHERE lead_id IS NULL)                                            AS venda_sem_lead,
  count(*) FILTER (WHERE corretor_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = vendas.corretor_id))   AS venda_corretor_orfao
FROM vendas;

-- 4.6 comissões sem venda, sem lead, ou com beneficiário inexistente.
SELECT
  count(*) FILTER (WHERE venda_id IS NULL)        AS comissao_sem_venda,
  count(*) FILTER (WHERE lead_id IS NULL)         AS comissao_sem_lead,
  count(*) FILTER (WHERE beneficiario_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = comissoes.beneficiario_id)) AS comissao_benef_orfao
FROM comissoes;

-- 4.7 agendamentos / interações / tarefas com corretor_id órfão (colunas sem FK).
SELECT 'agendamentos' tab, count(*) FROM agendamentos a
  WHERE a.corretor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id=a.corretor_id)
UNION ALL
SELECT 'interacoes', count(*) FROM interacoes i
  WHERE i.corretor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id=i.corretor_id)
UNION ALL
SELECT 'tarefas', count(*) FROM tarefas t
  WHERE t.corretor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id=t.corretor_id);


-- ----------------------------------------------------------------------------
-- 5. NORMALIZAÇÃO  (leads ativos)
-- ----------------------------------------------------------------------------

-- 5.1 Telefones fora do padrão E.164-BR (não têm 10/11 dígitos, nem 12/13 com '55').
SELECT count(*) AS telefones_invalidos
FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND NOT (
    length(regexp_replace(coalesce(telefone,''),'\D','','g')) IN (10,11)
    OR (length(regexp_replace(coalesce(telefone,''),'\D','','g')) IN (12,13)
        AND left(regexp_replace(coalesce(telefone,''),'\D','','g'),2)='55')
  );

-- 5.2 Telefones com formatação não-canônica (têm caracteres não-numéricos = precisam normalizar).
SELECT count(*) FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND telefone ~ '\D';

-- 5.3 Nomes em CAIXA ALTA ou com espaços extras / duplos.
SELECT
  count(*) FILTER (WHERE nome = upper(nome) AND nome ~ '[A-Za-zÀ-ÿ]') AS nome_caixa_alta,
  count(*) FILTER (WHERE nome <> btrim(nome) OR nome ~ '\s{2,}')      AS nome_espacos
FROM leads WHERE deleted_at IS NULL AND na_lixeira = false;

-- 5.4 E-mails preenchidos porém inválidos (regex simples, mesma de validators.ts).
SELECT count(*) FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND coalesce(btrim(email),'') <> ''
  AND email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

-- 5.5 faixa_mcmv: valores brutos distintos (esperado depois: só F1..F4 ou NULL).
SELECT faixa_mcmv, count(*) FROM leads GROUP BY faixa_mcmv ORDER BY 2 DESC;

-- 5.6 renda_informada / entrada_disponivel guardadas como texto não-numérico.
SELECT
  count(*) FILTER (WHERE coalesce(btrim(renda_informada),'')<>'' AND btrim(renda_informada) !~ '^[0-9.,]+$') AS renda_texto,
  count(*) FILTER (WHERE coalesce(btrim(entrada_disponivel),'')<>'' AND btrim(entrada_disponivel) !~ '^[0-9.,]+$') AS entrada_texto
FROM leads WHERE deleted_at IS NULL AND na_lixeira = false;

-- 5.7 CPFs preenchidos com tamanho inválido (≠ 11 dígitos).
SELECT count(*) FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND coalesce(btrim(cpf),'') <> ''
  AND length(regexp_replace(cpf,'\D','','g')) <> 11;


-- ----------------------------------------------------------------------------
-- 6. LEADS PARADOS  (ativos, por estágio e faixa de dias sem interação)
-- ----------------------------------------------------------------------------
SELECT status,
  count(*) total,
  count(*) FILTER (WHERE coalesce(ultima_interacao, created_at) < now() - interval '3 days')  AS parados_3d,
  count(*) FILTER (WHERE coalesce(ultima_interacao, created_at) < now() - interval '7 days')  AS parados_7d,
  count(*) FILTER (WHERE coalesce(ultima_interacao, created_at) < now() - interval '15 days') AS parados_15d,
  count(*) FILTER (WHERE coalesce(ultima_interacao, created_at) < now() - interval '30 days') AS parados_30d
FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND status NOT IN ('contrato_fechado','perdido','pos_venda')
GROUP BY status ORDER BY total DESC;

-- 6.1 Follow-up vencido (proximo_followup no passado, lead ainda aberto).
SELECT count(*) FROM leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND proximo_followup IS NOT NULL AND proximo_followup < now()
  AND status NOT IN ('contrato_fechado','perdido','pos_venda');


-- ----------------------------------------------------------------------------
-- 7. ENRIQUECIMENTO POSSÍVEL  (backfills determinísticos — sem inventar dado)
-- ----------------------------------------------------------------------------

-- 7.1 projeto_nome vazio mas projeto_id setado (dá para preencher a partir de projetos).
SELECT count(*) FROM leads l
WHERE l.projeto_id IS NOT NULL AND coalesce(btrim(l.projeto_nome),'') = '';

-- 7.2 ultima_interacao nula mas existem interações (dá para preencher com max(created_at)).
SELECT count(*) FROM leads l
WHERE l.ultima_interacao IS NULL
  AND EXISTS (SELECT 1 FROM interacoes i WHERE i.lead_id = l.id);

-- 7.3 construtora vazia mas projeto tem construtora.
SELECT count(*) FROM leads l
JOIN projetos pr ON pr.id = l.projeto_id
WHERE coalesce(btrim(l.construtora),'') = '' AND coalesce(btrim(pr.construtora),'') <> '';


-- ----------------------------------------------------------------------------
-- 8. LGPD
-- ----------------------------------------------------------------------------
SELECT
  count(*)                                                  AS ativos,
  count(*) FILTER (WHERE consentimento_lgpd IS NULL)        AS consentimento_nulo,
  count(*) FILTER (WHERE consentimento_lgpd = false)        AS consentimento_false,
  count(*) FILTER (WHERE opt_out = true)                    AS opt_out,
  count(*) FILTER (WHERE coalesce(btrim(cpf),'') <> '')     AS com_cpf,
  count(*) FILTER (WHERE renda_estimada IS NOT NULL
                     OR coalesce(btrim(renda_informada),'') <> '') AS com_renda
FROM leads WHERE deleted_at IS NULL AND na_lixeira = false;

-- 8.1 Opt-out NÃO respeitado: lead com opt_out=true que recebeu interação de SAÍDA depois.
--     (ajuste o nome da coluna de data se necessário: created_at de interacoes.)
SELECT count(DISTINCT l.id) AS optout_contatado_apos
FROM leads l
JOIN interacoes i ON i.lead_id = l.id
WHERE l.opt_out = true
  AND i.direcao = 'saida'
  AND i.created_at > coalesce(l.updated_at, l.created_at) - interval '0 day';

-- 8.2 Opt-out porém ainda distribuído a um corretor (deveria estar encerrado).
SELECT count(*) FROM leads
WHERE opt_out = true AND corretor_id IS NOT NULL
  AND deleted_at IS NULL AND na_lixeira = false;


-- ----------------------------------------------------------------------------
-- 9. SAÚDE DO SCHEMA  (índices, constraints, RLS)
-- ----------------------------------------------------------------------------

-- 9.1 Há UNIQUE em telefone/telefone_normalizado nos leads? (espera-se que NÃO hoje.)
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='leads'
ORDER BY indexname;

-- 9.2 Tabelas SEM RLS habilitado (lacuna de segurança).
SELECT n.nspname AS schema, c.relname AS tabela, c.relrowsecurity AS rls_on
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relrowsecurity, c.relname;

-- 9.3 Colunas FK candidatas sem índice (gargalo em JOIN/filtro). Conferir corretor_id,
--     equipe_id, venda_id, etc. Lista todos os índices por tabela para checagem manual:
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('leads','vendas','comissoes','agendamentos','interacoes','tarefas','distribution_log')
ORDER BY tablename, indexname;

-- 9.4 FKs declaradas e sua ação ON DELETE (validar política para auth.users/profiles).
SELECT conrelid::regclass AS tabela, conname, confdeltype AS on_delete,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype='f' AND connamespace='public'::regnamespace
ORDER BY conrelid::regclass::text;
