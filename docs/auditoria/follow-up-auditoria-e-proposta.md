# Auditoria + Proposta — Subsistema de Follow-up (SMQ CRM)

> **Tipo:** auditoria + proposta. **Nada foi aplicado.** Objetivo: o corretor fazer
> follow-up **assertivo e sem erros**. Evidência em `arquivo:linha` + validação ao
> vivo. **Data:** 2026-07-05. **Branch:** `claude/lead-distribution-audit-dkxyia`.

---

## Sumário executivo

O follow-up hoje é **reativo, manual e frágil**. Não há cadência; o "próximo
follow-up" vive em **dois lugares que não conversam**; e há vários pontos de
**perda silenciosa** (o corretor não vê o que deveria, ou vê o que já não importa).

**Os 3 problemas estruturais:**

1. **Duas fontes de verdade divergentes.** O que o corretor realmente vê são as
   **`tarefas`** (`data_vencimento`). Mas existe também `leads.proximo_followup`,
   que **não é exibido como lista de "vence hoje"** — só entra em ranking (Radar) e
   como *filtro de exclusão* no Hoje. Só um fluxo (`RegistrarContatoDialog`) escreve
   os dois juntos; todos os outros escrevem **um ou outro** → eles se contradizem.
2. **Perda silenciosa.** `proximo_followup` **nunca é limpo** e, quando setado sem
   criar tarefa (follow-up em massa e "Editar dados"), vira **trabalho invisível**
   que ainda **remove o lead da rede de proteção** "Sem próxima ação" do Hoje.
3. **Sem cadência.** Cada etapa gera **uma** tarefa; não há sequência D+1/D+3/D+7,
   nem escalonamento, nem reativação de frio dentro do CRM. As únicas redes são um
   alerta plano de **5 dias** e um arquivamento de 30 dias **que nem está agendado**.

**Linha de base ao vivo (hoje):**
- **587** leads em `aguardando_retorno` (o balde de follow-up) — **100% com
  `proximo_followup = null`** e quase todos sem `ultimo_contato`.
- **6.086** negociações paradas 3+ dias (inclui ruído de fechados/órfãos; **1.651
  sem corretor**). Concentração: Valkyria 730, Monica 547, Leticia Castro 471…
- Mesmo a conta **"Seu Metro Quadrado" (admin)** ainda aparece com 1 lead parado.

**Resultado:** o follow-up "assertivo e sem erros" está bloqueado por defeitos de
**consistência de dados** e **visibilidade** — não por falta de telas. A proposta
(§5) unifica a fonte de verdade em `tarefas`, torna `proximo_followup` um espelho
derivado, corrige os pontos de perda silenciosa e adiciona cadência.

---

## 1. Mapa do subsistema de follow-up

| Camada | Onde vive | O que faz |
|---|---|---|
| **Motor por etapa (client)** | `src/lib/follow-up.ts:31-147` | A cada mudança de etapa cria **1** tarefa: `agendado`→"Confirmar visita" (~1d antes); `visita_realizada`→D+2; `analise_credito`→D+3; `em_atendimento`→D+1; `aguardando_retorno`→D+1. Dedup por título exato. **Não** grava `proximo_followup`. |
| **Motor por etapa (DB)** | trigger `criar_followup_em_atendimento` — `20260616095924_…:95-137` | Ao entrar em `em_atendimento`: cria tarefa "Follow-up automático" (`origem_automatica=true`, +24h) **e** seta `proximo_followup=now()+24h`. Ao entrar em `perdido/contrato_fechado/pos_venda`: cancela tarefas **só** com `origem_automatica=true`. |
| **Registrar contato** | `src/components/registrar-contato-dialog.tsx:83-116` | Insere `interacoes` + agenda a próxima (chips Amanhã/+2d/+1sem) escrevendo **tarefa E `proximo_followup`** (único lugar que sincroniza os dois). |
| **Alerta "parado"** | `gerar_alertas_leads_parados` — `20260619123001_…:5-38`, cron `0 8 * * *` | Lead sem interação há **5+ dias** → 1 alerta/dia em `alertas` (`tipo='follow_up'`, sem telefone do cliente — LGPD ok). |
| **Lembrete de visita** | `gerar_pushes_lembretes_visita` — `20260619123001_…:42-78`, cron `*/5` | Web Push 48h/24h/10h antes da visita → `push_outbox`. **Entrega depende de agendador externo** (`push-dispatch.ts`), não de pg_cron. |
| **Telas** | `hoje.tsx`, `agendamentos.tsx` (Agenda/Tarefas), `tarefas.tsx`, `blitz.tsx`, `leads.index.tsx`, `leads.$leadId.tsx`, `radar.tsx` | Hoje→"Ação" é o hub; card "Tarefas & follow-ups" mostra tarefas com `data_vencimento <= hoje`. |
| **Estados externos** | `estado ∈ {EM_FOLLOWUP, FRIO_REATIVACAO, AGUARDANDO_HORARIO}` | **Nunca setados pelo CRM** — geridos pelo n8n/copiloto externo. Inertes aqui. |

