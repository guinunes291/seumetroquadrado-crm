# Auditoria de métricas + padronização hh:mm — 2026-08-09

Branch: `claude/crm-metrics-audit-standardization-sejjwz` · Commits "Auditoria de métricas 1/6 … 6/6".

Três frentes, nesta ordem: (1) mapear e auditar todas as métricas do CRM, com prioridade no tempo para primeiro contato; (2) corrigir cálculos errados; (3) padronizar TODA exibição de duração em hh:mm. **Regra de ouro respeitada em tudo:** banco e API continuam armazenando e trafegando duração como número (minutos inteiros; horas decimais nas MVs de tempo por etapa); a string hh:mm existe só na camada de exibição, e nenhuma ordenação/soma/meta passou a usar texto.

---

## 1. Inventário final de métricas (com status)

Status: ✅ correta · 🔧 corrigida (antes/depois na seção 2) · ➕ criada · ⏳ pendente de decisão.

### 1.1 Métricas de tempo

| Métrica | Definição/fórmula | Unid. | Calculada em | Exibida em | Status |
|---|---|---|---|---|---|
| **Tempo de 1º contato humano** (`tempo_primeira_resposta`) | criação do lead (`leads.created_at`) → 1ª interação de SAÍDA com autor humano (`interacoes.ocorreu_em`, `direcao='saida'`, `autor_id IS NOT NULL`, tipo ∉ {nota, mudanca_status}); coorte por dia de criação em America/Sao_Paulo; média + mediana em minutos; NULL = pendente | min | migração `20260809190000` (v2) | Painel do Gestor (`gestao/derive.ts` — hoje sem consumidor de UI ativo, ver §5.j) | 🔧 |
| **1ª resposta p50 do corretor** (`primeira_resposta_p50_min`) | `COALESCE(data_distribuicao, created_at)` → 1ª interação do corretor dono (`autor_id = corretor_id`, tipo ∉ {nota, mudança}), pelo timestamp de REGISTRO (`i.created_at` — decisão anti-manipulação de 20260731123000, mantida); p50 mensal; NULL = pendente | min | MV `metrics.performance_corretor_mensal` (recriada em `20260809191000`) | Performance (tabela), Raio-X (StatTile, tabela de evolução, PDF, XLSX) | 🔧 (mês BRT) |
| SLA de 1º contato ao vivo (`leads_sla_pendentes`/`leads_com_sla`) | `now() − COALESCE(data_distribuicao, created_at)` vs `sla_minutos` por origem (webhook: `LEAST(timeout, sla)`); atenção > 60% | min | `20260728101000` / `20260719130000` | Meu Dia, kanban, `sla-badge`, Atender | ✅ (âncora distribuição é deliberada — SLA do corretor; exibição virou hh:mm) |
| Leads urgentes (`minutos_parado`) | `now() − COALESCE(data_distribuicao, created_at)` ≥ 30 min, status novo/aguardando | min | `dashboard_leads_urgentes` | Relatórios (badge), Central de Comando (motivo) | ✅ (exibição hh:mm) |
| SLA de repasse (transfer) | `Date.now() − data_distribuicao` vs `timeout_minutos` da origem | ms→MM:SS | `transfer-sla-badge.tsx` (cliente) | badge countdown + barra | ✅ (countdown MM:SS mantido — §5.e; tooltip de config em hh:mm) |
| **Tempo por etapa do funil** | transições consecutivas de `lead_status_transitions` (`LEAD()` por lead); média + p50 em horas por mês de ENTRADA na etapa; só etapas com saída registrada | horas | MV `metrics.tempo_etapa_mensal` + `gestao_tempo_etapa` | Funil ("Tempo por etapa"), Gargalos ("etapa lenta"), heatmap (dias) | 🔧 (mês BRT; exibição hh:mm) · ⏳ viés de sobrevivência (§5.h) |
| Tempo de ciclo (criação→fechamento) | não existe métrica dedicada; o proxy é a soma dos tempos por etapa + coorte do funil | — | — | — | ⏳ (§5.k — criar se desejado) |
| Dias parado / sem contato | `now() − lead_ultima_atividade(ultima_interacao, ultimo_contato, updated_at)` (SQL) e 4 réguas TS (`lead-flags` 5d/10d, `priority`, `fechamento`, kanban) | dias | `metrics.leads_base` + libs TS | chips, kanban ("Xd"), tooltips, estoque | ✅ (kanban ganhou clamp ≥ 0; exibição em dias mantida — §5.f) |
| Tempo relativo ("há X") | `formatRelativeTime` (agora único — `formatDesde` delega) | min/h/d | `lib/interacoes.ts` | timeline, listas, filas do Atender | ✅ (grafia unificada; hh:mm na timeline é pendência de UX — §5.f) |

