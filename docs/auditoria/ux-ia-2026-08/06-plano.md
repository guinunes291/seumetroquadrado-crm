# Fase 6 — Plano de implementação

> Backlog em três ondas. Todo item cabe em PR pequeno e independente.
> **Impacto** = cliques economizados × frequência semanal (Fase 4).
> **Esforço**: P = horas · M = 1–3 dias · G = mais de 3 dias.

---

## Onda 1 — Quick wins (dias)

Sem migração de dados, **sem mudança de rota**, sem tocar schema. Tudo reversível.

| # | Item | Arquivos | Impacto | Esf. | Risco | Depende de |
|---|---|---|---|---|---|---|
| 1.1 | **FAB vira menu de ação** — Registrar contato · Novo lead · SamiQ | `bottom-nav.tsx:59-66`, `registrar-contato-dialog.tsx`, `novo-lead-dialog` | **~200 cliques/sem** (#2: 4→2) | P | baixo | — |
| 1.2 | **Busca na barra de polegar** no lugar de Pipeline | `bottom-nav.tsx:13-20` | #1 e #6; melhora Fitts na ação mais repetida | P | baixo | — |
| 1.3 | **Projetos no menu do FAB** | `bottom-nav.tsx` | **~60 cliques/sem** (#6: 4→2) | P | baixo | 1.1 |
| 1.4 | **Links Úteis promovido a 1º nível**, botão único, última posição **[DECIDIDO]** | `app-sidebar.tsx:60-63` | tira 1 clique de uso diário | P | nenhum | — |
| 1.5 | **Remover toggle Operação × Minha** da home | `hoje.tsx:57-58, 113-126` | limpa o cabeçalho da tela mais aberta | P | baixo — gestor que vende perde o atalho; mitigar com seletor no rodapé | — |
| 1.6 | **Fixar ordem dos widgets**, remover personalização | `hoje.tsx:127`, `widget-registry.tsx` | H-Sinal; ninguém usou **[DECIDIDO]** | P | baixo | 1.5 |
| 1.7 | **`/match` entra no ⌘K** | `command-palette.tsx:197-244` | torna achável a única página fora de toda navegação | P | nenhum | — |
| 1.8 | **Etapa in-line no card de Atender** | `features/atendimento/queue-section.tsx`, `lead-stage-menu.tsx` | **~40 cliques/sem** (#3: 4→3) | M | médio — transição só via `transicionarLead` | — |
| ~~1.9~~ | **Filtro "parado há X dias" — MOVIDO PARA A ONDA 2** | — | — | — | — | ver 2.11 |
| 1.10 | **Corrigir o badge de aprovações** — apontar para onde a ação está | `app-sidebar.tsx:120`, `features/nav/use-nav-badges.ts` | #15: para de mentir | P | nenhum | — |

**Total Onda 1 entregue: ~160 cliques/semana por corretor**, sem uma única rota alterada.

> Item 1.10 é o mais barato do backlog e conserta um loop de trabalho quebrado. Deve ser o
> primeiro commit.

### Correção sobre o item 1.1 (descoberta na implementação)

A estimativa original creditava ao FAB a redução da tarefa #2 (registrar interação) de 4 para
2 cliques — **isso estava errado**. `RegistrarContatoDialog` exige um lead
(`registrar-contato-dialog.tsx:64-70`), e a partir de um botão global não há lead no contexto:
o caminho seria FAB → Registrar contato → escolher o lead → Salvar, os mesmos 4 toques de hoje.

O FAB entrega ganho real em **Novo lead** e **Projetos** (#6: 4 → 2). A redução da tarefa #2
depende de uma ação in-line no card da fila de Atendimento — o card hoje tem copiar script,
WhatsApp e ligar (`features/atendimento/queue-section.tsx:101-129`), mas não registrar contato.
Isso leva #2 de 4 para 3 e está proposto como item novo **1.11**, fora do que já foi aprovado.

| # | Item | Arquivos | Impacto | Esf. | Risco |
|---|---|---|---|---|---|
| 1.11 | **"Registrar contato" in-line no card de Atendimento** ✅ entregue | `features/atendimento/queue-section.tsx`, `atendimento.tsx`, `registrar-contato-dialog.tsx` | **~100 cliques/sem** (#2: 4 → 3) | P | baixo — o dialog já existe e recebe o lead do card |

> Na implementação apareceu um bug de cache pré-existente: `RegistrarContatoDialog` invalidava
> `blitz-queue` mas não `atendimento:inbox`, então um contato registrado pelo peek em
> `/atendimento` só sumia da fila quando o realtime de `interacoes` chegasse. Corrigido junto.

---

## Onda 2 — Reorganização (semanas)

Fusão de páginas, drawers e rotas novas **com redirect das antigas**.

| # | Item | Arquivos/rotas | Impacto | Esf. | Risco | Depende de |
|---|---|---|---|---|---|---|
| 2.1 | **Bloco admin sai de Operação para Configurações** **[DECIDIDO]** | `painel-gestor.tsx:79, 204-209, 300-326` → `configuracoes.tsx`; 5 redirects de `?tab=` | 12 abas → 7 | M | baixo — só move componentes montados | — |
| 2.2 | **Fundir Funil + Gargalos** | `painel-gestor.tsx:199-200, 276-285` | 7 → 6 abas; #9 numa aba só | M | baixo — mesmos filtros | 2.1 |
| 2.3 | **Fundir Leads por Corretor em Time** | `painel-gestor.tsx:203, 297-299` | 6 → 5 abas (D4) | M | baixo | 2.1 |
| 2.4 | **Rota `/financeiro`** absorve fechamento + comissões + aprovação **[DECIDIDO]** | nova rota; redirects de `/financeiro/fechamento`, `/ranking?tab=comissoes`, `/comissoes` | **#15: 5→2**; conserta o loop do badge | M | médio — `comissoes-page.tsx` monta a aprovação; mover sem quebrar RLS | 1.10 |
| 2.5 | **6ª fila "Confirmar visita" em Atender** | `features/atendimento/derive.ts:38-63`, RPC `atendimento_inbox_v4` | **#5b: ⛔ → 2** | M | médio — nova versão de RPC, usar `rpcWithFallback` | — |
| 2.6 | **8ª exceção "documentação travada" no Painel do Dia** | `painel-dia/derive.ts:9-15`, RPC `gestao_painel_dia` | **#14: ⛔ → 2** | M | médio — idem | — |
| 2.7 | **Atender ganha 3 modos** (Prioridade/Volume/Consulta); `/leads` e `/blitz` viram redirect | `atendimento.tsx`, `leads.index.tsx`, `blitz.tsx` | fecha D1 e D2; tira ~20 ações do nível primário | **G** | **alto** — é a maior mudança do plano | 1.8, 2.5 |
| 2.8 | **Oferta Ativa dividida por papel** **[DECIDIDO]** | `/oferta-ativa/nova` → aba Campanhas | coerência de papel | M | baixo | 2.1 |
| 2.9 | **Landing vira aba de Distribuição** | `leads-landing.tsx` → `/distribuicao?tab=landing` | tira item de gestão do menu do corretor | M | baixo | — |
| 2.10 | **Comparação lado a lado** em Funil e Relatórios | `funil-view.tsx`, `relatorios-view.tsx:104` | **#10 e #11**, hoje impossíveis | **G** | médio | 2.2 |
| 2.11 | **Filtro "parado há X dias"** — veio da Onda 1 | `lib/leads-views.ts:25-34`, `lib/leads-filtros.ts:66-91`, nova `leads_filtered_v4` | #13 deixa de aceitar só 5 ou 30 | M | médio | **exige migração** |

> **Por que 2.11 saiu da Onda 1.** A Onda 1 é "sem migração", e este item não cabe nessa
> restrição sem virar bug. O `CASE` de `leads_filtered_v3` termina em `ELSE true`
> (`20260728100000_leads_filtered_v3.sql:246`): um valor de `_contato` que o servidor não
> conhece devolve **a lista inteira, sem filtro**. E no caminho v3 o cliente não re-filtra —
> `if (source !== "v1") return leadsAll` (`leads.index.tsx:637`). Resultado de adicionar um
> preset só no front: a tela mostraria todos os leads como se fossem os parados. Errado em
> silêncio, na tela usada para decidir quem cobrar. Precisa de `leads_filtered_v4` +
> `leads_status_counts_v4` (as contagens dos chips leem o mesmo `_contato`), com
> `rpcWithFallback` para degradar sem quebrar.

> **2.7 é o item de maior risco do plano inteiro.** Recomendo quebrá-lo em três PRs: (a) modo
> Consulta dentro de Atender lendo a mesma query de `/leads`; (b) migrar filtros para drawer;
> (c) só então transformar `/leads` em redirect. Nunca num commit só.

---

## Onda 3 — Estrutural

| # | Item | Impacto | Esf. | Risco |
|---|---|---|---|---|
| 3.1 | **Etapas de crédito: Em Análise / Aprovada / Reprovada** **[DECIDIDO]** | responde "quantos negócios estão liberados?" — hoje impossível | **G** | **alto** — muda `LEAD_STATUS_ORDER`, transições, modais, kanban, e exige migração dos leads em `analise_credito` |
| 3.2 | **`novo` e `aguardando_corretor` entram no funil** | o kanban passa a mostrar quem acabou de chegar | M | médio — muda a leitura de todos os gráficos de funil |
| 3.3 | **Home por papel** (sem toggle) | separa as duas caras de vez | M | baixo | 
| 3.4 | **Verificação das ~30 RPCs órfãs** por `pg_stat_statements` (7 dias) | fecha a dúvida sobre consumidor externo antes de eliminar | P | nenhum |
| 3.5 | **Conectar `leads_search_v2` ao ⌘K** | tira a query `ilike` do cliente | P | baixo |
| 3.6 | **Remover o papel `superintendente`** dos guards **[DECIDIDO: legado]** | simplifica a matriz de permissão | M | médio — tocar RLS exige cuidado |

> **3.1 antes de 3.2.** Ambas mexem no funil; fazer juntas dobra a superfície de erro num
> componente que o time inteiro usa.

---

## Matriz impacto × esforço

```
ALTO   │ 1.1 ●        │ 1.8 ●   2.5 ●    │ 2.7 ●
IMPACTO│ 1.2 ● 1.3 ●  │ 2.4 ●   2.6 ●    │ 3.1 ●
       │ 1.10 ●       │ 2.1 ●            │ 2.10 ●
       ├──────────────┼──────────────────┼───────────
MÉDIO  │ 1.4 ● 1.7 ●  │ 1.9 ●   2.2 ●    │ 3.2 ●
       │              │ 2.3 ● 2.8 ● 2.9 ●│ 3.3 ●
       ├──────────────┼──────────────────┼───────────
BAIXO  │ 1.5 ● 1.6 ●  │ 3.5 ●            │ 3.6 ●
       │ 3.4 ●        │                  │
       └──────────────┴──────────────────┴───────────
          P (horas)      M (1-3 dias)      G (>3 dias)
```

**Quadrante de ouro (alto impacto, esforço P):** 1.1, 1.2, 1.3, 1.10 — quatro PRs pequenos que
sozinhos entregam ~300 cliques/semana e consertam o badge quebrado. Começar por aqui.

---

## O que NÃO fazer agora

| Não fazer | Por quê |
|---|---|
| **Eliminar as ~30 RPCs órfãs** | Não confirmei que não há consumidor externo. Um MCP hospedado fora ou um n8n pode chamá-las com service key — caminho invisível para este repo. Medir primeiro (3.4), eliminar depois |
| **Reescrever `/leads`** | 2.071 linhas com regra de negócio real. O caminho é esvaziá-la por partes (2.7 em três PRs), não substituí-la |
| **Mexer nos 4 modais obrigatórios** **[DECIDIDO: fricção necessária]** | Você decidiu mantê-los. O ganho na tarefa #3 vem do caminho até a etapa, não de remover a fricção |
| **Renomear conceitos do domínio** | lead, pasta, funil, repescagem, corretor, roleta ficam. As mudanças da Fase 6 são de **rótulo de navegação**, não de vocabulário |
| **Fazer 3.1 e 3.2 juntas** | Ambas mexem no funil. Dobra a superfície de erro num componente que todo o time usa |
| **Tocar as roletas** | `SECURITY DEFINER`, distribuição automática e SLA são o núcleo transacional. Fora do escopo de uma auditoria de UX |
| **Remover redirects antigos** | Os 17 atuais custam ~9 linhas cada e protegem deep links colados em WhatsApp. Custo desprezível, benefício real |
| **Personalização de layout** | Já provou não pegar. Não reintroduzir sob outra forma |

---

## Como medir depois

Cinco métricas verificáveis. As três primeiras têm baseline nesta auditoria.

| # | Métrica | Baseline (hoje) | Meta | Como medir |
|---|---|---|---|---|
| **M1** | **Cliques nas 17 tarefas críticas** | média corretor **3,0** · gestor **2,9** · 3 inexistentes | corretor ≤2,0 · gestor ≤2,0 · **0** inexistentes | recontar pela Fase 4 após cada onda; idealmente instrumentar (evento por ação, do toque inicial à conclusão) |
| **M2** | **Itens no menu de 1º nível** | corretor 5 (+`/leads` duplicando Atender) · gestão 6 | ≤6 por papel, sem duplicação de objeto | contar `NAV_ITEMS` filtrado por papel |
| **M3** | **Abas no hub de gestão** | **12** | **5** | contar `GESTAO_TABS` |
| **M4** | **% de RPCs sem consumidor** | **55%** (135/244); ~30 de consulta/comando | <10% de consulta/comando sem consumidor | cruzar `pg_stat_statements` (7 dias) com o grep de `src/` — o método está em `01-inventario.md §4` |
| **M5** | **Tempo até a primeira ação útil na home** | não medido | <5 s do login à primeira ação disparada | evento de telemetria: `login` → primeiro clique que dispara mutation |

Duas métricas de saúde que **não** devem piorar:

- **Rotas órfãs** (fora de menu, bottom nav e ⌘K): hoje **1** (`/match`, intencional). Meta: **0**
  após o item 1.7.
- **Cobertura de estado vazio/erro**: hoje **7/7** nas páginas amostradas. Meta: manter 100%.

---

## Sequência recomendada

```
Semana 1  │ 1.10 → 1.1 → 1.2 → 1.3 → 1.4        (quadrante de ouro + Links Úteis)
Semana 2  │ 1.5 → 1.6 → 1.7 → 1.9                (limpeza + achabilidade)
Semana 3  │ 1.8 → 2.1                            (etapa in-line + admin sai da Gestão)
Semana 4-5│ 2.2 → 2.3 → 2.4                      (fusões + rota Dinheiro)
Semana 6-7│ 2.5 → 2.6                            (as duas tarefas inexistentes)
Semana 8+ │ 2.7 em 3 PRs → 2.10                  (a fusão grande)
Depois    │ 3.4 → 3.5 → 3.1 → 3.2 → 3.3 → 3.6   (medir antes de estruturar)
```

O item **3.4 vem antes de qualquer eliminação** — medir o consumo real das RPCs antes de apagar
qualquer coisa.
