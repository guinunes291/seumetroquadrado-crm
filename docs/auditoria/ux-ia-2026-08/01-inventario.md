# Fase 1 — Inventário factual

> Matéria-prima da auditoria de UX/AI. Toda linha tem evidência em `arquivo:linha`.
> Nada aqui é opinião — julgamento é da Fase 2 em diante.
>
> Stack real verificada: **TanStack Start (file-based routing) + React 19 + Tailwind v4 +
> shadcn/ui + Supabase (Postgres, RLS, RPCs)**. Não há tRPC, Express, Drizzle nem MySQL/TiDB —
> o briefing original descrevia outra stack. O equivalente a "procedure tRPC" neste sistema é
> **função de banco (RPC)** e **rota de API** em `src/routes/api/`.

## Cobertura desta varredura

| O que foi varrido | Método | Completude |
|---|---|---|
| Rotas | `src/routes/**` completo | Total |
| Árvore de navegação | `app-sidebar.tsx`, `bottom-nav.tsx`, `command-palette.tsx`, `route.tsx` | Total |
| Funções de banco | 246 migrations em `supabase/migrations/` | Total (244 funções) |
| Consumo de RPC pelo front | match de string em todo `src/` | Total |
| Elementos acionáveis por página | leitura das rotas + contagem de mutations por feature | **Parcial** — as ações principais estão listadas; a enumeração botão-a-botão dentro de cada componente de `src/features/**` não foi feita. Onde não confirmei, está marcado `NÃO VERIFICADO`. |

---

## 1. Rotas

### 1.1 Páginas reais autenticadas (21)

| Rota | Componente | Papéis | No menu? | Linhas |
|---|---|---|---|---|
| `/hoje` | `CommandCenterPage` (`hoje.tsx:45`) | todos | **Início** (1º nível) | 173 |
| `/leads` | `leads.index.tsx` | todos; ações de gestão sob `canManage` (`leads.index.tsx:966`) | **Leads** (1º nível) | 2071 |
| `/leads/$leadId` | dossiê 360° (`leads.$leadId.tsx`) | todos (guard de carteira em `:1`) | não — filho de `/leads` | 477 |
| `/atendimento` | `AtendimentoPage` (`atendimento.tsx:47`) | todos | **Atendimento** (1º nível) | 205 |
| `/blitz` | `blitz.tsx` | todos | filho de Leads | 557 |
| `/oferta-ativa` | `OfertaAtivaPage` (`features/projetos/oferta-ativa-page`) | todos | filho de Leads | 10 |
| `/oferta-ativa/nova` | `oferta-ativa.nova.tsx` | admin/gestor | não | 473 |
| `/oferta-ativa/$ofertaId` | `oferta-ativa.$ofertaId.tsx` | admin/gestor | não | 1130 |
| `/leads-landing` | `leads-landing.tsx` | admin/gestor (`app-sidebar.tsx:78`) | filho de Leads | 455 |
| `/pipeline` | `PipelinePage` (`pipeline.tsx:22`) | todos | **Pipeline** (1º nível) | 51 |
| `/agendamentos` | `agendamentos.tsx` | todos | filho de Atendimento | 383 |
| `/modo-visita` | `ModoVisitaPage` (`features/visitas/modo-visita-page`) | todos | filho de Atendimento | 8 |
| `/projetos` | `projetos.index.tsx` | todos; escrita sob admin/gestor | **Projetos** (1º nível) | 300 |
| `/projetos/$projetoId` | `projetos.$projetoId.tsx` | todos; escrita sob admin/gestor | não | 409 |
| `/vitrine` | `vitrine.tsx` | todos | filho de Projetos | 695 |
| `/links-uteis` | `LinksUteisPage` (`features/projetos/links-uteis-page`) | todos | filho de Início | 10 |
| `/ranking` | `ranking.tsx` | todos | filho de Início, rotulado **"Desempenho"** (`app-sidebar.tsx:61`) | 1799 |
| `/painel-gestor` | `PainelGestorPage` (`painel-gestor.tsx:142`) | admin/gestor/superintendente (`:144`) | **Gestão** (1º nível) | 329 |
| `/distribuicao` | `distribuicao.tsx` | admin/gestor (`app-sidebar.tsx:122`) | filho de Gestão | 33 |
| `/financeiro/fechamento` | `fechamento.tsx` | admin/gestor (`app-sidebar.tsx:126`) | filho de Gestão | 34 |
| `/match` | `match.tsx` | todos | **NÃO** — nem no menu, nem no ⌘K | 532 |