### 1.2 KPIs de período, funil, contagens, rankings

| Métrica | Âncora canônica | Status |
|---|---|---|
| `dashboard_kpis` / `dashboard_atividade_periodo` (leads, agendamentos, visitas, no-shows, pastas, análises, vendas, VGV, deltas) | data do fato por métrica: lead=created_at · agendamento=created_at · visita=data_inicio (validada) · pasta=pasta_montada_em · análise/perda=data da transição · venda=data_assinatura; recorte timestamptz com limites LOCAIS do `useDateFilter` | ✅ |
| `dashboard_serie_diaria` | buckets diários em America/Sao_Paulo | ✅ |
| Funil coorte (`funil_coorte_mensal` + cobertura de transições) vs snapshot (`stage-metrics.ts`) | coorte por mês de criação (agora BRT) × posição atual | 🔧 (mês BRT) · ⏳ nomenclatura única "conversão" (§5.g) |
| Conversões (4 definições distintas sob o mesmo rótulo) | ponderada Σvendas/Σleads (gestao/derive:48, performance-derive) × média de taxas (gestao/derive:88) × coorte (funil-derive) × snapshot (stage-metrics) × vendas/leads_atendidos (metas.ts) | ⏳ (§5.g) |
| Contagens por status/temperatura (`leads_status_counts_v2`, `pipeline_snapshot_v3`, chips) | RLS/carteira como autoridade de escopo; lixeira excluída (exceto perdidos — perda é fato histórico, deliberado) | ✅ |
| Rankings (`rankAgents`, Copa, `ranking-periodo-v2`) | vendas → visitas → atendidos; Copa com calendário fixo próprio (deliberado) | ✅ |
| Pacing/metas (`projecaoLinear`, `semaforo`, `progressoMeta`) | proteção de denominador em tudo; convenção null×0 divergente | ⏳ (§5.g D9) |
| Comissões (`round2` com EPSILON) | percentuais sobre valor da venda | ✅ |
| Origem que vende (`gestao_origens` coorte, fallback `rel_origem_efetiva` marcado `degradado:true`) | coorte × status atual — a UI avisa | ✅ |
| Motivos de perda (`gestao_motivos_perda` com VGV estimado; `dashboard_motivos_perda`) | mês de `data_perda` (agora BRT na MV) | 🔧 (mês BRT) |
| Insights do mês (`gerarInsights`: vazamento, previsão, share de perda, tendência, ponta-a-ponta) | mês corrente; agora com instantes completos do mês local | 🔧 |
| Streak de atividade / atividades diárias (Central de Comando) | `atividades_diarias.dia` (dia BRT gravado por trigger); recorte agora no dia local | 🔧 |

### 1.3 Lógica duplicada identificada (mesma métrica em mais de um lugar)

