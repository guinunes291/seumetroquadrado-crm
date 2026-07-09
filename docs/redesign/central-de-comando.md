# Central de Comando SMQ — Proposta de redesign completo do CRM

> **Conceito:** o corretor não "abre um CRM". Ele entra na **Central de Comando** da própria
> operação comercial. Cada tela responde uma pergunta de negócio; cada dado gera uma ação;
> cada ação está a no máximo um clique. Tema padrão: **Modo Comando** (dark navy premium).
>
> Proposta 100% aterrissada no código real (TanStack Start + Tailwind v4 + shadcn + Supabase),
> aprovada com escopo total e implementada em fases nesta branch (`claude/smq-crm-redesign-v7mxt6`).

---

## 1. Diagnóstico — o que um CRM imobiliário comum faz mal

1. **É um arquivo, não um cockpit.** A home mostra relatórios do passado; o corretor precisa
   decidir sozinho o que fazer agora. Resultado: lead quente esfria enquanto o corretor rola tabelas.
2. **Informação espalhada por cliques.** Ver renda, histórico e próximo passo de um cliente exige
   3–6 cliques e 2 telas. O corretor faz isso ~50×/dia.
3. **Tabelas como interface padrão.** Tabela é ótima para auditar, péssima para agir. Nenhuma
   tabela diz "ligue para este primeiro".
4. **Follow-up depende de memória.** O sistema registra o passado mas não cobra o futuro.
   A causa nº 1 de perda de lead é ausência estrutural de próxima ação.
5. **Gestão reativa.** O gerente descobre queda de performance no fechamento do mês, não no dia 3.
6. **Relatórios que não explicam.** Gráficos bonitos sem resposta para "onde estou perdendo dinheiro?".
7. **Gamificação infantil ou ausente.** Ou não existe, ou parece joguinho — nada que um corretor
   sênior respeite.
8. **Mobile como afterthought.** O corretor vive no celular entre visitas; o CRM vive no desktop.
9. **IA como enfeite.** Chatbot genérico desconectado do contexto do lead, do funil e do produto.
10. **Identidade zero.** Todos os CRMs se parecem: sidebar cinza, cards brancos, azul-padrão-SaaS.

O CRM da SMQ já resolvia parte disso (fila de ação, score, SLA, follow-up automático, Match IA) —
mas com aparência genérica, dark mode dormante, sem copiloto na interface e sem uma experiência
que *guie* o dia. Esta proposta fecha esse ciclo.

## 2. Novo conceito geral — Central de Comando SMQ

A metáfora que organiza tudo: **torre de controle**.

- **O corretor pilota**: a home é a pista do dia — Próxima Melhor Ação no centro, fila de missões
  priorizada por score, metas como instrumentos de voo, SamiQ como copiloto no assento ao lado.
- **O gerente controla o tráfego**: painel com saúde de cada corretor, onde intervir, o que travou.
- **A diretoria enxerga a rota**: Inteligência traduz números em frases de negócio e previsão.

Três princípios inegociáveis:

1. **Toda tela responde "e agora, o quê?"** — nunca só "o que aconteceu".
2. **A prioridade é calculada, não adivinhada** — `scoreLead` (temperatura + etapa + SLA + tempo
   parado) ordena todas as filas do sistema.
3. **IA sugere, humano decide** — SamiQ nunca escreve no banco nem envia mensagem sozinho.

## 3. Nova arquitetura de navegação (máx. 7 itens)

```
1. Início        → /hoje          (Central de Comando)      [filho: Desempenho /ranking]
2. Leads         → /leads                                    [filhos: Blitz, Captação*]
3. Atendimento   → /atendimento   (NOVA — fila de ação)      [filho: Agenda & Tarefas]
4. Pipeline      → /pipeline      (NOVA — Funil + Fechamento)
5. Projetos      → /projetos                                 [filho: Vitrine]
6. Gestão        → /painel-gestor (gestor/admin)
7. Inteligência  → /inteligencia  (NOVA — insights + relatórios)
Footer: Meu perfil · Configurações (admin) · Tema · Sair       (*gestor/admin)
```

- **Mobile:** bottom nav com 5 slots — Início · Leads · **SamiQ (FAB central dourado)** ·
  Atendimento · Pipeline. Todo o resto acessível pelo menu hamburger e pela busca.
- **Command palette (⌘K)** ganha grupo "Ações": novo lead, registrar venda, iniciar sprint,
  abrir SamiQ, alternar tema — além de navegação e busca de leads.
