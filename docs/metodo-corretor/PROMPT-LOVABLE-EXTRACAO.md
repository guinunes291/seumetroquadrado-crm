# Prompt para o Lovable — extração de dados do CRM SMQ

**Como usar:** copie tudo abaixo da linha e cole no chat do Lovable do projeto
`seumetroquadrado-crm`. Ele vai rodar as consultas no Supabase e devolver os resultados.
Copie a resposta inteira dele e me mande aqui.

**Por que só agregados:** nada abaixo pede nome, telefone, CPF ou e-mail de cliente. Os
números respondem tudo o que falta no estudo, e um dump com dados pessoais seria risco de
LGPD sem ganho nenhum de análise.

---

Preciso que você rode consultas **somente de leitura** no banco Supabase deste projeto e
me devolva os resultados. Isto é uma auditoria de dados — **não é um pedido de mudança**.

## Regras obrigatórias

1. **NÃO** crie, altere ou apague nada: nenhuma migration, nenhuma tabela, nenhuma
   coluna, nenhuma RPC, nenhum registro. **Apenas `SELECT`.**
2. **NÃO** altere código da aplicação. Nenhum arquivo do repositório deve ser tocado.
3. **NÃO** traga dados pessoais: nada de `nome`, `telefone`, `telefone_e164`, `email`,
   `cpf`, `observacoes` ou `conteudo` de interação. Só contagens e agregados. Onde eu
   peço corretor, use o **primeiro nome** apenas.
4. Devolva o resultado de **cada bloco** como uma **tabela markdown**, com o número do
   bloco no título. Se um bloco retornar zero linhas, escreva explicitamente
   `ZERO LINHAS` — isso é um resultado válido e importante para mim.
5. Se alguma consulta **der erro** (coluna ou tabela que não existe com esse nome),
   **não desista do bloco**: descubra o nome real, corrija e me diga exatamente o que
   mudou. Rode os blocos restantes de qualquer jeito.
6. No fim, me diga se alguma tabela citada aqui **não existe** no banco.

---

## BLOCO 0 — Inventário e volume das tabelas

```sql
SELECT 'leads' AS tabela, count(*) AS linhas FROM public.leads
UNION ALL SELECT 'leads_vivos', count(*) FROM public.leads
  WHERE deleted_at IS NULL AND na_lixeira = false
UNION ALL SELECT 'interacoes', count(*) FROM public.interacoes
UNION ALL SELECT 'tarefas', count(*) FROM public.tarefas
UNION ALL SELECT 'agendamentos', count(*) FROM public.agendamentos
UNION ALL SELECT 'vendas', count(*) FROM public.vendas
UNION ALL SELECT 'documentacoes', count(*) FROM public.documentacoes
UNION ALL SELECT 'chamadas', count(*) FROM public.chamadas
UNION ALL SELECT 'lead_eventos', count(*) FROM public.lead_eventos
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
ORDER BY 1;
```

---

## BLOCO 1 — VENDAS (a pergunta mais importante)

### 1a. Todas as vendas por status, sem filtro de data

```sql
SELECT status_venda, distrato, count(*) AS qtd,
       min(created_at)::date AS mais_antiga,
       max(created_at)::date AS mais_recente,
       round(sum(coalesce(valor_venda,0))::numeric, 2) AS vgv_total
  FROM public.vendas
 GROUP BY 1,2
 ORDER BY 3 DESC;
```

### 1b. Vendas por mês (12 meses)

```sql
SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
       count(*) AS vendas,
       count(*) FILTER (WHERE status_venda = 'aprovada')             AS aprovadas,
       count(*) FILTER (WHERE status_venda = 'pendente')             AS pendentes,
       count(*) FILTER (WHERE distrato)                              AS distratos,
       count(*) FILTER (WHERE corretor_id IS NULL)                   AS sem_corretor,
       round(sum(coalesce(valor_venda,0))::numeric, 2)               AS vgv
  FROM public.vendas
 WHERE created_at >= now() - interval '12 months'
 GROUP BY 1 ORDER BY 1;
```

### 1c. Vendas por corretor (12 meses, só primeiro nome)

```sql
SELECT split_part(coalesce(p.nome,'(sem corretor)'), ' ', 1) AS corretor,
       count(*) AS vendas,
       count(*) FILTER (WHERE v.status_venda = 'aprovada') AS aprovadas,
       round(sum(coalesce(v.valor_venda,0))::numeric, 2)   AS vgv
  FROM public.vendas v
  LEFT JOIN public.profiles p ON p.id = v.corretor_id
 WHERE v.created_at >= now() - interval '12 months'
 GROUP BY 1 ORDER BY 2 DESC;
```