**Fonte de verdade real:** `tarefas.data_vencimento`. `leads.proximo_followup` é
um segundo trilho **não exibido como worklist**.

---

## 2. Diagnóstico — defeitos que quebram o follow-up assertivo

Priorizados pelo impacto em "assertivo e sem erros".

### P0 — Perda silenciosa e dados errados

- **F1. `proximo_followup` nunca é limpo → some/engana para sempre.** Setado em
  `em_atendimento` (trigger), em massa, no editar e no registrar-contato — mas
  **nenhum** caminho o zera (grep: nenhum `proximo_followup = null`), nem ao concluir
  a tarefa nem ao registrar nova interação. Como `hoje.tsx:270` trata **qualquer
  `proximo_followup` futuro** como "tem próxima ação", um lead pode ficar **fora da
  rede "Sem próxima ação" para sempre** por um follow-up já feito/abandonado. E
  `radar.tsx:68` rankeia em cima de valor velho.

- **F2. `proximo_followup` sem tarefa = trabalho invisível.** `bulkFollowup`
  (`leads.index.tsx:946-963`) e o form de editar (`leads.$leadId.tsx:322-324`) setam
  `proximo_followup` **sem criar tarefa**. Como nenhuma tela mostra `proximo_followup`
  como to-do, esse follow-up **nunca aparece** na data — e ainda **esconde** o lead da
  rede de proteção (F1). Perda dupla.

- **F3. Tarefas de leads fechados/perdidos continuam pendentes.** O cancelamento
  automático (`20260616095924_…:122-126`) só apaga `origem_automatica=true`. Todas as
  tarefas do motor client / diálogos / registrar-contato têm `origem_automatica=false`
  → quando o lead é **ganho ou perdido**, elas **continuam `pendente`**. O corretor
  segue vendo follow-up de negócio fechado/perdido.

- **F4. Concluir pelo Hoje não grava `data_conclusao`.** `hoje.tsx:214-220` seta só
  `{status:'concluida'}`; `tarefas.tsx:135-139` grava `data_conclusao`. O contador
  "Concluídas hoje" (`tarefas.tsx:104-108`) e qualquer relatório de produtividade
  **perdem** as tarefas concluídas pelo Hoje.

- **F5. Dois "next follow-ups" que divergem.** Só `RegistrarContatoDialog` sincroniza
  tarefa + `proximo_followup`. Motor automático e form manual → só tarefa; snooze
  (`tarefas.tsx:151-165`) → só tarefa; em massa/editar → só `proximo_followup`. Logo o
  campo "Próximo follow-up" (aba Dados) e a tarefa pendente **frequentemente se
  contradizem**, e adiar uma tarefa deixa `proximo_followup` velho.

### P0 — Duplicação

