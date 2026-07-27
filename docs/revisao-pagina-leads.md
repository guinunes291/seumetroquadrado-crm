# Revisão completa — Página de Leads (`/leads`)

**Data:** 2026-07-26 · **Escopo:** `leads.index.tsx` e todo o ecossistema que a página monta
(tabela, cards, Kanban embutido, peek drawer, modo foco, ações em lote, RPCs `leads_filtered_v2`
/ `leads_status_counts_v2` / `pipeline_stage_page_v2` / `leads_sla_pendentes`, importação e
criação de lead). Cruzado com dados reais de produção (via MCP do CRM) e com as revisões
anteriores (`docs/revisao-crm.md`, `docs/auditoria/*`) para não repetir o que já foi feito.

Formato dos itens: **Problema → Proposta · Esforço (P ≤1d / M 2-5d / G 1-3sem) · Prioridade.**

---

## 1. O que a página já faz bem (manter)

A base é forte — a revisão abaixo é de lapidação e de coerência, não de reconstrução:

- **Prioridade operacional no servidor** (ADS aguardando → com projeto → demais), paginação e
  contagens 100% server-side na v2, com fallback declarado para a v1.
- **Chips de status com contagem real**, filtros rápidos de contato, **visões salvas** por usuário
  e drill-through por URL vindo das telas de gestão.
- **Split "Iniciar atendimento"** (1 clique com o último tipo usado), botão de **próxima ação por
  etapa** (`PROXIMA_ACAO`), WhatsApp que **registra a interação** na timeline.
- **Modo foco** (tecla F, J/K), **peek drawer** com score, **motor anti-perda** (follow-up
  automático por transição) e **Desfazer** ao mover para a lixeira.
- Kanban com drag & drop próprio (mouse + long-press), validação de transição **antes** do drop
  com toast explicativo, snapshot agregado por etapa (quantidade, parados 7d+, VGV).
- DataTable com colunas ocultáveis, densidade, seleção e sort server-side (whitelist).
- Dedup transacional por telefone no "Novo lead" (`criar_lead_dedup`), máquina de estados
  espelhada do banco, acessibilidade acima da média (aria-pressed, aria-live no Kanban, alvos 44px).

---

## 2. Números de produção que mudam a leitura da página

Fonte: MCP do CRM (funil canônico = `leads.status`), 26/07/2026:

| Métrica                                                                                                                                                                 | Valor                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Total de leads                                                                                                                                                          | **55.060**                                 |
| Em status **fora do funil exibido** (soma de `qualificado`, `agendado`, `visita_realizada`, `proposta_enviada`, `contrato_fechado`, `pos_venda`, `aguardando_corretor`) | **45.660 (83%)**                           |
| `em_atendimento`                                                                                                                                                        | 4.743                                      |
| `aguardando_atendimento`                                                                                                                                                | 3.504                                      |
| `aguardando_retorno`                                                                                                                                                    | 1.051                                      |
| `analise_credito`                                                                                                                                                       | 67                                         |
| `perdido`                                                                                                                                                               | **7**                                      |
| Temperatura                                                                                                                                                             | 166 quentes · 21.214 mornos · 33.611 frios |
| Corretores "ativos"                                                                                                                                                     | 41 (inclui ao menos 6 contas de teste/bot) |

Três conclusões operacionais saem direto daí:

1. **A página só "enxerga" nos chips ~17% da base.** Os chips de status iteram apenas as 8
   etapas do funil (`LEAD_STATUS_ORDER`); os 45,6 mil leads restantes estão em status **válidos
   do enum** porém fora dessa lista (`qualificado`, `proposta_enviada`, `pos_venda`,
   `aguardando_corretor`, `novo`…) e só aparecem no chip "Todos" (55 mil vs soma dos chips
   ~9,4 mil). Para o gestor, a conta nunca fecha. _(Correção sobre a 1ª versão desta revisão:
   `leads.status` é enum e nunca conteve `descartado`/`ganho`/`vendido` — esses valores são do
   vocabulário do MCP, que falhou ao contá-los justamente por não existirem; o "(outros)" da
   consulta é a soma dos status do enum que ele não enumerou.)_
