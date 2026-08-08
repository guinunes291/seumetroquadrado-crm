# 03 · Métricas de acompanhamento

> As métricas M1–M5 da auditoria `ux-ia-2026-08` **continuam valendo** e não são renumeradas. Este estudo acrescenta 9 métricas para cobrir os eixos que M1–M5 não medem (verdade dos números, mensageria, controle e dívida técnica).

## M1–M5 — mantidas (fonte: `ux-ia-2026-08/06-plano.md`)

| #   | Métrica                          | Baseline                                      | Meta                                     |
| --- | -------------------------------- | --------------------------------------------- | ---------------------------------------- |
| M1  | Cliques nas 17 tarefas críticas  | corretor 3,0 · gestor 2,9 · 3 tarefas ⛔      | ≤2,0 · ≤2,0 · **0 tarefas inexistentes** |
| M2  | Itens no menu de 1º nível        | corretor 5 (+ `/leads` duplicando) · gestão 6 | ≤6 por papel, sem duplicação             |
| M3  | Abas no hub de gestão            | 12                                            | 5                                        |
| M4  | % de RPCs sem consumidor         | 55% (135/244)                                 | <10% de consulta/comando                 |
| M5  | Tempo até a 1ª ação útil na home | não medido                                    | <5 s do login                            |

Saúde que não deve piorar: rotas órfãs 1 → 0 · cobertura de estado vazio/erro 7/7 → manter 100%.

## Novas métricas por eixo

### Gestão

| #   | Métrica                                                              | Baseline                       | Meta                            | Como medir                                                             |
| --- | -------------------------------------------------------------------- | ------------------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| G1  | **Soma dos chips = total de leads** (nenhum status invisível)        | chips ~9,4 mil vs 55.060 (17%) | 100%                            | `leads_status_counts_v3` × `count(*)` de `leads` ativos                |
| G2  | **% da safra do período com desfecho** (ganho ou perdido com motivo) | ~0,01% (7/55.060 perdidos)     | >30% da safra do mês em 90 dias | coorte por `created_at` × transições para `contrato_fechado`/`perdido` |

### Operação

| #   | Métrica                                     | Baseline                                                          | Meta                               | Como medir                                                   |
| --- | ------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| O1  | **% de conversas WhatsApp visíveis no CRM** | 0%                                                                | >80% após C.3                      | mensagens em `mensagens` × volume estimado do provedor       |
| O2  | **Tempo mediano da 1ª resposta ao lead**    | não medido (existe `tempo_primeira_resposta` para TPR de webhook) | medir na Onda A → reduzir 30% na E | mediana de `tempo_primeira_resposta` + eventos da mensageria |

### Controle

| #   | Métrica                                                                                   | Baseline                                          | Meta                           | Como medir                                 |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| C1  | **MTTD de erro em produção**                                                              | ∞ (sem tracking; descoberta por anedota)          | <15 min                        | alertas do error tracking (0.1)            |
| C2  | **Restore de backup testado**                                                             | 0                                                 | ≥1× por trimestre, com roteiro | registro do exercício (0.3)                |
| C3  | **% de chamadas de IA sob governança** (prompt/modelo versionados, quota, redação de PII) | 3 de 4 superfícies fora (match, resumo, mensagem) | 100%                           | `samiq_execucoes` cobre todas as fns de IA |

### Desenvolvimento

| #   | Métrica                                  | Baseline          | Meta                                                   | Como medir                                         |
| --- | ---------------------------------------- | ----------------- | ------------------------------------------------------ | -------------------------------------------------- |
| D1  | Type escapes (`as never` / `unknown as`) | ~212 (budget 220) | <150 em 90 dias                                        | `npm run type-escape-budget` (baixar o teto junto) |
| D2  | Arquivos >500 linhas em `src/`           | 38                | nenhum novo; −5 em 90 dias (fatiados ao serem tocados) | contagem no CI (informativa)                       |

## Regras de uso

1. **Nenhuma métrica nova exige ferramenta nova além do error tracking (0.1)** — G1/G2/O2 saem de SQL sobre tabelas existentes; C3 sai de `samiq_execucoes`; D1/D2 saem de scripts que já existem ou de um `wc -l` no CI.
2. Medir **antes** de cada onda e ao final dela — o baseline de O2, por exemplo, precisa existir antes da Onda E para provar o efeito do follow-up automático.
3. Métrica que regredir por 2 medições seguidas entra como item de onda corrente, não como "depois".