- **F6. Follow-up duplo ao entrar em `em_atendimento`.** Disparam **os dois** motores:
  o trigger DB ("Follow-up automático", +24h) **e** o client via `use-lead-status.ts`
  ("Follow-up com {nome}", +1 dia). Títulos diferentes ⇒ o dedup do client
  (`follow-up.ts:123`) não vê a linha do trigger ⇒ **2 tarefas** para a mesma
  transição.

- **F7. Acúmulo de "Follow-up com {nome}".** `registrar-contato-dialog.tsx:100` e
  `hoje.tsx:291` inserem esse título **sem dedup** → contatos repetidos empilham
  tarefas idênticas abertas.

### P1 — Visibilidade e ação

- **F8. Aba "Tarefas" do lead é read-only.** `leads.$leadId.tsx:1058-1073` lista as
  tarefas com badges, mas **sem botão de concluir/adiar**. Vendo o lead, o corretor
  **não consegue fechar o follow-up ali** — precisa ir ao Hoje/Tarefas.

- **F9. Atrasado parece "vence hoje".** O card do Hoje mostra só `HH:mm` e **esconde a
  data** dos atrasados (`hoje.tsx:660`) → uma tarefa atrasada há dias fica igual a uma
  de hoje. Na aba Tarefas do lead não há ênfase de atraso.

- **F10. Botão inteligente `PROXIMA_ACAO` some no Kanban e no Blitz.** Existe só na
  lista e no detalhe (`leads.index.tsx:1648-1667`, `leads.$leadId.tsx:690-712`). No
  Kanban e no Blitz — justamente os modos de trabalho rápido — o corretor não recebe a
  sugestão do próximo passo.

- **F11. Ações em massa sem confirmação.** Follow-up/temperatura/ligação em massa
  aplicam a N leads só com um toast (`leads.index.tsx:946-`), fácil de errar.

### P1 — Confiabilidade

- **F12. Fuso horário.** (a) O cron `alertar-leads-parados '0 8 * * *'` roda em **UTC**
  → dispara **05:00 BRT**, não 08:00 (os jobs de presença compensam com
  `AT TIME ZONE`, os de follow-up não). (b) Vencimentos são calculados em
  `new Date()+n*DIA_MS` no fuso **do navegador** (`follow-up.ts:37`), enquanto o
  trigger DB usa `now()+interval` (UTC) — device fora de BRT recebe horários deslocados
  e "+1 dia" fixo (24h) pode cair no mesmo dia útil. (c) Corpo do push de visita usa
  `to_char` no fuso da sessão do DB (`…:52`), podendo mostrar hora diferente do app.

- **F13. Entrega de push frágil.** `push-dispatch` **não é cron do pg_cron**; depende
  de agendador externo. Se `PUSH_DISPATCH_SECRET`/scheduler não estiver provisionado,
  os lembretes de visita ficam em `push_outbox` **sem sair**. (Alertas in-app do sino
  funcionam via polling+realtime.)

### P2 — Estrutural

- **F14. Sem cadência/escalonamento.** Uma tarefa por etapa, ponto. Sem D+1/D+3/D+7,
  sem "3 tentativas e desiste". Redes: alerta de 5 dias + arquivo de 30 dias.

- **F15. `arquivar_leads_sem_contato_30d` definido mas NÃO agendado.** Nenhum
  `cron.schedule` o referencia (`20260704211859_…:140-174`) → a rede de 30 dias
  provavelmente **não roda** sozinha.

- **F16. `estado` EM_FOLLOWUP/FRIO_REATIVACAO inertes no CRM.** A reativação de frio
  não tem cadência interna — depende 100% do n8n externo.

- **F17. `proxima_acao` (coluna text) órfã.** Só escrita via API pública
  (`$id.ts:72`); nenhum trigger preenche, nenhuma UI lê. O que o sistema externo
  escreve ali é **invisível** ao corretor.

- **F18. "Follow-up" espalhado em 3 enums.** `tarefa_tipo`, `interacao_tipo` e
  `agendamento_tipo` cada um com seu `follow_up` — confunde o corretor sobre o que é
  tarefa, interação ou evento.