Rodapé da sidebar (fora de `NAV_ITEMS`): `/meu-perfil` (todos, `app-sidebar.tsx:369`) e
`/configuracoes` (admin, `app-sidebar.tsx:378`).

### 1.2 Rotas que são apenas redirect (17)

Nenhuma é órfã: todas resolvem para um destino vivo. Deep links antigos continuam funcionando.

| Rota antiga | Destino | Evidência |
|---|---|---|
| `/comissoes` | `/ranking?tab=comissoes` | `comissoes.tsx:8` |
| `/conquistas` | `/ranking?tab=conquistas` | `conquistas.tsx:7` |
| `/copa` | `/ranking?tab=competicao` | `copa.tsx:7` |
| `/corretores` | `/painel-gestor?tab=pessoas` | `corretores.tsx:7` |
| `/equipes` | `/painel-gestor?tab=pessoas` | `equipes.tsx:7` |
| `/dashboard` | `/painel-gestor?tab=relatorios` | `dashboard.tsx:7` |
| `/relatorios` | `/painel-gestor?tab=relatorios` | `relatorios.tsx:7` |
| `/inteligencia` | `/painel-gestor` (preserva filtros) | `inteligencia.tsx:24-25` |
| `/duplicatas` | `/painel-gestor?tab=qualidade` | `duplicatas.tsx:7` |
| `/lixeira` | `/painel-gestor?tab=qualidade` | `lixeira.tsx:7` |
| `/templates` | `/painel-gestor?tab=comunicacao` | `templates.tsx:7` |
| `/leads-por-corretor` | `/painel-gestor?tab=leads-corretor` | `leads-por-corretor.tsx:7` |
| `/metas` | `/painel-gestor?tab=metas` | `metas.tsx:83` |
| `/kanban` | `/pipeline` | `kanban.tsx:7` |
| `/radar` | `/pipeline?tab=fechamento` | `radar.tsx:7` |
| `/meu-painel` | `/hoje` | `meu-painel.tsx:7` |
| `/tarefas` | `/agendamentos?tab=tarefas` | `tarefas.tsx:7` |

**Anomalia:** `metas.tsx` redireciona (`:83`) **e** exporta `MetasPage`, consumido como a aba
"Metas & Ritmo" de `/painel-gestor` (`painel-gestor.tsx:26, 294-296`). Um arquivo de rota
servindo de biblioteca de componente para outra rota.

### 1.3 Rotas públicas e de API (26)

| Grupo | Rotas |
|---|---|
| Públicas de tela | `/` (`index.tsx`), `/auth`, `/reset-password`, `/vitrine-publica`, `/.lovable.oauth.consent` |
| API interna | `api/documentacao`, `api/vitrine-links`, `api/google/oauth.callback` |
| API pública — leitura | `api/public/leads/`, `api/public/leads/$id`, `api/public/corretores/`, `api/public/corretores/$id`, `api/public/comissoes/`, `api/public/comissoes/$id`, `api/public/projetos/`, `api/public/vendas/`, `api/public/vendas/$id`, `api/public/metricas`, `api/public/documentos`, `api/public/vitrine` |
| API pública — escrita | `api/public/leads/$id.corretor`, `api/public/leads/$id.eventos`, `api/public/leads/$id.perda`, `api/public/escrita/health`, `api/public/escrita/ping` |
| Webhooks | `api/public/webhooks/landing`, `api/public/webhooks/lead/$token`, `api/public/hooks/copiloto-handoff`, `api/public/hooks/push-dispatch` |
| MCP | `mcp.ts`, `[.mcp]/list-tools`, `[.mcp]/invoke-tool/$tool`, `[.well-known]/oauth-protected-resource` |

---

## 2. Árvore de navegação atual

### 2.1 Sidebar desktop (`app-sidebar.tsx:53-131`)

