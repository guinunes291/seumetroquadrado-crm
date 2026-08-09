# 01 · Diagnóstico nos 4 eixos

> Estado atual × gap por eixo. Cada item aponta o documento ou arquivo de origem — este estudo consolida diagnóstico já escrito e verificado, não reinventa. Onde há número de produção, a referência é `docs/revisao-pagina-leads.md` (26/07/2026).

---

## 1. Gestão

**O que já existe e é forte.** Cockpit de gestão em `/hoje`, Painel do Dia com exceções e R$ em risco, Inteligência (funil por coorte, gargalos, heatmap corretor×etapa, Raio-X do Corretor com PDF), metas com pacing e cálculo reverso, aprovação de venda atômica com ledger (`aprovar_venda`), camada semântica `metrics` no banco com refresh carimbado. A matriz de transições do funil foi validada TS×SQL com zero divergência (`2026-07-19-diagnostico.md`).

**Os gaps, do mais caro ao menos caro:**

| Gap                                                                                                                                                                              | Evidência                          | Fonte                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| **O funil não fecha conta.** Chips de status enxergam ~17% da base; 45.660 leads estão em status válidos do enum mas fora de `LEAD_STATUS_ORDER`                                 | 55.060 leads, chips somam ~9,4 mil | `revisao-pagina-leads.md` §2–3                               |
| **Perda não existe como disciplina.** 7 leads perdidos em 55 mil; conversão por etapa e motivos de perda são ficção                                                              | idem                               | `revisao-pagina-leads.md` §2                                 |
| **Crédito é 1 etapa onde a operação tem 3.** Um negócio liberado pela Caixa e um negócio morto no banco são visualmente idênticos — "a lacuna de modelagem mais cara do sistema" | etapa `analise_credito` única      | `ux-ia-2026-08/00-sumario-executivo.md`, item 3.1 [DECIDIDO] |
| **Comparação lado a lado é impossível.** Corretor × média do time, mês × mês anterior — tarefas #10 e #11 da auditoria não têm caminho                                           | baseline: ⛔                       | `ux-ia-2026-08/04-cliques.md`, item 2.10                     |
| **Duas tarefas de gestão não têm tela:** pastas de documentação travadas de toda a operação; e a fila "confirmar visita" do corretor                                             | itens 2.5 e 2.6                    | `ux-ia-2026-08/06-plano.md`                                  |
| **O funil não mostra quem acabou de chegar.** `novo` e `aguardando_corretor` recebem lead mas ficam fora de `LEAD_STATUS_ORDER`                                                  | `src/lib/leads.ts`                 | `ux-ia-2026-08/00-sumario-executivo.md`, item 3.2            |
| **Metas com RLS aberta.** Qualquer autenticado lê metas de todos; gestor de qualquer equipe edita metas de qualquer corretor                                                     | política `USING true`              | `2026-07-19-pendencias.md` P-1                               |
| **Comissão "de ninguém".** `gerar_comissoes_para_venda` cria linhas com `beneficiario_id NULL` que somam no total e nunca serão pagas a alguém identificável                     |                                    | `2026-07-19-pendencias.md` P-2                               |

---

## 2. Desenvolvimento

**O que já existe e é forte.** Padrão de lógica pura separada de I/O (`*-derive.ts`) que sustenta 808 testes unitários; 278 testes contra Postgres real (RLS por papel, jornada ponta a ponta, consistência de KPIs, `aprovar_venda`); replay das migrations como gate de CI; budgets tipo "ratchet" (type escapes ≤220, bundle ≤250 KB gz); gitleaks; comentários de cabeçalho que registram decisão e motivo em quase todo arquivo.

**Os gaps:**

