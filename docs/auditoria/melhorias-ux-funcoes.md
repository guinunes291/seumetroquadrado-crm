# Melhorias de UX e Funções — CRM Seu Metro Quadrado

**Data:** 2026-06-24 · **Método:** varredura das ~30 telas por 3 auditorias paralelas
(ciclo do lead, produtividade, gestão/analytics) + verificação manual. Foco em **usabilidade**
e **funções faltantes** (bugs/segurança estão em `relatorio-tecnico.md`).

Cada item: **Onde · Problema · Sugestão · Esforço (P≤1d / M 2-5d / G 1-3sem) · Prioridade (P0/P1/P2)**.
Itens marcados ✅ foram **implementados nesta leva** (ver diff do branch).

---

## Resumo executivo

A base é sólida (funil, kanban, distribuição, timeline, gamificação, IA de match, command
palette). O que pesa são **papercuts**: ~3-5 s de fricção por ação × dezenas de ações/dia ×
corretor. Em uma equipe de 10, isso é da ordem de **dezenas de horas/mês**. As maiores alavancas
são: **registrar contato/nota em 1 clique**, **urgência visível (SLA) em todo lugar**,
**adiar/snooze sem reabrir formulário**, **confirmações em ações destrutivas** e **empty states
que oferecem a próxima ação**.

Esta leva entregou 7 quick wins (abaixo). O restante está priorizado para as próximas levas.

---

## Quick wins implementados nesta leva ✅

1. **SLA no detalhe do lead** — `leads.$leadId.tsx` passa a exibir o contador de SLA (reusa
   `sla-badge.tsx` e a view `leads_com_sla`) ao lado do status. Antes só existia no kanban.
2. **Nota rápida inline na timeline** — `leads.$leadId.tsx`: textarea + Ctrl+Enter grava uma
   nota (interação interna) sem abrir o modal completo. Registrar é a ação nº 1 do corretor.
3. **Split "Iniciar atendimento"** — `leads.index.tsx`: botão dispara o último tipo usado
   (WhatsApp/ligação) em 1 clique; dropdown troca o tipo ou abre o modal. Antes eram 2 passos.
4. **Snooze de tarefa** — `tarefas.tsx`: "Adiar 1h / 1 dia / 1 semana" sem abrir o editor.
5. **Presets de lembrete** — `agendamentos.tsx`: select (5/15/30/60/120/1440 min) no lugar do
   campo numérico.
6. **Confirmações destrutivas** — `AlertDialog` antes de **bloquear corretor** (`corretores.tsx`)
   e antes de **excluir visão salva** (`leads.index.tsx`).
7. **Empty states úteis** — metas (botão "criar meta do mês"), comissões (explica que são
   geradas na venda) e dashboard (orienta ajustar o filtro de data).

---

## Por tela (priorizado)

### Lista de Leads (`leads.index.tsx`)
- **Próximo lead automático após ação** · após registrar/avançar, abrir o próximo da fila · M · **P1**.
- **Ações em massa avançadas** (mudar temperatura, agendar follow-up, registrar nota em lote);
  hoje só há ligação/transferir/lixeira · M · **P1**.
- **Ordenação configurável** (recente, antigo, temperatura, inatividade); hoje é fixa · M · **P1**.
- **Colunas configuráveis** (mostrar renda/entrada/FGTS inline) · M · **P2**.
- **Tags/etiquetas** ("precisa visita", "aguarda assinatura") · M · **P2**.
- **Export CSV** dos leads filtrados · P · **P2**.
- **Mobile**: aumentar botões WhatsApp/ligar (hoje `h-7 w-7`) e o de roleta · P · **P1**.
- **Lembrar página** ao voltar de um lead (paginação reseta) · P · **P2**.

### Detalhe do Lead (`leads.$leadId.tsx`)
- **Edição inline de campos críticos** (nome/telefone/projeto) sem abrir o modal gigante · M · **P1**.
- **Feed unificado** na timeline (mudanças de status + tarefas + agendamentos, não só interações) · M · **P2**.
- **Anexos** (documentos, fotos de visita, prints) · M · **P2**.
- **Validação de CPF/renda/entrada** ao editar (evita dado sujo) · P · **P1** (também citado no relatório técnico).
- **Remover o dropdown "Mudar para…" redundante** (há botão + menu + select para a mesma coisa) · P · **P2**.

### Kanban (`kanban.tsx`)
- **Abrir o modal automaticamente** ao soltar o card numa coluna que exige dados
  (agendado/visita/crédito/contrato) — hoje o card "volta" sem feedback claro · P · **P1**.