```
Início            → /hoje
  ├ Desempenho    → /ranking
  └ Links Úteis   → /links-uteis
Leads             → /leads                     [badge: b.atendimento]
  ├ Modo Blitz    → /blitz
  ├ Oferta Ativa  → /oferta-ativa
  └ Captação (Landing) → /leads-landing        [admin, gestor]
Atendimento       → /atendimento               [badge: b.tarefasVencidas]
  ├ Agenda & Tarefas → /agendamentos           [badge: b.agendaHoje]
  └ Modo Visita   → /modo-visita
Pipeline          → /pipeline
Projetos          → /projetos
  └ Vitrine (mapa) → /vitrine
Gestão            → /painel-gestor             [admin, gestor, superintendente] [badge: b.aprovacoes]
  ├ Distribuição  → /distribuicao              [admin, gestor]
  └ Financeiro · Fechamento → /financeiro/fechamento  [admin, gestor]
--- rodapé ---
Meu perfil        → /meu-perfil
Configurações     → /configuracoes             [admin]
Sair · Recolher (atalho "[")
```

Contagem de 1º nível: **corretor vê 5**, gestor/admin vê **6**. Modo trilho colapsado
(72 px, só ícones) esconde todos os filhos (`app-sidebar.tsx:245-284`).

### 2.2 Barra inferior mobile (`bottom-nav.tsx:13-20`)

```
[Início /hoje]  [Leads /leads]  ((FAB dourado: SamiQ))  [Atender /atendimento]  [Pipeline /pipeline]
```

O FAB dispara `window.dispatchEvent(new Event("open-samiq"))` (`bottom-nav.tsx:62`).
**Projetos e Agenda não estão na barra** — só pelo menu hambúrguer (`app-sidebar.tsx:575-589`).

### 2.3 Header (`route.tsx:119-141`)

`[hambúrguer mobile] · [botão de busca → ⌘K] · [sino de notificações]`

### 2.4 Command palette (`command-palette.tsx`)

Abre por `⌘K`/`Ctrl+K` (`:63`) ou pelo evento `open-command-palette` (`:70`), disparado pelo
botão de lupa do header. Busca **leads** (por nome/telefone via `search_text`, `:91-104`),
**projetos**, **tarefas** e **corretores**; guarda recentes; e oferece 13 atalhos de navegação
(`:197-244`).

### 2.5 Abas internas (2º nível real de navegação)

| Página | Abas | Evidência |
|---|---|---|
| `/painel-gestor` | Dia · Relatórios · Funil · Gargalos · Time · Metas & Ritmo · Leads por Corretor · **[admin]** Pessoas · Estoque · Campanhas · Comunicação · Qualidade | `painel-gestor.tsx:196-210` |
| `/ranking` | Ranking · Competição · Conquistas · Comissões | `ranking.tsx:95-98` |
| `/pipeline` | Funil · Fechamento | `pipeline.tsx:44-47` |
| `/agendamentos` | Agenda · Tarefas | `agendamentos.tsx:78-79` |
| `/leads/$leadId` | Timeline · Dados · Qualificação · Tarefas · Agendamentos · Documentação | `leads.$leadId.tsx:393-413` |
| `/leads` | Lista · Kanban (toggle de visão) | `leads.index.tsx:944-961` |
| `/configuracoes` | Integrações · Gestão · Preferências | `configuracoes.tsx:72-74` |
| `/match` | Financeiro · IA | `match.tsx:98-101` |

**Total de destinos navegáveis distintos: 5–6 no menu + 33 abas internas.**

---

## 3. Elementos acionáveis por página

### 3.1 `/leads` (`leads.index.tsx`)

| Elemento | Dispara | Linha |
|---|---|---|
| Toggle Lista/Kanban | estado local `setView` | 944-961 |
| Botão "Blitz" | navega `/blitz` | 962-967 |
| Botão "Importar" (`canManage`) | `ImportLeadsDialog` | 969-972 |
| Botão "Novo lead" | `abrirNovoLead` (dialog global) | 975 |
| Menu de visões salvas | `aplicarFiltros` / salvar / excluir visão | 1071-1113 |
| Busca por nome/email/telefone | `rpc("leads_filtered")` | 1192, 525 |
| Toggle tabela/cards | preferência de usuário | 1215-1227 |
| Filtros: Origem · Temperatura · Período · Corretor | requery `leads_filtered` | 1250-1290 |
| Filtro de data inicial/final | idem | 1313-1323 |
| **Em massa** — Registrar ligação | `bulkRegistrarLigacao` (cria interação) | 1337-1353 |
| **Em massa** — Temperatura (quente/morno/frio) | `bulkTemperatura` | 1355-1392 |
| **Em massa** — Follow-up | `bulkFollowupOpen` → mutation | 1394-1396 |
| **Em massa** — Descartar | `bulkDescartar` (com motivo) | 1397-1405 |
| **Em massa** — Roleta (admin) | `bulkRoleta` → triagem v3 | 1407-1425 |
| **Em massa** — Transferir (`canManage`) | `transferir_leads` | 1427-1429 |
| **Em massa** — Mover p/ lixeira / Restaurar | `moverLixeira` | 1430-1450 |
| Na linha — mudar temperatura | mutation inline | 1597-1622 |
| Na linha — WhatsApp com mensagem pronta | `useWhatsAppLead` | 1699 |
| Na linha — Ligar | `tel:` | 1710 |
| Contagem por status | `rpc("leads_status_counts")` | 595 |

