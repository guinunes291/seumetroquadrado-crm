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

| Fase     | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                     | Commit               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| F0       | SMQ Motion (tokens de duração/easing, keyframes, stagger, hover-lift, press-scale, view transitions, AnimatedNumber, draw-in, tabs deslizantes, celebração CSS) + fundações (user_preferences + fallback, rpcWithFallback, undo universal, Button loading, skeleton único shimmer, camadas de luz) + consolidação (KpiCard→StatTile, 4 componentes mortos removidos, deps PWA mortas fora, atendimento em 1 canal realtime) | `9da9e08`, `5976b20` |
| F1       | Sidebar colapsável (trilho 72px, tooltips, atalho `[`) com badges de pendência (RPC `nav_pendencias`, some sem migration), palette global (leads+projetos+tarefas+corretores, recentes, ações: novo lead/registrar venda/tema/sprint/SamiQ), overlay de atalhos `?`, NovoLeadDialog global                                                                                                                                  | `deb8252`            |
| F2       | DataTable premium (@tanstack/react-table + react-virtual): sort com aria-sort, colunas/ordem/densidade por usuário, seleção múltipla, skeleton de células, vazio com CTA, virtualização >80 linhas. Piloto: Leads por Corretor (2.000 linhas virtualizadas; página movida p/ features → react-table fora do chunk de entrada)                                                                                               | `4dcbaaf`            |
| F3       | Leads: monólito 2.179→1.655 linhas (extração para features/leads), `leads_filtered_v2` (paginação/contato/sort no SQL — P2-15) com fallback v1, LeadsTable premium com flags (novo/quente/atrasado/sem contato/em risco/parado), cards em cascata, **Modo Foco** (tela cheia, fila J/K com prefetch, WhatsApp/ligar/contato/etapa) e undo na lixeira                                                                        | `f157e1e`, `39cf361` |
| F4       | Dossiê 360°: rota 1.552→456 linhas, abas modulares em features/leads/dossie, **Timeline premium** (agrupamento por dia, ícone/tom por tipo, cascata), nota rápida preservada, documentacao-tab (regra do 3º doc) intocado                                                                                                                                                                                                   | `f3067a7`            |
| F5       | Pipeline: DnD por Pointer Events (touch com long-press, ghost compositor-only, auto-scroll, Esc, hit-test testado), `pipeline_snapshot_v3` (VGV por etapa) com fallback v2, % conversão acumulada por etapa, contagens animadas. Recharts lazy na Inteligência (P3-13)                                                                                                                                                      | `8afd1dd`            |
| F6       | Home = cockpit de 7 widgets personalizáveis (ocultar/reordenar por usuário e escopo), cada um com loading/erro isolado; NBA com beam-border; hoje.tsx 955→153 linhas; lógica de escopo por papel preservada byte a byte                                                                                                                                                                                                     | `34d26b6`            |
| Públicas | Login split-screen com painel de marca; reset-password alinhado                                                                                                                                                                                                                                                                                                                                                             | `71c1c4a`            |
| F7       | Ficha do projeto como munição comercial (hero com capa/preço dourado/CTAs de pitch, mapa de disponibilidade de unidades por bloco/andar + DataTable) e Agenda premium (calendário com anel dourado no hoje, lista em Timeline por dia, undo em concluir tarefa); rotas 795→409 e 870→383 linhas                                                                                                                             | `535f11c`            |
| F8       | Gestão: `gestao_metricas` agrega atividade/aderência no servidor (P2-12 — fim das 10k linhas no cliente, com fallback), Saúde/Corretores/Equipes/Lixeira/Comissões em DataTable, restaurar da lixeira com Desfazer (compensate), Distribuição com auditoria/histórico em DataTable (roletas intocadas)                                                                                                                      | `7812c92`            |
| F9       | Gamificação premium: pódio hero (glow + fio de luz no 1º), medalhas com relevo e brilho único na conquista nova, ranking/copa em DataTable, copa 1.988→922 linhas, lib/periodo unificada (+18 testes), −23 casts usando tipos gerados                                                                                                                                                                                       | `d203b55`            |
| F10      | Sweep final: erro tratado/vazios orientados/a11y nas 12 rotas restantes, ratchet do type-escape budget, verificação completa (build+bundle+smoke) e métricas finais                                                                                                                                                                                                                                                         | _abaixo_             |

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

## Métricas antes → depois (finais, verificadas no gate de F10)

| Métrica                       | Antes                     | Depois                                                                                                                     |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Chunk de entrada (gz)         | 203,7 KB                  | **195,4 KB** (−8,3 KB mesmo com react-table+react-virtual novos — páginas-aba saíram dos arquivos de rota)                 |
| Type-escapes                  | 228 (teto 242)            | **212 (teto 220 — ratchet aplicado)**                                                                                      |
| Testes unitários              | 526                       | **599** (+73: prefs, undo, count-up, shortcuts, badges, DataTable, Timeline, lead-flags, stage-metrics, hit-test, período) |
| leads.index.tsx               | 2.395 linhas              | 1.655                                                                                                                      |
| leads.$leadId.tsx             | 1.552 linhas              | 456                                                                                                                        |
| hoje.tsx                      | 955 linhas                | 153                                                                                                                        |
| copa.tsx                      | 1.988 linhas              | 922                                                                                                                        |
| projetos.$projetoId.tsx       | 795 linhas                | 409                                                                                                                        |
| agendamentos.tsx              | 870 linhas                | 383                                                                                                                        |
| Paginação de leads com filtro | corte silencioso em 1.000 | 100% servidor (v2, com fallback)                                                                                           |
| Agregação do gestor           | ~10.000 linhas no cliente | RPC agregada (com fallback)                                                                                                |
| Virtualização                 | inexistente               | DataTable >80 linhas (leads, gestão, comissões, ranking, copa…)                                                            |
| Undo                          | inexistente               | lixeira (delayed), restaurar (compensate), concluir tarefa (delayed)                                                       |
| Erro tratado nas rotas        | 14/41                     | todas as rotas (QueryErrorState/AsyncBoundary)                                                                             |
| Reduced-motion                | 7 arquivos                | global (styles.css) + por componente                                                                                       |
| Animações                     | 4 keyframes soltos        | sistema SMQ Motion completo (compositor-only)                                                                              |
| DnD do Kanban                 | HTML5 (sem touch)         | Pointer Events (mouse/toque/caneta)                                                                                        |
| Gate final                    | —                         | typecheck ✓ · lint ✓ · 599/599 ✓ · build ✓ · bundle ✓ · budget ✓ · smoke ✓                                                 |