- **Quick actions no card** (📞/💬 ao hover) · M · **P2**.
- **Contagem de "parados" por coluna** (sem contato há N dias) · P · **P2**.
- **Mobile**: kanban horizontal é difícil; oferecer visão lista/coluna única · M · **P2**.

### Distribuição (`distribuicao.tsx`)
- **Feedback no "Rodar agora"** (quantos leads, para quem) · P · **P1**.
- **Confirmação no "Zerar cotas"** · P · **P1**.
- **Simulador/preview** da próxima rodada · M · **P2**.
- **Reordenar por drag** em vez de ↑/↓ · M · **P2**.

### Oferta Ativa (`oferta-ativa.*`)
- **Ações em massa** (marcar todos contatados; filtro por status dentro da lista) · M · **P1**.
- **Duplicar lista** com novos filtros · P · **P2**.
- **Envio de template em massa** para não-contatados · M · **P2**.

### Agendamentos (`agendamentos.tsx`)
- **Click-to-create no calendário** (clicar no dia já pré-preenche) · M · **P1**.
- **Drag-to-reschedule** no calendário · G · **P2**.
- **Aviso de conflito de horário** em tempo real · M · **P1**.
- **Recorrência** (visita semanal) · M · **P2**.
- **Mobile**: form longo em modal → usar drawer/stepper · M · **P2**.

### Tarefas (`tarefas.tsx`)
- **Quick-add inline** (1 linha + Enter) sem o modal · M · **P1**.
- **Ordenar por prioridade + vencimento** por padrão; seção "Atrasadas" no topo · P · **P1**.
- **Resultado ao concluir** (campo "próximos passos") · P · **P2**.
- **Recorrência / checklist** dentro da tarefa · M · **P2**.

### Meu Painel (`meu-painel.tsx`)
- **Tornar a home pós-login** (hoje é `/dashboard`; corretor quer ação, não análise) · P · **P1** (decisão de produto).
- **Fila de ação unificada** (SLA + quentes + follow-up + agenda numa lista priorizada) · M · **P1**.
- **Indicador de ritmo** ("8/20 ligações; precisa acelerar") · M · **P2**.
- **Celebração ao bater meta** · P · **P2**.

### Blitz (`blitz.tsx`)
- **Auto-gerar resumo IA** ao trocar de lead (hoje exige clique) · M · **P1**.
- **Ajuda dos atalhos** (modal "?" na 1ª vez) · P · **P2**.
- **Marcar "liguei/sem resposta" em 1 clique** sem trocar de lead · P · **P2**.

### Match (`match.tsx`)
- **Pré-preencher dados do cliente** quando vier `?leadId=` · M · **P1**.
- **Compartilhar resultado** com o cliente (link/PDF) · M · **P2**.
- **Mobile**: stepper 3 passos e grids 2×2 apertados · M · **P2**.

### Templates (`templates.tsx`)
- **Preview com variáveis substituídas** (`{{nome}}` → "João") · P · **P1**.
- **Usar template a partir do lead** (atalho contextual) · M · **P2**.
- **Aviso de variável não preenchida** antes de enviar · P · **P2**.

### Dashboard (`dashboard.tsx`)
- **Drill-down nos KPIs** (clicar abre detalhe) · M · **P1**.
- **Comparativo período-a-período** (↑↓ % vs. semana/mês anterior) · M · **P1**.
- **Filtro "minha equipe / todo time"** para gestor · M · **P1**.
- **Alerta de meta em risco** · M · **P1**.
- **Export PDF** · M · **P2**.
- **Auto-refresh** para modo TV · P · **P2**.

### Ranking (`ranking.tsx`)
- **Filtro por equipe** · M · **P1**.
- **Persistir aba/mês em query params** · P · **P2**.
- **Tooltip de decomposição de pontos** · P · **P2**.
- **Real-time** (hoje refetch periódico) para TV · M · **P2**.

### Metas (`metas.tsx`)
- **Progresso real vs. meta** (barra "4/10 vendas") · M · **P1**.
- **Corretor enxergar a própria meta** (hoje só admin/gestor) · M · **P1**.
- **Copiar do mês anterior** · P · **P2**.
- **Alerta de meta vencendo** · P · **P2**.

### Comissões (`comissoes.tsx`)
- **Paginação** (hoje corta em 500) · M · **P1**.
- **Filtro por período** · P · **P1**.
- **Totais respeitam o filtro ativo** · P · **P1**.
- **Forecast de comissão do mês** · M · **P2**.
- **Export para contador** · M · **P2**.