2. **Ninguém marca lead como perdido** (7 em 55 mil). O funil incha em `em_atendimento` /
   `aguardando_retorno` para sempre, e as taxas de conversão por etapa do Kanban ficam sem sentido.
3. **O gargalo é priorização dentro do miolo do funil**: 4.743 leads em atendimento e 1.051
   aguardando retorno, mas a ordenação padrão só prioriza `aguardando_atendimento`; todo o resto
   é ordenado por **data de criação**, sem considerar última interação, temperatura, follow-up
   vencido ou SLA.

---

## 3. P0 — Incoerências que afetam a operação hoje

### 3.1 Status fora do funil invisíveis nos chips (83% da base)

- **Problema:** os chips de status renderizam só as 8 etapas de `LEAD_STATUS_ORDER`; leads em
  `qualificado`, `proposta_enviada`, `pos_venda`, `aguardando_corretor` e `novo` (45,6 mil hoje)
  não têm chip próprio — só aparecem em "Todos", e a soma dos chips nunca bate com o total.
  _(O enum `lead_status` já restringe os valores; não há valores "legados" fora dele — a
  correção é de exibição, não de dados.)_
- **Proposta:** chips **dinâmicos** para qualquer status com contagem > 0 fora do funil
  (rótulo via `LEAD_STATUS_LABEL`), mantidos depois dos chips fixos. Decisão de produto
  complementar: triar essa massa (requalificar/descartar) usando o descarte em lote de 3.3.
- **Esforço P · P0.**

### 3.2 Gestor cria lead que ele mesmo não vê

- **Problema:** o escopo vigente da `leads_filtered_v2` (20/07) exclui leads órfãos para gestor
  ("carteira + equipe, sem `corretor_id IS NULL`"), mas o dialog "Novo lead" faz o **gestor criar
  lead sem corretor** ("atribua depois pela lista"). Ele cria, o lead some. O filtro
  "Sem corretor" também retorna vazio para gestor.
- **Proposta:** (a) no dialog, gestor escolhe corretor do time (select) ou distribui via roleta;
  (b) incluir órfãos no escopo do gestor (decisão de produto — provavelmente sim, órfão é
  responsabilidade da gestão); (c) alinhar `leads_sla_pendentes` (hoje gestor = organização
  inteira) ao mesmo modelo de escopo da lista.
- **Esforço P-M · P0.**

### 3.3 Funil sem saída: disciplina de "perdido"

- **Problema:** 7 perdidos em 55 mil. Existe categoria oficial de perda (11 motivos), fluxo
  dedicado e botão Descartar em cada linha — mas nada **empurra** o descarte; leads mortos ficam
  como "em atendimento" para sempre e poluem toda métrica.
- **Proposta:** rotina de higiene visível na própria página: visão pronta "Sem contato 30d+"
  com ação em lote **"Descartar com motivo"** (hoje não existe descarte em lote) + sugestão
  automática no card/linha ("90 dias sem contato — descartar?"). Cron opcional que move para
  um status "inativo" reversível após N dias.
- **Esforço M · P0** (o descarte em lote com motivo é a peça que falta).

### 3.4 Bugs pontuais encontrados no código

- **`TransferSlaBadge` invalida query key morta** `["kanban-leads"]` — o Kanban usa
  `["pipeline-stage-v2"]`/`["pipeline-snapshot-v2"]`; quando o repasse dispara, o quadro não
  atualiza. Também dispara a RPC **no corpo do render** (deveria ser `useEffect`). · **P · P0**
- **"Novo lead" não invalida** `["leads-status-counts"]` nem as keys do pipeline — contadores e
  Kanban ficam defasados após criar. · **P · P0**
- **Sort no fallback v1 finge funcionar**: o indicador da coluna muda, a ordem não; a prop
  `source` chega na `LeadsTable` e não é usada (nem um tooltip "ordenação indisponível"). · **P · P1**
- **`bulkTransferir` parcialmente aplicado sem relatório**: chunks de 100 abortam no meio sem
  dizer quantos foram; o insert de timeline (1 linha/lead) não tem chunk nem tratamento de erro. · **P · P1**