Nota: `metas.tsx` foi a única página-aba mantida no arquivo de rota —
`tests/commercial-consumers.test.ts` lê esse caminho como texto e exige as
strings da query de vendas aprovadas; mover exigiria editar o teste.

## Pendências conscientes (fora desta rodada)

- Blitz permanece como está (já é uma experiência de foco rica com fila SLA
  e Resumo IA — convertê-la ao FocusMode removeria funções).
- vitrine-publica: herda tokens/tema; reskin dedicado fica para a próxima.
- Regenerar types do Supabase após aplicar as migrations (remove os
  `as never` de RPCs novas e permite baixar o teto do type-escape budget).
- Smoke autenticado opt-in (`e2e/smoke-auth.mjs`) — desenhado no plano,
  não implementado nesta rodada.

## Adendo — passe de intensidade do movimento (pós-produção, 13/07)

Feedback do dono do produto com a v2 no ar: "não estou vendo o SMQ Motion,
está tudo bem parecido". A calibragem original priorizou discrição a ponto
de o movimento passar despercebido — especialmente no mobile, onde as
interações de hover não existem. Recalibrado para "Marcante", mantendo TODAS
as regras de performance (só transform/opacity, stagger ≤ 8, reduced-motion
global intocado):

| Efeito                | Antes                 | Depois                                                 |
| --------------------- | --------------------- | ------------------------------------------------------ |
| slide-fade (entradas) | 6px                   | 16px de deslize                                        |
| stagger-children      | 0,32s · degrau 40ms   | 0,42s · degrau 60ms                                    |
| View Transitions      | fade 0,16/0,22s + 4px | saída sobe 8px · entrada 14px em 0,3s                  |
| beam-border (hero)    | anel 1px · giro 7s    | anel 2px · cauda longa + cabeça quente · giro 4,5s     |
| hover-lift            | -2px · 120ms          | -3px · 200ms                                           |
| press-scale           | scale 0,98            | scale 0,97                                             |
| useCountUp            | 700ms                 | 900ms                                                  |
| EntityCard ativável   | só sombra             | hover-lift + press-scale (feedback de toque no mobile) |

Cards NÃO ativáveis deixaram de reagir a hover (a sombra de hover era
aplicada a todos) — affordance honesta: só o que é clicável se move.

## Adendo 2 — lentidão de /pipeline e /hoje (perf do gate de carteira, 13/07)

Feedback: "pipeline e início ainda estão muito lentos". Causa raiz encontrada:
o gate de carteira era avaliado POR LINHA — a policy de SELECT de `leads`
chama `pode_acessar_lead(auth.uid(), id)` para cada linha, e a função (nunca
inlinada por ser SECURITY DEFINER) refaz lookup de profiles + até 3 has_role +
EXISTS de volta em leads + join de equipes A CADA CHAMADA. Policies de
tarefas/agendamentos e as RPCs do Kanban (snapshot v3 + stage_page_v2, uma por
coluna) repetiam o padrão. Dezenas de milhares de subconsultas por tela.

Migration `20260718100000_escopo_carteira_rapido.sql` — mesma REGRA de
acesso, avaliada 1x por query:

- Helpers `ve_carteira_completa` / `corretores_do_gestor` (decomposição
  literal dos branches de pode_acessar_lead).
- Policies de SELECT de leads/tarefas/agendamentos no padrão InitPlan
  (subconsultas escalares avaliadas uma vez; acesso continua derivado do LEAD,
  nunca do corretor denormalizado — regra pós-transferência preservada).
- `pipeline_snapshot_v3` e `pipeline_stage_page_v2` com escopo pré-computado
  no DECLARE.
- Nova RPC `leads_sem_acao`: o guardrail da home baixava TODAS as tarefas
  pendentes + TODOS os agendamentos futuros da org para descartar quase tudo
  no cliente; agora anti-joins indexados no servidor devolvem só candidatos
  (scoreLead continua no cliente — regra de negócio intocada). Cliente via
  rpcWithFallback (caminho antigo preservado).
- 6 índices para os caminhos quentes (página de coluna do kanban, leads ativos
  por última interação, anti-joins, tarefas por vencimento, agenda por data).
- Contagens de conquistas com `head:true` (só o count viaja).

Policies de INSERT/UPDATE/DELETE intocadas (linha única). Testes novos em
`tests/escopo-carteira-rapido.test.ts` travam os invariantes de segurança da
nova forma (13 asserções). 612 testes verdes.