- Rotas antigas (`/kanban`, `/radar`, `/relatorios`, `/dashboard`) **redirecionam** — nenhum
  atalho salvo quebra.

## 4. Design system — "SMQ Command"

Camada de tokens em `src/styles.css` (Tailwind v4 CSS-first), só adição — nenhum token renomeado:

- **Escalas de marca:** `navy-50…950` e `gold-50…900` (OKLCH), com aliases legados `--navy`/`--gold`.
- **Superfícies glass:** `--glass` + `--glass-border` + utilitário `glass-panel`
  (backdrop-blur 12px, fallback sólido via `@supports`). Usado com moderação: sidebar, header,
  bottom-nav, painel SamiQ — nunca em todo card.
- **Elevação:** `--elev-1…4` (sombras tintadas de navy no claro, pretas + inset highlight no escuro)
  e `--glow-gold` para o que merece destaque (CTA da Próxima Melhor Ação, FAB SamiQ, lead quente).
- **Gradientes:** `--gradient-command` (navy profundo radial — hero/sidebar), `--gradient-gold`
  (CTAs e medalhas), `--gradient-surface` (brilho sutil de card).
- **Movimento:** keyframes próprios `pulse-glow`, `shimmer`, `slide-fade`, `count-pop` expostos
  como `animate-*`; tudo respeita `motion-reduce`.

## 5. Paleta de cores

| Papel | Light ("Clareza") | Dark ("Modo Comando" — padrão) |
|---|---|---|
| Fundo | branco-azulado `oklch(0.99 0.002 250)` | navy profundo `oklch(0.14 0.03 250)` |
| Card | branco puro | navy elevado `oklch(0.19 0.04 250)` + inset highlight |
| Primário | navy `oklch(0.32 0.06 250)` | **dourado** `oklch(0.72 0.12 85)` |
| Destaque | dourado | dourado (glow) |
| Semânticas | success/warning/info/destructive já tokenizadas | versões clareadas p/ contraste |
| Temperatura | quente=danger, morno=warning, frio=info (chips com `dark:` variantes) | idem |

O dourado é **moeda rara**: só para prioridade máxima, conquistas e o SamiQ. Se tudo brilha, nada brilha.

## 6. Tipografia

- **Inter Variable** (já instalada) — corpo, formulários, tabelas, chips. Legibilidade em densidade.
- **Sora Variable** (nova, latin ~35KB) — `--font-display`: títulos de página, valores de KPI,
  timer do Sprint, números do ranking. Sempre `tabular-nums` em números. Geometria levemente
  técnica = sensação de instrumento, sem cair em sci-fi.

## 7. Componentes principais (novos)

| Componente | Papel |
|---|---|
| `ui/glass-card` | superfície glass com elevação e glow opcional |
| `ui/stat-tile` | KPI premium: valor em Sora, delta, sparkline, glow por intent |
| `ui/score-ring` | anel SVG 0–100 do score de prioridade / probabilidade de fechamento |
| `ui/temperature-chip` | chip de temperatura; pulse-glow apenas em `quente` |
| `ui/sparkline` | tendência em SVG puro (sem lib) |
| `ui/section-header` | eyebrow + título + ação — hierarquia consistente |
| `command-center/next-best-action` | a faixa "Próxima Melhor Ação" com botão de execução |
| `command-center/mission-queue` | fila de missões priorizada com ações inline |
| `leads/lead-peek-drawer` | dossiê-relâmpago sem sair da lista |
| `samiq/*` | launcher flutuante + painel do copiloto |
| `sprint/*` | HUD de sprint com countdown e progresso |
| `bottom-nav` | navegação mobile com FAB SamiQ |

## 8. Layout — Central de Comando (home)

```
┌─ Saudação + data + streak 🔥 ────────────── [Iniciar Sprint] [Tema] ─┐
│  ⭐ PRÓXIMA MELHOR AÇÃO                                              │
│  "Ligar para Ana agora — quente, 18h sem contato"     [Ligar] [Zap] │
├──────────────────┬──────────────────────┬───────────────────────────┤
│ FILA DE MISSÕES  │ HOJE                 │ INSTRUMENTOS              │
│ (por score, dedup│ • visitas de hoje    │ • metas do dia (rings)    │
│  WhatsApp/ligar  │ • tarefas urgentes   │ • posição no ranking      │
│  inline)         │ • sem próxima ação   │ • alertas inteligentes    │
└──────────────────┴──────────────────────┴───────────────────────────┘
```