### Corretores (`corretores.tsx`)
- **Debounce na busca** · P · **P2**.
- **Convite por e-mail / reset de senha** · M · **P1**.
- **Último acesso** por corretor · M · **P2**.
- **Aviso de gestor sem equipe** · P · **P2**.

### Equipes (`equipes.tsx`)
- **Ver membros e performance** da equipe direto · M · **P1**.
- **Aviso ao desativar equipe** (impacto em corretores/leads) · P · **P1**.
- **Meta por equipe** com progresso · M · **P2**.

### Copa / Conquistas (`copa.tsx`, `conquistas.tsx`)
- **Aba "meu desempenho"** para o corretor (pontos, confrontos) · M · **P1**.
- **Notificação de novo confronto / conquista** · M · **P2**.
- **Critério de desbloqueio visível** nas conquistas bloqueadas · P · **P2**.
- **Admin: modal "definir vencedores"** com filtro por fase/paginação · M · **P2**.

### Projetos (`projetos.index.tsx`, `projetos.$projetoId.tsx`)
- **Ordenação** (preço, entrega) e **busca na tabela de unidades** · M · **P1**.
- **"N unidades disponíveis"** no card · P · **P1**.
- **Status de unidade com cor** (disponível/reservada/vendida/bloqueada) · P · **P1**.
- **Bulk de status de unidades** · M · **P2**.
- **Mapa de empreendimentos** (geocoding) · G · **P2**.
- **Favoritar / comparar projetos** · M · **P2**.

### Navegação / componentes
- **Command palette (⌘K)**: já existe (busca de leads + navegação). Falta **ações rápidas**
  (novo lead, nova tarefa) e **leads recentes** · M · **P2**.
- **Notification bell**: marcar lido ao abrir; filtro por tipo; "ver todas" · P · **P2**.
- **Sidebar**: badges de contagem (tarefas/alertas); colapsar seções · M · **P2**.

---

## Automações sugeridas (vs. já existentes)

**Já existem** (não refazer): distribuição automática (`distribuir_lead` + cron), comissão na
venda (trigger), limpeza da lixeira 90d (cron), alertas de tarefa atrasada / agendamento próximo
/ leads parados (crons), recálculo de temperatura (cron).

**Faltam:** lembrete ao cliente 24h/1h antes da visita (WhatsApp); criar tarefa automática ao
agendar follow-up; push 1h antes do vencimento da tarefa; sugerir próximo status ao concluir
tarefa vinculada; conquista em tempo real ao bater critério; alerta de meta em risco.

---

## Falsos positivos / já implementado (transparência)

A varredura sugeriu vários itens que **já existem**; registramos para não desperdiçar esforço:
- **Busca global / navegação por teclado** → `command-palette.tsx` (⌘K).
- **Distribuição automática de leads** → RPC `distribuir_lead` + cron.
- **Cálculo automático de comissão** → trigger `gerar_comissao_da_venda`.
- **Limpeza automática da lixeira (90d)** → cron `expirar-lixeira`.
- **Import de projetos em massa** → `import-projetos-dialog.tsx`.
- **Erros de import linha a linha** e **validação ao criar Oferta Ativa** → já entregues em levas anteriores.
- **Celebração ao bater meta** → já existe em `/ranking`.

---

## Mobile / TV (resumo)

- **Mobile (corretor em campo):** botões de contato pequenos (lista/painel); modais longos
  (agendamento/tarefa) deveriam ser drawers; kanban horizontal difícil; stepper do match apertado.
- **TV (escritório):** ranking já é excelente; dashboard serve mas precisa de auto-refresh.
  Ambos ganhariam com real-time em vez de refetch periódico.

---

## Top 20 quick wins (priorizado)

1. ✅ Split "iniciar atendimento" (1 clique) · 2. ✅ Nota rápida inline · 3. ✅ SLA no detalhe ·
4. ✅ Snooze de tarefa · 5. ✅ Presets de lembrete · 6. ✅ Confirmações destrutivas ·
7. ✅ Empty states com ação · 8. Próximo lead automático após ação · 9. Quick-add de tarefa ·
10. Abrir modal ao soltar card no kanban · 11. Feedback no "Rodar agora" da distribuição ·
12. Preview de template com variáveis · 13. Pré-preencher cliente no match via `leadId` ·
14. Ordenação na lista de leads · 15. Drill-down de KPI no dashboard · 16. Progresso real em metas ·
17. Paginação + filtro de período em comissões · 18. Status de unidade com cor + busca ·
19. Mobile: aumentar botões de contato · 20. "Meu Dia" como home (decisão de produto).