### 3.2 `/atendimento` (`atendimento.tsx`)

5 filas priorizadas por score, máx. 15 cards cada, contagens sobre a carteira inteira
(`:56-70`): **novos · responder · followups · esfriando · docs** (`:37-43`).
Card abre `LeadPeekDrawer` (`:15`); ação de WhatsApp por `useWhatsAppLead` (`:14`).
Realtime em `leads`, `interacoes`, `documentacoes` num único canal (`:73`).
Backend: `atendimento_inbox_v3` com fallback para `v2` (`:60-68`).

### 3.3 `/pipeline` (`pipeline.tsx`)

Aba **Funil** = `KanbanBoard` (`components/leads-kanban-board.tsx`), drag-and-drop por Pointer
Events. Aba **Fechamento** = `FechamentoView` (`features/pipeline/`).

### 3.4 `/painel-gestor` (`painel-gestor.tsx`)

12 abas (§2.5). Filtros de período/corretor/origem só aparecem nas abas Funil e Gargalos
(`:192, 213-265`) e persistem na URL. Guard: corretor é redirecionado para `/` (`:185-187`).
Aba `pessoas` empilha **duas** páginas na mesma aba: `CorretoresPage` + `EquipesPage`
(`:301-305`). Aba `qualidade` empilha `DuplicatasPage` + `LixeiraPage` (`:322-326`).

### 3.5 `/hoje` (`hoje.tsx` + `widget-registry.tsx`)

10 widgets, ocultáveis e reordenáveis por usuário e por escopo (`widget-registry.tsx:69-105`):

| Widget | Escopo | Papéis |
|---|---|---|
| `gestao-dia` "O que exige ação hoje" | operação | admin/gestor/superintendente |
| `gestao-atalhos` "Ferramentas de gestão" | operação | idem |
| `gestao-pacing` "Ritmo do mês" | operação | idem |
| `nba` "Próxima melhor ação" | minha | todos |
| `missoes` "Fila de missões" | minha | todos |
| `hoje-agenda` "Agenda de hoje" | ambos | todos |
| `tarefas` "Tarefas & follow-ups" | minha | todos |
| `metas` "Metas do dia" | minha | todos |
| `radar` "Radar de risco" | ambos | todos |
| `produtividade` "Produtividade" | ambos | todos |

Toggle **Operação × Minha** (`hoje.tsx:113-126`); default é `operacao` para quem tem papel de
gestão (`:56-58`).

### 3.6 Demais páginas

| Página | Superfície de ação | Status |
|---|---|---|
| `/leads/$leadId` | 6 abas + registrar contato + WhatsApp + editar + mudar etapa | ações confirmadas em `registrar-contato-dialog.tsx`, `lead-stage-menu.tsx`; **enumeração completa NÃO VERIFICADA** |
| `/blitz` | fila com badges de SLA ("SLA estourado"/"Atenção"/"No prazo", `:139-141`), registrar contato (`:import`) | parcial |
| `/agendamentos` | 4 mutations (`:169, 193, 219` + `:3`), "Novo agendamento" (`:274`), "Editar agendamento" (`:364`) | confirmado |
| `/projetos` | header "Projetos / Empreendimentos" (`:143`); 9 mutations em `features/projetos` | parcial |
| `/match` | 2 abas: Financeiro (poder de compra) e IA (busca em linguagem natural) (`:92-101`) | confirmado |
| `/leads-landing` | "Leads recebidos da landing page externa via webhook público" (`:171-172`) | parcial |
| `/vitrine` | "Vitrine de Empreendimentos" (`:146`) + geração de links públicos | parcial |
| `/distribuicao` | 11 mutations, 10 RPCs em `features/distribuicao` (3220 linhas) | **NÃO VERIFICADO** em detalhe |
| `/financeiro/fechamento` | 12 mutations em `features/financeiro` (1775 linhas) | **NÃO VERIFICADO** em detalhe |
| `/ranking` | 4 abas, 10 mutations, 9 RPCs em `features/ranking` | parcial |
| `/configuracoes` | 3 abas: Integrações · Gestão · Preferências (`:72-74`) | confirmado |
| `/meu-perfil` | "Atualize seus dados de cadastro e senha" (`:123`) | confirmado |