A pergunta que a home responde: **"o que eu faço agora, e o que falta para bater minha meta hoje?"**

## 9. Layout — Leads

- Cards inteligentes com temperatura, score-ring, "Xd parado", origem, próximo passo.
- Filtros rápidos em chips com contagem viva; visões salvas; busca já poderosa (mantida).
- **Peek drawer**: clique no card abre um dossiê-relâmpago lateral (resumo, última interação,
  próxima ação, WhatsApp) — abrir a página inteira vira exceção, não regra.

## 10. Layout — Página do cliente (dossiê inteligente)

- **Header fixo**: nome, temperatura, score, etapa, valor + [WhatsApp] [SamiQ].
- **Resumo executivo** (glass): Resumo IA + Próxima Melhor Ação + badges de risco
  (dias sem contato, SLA, docs pendentes).
- Abas mantidas (Timeline, Dados, Qualificação, Tarefas, Agendamentos, Documentação) —
  com a resposta de "quem é, o que quer, o que falta" visível em <10 segundos.

## 11. Layout — Pipeline

- Kanban com **sinais por card**: score-ring, temperatura, valor potencial, próximo passo,
  dias na etapa; coluna com contagem + **% de conversão vs. etapa anterior** (o gargalo fica visível).
- **Aba Fechamento** (Modo Fechamento): leads ordenados por probabilidade de fechar
  (`probabilidadeFechamento`), docs pendentes, simulações, gap vs. meta — com destaque
  automático na segunda quinzena.

## 12. Layout — Projetos

- Cards com foto + overlay gradiente, chip de renda mínima, região, status de estoque.
- Ficha com **munição comercial em primeiro plano**: diferenciais, argumentos como "cartuchos"
  com **botão copiar mensagem de venda** (pronta para o WhatsApp), objeções frequentes, book, tabela.

## 13. Layout — Gestão

- **Visão geral** primeiro: StatTiles da operação + **"quem precisa de ajuda"** (corretores
  ranqueados por leads parados + SLA estourado) + contadores acionáveis (clicou → lista → agir).
- Abas existentes mantidas (Saúde, Distribuição, Pessoas, Comunicação, Qualidade, Comissões).
- Pergunta respondida: **"onde eu intervenho hoje?"**

## 14. Layout — Inteligência

- **Insights em linguagem de negócio no topo**, derivados dos dados: "Facebook converte 2,1×
  menos que indicação", "maior perda está entre Agendado → Visita", "previsão do mês: X vendas
  no ritmo atual". Cada insight com recomendação prática.
- Gráficos existentes (evolução, funil, motivos de perda, ranking) abaixo, como evidência.

## 15. Microinterações

- `pulse-glow` só no que é quente/urgente (chip quente, CTA da NBA, últimos 5min do sprint).
- `count-pop` em números que mudam; `slide-fade` em listas que entram; `shimmer` em loading.
- Concluir tarefa: check com micro-bounce + toast. Meta batida: anel completa com glow dourado.
- Tudo discreto, tudo com `motion-reduce:animate-none`.

## 16. Gamificação (elegante, não infantil)

- **Streak** 🔥 de dias com atividade ≥ meta (derivado de `atividades_diarias`) — home e ranking.
- **Metas do dia como instrumentos** (rings de progresso), não tabelas.
- Ranking, Copa SMQ, Conquistas e TV mode **mantidos** e revestidos com a nova identidade
  (navy/gold, Sora nos números). Medalhas com gradiente dourado.
- Sprint com resultado ao final = dopamina de fechamento de ciclo, várias vezes ao dia.

## 17. SamiQ na interface

- **FAB dourado flutuante** (desktop, canto inferior direito, ⌘J) e **slot central do bottom-nav** (mobile).
- Painel lateral (Sheet 420px / drawer mobile): header de contexto (detecta a rota — na página de
  um lead, o SamiQ já sabe de quem se fala), grid de ações rápidas + chat leve.
- **11 ações**: resumo do cliente, mensagem sugerida, resposta a objeção, próximo passo,
  projeto ideal, checklist documental, recuperação de lead frio, roteiro de ligação,
  análise do funil, prioridade do dia, pergunta livre.
- Guard-rails: rate limit por usuário, contexto RLS-scoped, **nunca escreve no banco, nunca envia
  mensagem** — devolve texto + botões de navegar/copiar; WhatsApp sempre abre para revisão humana.

## 18. Redução de cliques