### 1d. Leads marcados como venda × tabela de vendas

```sql
SELECT
  (SELECT count(*) FROM public.leads
    WHERE status IN ('contrato_fechado','pos_venda','ganho','vendido')
      AND deleted_at IS NULL)                                   AS leads_com_status_de_venda,
  (SELECT count(*) FROM public.vendas)                          AS linhas_em_vendas,
  (SELECT count(DISTINCT lead_id) FROM public.vendas
    WHERE lead_id IS NOT NULL)                                  AS leads_distintos_com_venda,
  (SELECT count(*) FROM public.leads l
    WHERE l.status IN ('contrato_fechado','pos_venda','ganho','vendido')
      AND l.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.vendas v WHERE v.lead_id = l.id))
                                                                AS status_de_venda_SEM_linha_em_vendas;
```

---

## BLOCO 2 — O REGISTRO DE ATIVIDADE (interações, tarefas, agendamentos)

### 2a. Volume por mês, 6 meses

```sql
SELECT to_char(date_trunc('month', d.dia), 'YYYY-MM') AS mes,
       count(*) FILTER (WHERE d.fonte='interacao')   AS interacoes,
       count(*) FILTER (WHERE d.fonte='tarefa')      AS tarefas_criadas,
       count(*) FILTER (WHERE d.fonte='agendamento') AS agendamentos_criados,
       count(*) FILTER (WHERE d.fonte='chamada')     AS chamadas,
       count(*) FILTER (WHERE d.fonte='documento')   AS documentos
  FROM (
    SELECT created_at AS dia, 'interacao'   AS fonte FROM public.interacoes
    UNION ALL SELECT created_at, 'tarefa'      FROM public.tarefas
    UNION ALL SELECT created_at, 'agendamento' FROM public.agendamentos
    UNION ALL SELECT criado_em,  'chamada'     FROM public.chamadas
    UNION ALL SELECT created_at, 'documento'   FROM public.documentacoes
  ) d
 WHERE d.dia >= now() - interval '6 months'
 GROUP BY 1 ORDER BY 1;
```

### 2b. Interações por tipo e direção (90 dias)

```sql
SELECT tipo, direcao, count(*) AS qtd, max(ocorreu_em)::date AS ultima
  FROM public.interacoes
 WHERE ocorreu_em >= now() - interval '90 days' AND deleted_at IS NULL
 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 30;
```

### 2c. Tarefas por status e tipo

```sql
SELECT status, tipo, count(*) AS qtd,
       count(*) FILTER (WHERE data_vencimento < now() AND status IN ('pendente','em_andamento')) AS vencidas
  FROM public.tarefas
 WHERE deleted_at IS NULL
 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 30;
```

### 2d. Agendamentos por tipo e status

```sql
SELECT tipo, status, auto_gerado, count(*) AS qtd,
       min(data_inicio)::date AS mais_antigo,
       max(data_inicio)::date AS mais_recente
  FROM public.agendamentos
 WHERE deleted_at IS NULL
 GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 30;
```

### 2e. Quantos leads têm cada tipo de registro (leads vivos com dono)

```sql
WITH base AS (
  SELECT id FROM public.leads
   WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NOT NULL
     AND status NOT IN ('perdido','contrato_fechado','pos_venda')
)
SELECT
  (SELECT count(*) FROM base)                                                AS leads_ativos_com_dono,
  (SELECT count(*) FROM base b WHERE EXISTS
     (SELECT 1 FROM public.interacoes i WHERE i.lead_id=b.id))               AS com_alguma_interacao,
  (SELECT count(*) FROM base b WHERE EXISTS
     (SELECT 1 FROM public.tarefas t WHERE t.lead_id=b.id))                  AS com_alguma_tarefa,
  (SELECT count(*) FROM base b WHERE EXISTS
     (SELECT 1 FROM public.agendamentos a WHERE a.lead_id=b.id))             AS com_algum_agendamento,
  (SELECT count(*) FROM base b WHERE EXISTS
     (SELECT 1 FROM public.documentacoes d WHERE d.lead_id=b.id))            AS com_algum_documento;
```

### 2f. Leads em `agendado` que NÃO têm agendamento