- Contagens de status **refazem a cada troca de página** (`page` está no queryKey dos counts sem
  necessidade). · **P · P2**

---

## 4. Melhorias para o CORRETOR (dia a dia)

### 4.1 Priorização de verdade no miolo do funil ⭐ maior alavanca

- **Problema:** dentro do grupo "demais status" (4,7 mil leads em atendimento), a ordem padrão é
  `created_at DESC`. O **score de prioridade já existe** (`lib/priority.ts`, 0-100 com temperatura
  - etapa + SLA + dias parado) mas só aparece no peek e no modo foco — nunca na tabela, nunca como
    ordenação, e **sempre sem o componente de SLA** (nenhum chamador passa `slaStatus`).
- **Proposta:** levar o score para o servidor (coluna calculada na `leads_filtered_v2` ou
  materializada por cron junto com a temperatura) e: (a) coluna "Prioridade" sortable na tabela,
  (b) tornar o score o critério de desempate da prioridade operacional padrão, (c) alimentar
  `slaStatus` no peek/foco a partir de `leads_sla_pendentes`.
- **Esforço M · P1.**

### 4.2 Modo foco como esteira de trabalho completa

- **Problemas:** a fila é só a **página atual (50)**, não o recorte filtrado; `startId` está
  implementado mas nunca alimentado (não existe "trabalhar a fila a partir deste lead");
  não há atalhos de ação (só J/K navegam); depois de agir é preciso avançar manualmente.
- **Proposta:** fila = ids do recorte inteiro (a RPC pode devolver só ids até um teto, ex. 500);
  entrada "Focar a partir daqui" no menu da linha; atalhos **W** (WhatsApp), **L** (ligação),
  **R** (registrar contato), **E** (mudar etapa); auto-avançar após registrar contato/mudar etapa
  — fecha o item "próximo lead automático após ação" pendente desde a auditoria de junho.
- **Esforço M · P1.**

### 4.3 Coluna e sort "Última interação" (quick win)

- A whitelist da v2 **já aceita** `ultima_interacao` — a tabela é que não oferece a coluna.
  Adicionar coluna "Último contato" (relativa: "há 3 dias" / "nunca") sortable. Com ela, o
  corretor ordena a carteira por "quem estou deixando esfriar" em 1 clique. · **P · P1**

### 4.4 Follow-up visível na linha (dado hoje morto)

- **Problema:** a v2 devolve `tem_followup` e o campo morre no tipo — nenhuma coluna, chip ou
  flag o exibe; o booleano nem diz se está vencido.
- **Proposta:** evoluir a RPC para devolver `proximo_followup` (data) e expor: chip
  "Follow-up hoje/vencido" (flag com intent danger) + coluna opcional. Complemento: ação
  "+ Follow-up" na linha (hoje follow-up só existe em lote). · **P-M · P1**

### 4.5 Uma régua única de "lead esfriando"

- **Problema:** quatro réguas divergentes para a mesma ideia: flags (5d/10d), badge "Nd parado"
  (2d/5d), Kanban (2d/5d no card, 7d no header), filtro "Sem contato 5+ dias" — com listas de
  status excluídos diferentes entre `lead-flags.ts` e `lead-indicators.tsx` (ex.: lead em `novo`
  pode ganhar flag "Parado 10d+" sem o badge de dias). Na mesma célula aparecem "Sem contato 5d+"
  e "5d parado" juntos.
- **Proposta:** um módulo único de limiares (constantes nomeadas, injetáveis por config no futuro)
  consumido por flags, badge, Kanban e filtros; exibir **um** sinal por linha (flag com o número de
  dias dentro: "Parado · 12d"). · **P-M · P1**

### 4.6 Peek drawer que resolve sem sair dele

- **Problemas:** sem "Registrar contato" e sem "Mudar etapa" (só o botão de próxima ação); não
  mostra flags nem SLA (linha e peek contam histórias diferentes); erros de query são engolidos
  (viram "nenhuma interação"); queries duplicam `use-lead-detail` com limites diferentes.