| Ação | Antes | Agora |
|---|---|---|
| Saber quem chamar primeiro | rolar listas, decidir sozinho | 0 clique — NBA na home |
| Ver contexto de um lead | abrir página inteira (3–4 cliques) | 1 clique — peek drawer |
| Mandar mensagem certa | procurar template, adaptar | 1–2 cliques — SamiQ/script sugerido |
| Copiar pitch de um projeto | montar na mão | 1 clique — copiar mensagem de venda |
| Achar quem precisa de ajuda (gestor) | 6–8 telas | 0 clique — Visão geral da Gestão |
| Alternar contexto (qualquer coisa) | navegar menus | ⌘K → ação direta |

## 19. Por que dá vontade de usar todos os dias

- A home **começa o dia pelo corretor** (NBA + fila pronta) — abre-se o CRM para ganhar tempo, não perder.
- **Sprint** transforma prospecção em ciclos curtos com resultado visível.
- **Streak + metas do dia** dão razão para voltar amanhã.
- **SamiQ** tira o corretor do branco na hora da objeção.
- **Modo Comando** dark premium: identidade própria, orgulho de mostrar a tela.

## 20. Implementação técnica

- Tailwind v4 CSS-first: tudo em tokens (`src/styles.css`), zero lib nova de UI/gráfico/animação.
- Tema: classe `.dark` + script inline anti-FOUC no shell SSR + `useSyncExternalStore`;
  preferência em `localStorage["smq-theme"]`; **dark é o padrão**.
- SamiQ: `createServerFn` no padrão dos `*-ia.functions.ts` existentes (auth + zod + rate-limit +
  Lovable AI Gateway modelo flash, contexto truncado).
- Sprint/streak/insights/atendimento: **zero migration** — tudo derivado de tabelas existentes
  (`interacoes`, `tarefas`, `atividades_diarias`, `documentacoes`) e lógica pura testável.
- Testes: cada lógica nova nasce com unit test (theme, sprint, insights, atendimento-derive, samiq).

## 21. Melhorias para o corretor (dia a dia)

NBA na home e no lead · fila única priorizada · peek drawer · scripts prontos por contexto ·
Sprint com resultado · streak · SamiQ no bolso (mobile FAB) · bottom-nav de polegar ·
dark premium para plantão noturno · WhatsApp sempre a 1 clique com mensagem sugerida.

## 22. Melhorias para o gestor

Visão geral acionável ("quem precisa de ajuda") · leads parados por corretor com ação inline ·
tempo de 1ª resposta e SLA compliance visíveis · alertas de queda de performance ·
distribuição e qualidade de cadastro já existentes ganham vitrine única.

## 23. Melhorias para a diretoria

Inteligência que explica: melhor origem por conversão (onde investir mídia), gargalo do funil
(onde treinar), previsão de vendas no ritmo atual (o que esperar do mês), tração por projeto
(o que priorizar com incorporadores) — em frases, com evidência em gráfico logo abaixo.

## 24. Componentes reutilizáveis (inventário)

**Novos:** glass-card · stat-tile · score-ring · temperature-chip · sparkline · section-header ·
next-best-action · mission-queue · alert-rail · day-goals · lead-card · lead-list-row ·
lead-peek-drawer · queue-section (atendimento) · suggested-script · fechamento-view ·
samiq-launcher · samiq-panel · sprint-hud · sprint-dialog · bottom-nav · theme-toggle · insights.
**Mantidos e revestidos:** kpi-card · status-badge · sla-badge · empty-state · page-header ·
projeto-card · leads-kanban-board · resumo-ia · command-palette · notification-bell.

## 25. Plano de execução em fases

| Fase | Entrega | Status |
|---|---|---|
| 0 | Este documento | ✅ |
| 1 | Fundação: tokens, Sora, tema escuro padrão + switcher | — |
| 2 | Shell (sidebar/header/bottom-nav) + primitives novos | — |
| 3 | Central de Comando (home) | — |
| 4 | Leads: cards + peek drawer | — |
| 5 | Pipeline (Funil + Fechamento) + navegação final | — |
| 6 | Atendimento (tela nova) | — |
| 7 | Dossiê do cliente | — |
| 8 | SamiQ na interface | — |
| 9 | Sprint + gamificação + Inteligência | — |
| 10 | Gestão cockpit + Projetos + polish final | — |

Cada fase termina com `build` + `test` verdes e commit próprio — o sistema nunca fica quebrado.