| Gap                                                                                                                                                                                                                             | Evidência                                                                   | Fonte                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| **Três motores de distribuição coexistem** com elegibilidades diferentes — o ponderado ignora cota/% do canônico e coloca o lead direto em `em_atendimento`, pulando o SLA                                                      | v1 (`fila_distribuicao`), ponderado por tier, v3 canônico                   | `2026-07-19-pendencias.md` P-4             |
| **Versões de RPC coexistindo**: `leads_filtered` v1/v2/v3, `leads_status_counts` v1–v3, `atendimento_inbox` v2/v3, `gerar_comissoes` ×3; ~30 RPCs de consulta/comando sem consumidor (medir antes de apagar)                    | 55% de 244 sem consumidor                                                   | `ux-ia-2026-08/01-inventario.md`, item 3.4 |
| **`types.ts` do Supabase desatualizado** → ~212 escapes de tipo (`as never`, `unknown as`), contidos pelo budget de 220                                                                                                         | `scripts/check-type-escape-budget.mjs`                                      | código                                     |
| **38 arquivos > 500 linhas**, piores: `leads.index.tsx` 2.085, `ranking.tsx` 1.821, `oferta-ativa.$ofertaId.tsx` 1.172                                                                                                          |                                                                             | código                                     |
| **4 fontes canônicas concorrentes de formatação BRL**, redefinidas localmente ~15×                                                                                                                                              | `formatBRL` em `projetos.ts`, `unidades.ts`, `comissoes.ts`, `orcamento.ts` | código                                     |
| **3 padrões de guard de papel** (`RequireRole`, redirect inline, EmptyState); só um trata o carregamento; `/leads-landing` marcada admin/gestor no menu mas sem guard próprio (RLS é a barreira real)                           |                                                                             | código                                     |
| **Tabela `leads` inchada** (~85 colunas): estado de motor de distribuição, resultado de visita, contadores de janela e chaves de idempotência morando na entidade, com 5 triggers em cima                                       |                                                                             | migrations                                 |
| **Estruturas legadas duplicando conceito**: `na_lixeira` × `deleted_at`; `fila_distribuicao` × `roletas`; `documentacoes` × `documentacao_versoes`                                                                              |                                                                             | `2026-07-19-pendencias.md` P-8             |
| **Drift de schema**: `copa_ranking()` vive em produção com shape que não existe em nenhuma migration                                                                                                                            |                                                                             | `2026-07-19-pendencias.md` P-5             |
| **Dual-lockfile** `bun.lock` + `package-lock.json` — já quebrou `npm ci`                                                                                                                                                        |                                                                             | `2026-07-19-pendencias.md` P-6             |
| **IA fora da governança**: `match-ia`, `resumo-ia` e `mensagem-ia` têm modelo hardcoded, sem quota distribuída e enviam PII crua — enquanto o SamiQ (mesmo repo) versiona prompt/modelo no banco, aplica quota e redação de PII | `src/lib/*-ia.functions.ts` × `src/lib/samiq-governance*`                   | código                                     |

> Nota: `.lovable/roadmap-restante.md` está **desatualizado** (lista Oferta Ativa, Comissões e Gamificação como pendentes — todas entregues). Dele, só continua genuinamente pendente: chatbot público, `tabelas_preco` com vigências, geocoding/mapa real, carteira ativa, e-mail transacional (Resend) e `propostas_publicas` com link assinável.

---

## 3. Controle

**O que já existe e é forte.** RLS em praticamente tudo com helpers disciplinados (`has_role` com REVOKE de PUBLIC/anon, padrão InitPlan, convenção `_` para funções internas); ledgers imutáveis de comissão e métricas de venda; guardas do agente MCP (6 triggers + views de cobertura + cron que reaplica); API pública com escopos, auditoria obrigatória de escrita e janela legada com sunset de 7 dias fail-closed; smoke que varre segredos no JS servido; gitleaks no CI.

**Os gaps — este é o eixo mais fraco do sistema:**