---

## 3. Baseline ao vivo (para medir a melhoria)

| Métrica | Valor hoje | Fonte |
|---|---|---|
| Leads em `aguardando_retorno` | **587** (graziele 248, Valkyria 240, L.Castro 89) | `crm_listar_negociacoes(status=aguardando_retorno)` |
| …com `proximo_followup` preenchido | **0** | idem (amostra 100% null) |
| Negociações paradas 3+ dias | **6.086** (1.651 sem corretor) | `crm_listar_negociacoes(parado_ha_dias=3)` |
| Lead com admin/bot | ≥1 ("Seu Metro Quadrado") | idem |

---

## 4. Proposta — Follow-up unificado e à prova de erro

**Princípio:** **uma** fonte de verdade — a **tarefa**. `leads.proximo_followup`
deixa de ser escrito à mão e passa a ser um **espelho derivado** (a menor
`data_vencimento` das tarefas de follow-up abertas do lead), mantido por trigger.
Assim Radar, Hoje e a aba Dados **sempre** batem com o que o corretor tem a fazer.

### 4.1 Convergir os dois trilhos (resolve F1, F2, F5)
- **Trigger em `tarefas`** (INSERT/UPDATE/DELETE): recalcula
  `leads.proximo_followup = min(data_vencimento)` das tarefas abertas
  (`status in ('pendente','em_andamento')`, `tipo` de follow-up) do lead; **null** se
  não houver nenhuma. → `proximo_followup` **se auto-limpa** ao concluir/adiar/cancelar.
- **Em massa e "Editar dados"**: passam a **criar/ajustar a tarefa** (não escrever
  `proximo_followup` cru). O campo na aba Dados vira **read-only derivado**.

### 4.2 Fechar os vazamentos (resolve F3, F4, F6, F7)
- **Cancelar** todas as tarefas de follow-up abertas quando o lead vira
  `contrato_fechado/perdido/pos_venda` — **independente de `origem_automatica`**.
- **`hoje.tsx` concluir**: gravar `data_conclusao = now()` (igual ao `tarefas.tsx`).
- **Um único motor** de "tarefa por etapa": consolidar no client (`follow-up.ts`,
  testável) **ou** no trigger DB — não os dois. Remover o duplicado; padronizar título
  e `origem_automatica=true`.
- **Dedup por `(lead_id, tipo, janela de datas)`**, não por título exato.

### 4.3 Tornar o trabalho visível (resolve F8, F9, F10, F11)
- Aba "Tarefas" do lead: adicionar **concluir/adiar** inline.
- Atrasados: mostrar **"atrasada há N dias" + a data**, não só `HH:mm`.
- `PROXIMA_ACAO` como botão no **Kanban** e no **Blitz**.
- **Confirmação** nas ações em massa (N leads).

### 4.4 Confiabilidade (resolve F12, F13, F15)
- Crons de follow-up com `AT TIME ZONE 'America/Sao_Paulo'` e vencimentos em
  **dia-calendário BRT** (não 24h fixas do navegador).
- Garantir o agendador do `push-dispatch` **ou** migrar a entrega para
  `pg_cron` + `pg_net` (como as métricas). Monitorar `push_outbox` pendente.
- **Agendar** `arquivar_leads_sem_contato_30d` (ou removê-lo, se indesejado).

### 4.5 Cadência de verdade (resolve F14, F16 — P2, decisão de negócio)
Introduzir **sequência multi-toque por temperatura**, server-side: ao concluir uma
tarefa de follow-up **sem avançar o funil**, agendar automaticamente o próximo toque
até um teto, depois marcar para reativação/arquivo. Sugestão inicial `[SUPOSIÇÃO]`:

| Temperatura | Cadência | Teto |
|---|---|---|
| Quente | D+1, D+3, D+7 | 3 toques → escala p/ gestor |
| Morno | D+2, D+7, D+15 | 3 toques → frio |
| Frio | D+30 (reativação) | 1 toque → arquivo 30d |