```sql
SELECT count(*) AS agendados_sem_agendamento
  FROM public.leads l
 WHERE l.status = 'agendado' AND l.deleted_at IS NULL AND l.na_lixeira = false
   AND NOT EXISTS (SELECT 1 FROM public.agendamentos a
                    WHERE a.lead_id = l.id AND a.deleted_at IS NULL);
```

---

## BLOCO 3 — FUNIL E CONVERSÃO REAL

### 3a. Coorte por mês de entrada × onde está hoje (6 meses)

```sql
SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS coorte,
       count(*)                                                        AS entraram,
       count(*) FILTER (WHERE status='aguardando_atendimento')          AS aguard_atend,
       count(*) FILTER (WHERE status='aguardando_retorno')              AS aguard_retorno,
       count(*) FILTER (WHERE status='qualificacao_corretor')           AS qualificacao,
       count(*) FILTER (WHERE status='em_atendimento')                  AS em_atendimento,
       count(*) FILTER (WHERE status='agendado')                        AS agendado,
       count(*) FILTER (WHERE status='visita_realizada')                AS visita,
       count(*) FILTER (WHERE status='analise_credito')                 AS analise,
       count(*) FILTER (WHERE status IN ('contrato_fechado','pos_venda')) AS venda,
       count(*) FILTER (WHERE status='perdido')                         AS perdido
  FROM public.leads
 WHERE deleted_at IS NULL AND created_at >= now() - interval '6 months'
 GROUP BY 1 ORDER BY 1;
```

### 3b. Conversão por origem de lead (6 meses)

```sql
SELECT coalesce(origem,'(sem origem)') AS origem,
       count(*) AS leads,
       count(*) FILTER (WHERE status IN ('agendado','visita_realizada','analise_credito','contrato_fechado','pos_venda')) AS chegou_ao_fundo,
       count(*) FILTER (WHERE status IN ('contrato_fechado','pos_venda')) AS vendas,
       count(*) FILTER (WHERE status='perdido') AS perdidos
  FROM public.leads
 WHERE deleted_at IS NULL AND created_at >= now() - interval '6 months'
 GROUP BY 1 ORDER BY 2 DESC LIMIT 25;
```

### 3c. Os tipos de evento que existem em `lead_eventos` (90 dias)

> Preciso saber se as **transições de etapa** estão sendo logadas. Se estiverem, dá para
> medir a conversão de verdade em vez de aproximar pelo status atual.

```sql
SELECT tipo, agente, count(*) AS qtd,
       min(created_at)::date AS de, max(created_at)::date AS ate
  FROM public.lead_eventos
 WHERE created_at >= now() - interval '90 days'
 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 40;
```

### 3d. Uma amostra ANONIMIZADA do payload de transição

```sql
SELECT tipo, agente, payload
  FROM public.lead_eventos
 WHERE tipo ILIKE '%transic%' OR tipo ILIKE '%status%' OR tipo ILIKE '%etapa%'
 ORDER BY created_at DESC LIMIT 5;
```

---

## BLOCO 4 — TEMPO ATÉ O PRIMEIRO CONTATO (SLA)

```sql
WITH primeira AS (
  SELECT l.id, l.data_distribuicao,
         (SELECT min(i.ocorreu_em) FROM public.interacoes i
           WHERE i.lead_id = l.id AND i.direcao = 'saida' AND i.deleted_at IS NULL) AS primeiro_toque
    FROM public.leads l
   WHERE l.deleted_at IS NULL AND l.data_distribuicao IS NOT NULL
     AND l.data_distribuicao >= now() - interval '90 days'
)
SELECT count(*)                                                        AS leads_distribuidos_90d,
       count(primeiro_toque)                                           AS com_1o_toque_registrado,
       round(100.0 * count(primeiro_toque) / nullif(count(*),0), 1)     AS pct_com_toque,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM primeiro_toque - data_distribuicao)/60)::numeric, 1) AS mediana_min,
       round(percentile_cont(0.9) WITHIN GROUP (
         ORDER BY extract(epoch FROM primeiro_toque - data_distribuicao)/60)::numeric, 1) AS p90_min
  FROM primeira;
```

---

## BLOCO 5 — COMPARECIMENTO EM VISITA

```sql
SELECT status, count(*) AS qtd
  FROM public.agendamentos
 WHERE tipo = 'visita' AND deleted_at IS NULL
   AND data_inicio BETWEEN now() - interval '180 days' AND now()
 GROUP BY 1 ORDER BY 2 DESC;
```

---

