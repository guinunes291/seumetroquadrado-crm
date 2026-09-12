# Motor de higiene — Fatia 2b (modo sombra)

O motor roda todo dia às 04h UTC (`cron` job `higiene-processar-diaria`) e, no
modo atual (`sombra`), **não move nenhum lead**: ele apenas grava em
`public.higiene_execucao_log` o que faria.

## O que existe

| Objeto                               | Papel                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `higiene_config.modo`                | `sombra` (só registra) · `ativo_parcial` (só alerta) · `ativo` (régua inteira) |
| `higiene_config.teto_perdidos_dia`   | Teto diário de perdas automáticas (dia em horário de Brasília)                 |
| `higiene_config.lote_max`            | Quantos leads o motor avalia por execução                                      |
| `higiene_regra_fase.dias_perda`      | Prazo próprio da fase (NULL = `dias_parado_min`)                               |
| `higiene_regra_fase.acao_automatica` | `nenhuma` · `alertar` · `devolver_roleta` · `perdido`                          |
| `higiene_execucao_log`               | Um registro por lead avaliado, com motivo do pulo e carimbo da config          |
| `higiene_processar()`                | O motor                                                                        |
| `higiene_desfazer_lote(execucao_id)` | Reverte em bloco o que uma execução aplicou (idempotente)                      |
| `v_higiene_motor_status`             | Batimento cardíaco: sempre uma linha, mesmo sem execução                       |

## Travas estruturais (CHECK, não disciplina)

- `aguardando_atendimento` não pode entrar na régua: essa fase pertence ao SLA
  de 15 minutos da distribuição. Duas regras movendo o mesmo lead é pior que
  nenhuma.
- `analise_credito` nunca ganha `dias_perda`: é a fase que mais converte; ali o
  problema é cobrança, não descarte.
- Escrita em lote é medida sobre a base inteira (`escrita_lote_global`), não só
  sobre os leads vivos — uma importação de 6 mil leads continua sendo uma
  importação depois que parte dela vira perdido.
- Leads em ressurreição pelo pré-atendimento (`sdr_id` preenchido) são pulados:
  outro motor já é dono deles.

## Como acompanhar

```sql
SELECT * FROM public.v_higiene_motor_status;

SELECT motivo_pulo, count(*)
  FROM public.higiene_execucao_log
 WHERE execucao_id = (SELECT execucao_id FROM public.v_higiene_motor_status)
 GROUP BY 1 ORDER BY 2 DESC;
```

`0 aplicados` com `motivo_pulo = 'modo_sombra'` é o comportamento esperado hoje.
`0 avaliados` seria sinal de motor quebrado — daí a distinção existir no log.

## Rollback

Desligar só o agendamento (o motor continua chamável à mão):

```sql
SELECT cron.unschedule('higiene-processar-diaria');
```

Voltar ao modo sombra depois de qualquer teste em produção:

```sql
UPDATE public.higiene_config SET modo = 'sombra';
```

Desfazer uma execução inteira (alerta, devolução à fila ou perda):

```sql
SELECT public.higiene_desfazer_lote('<execucao_id>');
```

Remover o motor por completo, preservando as views da Fatia 1:

```sql
SELECT cron.unschedule('higiene-processar-diaria');
DROP VIEW IF EXISTS public.v_higiene_motor_status;
DROP FUNCTION IF EXISTS public.higiene_desfazer_lote(uuid);
DROP FUNCTION IF EXISTS public.higiene_processar();
DROP TABLE IF EXISTS public.higiene_execucao_log;
ALTER TABLE public.higiene_regra_fase
  DROP CONSTRAINT IF EXISTS higiene_regra_fase_nao_disputa_sla,
  DROP CONSTRAINT IF EXISTS higiene_credito_nao_perde,
  DROP COLUMN IF EXISTS dias_perda,
  DROP COLUMN IF EXISTS acao_automatica;
ALTER TABLE public.higiene_config
  DROP COLUMN IF EXISTS modo,
  DROP COLUMN IF EXISTS teto_perdidos_dia,
  DROP COLUMN IF EXISTS lote_max;
```

## Aposentadoria

`arquivar-leads-sem-contato-30d` estava agendado às 06h UTC com corpo
`RETURN 0`. Foi desagendado: cron ativo que não faz nada é pior que job
inexistente, porque passa a impressão de que a higiene já estava coberta.

## Testes

`tests/db/higiene-motor.test.ts` (13 casos) — roda com
`npm run test:db` contra o harness local.