Decidir também se a **reativação de frio** (`EM_FOLLOWUP/FRIO_REATIVACAO`) passa a ser
dirigida pelo CRM ou continua no n8n (hoje inerte no CRM).

### 4.6 Higiene (resolve F17, F18)
- `proxima_acao` (coluna text): **exibir** no detalhe (se o copiloto escreve sugestão
  lá) **ou aposentar**. Decidir.
- Unificar a linguagem "follow-up" (um conceito, um rótulo) entre tarefa/interação/
  agendamento.

---

## 5. Onde cada mudança (proposta — diffs aditivos)

- **(a) SQL/RPC:** trigger de espelho `proximo_followup` em `tarefas`; ampliar o
  cancelamento de tarefas no fechamento/perda; consolidar o motor de tarefa-por-etapa;
  agendar `arquivar_leads_sem_contato_30d`; corrigir fuso dos crons; (P2) motor de
  cadência.
- **(b) UI React:** aba Tarefas do lead com concluir/adiar; overdue com dias+data;
  `PROXIMA_ACAO` no Kanban/Blitz; confirmação em massa; `proximo_followup` read-only
  derivado; `hoje.tsx` gravar `data_conclusao`.
- **(c) Schema:** nada de novo obrigatório (usar colunas existentes). Índices sugeridos:
  `tarefas(corretor_id, status, data_vencimento)` e `tarefas(lead_id, status)`.

---

## 6. Priorização

| Prioridade | Itens | Efeito |
|---|---|---|
| **P0 — corrige perda/erro** | F1, F2, F3, F4, F5, F6, F7 | Follow-up para de sumir/duplicar; dados batem |
| **P1 — visibilidade/confiança** | F8, F9, F10, F11, F12, F13 | Corretor vê o certo, na hora certa |
| **P2 — estrutural** | F14, F15, F16, F17, F18 | Cadência e reativação de verdade |

---

## 7. Perguntas abertas (decisão do Guilherme)

1. **Fonte única:** ok promover `tarefas` como verdade e `proximo_followup` como
   espelho derivado (read-only)?
2. **Motor de tarefa-por-etapa:** manter no client (`follow-up.ts`) ou no trigger DB?
3. **Cadência:** os intervalos por temperatura (D+1/3/7 etc.) e os tetos batem com a
   operação?
4. **Reativação de frio:** dirigida pelo CRM ou continua no n8n?
5. **`proxima_acao` (coluna):** exibir a sugestão do copiloto ou aposentar?
6. **Backlog:** o que fazer com os **587 `aguardando_retorno`** e milhares de parados
   sem follow-up agendado — gerar tarefas em lote agora (com cadência) ou deixar a
   cadência pegá-los daqui pra frente?

---

## Apêndice — Consultas de validação (só leitura)

```sql
-- Leads em follow-up sem próxima data (o buraco principal)
SELECT status, count(*) AS leads, count(*) FILTER (WHERE proximo_followup IS NOT NULL) AS com_data
FROM public.leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND status IN ('aguardando_retorno','em_atendimento','agendado','analise_credito')
GROUP BY status ORDER BY leads DESC;

-- Tarefas de follow-up abertas em leads já fechados/perdidos (vazamento F3)
SELECT t.status AS tarefa, l.status AS lead, count(*)
FROM public.tarefas t JOIN public.leads l ON l.id = t.lead_id
WHERE t.status IN ('pendente','em_andamento') AND t.tipo = 'follow_up'
  AND l.status IN ('contrato_fechado','perdido','pos_venda')
GROUP BY 1,2;

-- Tarefas concluídas sem data_conclusao (F4)
SELECT count(*) FROM public.tarefas WHERE status='concluida' AND data_conclusao IS NULL;

-- Duplicatas de follow-up abertas por lead (F6/F7)
SELECT lead_id, titulo, count(*) FROM public.tarefas
WHERE status IN ('pendente','em_andamento') AND tipo='follow_up'
GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC LIMIT 50;
```