| Gap                                                                                                                                                                                                                                                                     | Evidência               | Fonte                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- |
| **Zero error tracking.** Nenhum Sentry/similar; `src/server.ts` faz `console.error`, que em Cloudflare Workers é log efêmero. A operação não sabe quando o sistema quebra                                                                                               |                         | código                                  |
| **Zero analytics de produto.** `src/lib/config.server.ts` é um esqueleto com o lugar reservado e nada preenchido                                                                                                                                                        |                         | código                                  |
| **Sem staging.** Um único projeto Supabase; URL/publishable key/project id com fallback hardcoded em `vite.config.ts`                                                                                                                                                   |                         | código                                  |
| **Deploy de banco manual e desacoplado do frontend.** Sem pipeline, sem rollback (273 migrations, zero `down`), com precedente de SQL aplicado à mão e o incidente P0-1 documentado: publicar o frontend antes do batch reproduz **logout global de todos os usuários** |                         | `2026-07-11-auditoria-completa.md` P0-1 |
| **Backup por fé.** Nenhuma estratégia no código; menção única "aplicar somente depois do backup" como procedimento manual; PITR do Supabase não documentado nem testado                                                                                                 |                         | `2026-07-11-evolucao-crm.md`            |
| **Trilha de auditoria genérica em só 5 tabelas** (`leads`, `agendamentos`, `tarefas`, `projetos`, `unidades`). `user_roles`, `profiles`, `metas` e `roleta_participantes` — as mais sensíveis a abuso interno — não têm trilha (vendas/comissões têm ledger)            | `audit_trigger()`       | migrations                              |
| **431 ocorrências de SECURITY DEFINER** fazem o modelo funcionar, mas não existe teste automatizado garantindo que toda função nova siga o padrão (`SET search_path`, REVOKE) — hoje é revisão humana                                                                   |                         | migrations                              |
| **`?secret=` na query string do lead-intake** ainda aceito (exposição via logs de infra)                                                                                                                                                                                |                         | `2026-07-19-pendencias.md` P-3          |
| **Smoke não autenticado** — jornadas logadas só são cobertas no nível de banco                                                                                                                                                                                          |                         | `2026-07-19-pendencias.md` P-10         |
| **Rate limit em memória por isolate** no caminho do Match IA (teto de custo de IA é aproximação em Workers)                                                                                                                                                             | `src/lib/rate-limit.ts` | código                                  |

---

## 4. Operação

**O que já existe e é forte.** Distribuição v3 com 3 roletas como dado, fila de exceções ("nenhum lead some"), SLA com repasse automático e guarda-corpos; Atendimento com filas priorizadas; Modo Blitz, Modo Foco, Modo Sprint; Modo Visita com fila offline; oferta ativa; push web com outbox e cron; bot Sami integrado por edge functions (agendar visita, anexar documento por WhatsApp, consultar agenda); intake de Facebook Ads com dedup e Turnstile na landing.

**Os gaps:**

| Gap                                                                                                                                                                                                                  | Evidência                                     | Fonte                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------- |
| **Mensageria é 1 via e invisível.** Envio é `wa.me` no gesto do corretor; resposta do cliente não existe no CRM. Sem janela de 24h, sem template aprovado, sem inbox, sem trilha da conversa                         | `src/lib/whatsapp.ts`, `use-whatsapp-lead.ts` | `fase7-mensageria.md`                 |
| **Priorização por `created_at`.** 4.743 leads em atendimento ordenados por data de criação; `scoreLead` existe em `src/lib/priority.ts` mas nunca na tabela, nunca como ordenação, sempre sem o componente de SLA    |                                               | `revisao-pagina-leads.md` §4          |
| **4 réguas divergentes de "esfriando"** (flags 5d/10d, badge 2d/5d, Kanban 2d/5d/7d, filtro 5+)                                                                                                                      |                                               | `revisao-pagina-leads.md` §4          |
| **Temperatura subcalibrada:** 166 quentes em 55 mil (0,3%) — a flag "em risco" quase nunca dispara                                                                                                                   | `recalcular_temperatura_leads`                | `revisao-pagina-leads.md` §2          |
| **Cadastro sujo elegível na roleta:** entre os 41 corretores "ativos" há `docs-bot`, "Edson teste junior" e duplicatas — recebendo lead de verdade                                                                   |                                               | `revisao-pagina-leads.md` §5.4        |
| **Duplicatas históricas de telefone** impedem a ativação dos índices únicos de dedup em produção                                                                                                                     | `uq_leads_projeto_telefone_ativo` guardado    | `2026-07-19-pendencias.md` P-11       |
| **Notificação Z-API sem fila/retry** — mensagem perdida some em silêncio                                                                                                                                             |                                               | `2026-07-19-pendencias.md` P-7        |
| **Tarefas sem caminho no sistema:** confirmar visita (corretor) e pastas travadas da operação (gestor) — as filas/exceções 2.5 e 2.6 do plano vigente                                                                |                                               | `ux-ia-2026-08/06-plano.md`           |
| **Filtro "parado há X dias" perigoso:** o `CASE` de `leads_filtered_v3` termina em `ELSE true` — valor desconhecido devolve a lista inteira sem filtro, "errado em silêncio, na tela usada para decidir quem cobrar" |                                               | `ux-ia-2026-08/06-plano.md` item 2.11 |