- **D1 — 1ª resposta**: RPC (criação→saída humana, `ocorreu_em`) × MV (distribuição→interação do dono, `created_at`). As duas âncoras são legítimas (SLA do lead × SLA do corretor) e agora estão documentadas nos COMMENTs; a divergência `ocorreu_em`×`created_at` fica como decisão (§5.d).
- **D2/D3 — conversão**: 4 fórmulas sob o mesmo nome (§5.g).
- **D4 — diasDesde**: `priority.ts` = `fechamento.ts` (idênticas) ≠ `lead-flags.ts` (fallback created_at) ≠ kanban (agora com clamp). Consolidação sugerida, não executada (mudaria semântica de fallback).
- **D6 — SLA 0.6/estourado**: SQL (`now()` do servidor) × badges (relógio do navegador). Dessincronia de relógio desloca o countdown — risco baixo, documentado.
- **D7 — mês da venda**: `data_assinatura` (canon, dashboards/MVs) × `aprovado_em` (`lib/metas.ts:117`, página de Metas) (§5.g).
- **D9 — "sem base"**: `null` (pacing, funil-derive, relatorios-derive) × `0` (`lib/metas.ts pct`, `gestao-pacing`, `conversaoMedia`) (§5.g).
- Réguas de esfriamento: `lead-flags` (5d/10d) × Atender (3d) × filtros de listagem (5d/30d/paramétrico) — deliberadas por contexto, mas sem documentação única (§5.g).

---

## 2. Bugs de cálculo corrigidos (antes → depois)

1. **`tempo_primeira_resposta` devolvia 0 para quem não respondeu ninguém** (`COALESCE(...,0)`). O KPI premiava quem não trabalhava o lead. → **NULL** (pendente, "—" na tela). _Migração `20260809190000`._
2. **A mesma RPC contava QUALQUER interação de saída como 1º contato** — sem filtro de autor nem de tipo. Eco de automação com `direcao='saida'` (hoje inexistente, mas sem guarda) e nota/mudança de status podiam zerar o cronômetro. → exige `autor_id IS NOT NULL` e `tipo NOT IN ('nota','mudanca_status')`; a métrica passa a se chamar explicitamente **tempo de 1º contato humano**.
3. **Recorte de período da RPC em dia UTC** (`created_at::date` no fuso do banco) mais front enviando instante ISO para parâmetro `date`: janela deslocada em até 1 dia vs os cards vizinhos do Painel. → RPC corta em `America/Sao_Paulo` e o front envia o dia local (`dateKey`). _`20260809190000` + `dashboard/queries.ts`._
4. **MVs de métricas bucketizavam o mês em UTC** (`date_trunc('month', …)` sem timezone): lead criado/visita ocorrida/perda registrada entre 21h e 24h de Brasília no último dia do mês caía no mês seguinte — divergindo dos dashboards (que cortam em BRT). → todas as MVs (`funil_coorte_mensal`, `tempo_etapa_mensal`, `performance_corretor_mensal`, `motivos_perda_mensal`) e a view `realizado_mensal` passam ao mês-calendário de America/Sao_Paulo. `vendas.data_assinatura` é DATE civil e ficou como está. _Migração `20260809191000` (régua canônica de 20260731123000 preservada)._
5. **"Hoje"/"mês atual" no front pela data UTC** (`toISOString().slice(0,10|8)`): após 21h de Brasília o dia/mês virava e (a) os cards de atividade da Central de Comando zeravam (`intervalo("hoje")`), (b) o streak consultava o dia errado, (c) o Raio-X e a tabela de Performance consultavam um mês ainda inexistente na virada de mês, (d) o InsightsPanel excluía o dia corrente inteiro (limite `< df` com data truncada). → `dateKey()` local em todos; InsightsPanel passa instantes completos do mês local. _`use-home-data.ts`, `raio-x-corretor.tsx`, `performance-view.tsx`, `insights-panel.tsx`, `funil-view.tsx`._
6. **Kanban podia exibir dias negativos** ("-1d") com timestamp futuro (dado sujo/importação). → clamp ≥ 0. (`formatRelativeTime` já degradava com segurança para "agora mesmo" — verificado, sem mudança.)
7. **Timestamps invertidos** (interação de saída registrada antes da criação do lead) já eram excluídos da média da RPC — agora são **contados** na nova coluna `leads_dado_sujo` para monitoramento (§3).

Correções que MUDAM valores exibidos (esperado): médias de 1ª resposta deixam de incluir zeros artificiais (tendem a SUBIR — o número antigo era artificialmente baixo); buckets mensais das MVs deslocam ~3h de dados por virada de mês; cards de "hoje" à noite passam a mostrar o dia certo.

---

## 3. Dados sujos — ocorrências