Mutations por feature (proxy de densidade de ação):
`gestao` 29 · `leads` 23 · `financeiro` 12 · `distribuicao` 11 · `ranking` 10 · `projetos` 9 ·
`agenda` 4 · `command-center` 4 · `visitas` 2 · `comissoes` 2 · `sprint` 2 ·
`atendimento` 0 · `pipeline` 0 · `inteligencia` 0 · `dashboard` 0 · `metas` 0.

---

## 4. Funções de banco (RPCs) — consumo

**244 funções definidas** em 246 migrations. **109** são citadas em algum arquivo de `src/`.
**43** estão ligadas a triggers (`EXECUTE FUNCTION`). Nenhuma referência a `cron.schedule` foi
encontrada nas migrations — o agendamento, se existe, é externo (n8n/Edge Functions) e
`NÃO ENCONTRADO` neste repositório.

### 4.1 RPCs de consulta/escrita sem NENHUM consumidor no front

Verificadas uma a uma: aparecem só em `src/integrations/supabase/types.ts` (arquivo gerado),
em nenhum componente, hook ou serviço.

| RPC | O que é, pelo nome/assinatura | Leitura |
|---|---|---|
| `gestao_metricas` | agregação de atividade/aderência do time | Entregue na fase F8 do redesign (`docs/redesign/v2-command.md`) e **não consumida** |
| `metricas_periodo_v2` | métricas do período | sem tela |
| `produtividade_corretores` | produtividade por corretor | sem tela — existe widget "Produtividade" que usa outra fonte |
| `ranking_atividades` | ranking por atividade | sem tela |
| `rel_conversao_por_corretor` | relatório de conversão | sem tela |
| `rel_evolucao_vendas` | série de vendas | sem tela |
| `dashboard_atividade_periodo` | atividade no período | sem tela (`dashboard_kpis`, `dashboard_funil` são usados) |
| `leads_search_v2` | busca de leads server-side | **sem tela — o ⌘K faz `supabase.from("leads").ilike(...)` direto** (`command-palette.tsx:91-104`) |
| `mesclar_leads_dup_lote` | merge de duplicatas em lote | sem tela — a aba Qualidade usa `mesclar_leads` (unitário) |
| `verificar_minhas_conquistas` | conquistas do usuário | sem tela |
| `copa_pontos_corretor`, `copa_get_ajuste_manual`, `copa_salvar_pontuacao`, `copa_set_participantes`, `copa_apurar_fase`, `copa_definir_vencedor`, `copa_aplicar_bonus_final` | operação da Copa | sem tela — a aba Competição usa `copa_ranking`, `copa_salvar_pontuacao_lote`, `copa_set_participante`, `copa_set_vencedor`, `copa_avancar_fase` |
| `atualizar_meu_perfil` | atualizar perfil | sem tela — `/meu-perfil` escreve por outro caminho |
| `distribuir_lead`, `distribuir_lead_elegivel`, `distribuir_lead_ponderado`, `atribuir_lead_a_corretor` | versões antigas de distribuição | superadas por `distribuir_lead_v3` e `triar_e_distribuir_lead` |
| `marcar_lead_perdido` | v1 | superada por `marcar_lead_perdido_v2` (`lib/lead-transitions.ts`) |
| `gerar_comissoes_para_venda`, `gerar_comissao_da_venda` | geração de comissão | superadas por `gerar_comissoes_v2` (também não citada no front — provavelmente chamada por trigger) |

### 4.2 Versões coexistentes (débito de migração)

| Família | Versões no banco | Consumida pelo front |
|---|---|---|
| `leads_filtered` | v1, v2, v3 | v3 com fallback v2 (`features/leads/leads-rpc.ts:37`); v1 ainda chamada em `leads.index.tsx:525` |
| `leads_status_counts` | v1, v2, v3 | v3/v2 (`leads-rpc.ts:49`); v1 em `leads.index.tsx:595` |
| `atendimento_inbox` | v2, v3 | v3 com fallback v2 (`atendimento.tsx:60-68`) |
| `pipeline_snapshot` | v2, v3 | v3 com fallback v2 |
| `distribuir_lead` | base, `_elegivel`, `_ponderado`, `_v3` | só `_v3` |
| `marcar_lead_perdido` | base, `_v2` | só `_v2` |
| `gerar_comissoes` | `_da_venda`, `_para_venda`, `_v2` | nenhuma pelo front |