- **Proposta:** adicionar as duas ações que faltam, reusar `use-lead-detail` (com staleTime e
  tratamento de erro) e exibir os mesmos chips/flags da linha. · **P-M · P1**

### 4.7 Kanban integrado à lista

- **Problemas:** trocar Lista↔Kanban **descarta todos os filtros** (o Kanban tem busca própria e
  nenhum filtro, embora a RPC aceite `_corretor_id`/`_projeto_id`); o card não abre o lead nem o
  peek; o filtro cliente extra usa o texto **não debounced** e só nome/telefone (dessincroniza do
  contador); mobile é uma etapa por vez sem indicação de que o drag não funciona (o menu resolve,
  mas nada orienta).
- **Proposta:** Kanban recebe os filtros ativos da página (mínimo: corretor, projeto, temperatura,
  busca compartilhada); clique no card abre o peek (mesma affordance da lista); remover o filtro
  cliente duplicado. · **M · P1**

### 4.8 Papercuts de ação

- "Descartar" duplicado (botão `Ban` + item do menu ⋯) — manter um. · **P · P2**
- Bulk "Registrar ligação" e "Temperatura" usam `window.confirm` (feio e inconsistente com o
  `AlertDialog` usado no resto). · **P · P2**
- Transições que abrem modal são sinalizadas só por um "…" de 10px no menu — trocar por ícone/
  sufixo claro ("abre formulário"). · **P · P2**
- Temperatura clicável na linha (chip abre dropdown quente/morno/frio) — pendente desde junho. · **P · P2**

---

## 5. Melhorias para o GESTOR

### 5.1 Seleção e lote na escala real da base

- **Problema:** a seleção é limitada à página (50); com 3,5 mil aguardando atendimento, transferir
  ou descartar uma safra inteira exige 70 repetições. Não existe "distribuir em lote pela roleta"
  (só individual) nem "descartar em lote com motivo".
- **Proposta:** banner "Selecionar todos os N do filtro" (padrão Gmail) executando o lote no
  servidor por **filtro**, não por lista de ids (RPC `bulk_*` que recebe os mesmos parâmetros da
  `leads_filtered_v2`); adicionar roleta em lote e descarte em lote com motivo; relatório de
  parciais ("87 de 100 transferidos, 13 falharam"). · **M-G · P1**

### 5.2 Export CSV do recorte filtrado

- Não existe nenhum export na página (só import). Gestor vive pedindo a lista para planilha.
  Botão "Exportar CSV" com os filtros ativos (server function paginando a v2 até o teto, com as
  colunas visíveis). · **P-M · P1**

### 5.3 Importação operacionalmente completa

- **Problemas:** insere linha a linha (planilha grande = minutos sem feedback), telefone salvo
  **cru** (sem normalização — mina o dedup futuro), não usa o `criar_lead_dedup` transacional,
  não atribui corretor nem dispara roleta (tudo cai em `novo` e depende de distribuição
  posterior), sem batch id/desfazer, sem download do relatório de erros.
- **Proposta:** lote com RPC única (array), telefone normalizado, opções "atribuir a corretor X"
  / "distribuir via roleta" no passo 2, `import_batch_id` para desfazer, botão "Baixar CSV de
  erros". · **M · P1**

### 5.4 Higiene do cadastro de corretores

- 41 "ativos" incluem `docs-bot`, "Edson teste junior", 2× "Meu metro De Login", 2× "Leticia
  amaral braga" (e-mails descartáveis). Essas contas aparecem no filtro de corretor, no dialog de
  transferência e (pior) são elegíveis na roleta. Desativar/flagar contas de teste e esconder
  bots dos selects. · **P · P0-P1**

### 5.5 Sinais agregados que o banco já entrega e a UI joga fora

- O snapshot do Kanban devolve `followups_vencidos` e `sem_proxima_acao` por etapa e o quadro não
  os exibe. São exatamente os dois números de cobrança do gestor. Exibir como badges no header da
  coluna (clicáveis → filtram). · **P · P1**

### 5.6 Filtros compartilháveis (URL de saída)