O ambiente desta sessão não obteve acesso de leitura ao banco de produção (a chamada MCP exige aprovação interativa), então as contagens ficam a um SELECT de distância. Rode como leitura (nada é alterado):

```sql
-- 3.1 Interações de saída registradas ANTES da criação do lead (invertidos)
SELECT count(DISTINCT i.lead_id) AS leads_com_saida_invertida
FROM public.interacoes i
JOIN public.leads l ON l.id = i.lead_id
WHERE i.direcao = 'saida' AND i.deleted_at IS NULL
  AND i.ocorreu_em < l.created_at;

-- 3.2 Timestamps futuros (dado sujo que o clamp do kanban agora mascara)
SELECT count(*) AS leads_com_interacao_futura
FROM public.leads l
WHERE l.ultima_interacao > now() + interval '5 minutes';

-- 3.3 Duplicatas ativas por telefone (pós-índices de dedup — deve ser ~0)
SELECT count(*) AS telefones_duplicados
FROM public.vw_leads_telefone_duplicado;
```

A partir da migração `20260809190000`, `tempo_primeira_resposta` devolve `leads_dado_sujo` por corretor — o monitoramento passa a ser contínuo, sem query manual. Não existe flag de lead de teste (§5.i); contas de teste foram desativadas por e-mail (`20260728102000`).

---

## 4. Arquivos alterados

**Novos**: `supabase/migrations/20260809190000_tempo_primeira_resposta_humana.sql` · `supabase/migrations/20260809191000_metrics_mvs_mes_brt.sql` · `src/lib/duracao.ts` · `tests/duracao.test.ts` · este relatório.

**Alterados**: `src/lib/utils.ts` (formatDuracaoParado removida) · `src/lib/interacoes.ts` (sem mudança de comportamento; formatRelativeTime virou o canônico) · `src/features/dashboard/{queries.ts,relatorios-view.tsx}` · `src/features/gestao/{derive.ts,gestao-config-card.tsx,painel-dia/derive.ts}` · `src/features/command-center/{derive.ts,widgets/use-home-data.ts}` · `src/features/inteligencia/{performance-view,performance-derive,raio-x-corretor,raio-x-derive,raio-x-relatorio,funil-view,gargalos-view,insights-panel}` · `src/features/atendimento/{derive.ts,volume-view.tsx}` · `src/features/distribuicao/tab-configuracoes.tsx` · `src/components/{sla-badge,transfer-sla-badge,leads-kanban-board}.tsx` · `tests/{utils,painel-dia-derive}.test.ts` (+ Prettier em `leads-query.ts`, `leads-views.ts`, `priority.ts` — drift do commit WIP anterior, sem mudança de lógica).

**Validação**: 928 testes ✅ · typecheck ✅ · lint:ci ✅ · build de produção ✅ · bundle-budget ✅ (202 KB gzip < 250) · format:check ✅. As migrações são ARQUIVOS no repositório — nada foi aplicado a banco vivo nesta sessão; elas rodam no fluxo normal de deploy. A conferência visual das telas e a amostragem de 10 leads dependem de credenciais/aprovação de banco que a sessão não tinha (script pronto na §3).

---

## 5. Decisões que ficam para o Guilherme

a. **Formato acima de 24h**: hoje `1d 02:15`. Para trocar por hh:mm acumulado (`26:15`) em todo o app, mude UMA constante: `ACIMA_DE_24H_PADRAO` em `src/lib/duracao.ts`.

b. **Relógio corrido × horas úteis no SLA**: mantido o relógio corrido (como era). Recomendação: para o SLA comercial, avaliar horas úteis — lead que chega sábado 23h e é atendido segunda 08h30 aparece hoje com ~33h de espera; com régua útil seria ~30min. Não implementado (mudaria o significado da métrica).