**Percentual de funções sem consumidor no front: 55% (135/244)** — a maioria legítima
(triggers, predicados de RLS, helpers internos, webhooks), mas **~30 são RPCs de consulta ou
comando que nenhuma tela chama**.

---

## 5. Sinais de duplicação

| # | Sinal | Evidência |
|---|---|---|
| D1 | **Mesma informação, 4 telas.** A carteira de leads é renderizada em `/leads` (lista/kanban), `/atendimento` (5 filas), `/pipeline` (kanban) e `/hoje` (widgets NBA + Missões) | `leads.index.tsx:944-961`, `atendimento.tsx:37-43`, `pipeline.tsx:44`, `widget-registry.tsx:88-89` |
| D2 | **Dois kanbans.** `/leads` tem toggle "Kanban" e `/pipeline` tem aba "Funil" — ambos montam `KanbanBoard` | `leads.index.tsx:953-960` e `pipeline.tsx:4, 44` |
| D3 | **Dois caminhos para registrar contato.** `RegistrarContatoDialog` aparece em 5 superfícies distintas | `lead-peek-drawer.tsx`, `focus-mode.tsx`, `leads.$leadId.tsx`, `blitz.tsx`, `registrar-contato-dialog.tsx` |
| D4 | **Filtro de corretor repetido com nomes diferentes.** "Corretor" em `/leads` (`:1290`), "Corretor" em `/painel-gestor` (`:231-245`), drill de corretor em Time (`:288-291`) e a página inteira "Leads por Corretor" (aba própria) |
| D5 | **Métrica de produtividade em 3 lugares.** widget `produtividade` na `/hoje`, aba "Time" e aba "Relatórios" do `/painel-gestor` | `widget-registry.tsx:103`, `painel-gestor.tsx:270-293` |
| D6 | **Dia do gestor em 2 lugares.** widget `gestao-dia` "O que exige ação hoje" na `/hoje` e aba "Dia" (`PainelDiaView`) do `/painel-gestor` | `widget-registry.tsx:71-77`, `painel-gestor.tsx:267-269` |
| D7 | **Duas páginas empilhadas numa aba.** `pessoas` = Corretores + Equipes; `qualidade` = Duplicatas + Lixeira | `painel-gestor.tsx:301-305, 322-326` |
| D8 | **Busca de lead implementada duas vezes.** ⌘K faz query direta na tabela; existe `leads_search_v2` no banco sem uso | `command-palette.tsx:91-104` vs §4.1 |
| D9 | **Metas em 2 rotas.** `metas.tsx` é rota (redirect) e biblioteca da aba "Metas & Ritmo" | `metas.tsx:83` + `painel-gestor.tsx:26` |
| D10 | **Rotulagem divergente do mesmo destino.** `/ranking` é "Desempenho" na sidebar, "Ranking" no título da página e "Competição/Conquistas/Comissões" nas abas | `app-sidebar.tsx:61` vs `ranking.tsx:95-98` |

---

## 6. Achados factuais para as fases seguintes

1. `/match` é a **única página viva fora de toda navegação** (menu, bottom nav e ⌘K).
2. `/painel-gestor` acumula **12 abas**, sendo 5 de administração — o maior ponto de
   concentração do sistema (Lei de Hick).
3. **~30 RPCs de consulta/comando sem consumidor**, incluindo `gestao_metricas` e
   `leads_search_v2`, ambas construídas para resolver problemas que as telas ainda resolvem
   de forma pior.
4. A **barra de polegar não alcança Projetos nem Agenda**; o maior alvo da tela (FAB) é o SamiQ,
   que por regra de produto não escreve nada (`samiq-panel.tsx:280`).
5. O funil tem **8 etapas ativas** e 5 status fora dele (`lib/leads.ts:6-33`) — divergência
   aberta com o processo comercial de 14 etapas; **pendente de confirmação do dono**.
6. `superintendente` aparece em 4 guards de rota mas foi declarado **papel legado sem usuário
   real** — a matriz de permissão carrega um papel morto.