- A URL só **entra** (drill-through); mexer nos filtros não a atualiza. Gestor não consegue mandar
  "olha essa fila" para um corretor. Sincronizar filtros → URL (o helper `filtrosParaSearch` já
  existe e está sem uso) e, num segundo passo, visões salvas no banco (compartilháveis por equipe)
  em vez de localStorage. · **P (URL) / M (visões no banco) · P1-P2**

### 5.7 Coerência de escopo entre as camadas

- Hoje: lista = carteira+equipe sem órfãos; contagens = equipe; `leads_sla_pendentes` = org
  inteira; `tem_followup` = qualquer corretor; Kanban = `pode_acessar_lead` por linha. Cada
  superfície responde "quantos leads tenho?" de um jeito. Consolidar numa única função de escopo
  (a dupla `ve_carteira_completa`/`corretores_do_gestor` já é o começo) usada por todas as RPCs. · **M · P1**

---

## 6. Dívidas menores / P2

- **Score sem SLA:** `scoreLead` aceita `slaStatus` (+20/+10) e nenhum chamador passa — ver 4.1.
- **`InatividadeBadge`** usa `Date.now()` direto (não testável) — alinhar com `leadFlags(opts.now)`.
- **Três tipos paralelos** (`Lead`, `PeekLead`, `LeadDetail`) e dois caminhos de fetch para
  interações/tarefas com limites e tratamento de erro diferentes.
- **Lembrar página/scroll** ao voltar do detalhe do lead (paginação reseta).
- **Colunas opcionais extras** no DataTable (o mecanismo de visibilidade já existe): Corretor
  visível por padrão para gestor, Renda/Entrada/FGTS opcionais, Score, Último contato.
- **Kanban:** colapsar colunas, VGV total do quadro, swimlane por corretor para gestor.
- **Temperatura automática subcalibrada?** 166 quentes em 55 mil (0,3%) — com tão poucos quentes,
  a flag "Em risco" quase nunca dispara. Revisar o cron `recalcular_temperatura_leads` junto com
  a limpeza dos status legados (3.1), senão a régua nova nasce torta.
- **Sort por `status`/`temperatura`** na v2 ordena alfabeticamente pelo texto do enum (ex.: frio <
  morno < quente por acaso, mas status não segue o funil) — mapear para ordem semântica.

---

## 7. Plano sugerido (3 ondas)

**Onda 1 — Verdade dos números (1 semana):**
3.1 saneamento de status legados · 3.2 escopo do gestor + lead órfão · 3.4 bugs pontuais ·
5.4 contas de teste · 4.3 coluna Última interação.

**Onda 2 — Máquina de trabalhar leads (2-3 semanas):**
4.1 score no servidor + coluna/sort · 4.2 modo foco completo (fila total, atalhos, auto-avançar) ·
4.4 follow-up visível · 4.5 régua única de esfriamento · 3.3 descarte em lote com motivo ·
5.5 badges agregados no Kanban.

**Onda 3 — Escala de gestão (2-3 semanas):**
5.1 lote por filtro (selecionar todos + roleta/descarte em lote + relatório de parciais) ·
5.2 export CSV · 5.3 importação v2 · 5.6 filtros na URL + visões por equipe ·
4.7 Kanban integrado aos filtros · 5.7 escopo unificado.

---

## Arquivos-chave desta revisão

- Página: `src/routes/_authenticated/leads.index.tsx` · tabela `src/features/leads/leads-table.tsx`
- Ações/indicadores: `src/features/leads/{row-actions,lead-indicators,focus-mode,lead-peek-drawer}.tsx`
- Regras: `src/lib/{leads,lead-flags,leads-views,priority}.ts` · `src/hooks/use-lead-status.ts`
- Lote: `src/features/leads/use-lead-mutations.ts` · Kanban: `src/components/leads-kanban-board.tsx`
- SLA: `src/components/transfer-sla-badge.tsx` · `supabase/migrations/20260717100000_leads_sla_pendentes.sql`
- RPC da lista: `supabase/migrations/20260714100000_leads_filtered_v2.sql` +
  `20260720120000_leads_filtered_v2_escopo_equipe.sql`
