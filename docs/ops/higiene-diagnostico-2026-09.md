# Higiene do Funil — diagnóstico medido (11–12/09/2026)

Registro das medições que sustentam a tela `/higiene-funil` (Fatia 1, PR #184) e o
desenho do motor (Fatia 2). Cada número aqui foi medido no banco de produção, não
estimado. Onde uma conclusão anterior se provou errada, o erro ficou registrado — a
correção vale mais que a aparência de acerto.

## 1. O quadro

Medido em 12/09/2026 ~01:00 UTC, via `v_higiene_resumo` e `v_higiene_base`.

| Medida                             |             Valor |
| ---------------------------------- | ----------------: |
| Leads vivos                        |            55.435 |
| Parados (5+ dias sem movimento)    |    32.627 (58,9%) |
| — abandono real (tocado, sem lote) |            18.982 |
| — lote **e** nunca tocado          |            12.714 |
| — lote, mas tocado                 |               927 |
| — nunca tocado, sem lote           |             **4** |
| Fila de ação                       | 1.230 (2 em lote) |

A partição fecha exata: `18.982 + 12.714 + 927 + 4 = 32.627`.

### 1.1 A fila de ação

| Prio | Fase                    | Leads | Em lote | % da fase parada |
| :--: | ----------------------- | ----: | ------: | ---------------: |
|  P1  | `analise_credito`       |   124 |       1 |        **92,5%** |
|  P1  | `visita_realizada`      |    29 |       0 |                — |
|  P2  | `agendado`              |    58 |       0 |                — |
|  P3  | `aguardando_retorno`    |   587 |       1 |        **85,4%** |
|  P3  | `qualificacao_corretor` |   432 |       0 |        **90,8%** |

`analise_credito` converte 39,1% para contrato fechado — a passagem mais saudável do
funil — e está 92,5% parada. É o item mais caro da operação hoje.

## 2. Os quatro achados que mudaram o desenho

### 2.1 `temperatura` é derivada, e filtrar por ela cegava a tela

`recalcular_temperatura_leads` roda a cada 10 min e define `quente` como estar em
`agendado`/`visita_realizada`/`analise_credito` **ou** ter interação nas últimas 24h.
Consequências:

- **"morno e parado 7+ dias" é impossível por construção** — o zero que aparecia no
  diagnóstico original era tautologia, não medição.
- Filtrar a fila por `temperatura='quente'` escondia **1.019** leads parados em
  `aguardando_retorno` / `qualificacao_corretor`, contra 211 que a fila mostrava.
  Escondia 5x mais do que mostrava, e justamente as fases do estrangulamento.

Medido duas vezes por caminhos independentes, com 4 dias de diferença: 1.018 e 1.019.

**Decisão:** a fila filtra por **fase**. `temperatura` segue exposta como contexto.

### 2.2 O relógio: `GREATEST`, não `COALESCE` encadeado

Com coalesce, um lead com `ultima_interacao` de 40 dias e `ultimo_contato` de ontem
aparecia como "parado há 40 dias". Reproduzido no harness; hoje é regressão em
`tests/db/higiene-funil.test.ts`.

Forma final: `COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)`.
Não é `ultima_atividade_em` (nasceu `NOT NULL DEFAULT now()` em `20260826120000`, régua
declaradamente não-retroativa: toda a base anterior a 26/08 tem o mesmo carimbo).
Não é `updated_at` (importação em massa mexe nele).

**Limite honesto:** `transicionar_lead` grava `ultima_interacao = now()` em toda mudança
de status. A métrica é _tempo sem movimento no sistema_, não _tempo sem contato_. A UI
rotula "sem movimento".

### 2.3 Escrita em lote: 42% do denominador, 0,16% da fila

12.995 leads com timestamp idêntico ao segundo em 2026-07-26 (6.708 às 16:59:54 e 6.287
às 17:01:23), atribuídos a 2 corretores. No total, 13.641 leads com relógio de lote.

Estão empoçados em `aguardando_atendimento` e `em_atendimento` — fases sem ação. A fila
de 1.230 tem só 2. **A fila está limpa; o denominador não.**

### 2.4 "Nunca tocado" e "importação" são o mesmo conjunto

Dos 12.718 leads nunca tocados, **12.714 são escrita em lote — 99,97%**. Só **4** leads
nunca tocados têm relógio próprio.

Não existem duas populações. Não há um problema separado de "a distribuição não
entregou": há uma importação de julho que nunca foi trabalhada.

**Consequência para o motor:** a trava de `nunca_tocado` protege sozinha 4 leads. A
proteção real dos 12.718 vem inteiramente da trava de `escrita_em_lote` — um único
predicado. Ver risco em 4.1.

## 3. Correções de conclusões erradas

Duas conclusões desta investigação se provaram falsas. As duas pelo mesmo erro: ler a
camada de **migrations ou nomes de job** e afirmar sobre a camada de **execução**.

### 3.1 "`arquivar_leads_sem_contato_30d` não está agendada" — ERRADO

Ela **está** agendada (`0 6 * * *`, ativa). A evidência usada foi grep em 351 migrations,
onde nenhum `cron.schedule` a referencia — o job foi criado fora de migration.

O que salvou a conclusão prática: o corpo da função é um stub `RETURN 0` desde
17/07/2026. Não é arma carregada, é gatilho travado. Ainda assim deve ser aposentada:
um job diário chamado "arquivar leads sem contato" que não arquiva nada é uma mentira
ativa no agendador.

### 3.2 "A SLA de 15 minutos não roda automaticamente" — ERRADO

Não existe job com o nome dela, e disso concluiu-se que só rodava sob demanda pelo badge
da tela. **Ela roda a cada 5 minutos.** `redistribuir_sla_webhook()` é chamada de dentro
de `processar_distribuicao_automatica()` (`20260904102000_sdr_motor.sql:1594`, a mais
recente das 8 definições), que está agendada como `distribuicao-auto`, `*/5 * * * *`.

## 4. Riscos abertos

### 4.1 🔴 `escrita_em_lote` se desfaz sozinho conforme o bloco encolhe

Em `v_higiene_base` a janela é calculada **depois** do filtro de vivo. Conforme leads
saem do conjunto vivo, o bloco encolhe — e ao cruzar `lote_min_leads` para baixo, todos
os remanescentes perdem a proteção de uma vez.

Para a tela isso é correto. **Para o motor é defeito de segurança.** Blocos medidos que
estão perto do limiar de 50:

| Bloco            | Leads | Distância do limiar |
| ---------------- | ----: | ------------------: |
| 2026-09-11 20:20 |    58 |                   8 |
| 2026-09-11 21:20 |    56 |                   6 |
| 2026-09-09 00:40 |    60 |                  10 |

**Exigência para a Fatia 2b:** o motor calcula a detecção de lote sobre a tabela
`leads` inteira (só `deleted_at IS NULL`), não sobre o conjunto vivo, e registra as
duas leituras no log.

### 4.2 A segurança do motor depende de uma linha de config

`lote_min_leads = 50` é o que protege 13.641 leads. Um `UPDATE higiene_config SET
lote_min_leads = 10000` os torna elegíveis instantaneamente, sem tocar em nenhuma regra
e sem rastro. **O log de execução precisa carimbar a config usada.**

### 4.3 🔴 A entrada de `aguardando_atendimento` é automática e contínua

`aguardando_atendimento` tem 33.011 leads (57% da base viva). A causa não é a SLA (3.2).
São duas esteiras automáticas:

| Job                          | Cron           | O que faz                                                                                         |  Vazão máxima |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------- | ------------: |
| `distribuir-estoque-plantao` | `*/10 * * * *` | `distribuir_estoque_roleta('plantao', 30)`: move `aguardando_corretor` → `aguardando_atendimento` | **4.320/dia** |
| `sdr-alimentar-perdidos`     | `0 11 * * *`   | `alimentar_base_sdr_perdidos()`: recicla `perdido` → base do SDR, `LIMIT 100`                     |       100/dia |

Medido: 2.700 eventos `sdr_base_entrada` (agente `sdr_motor`) na janela 00:00–05:00 em
~4 dias — compatível com o job de 10 em 10 minutos, lote de até 30.

**Implicação estratégica:** enquanto se constrói um motor para esvaziar o denominador,
existem esteiras reenchendo-o — inclusive com leads que já tinham saído (`perdido` →
`aguardando_atendimento`). O gestor precisa ver a vazão nos **dois** sentidos, ou vai
olhar o número parado e não entender por que ele não cai.

### 4.4 Movimento noturno ainda não explicado

Entre 00:37 e ~01:05 de 12/09, 90 leads saíram de "lote + nunca tocado" para "tocado"
(todas as três contagens moveram ~90 na direção compatível). As esteiras de 4.3 não
gravam `ultima_interacao`/`ultimo_contato` diretamente, então o mecanismo continua
aberto. **Resolver antes de o motor sair da sombra** — é um relógio de higiene sendo
zerado sem contato com cliente.

```sql
SELECT e.tipo, e.agente, e.payload->>'gatilho' AS gatilho, count(*),
       min(e.created_at), max(e.created_at)
  FROM public.lead_eventos e
 WHERE e.created_at > now() - interval '3 days'
   AND e.created_at::time BETWEEN '00:00' AND '05:00'
 GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 20;
```

## 5. Consultas de acompanhamento

```sql
-- O quadro (é o que a tela mostra)
SELECT * FROM public.v_higiene_resumo;

-- A partição que dimensiona o motor
SELECT
  count(*) FILTER (WHERE parado)                                              AS parados,
  count(*) FILTER (WHERE parado AND NOT escrita_em_lote AND NOT nunca_tocado) AS abandono_real,
  count(*) FILTER (WHERE parado AND escrita_em_lote AND nunca_tocado)         AS lote_e_virgem,
  count(*) FILTER (WHERE parado AND escrita_em_lote AND NOT nunca_tocado)     AS lote_mas_tocado,
  count(*) FILTER (WHERE parado AND NOT escrita_em_lote AND nunca_tocado)     AS virgem_sem_lote
FROM public.v_higiene_base;

-- A fila, por fase
SELECT status, prioridade, count(*) AS leads,
       count(*) FILTER (WHERE escrita_em_lote) AS dos_quais_em_lote
  FROM public.v_higiene_fila GROUP BY 1,2 ORDER BY prioridade, leads DESC;

-- Blocos perto do limiar de proteção (ver 4.1)
SELECT date_trunc('second',
         COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)) AS instante,
       count(*) AS leads
  FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false
   AND status NOT IN ('contrato_fechado','pos_venda','perdido')
 GROUP BY 1 HAVING count(*) BETWEEN 50 AND 120
 ORDER BY 2 ASC LIMIT 20;
```
