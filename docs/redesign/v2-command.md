# SMQ Command v2 — Redesign premium (registro de execução)

> Segunda rodada do redesign (a primeira, "Central de Comando", está em
> `central-de-comando.md`). Esta rodada eleva a fundação ao acabamento
> premium (referências: Linear/Stripe/Raycast), constrói os sistemas que
> faltavam (movimento, preferências por usuário, undo, tabela premium,
> modo foco, widgets) e corrige os débitos de performance conhecidos —
> sem tocar regras de negócio.

## Decisões de produto (aprovadas pelo dono)

1. **Tema padrão:** escuro "Modo Comando" refinado (camadas de luz
   `--surface-1/2/3`, hairlines); claro em paridade.
2. **Dashboards por papel:** adaptados aos 4 papéis existentes
   (admin/gestor/corretor/superintendente) — nenhum papel novo.
3. **Preferências por usuário:** tabela `user_preferences` (RLS owner-only)
   com fallback localStorage quando a migration não está aplicada.
4. **Escopo:** execução completa em fases na branch
   `claude/smq-crm-redesign-bztqtq`, commit verificado por fase.

## O que cada fase entregou

| Fase | Entrega | Commit |
| --- | --- | --- |
| F0 | SMQ Motion (tokens de duração/easing, keyframes, stagger, hover-lift, press-scale, view transitions, AnimatedNumber, draw-in, tabs deslizantes, celebração CSS) + fundações (user_preferences + fallback, rpcWithFallback, undo universal, Button loading, skeleton único shimmer, camadas de luz) + consolidação (KpiCard→StatTile, 4 componentes mortos removidos, deps PWA mortas fora, atendimento em 1 canal realtime) | `9da9e08`, `5976b20` |
| F1 | Sidebar colapsável (trilho 72px, tooltips, atalho `[`) com badges de pendência (RPC `nav_pendencias`, some sem migration), palette global (leads+projetos+tarefas+corretores, recentes, ações: novo lead/registrar venda/tema/sprint/SamiQ), overlay de atalhos `?`, NovoLeadDialog global | `deb8252` |
| F2 | DataTable premium (@tanstack/react-table + react-virtual): sort com aria-sort, colunas/ordem/densidade por usuário, seleção múltipla, skeleton de células, vazio com CTA, virtualização >80 linhas. Piloto: Leads por Corretor (2.000 linhas virtualizadas; página movida p/ features → react-table fora do chunk de entrada) | `4dcbaaf` |
| F3 | Leads: monólito 2.179→1.655 linhas (extração para features/leads), `leads_filtered_v2` (paginação/contato/sort no SQL — P2-15) com fallback v1, LeadsTable premium com flags (novo/quente/atrasado/sem contato/em risco/parado), cards em cascata, **Modo Foco** (tela cheia, fila J/K com prefetch, WhatsApp/ligar/contato/etapa) e undo na lixeira | `f157e1e`, `39cf361` |
| F4 | Dossiê 360°: rota 1.552→456 linhas, abas modulares em features/leads/dossie, **Timeline premium** (agrupamento por dia, ícone/tom por tipo, cascata), nota rápida preservada, documentacao-tab (regra do 3º doc) intocado | `f3067a7` |
| F5 | Pipeline: DnD por Pointer Events (touch com long-press, ghost compositor-only, auto-scroll, Esc, hit-test testado), `pipeline_snapshot_v3` (VGV por etapa) com fallback v2, % conversão acumulada por etapa, contagens animadas. Recharts lazy na Inteligência (P3-13) | `8afd1dd` |
| F6 | Home = cockpit de 7 widgets personalizáveis (ocultar/reordenar por usuário e escopo), cada um com loading/erro isolado; NBA com beam-border; hoje.tsx 955→153 linhas; lógica de escopo por papel preservada byte a byte | `34d26b6` |
| Públicas | Login split-screen com painel de marca; reset-password alinhado | `71c1c4a` |
| F7 | Projetos (hero comercial, grid de unidades, DataTable) + Agenda (calendário revestido, lista Timeline, undo em concluir tarefa) | _em execução_ |
| F8 | Gestão (DataTable nas abas, `gestao_metricas` agregada no servidor — P2-12, undo compensate na lixeira) + Comissões + Distribuição reskin | _em execução_ |
| F9 | Gamificação (pódio, medalhas, DataTable no ranking/copa, lib/periodo unificada) | _em execução_ |
| F10 | Sweep final: isError nas rotas restantes, vazios orientados, a11y, métricas finais | _pendente_ |

## Regras que protegeram o negócio

- Máquina de etapas: toda transição via RPC `transicionarLead` — nenhuma
  tela nova escreve `leads.status`.
- Venda → aprovação da gestão; follow-up automático (dedup ±1 dia);
  auto-avanço no 3º documento; roletas SECURITY DEFINER — intocados.
- Toda RPC nova é consumida com `rpcWithFallback`: sem a migration
  aplicada, o recurso degrada (badge some, VGV some, paginação cai p/ v1)
  e a tela NUNCA quebra (mitiga o P0-1 de deploy-order da auditoria).
- Undo só onde há inversa natural ou efetivação adiada; transição de etapa
  e venda ficam fora por regra.

## Migrations desta rodada (aplicar em ordem)

1. `20260713100000_user_preferences.sql` — preferências por usuário.
2. `20260713110000_nav_pendencias.sql` — badges da navegação.
3. `20260714100000_leads_filtered_v2.sql` — paginação/contato/sort no SQL.
4. `20260715100000_pipeline_snapshot_v3.sql` — VGV por etapa.
5. `20260716100000_gestao_metricas.sql` — agregação do gestor (F8).

A UI funciona sem elas (fallbacks); com elas, os recursos acendem.

## Métricas antes → depois

| Métrica | Antes | Depois |
| --- | --- | --- |
| Maior chunk gz | 203,7 KB | _preencher no F10_ |
| Type-escapes | 228/242 | _preencher no F10_ |
| Testes unitários | 526 | _preencher no F10_ (F6: 581) |
| leads.index.tsx | 2.395 linhas | 1.655 |
| leads.$leadId.tsx | 1.552 linhas | 456 |
| hoje.tsx | 955 linhas | 153 |
| Paginação de leads com filtro | corte silencioso em 1.000 | 100% servidor (v2) |
| Virtualização | inexistente | DataTable >80 linhas |
| Undo | inexistente | lixeira, tarefas (delayed/compensate) |
| Reduced-motion | 7 arquivos | global (styles.css) |
| Animações | 4 keyframes soltos | sistema SMQ Motion completo |

## Pendências conscientes (fora desta rodada)

- Blitz permanece como está (já é uma experiência de foco rica com fila SLA
  e Resumo IA — convertê-la ao FocusMode removeria funções).
- vitrine-publica: herda tokens/tema; reskin dedicado fica para a próxima.
- Regenerar types do Supabase após aplicar as migrations (remove os
  `as never` de RPCs novas e permite baixar o teto do type-escape budget).
- Smoke autenticado opt-in (`e2e/smoke-auth.mjs`) — desenhado no plano,
  não implementado nesta rodada.