## BLOCO 6 — LEADS SEM CORRETOR NO MEIO DO FUNIL

### 6a. Quantos, por etapa

```sql
SELECT status, count(*) AS sem_corretor,
       round(avg(extract(day FROM now() - coalesce(
         greatest(ultima_interacao, ultimo_contato), created_at)))::numeric, 0) AS media_dias_parado
  FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NULL
   AND status NOT IN ('novo','perdido','contrato_fechado','pos_venda')
 GROUP BY 1 ORDER BY 2 DESC;
```

### 6b. Eles já tiveram dono? (o que os soltou)

```sql
SELECT count(*)                                                      AS orfaos,
       count(*) FILTER (WHERE corretor_anterior_id IS NOT NULL)      AS tinham_dono_antes,
       count(*) FILTER (WHERE import_batch_id IS NOT NULL)           AS vieram_de_importacao,
       count(*) FILTER (WHERE sdr_devolvido_em IS NOT NULL)          AS devolvidos_pelo_sdr,
       count(*) FILTER (WHERE tentativas_redistribuicao > 0)         AS ja_redistribuidos
  FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NULL
   AND status NOT IN ('novo','perdido','contrato_fechado','pos_venda');
```

---

## BLOCO 7 — MOTIVOS DE PERDA

```sql
SELECT coalesce(motivo_perda_categoria,'(sem categoria)') AS motivo,
       count(*) AS qtd,
       count(*) FILTER (WHERE data_perda IS NOT NULL) AS com_data_de_perda
  FROM public.leads
 WHERE status = 'perdido' AND deleted_at IS NULL
 GROUP BY 1 ORDER BY 2 DESC;
```

---

## BLOCO 8 — ATIVIDADE POR CORRETOR (30 dias, só primeiro nome)

```sql
SELECT split_part(p.nome,' ',1) AS corretor,
       p.presente,
       (SELECT count(*) FROM public.leads l WHERE l.corretor_id=p.id
          AND l.deleted_at IS NULL AND l.na_lixeira=false
          AND l.status NOT IN ('perdido','contrato_fechado','pos_venda'))       AS carteira_ativa,
       (SELECT count(*) FROM public.interacoes i WHERE i.autor_id=p.id
          AND i.created_at >= now() - interval '30 days')                       AS interacoes_30d,
       (SELECT count(*) FROM public.agendamentos a WHERE a.corretor_id=p.id
          AND a.created_at >= now() - interval '30 days' AND a.deleted_at IS NULL) AS agendamentos_30d,
       (SELECT count(*) FROM public.tarefas t WHERE t.corretor_id=p.id
          AND t.status='concluida' AND t.updated_at >= now() - interval '30 days') AS tarefas_concluidas_30d,
       (SELECT count(*) FROM public.chamadas c WHERE c.corretor_id=p.id
          AND c.criado_em >= now() - interval '30 days')                        AS chamadas_30d,
       (SELECT count(*) FROM public.vendas v WHERE v.corretor_id=p.id
          AND v.created_at >= now() - interval '30 days')                       AS vendas_30d
  FROM public.profiles p
 WHERE p.ativo = true
 ORDER BY 3 DESC NULLS LAST;
```

---

## BLOCO 9 — CONFIGURAÇÃO VIGENTE

```sql
SELECT chave, valor FROM public.gestao_config ORDER BY chave;
```

Se a tabela `gestao_config` tiver outra forma (por exemplo colunas soltas em vez de
chave/valor), me mande o conteúdo dela inteiro — ela não tem dado pessoal.

E, se existirem, me mande também:

```sql
SELECT * FROM public.distribuicao_settings;
SELECT * FROM public.higiene_config;
```

---

## BLOCO 10 — JOBS AGENDADOS

```sql
SELECT jobid, schedule, jobname, active
  FROM cron.job
 ORDER BY jobname;
```

Se não tiver permissão para ler `cron.job`, é só me dizer — não force.

---

## O que eu quero que você me devolva

Uma única resposta com:

1. O resultado de cada bloco, em tabela markdown, na ordem, com o número do bloco.
2. `ZERO LINHAS` explicitamente onde não houver resultado.
3. A lista de qualquer tabela ou coluna citada aqui que **não exista** no banco.
4. Qualquer consulta que você tenha precisado corrigir, com o antes e o depois.

**Não conserte nada que encontrar.** Se algo parecer errado no banco, só me aponte no
final, em texto. A decisão do que corrigir é minha.