c. **Bot vs humano — limitação estrutural**: a resposta automática do bot (pré-handoff, n8n) NÃO é registrada no CRM — nem em `interacoes` (só ecoa ENTRADA) nem em `mensagens` de saída (Central 7b/7c não entregues). Portanto `tempo_primeira_resposta` "com bot" é imensurável hoje; a métrica implementada é o **1º contato humano** (SLA comercial, como pedido). Menor ajuste, SEM migração de schema: o fluxo n8n passar a POSTar o outbound do bot em `public.mensagens` (`direcao='saida'`, `corretor_id=NULL`, `provider` identificando o bot) — a tabela e a RLS já aceitam. Com isso, `tempo_primeira_resposta` (bot incluso) nasce de `MIN(mensagens.criado_em WHERE direcao='saida')`. Aguarda aprovação.

d. **`ocorreu_em` (data do fato, backdateável) × `created_at` (data do registro, anti-manipulação)**: a RPC usa o fato; a MV usa o registro (decisão explícita de 20260731123000). Recomendo padronizar — sugiro `created_at` (registro) nas duas, aceitando que ligação registrada tarde "piora" o número, em troca de métrica imanipulável. Não mudei nenhum dos lados.

e. **Countdowns MM:SS mantidos**: repasse automático (janela de ~5 min) e sprint (30–90 min) precisam de precisão de segundos — hh:mm arredondado ao minuto congelaria o contador. Tooltips e configs desses fluxos já exibem hh:mm.

f. **Grânulos não convertidos (deliberado)**: durações em DIAS inteiros (chips "12d parado", heatmap "Xd", estoque) seguem em dias — são outra unidade natural, não minutos; o tempo relativo humanizado da timeline ("há 45 min") foi unificado numa função só, mas segue humanizado — se quiser "há 00:45", é um wrapper de uma linha sobre `formatDuration`; o seletor de lembrete da agenda ("15 minutos antes") e os botões de sprint ("30 min") são opções de configuração em linguagem natural.

g. **Redefinições de métrica em aberto** (nada foi decidido sozinho): (D2/D3) unificar a definição de "conversão" — ponderada × média de taxas × coorte × snapshot — ou ao menos rotular distinto na UI; (D7) Metas usa `aprovado_em`, o resto usa `data_assinatura` — alinhar Metas ao canon?; (D9) padronizar "sem base" como `null`/"—" (hoje metade do código mostra 0); réguas de esfriamento 3d/5d/10d por contexto — documentar ou unificar.

h. **Tempo por etapa tem viés de sobrevivência**: `saiu_em IS NOT NULL` exclui exatamente o lead travado há semanas na etapa — o gargalo real é invisível na métrica feita para achá-lo. Corrigir exige redefinição (incluir permanência em aberto até `now()`), que muda bastante o número — decidir antes.

i. **Lead de teste**: não existe flag `is_test`; sugestão de menor ajuste: coluna booleana em `leads` + filtro em `metrics.leads_base` (1 migração pequena), ou manter a prática atual de contas de teste desativadas.

j. **RPC `tempo_primeira_resposta` sem consumidor ativo**: `useTempoPrimeiraResposta` e `quemPrecisaDeAjuda` existem e estão testados, mas nenhuma tela monta esses dados hoje (ficaram órfãos em algum redesign). Religar no Painel do Gestor ou remover.

k. **Tempo de ciclo (criação→fechamento)** não existe como métrica própria — só o funil de coorte responde "quantos fecharam", não "em quanto tempo". Se quiser, nasce de `lead_status_transitions` (criação → transição para contrato_fechado) numa MV pequena.

l. **Notificações geradas no Postgres** ("há mais de 30 min sem atendimento" etc., montadas em triggers): converter para hh:mm exige migração dos textos das funções de alerta — baixo valor, médio risco; deixado como está.

m. **8 × 14 etapas**: o funil implementado tem 8 etapas ativas (13 status no enum); a divergência com o processo comercial de 14 etapas já estava registrada em `docs/auditoria/ux-ia-2026-08/01-inventario.md` como pendente do dono — segue aberta.

n. **`ultima_interacao` é retrocedível**: o trigger grava `NEW.ocorreu_em` sem guarda de monotonicidade — um lançamento retroativo REGRIDE o "último contato" do lead (afeta filas e temperatura). Guarda `GREATEST(...)` é uma migração de 5 linhas; não executada.
