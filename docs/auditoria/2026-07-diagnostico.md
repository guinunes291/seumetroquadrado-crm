# Auditoria Geral do CRM SMQ — Diagnóstico · Julho/2026

**Data:** 2026-07-10 · **Branch:** `claude/smq-crm-audit-26ety6` · **Escopo:** revisão completa de
backend, frontend, banco de dados, permissões, integrações, fluxos críticos (agendamentos,
follow-ups, leads, distribuição, status, histórico), qualidade de código, testes e UX.

Método: 3 varreduras independentes (backend/integrações · frontend · banco/RLS/testes) sobre o
código e as 147 migrações, com verificação manual dos achados graves (todos os itens abaixo têm
evidência em arquivo:linha — nada aqui é "achismo de scanner"). Cruzado com as auditorias
anteriores (`relatorio-tecnico.md` de 2026-06-24, feita com 90 migrações) para não duplicar: as
~57 migrações novas (Distribuição v3, Central de Comando, comissões v2, presença) **nunca tinham
sido auditadas** e concentram parte dos achados novos.

---

## 0. Veredito

O núcleo do sistema é bom: o **motor de Distribuição v3 é sólido** (RPCs `SECURITY DEFINER`
atômicas, rodízio serializado no banco, fila de exceções, auditoria em `distribution_log`),
as **34 RPCs usadas pelo frontend existem todas**, RLS está habilitado em ~56 tabelas com o
padrão recomendado (`user_roles` + `has_role`), e o timezone das rotinas diárias da v3 usa
`America/Sao_Paulo` corretamente.

Os riscos reais estão em três famílias:

1. **Autorização furada nas bordas** — a API pública de escrita usa a chave de leitura; duas
   policies de INSERT abertas (`vendas`, `analises_credito`); tabelas de staging com PII sem RLS;
   webhook da landing sem proteção; permissões de UI cosméticas.
2. **Confiabilidade de entrega** — push marcado como enviado sem entrega real; fluxos
   multi-escrita sem compensação; syncs externos best-effort silenciosos.
3. **Concorrência** — família de check-then-insert sem constraint/lock (dedup de lead, dedup de
   follow-up, idempotência do copiloto) que duplica dados exatamente nos cenários de retry de
   webhook que o sistema mais recebe.

---

## 1. Problemas críticos (prioridade máxima)

| #   | Problema                                                                                                                                                                                                                                                                                                                                        | Evidência                                                                                                                                      | Impacto                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Endpoints públicos de ESCRITA autenticam com a chave de LEITURA.** O guard correto (`write-api-auth.ts`: `MCP_WRITE_API_KEY` + allowlist `pode_escrever` + auditoria `api_escrita_log`) só protege `escrita/ping` e `escrita/health`. Os endpoints que realmente mutam usam `checkReadApiKey` + `supabaseAdmin` (bypassa RLS, sem auditoria). | `api/public/leads/$id.ts:206` (PATCH de PII, opt-out, LGPD), `$id.corretor.ts:21` (reatribui corretor), `$id.perda.ts:42`, `$id.eventos.ts:36` | Quem tiver a READ_API_KEY reatribui leads, marca perda e muta PII, sem rastro                                                                 |
| C2  | **Staging com PII sem RLS.** `stg_leads/stg_agendamentos/stg_visitas/stg_analises` (nome, cpf, telefone, renda em texto) nunca receberam `ENABLE ROW LEVEL SECURITY`.                                                                                                                                                                           | migração `20260615215625`                                                                                                                      | Legíveis via PostgREST por qualquer autenticado                                                                                               |
| C3  | **Policy de INSERT de `vendas` aberta.** Duas policies permissivas coexistem; em RLS permissivo vale o OR — `WITH CHECK (auth.uid() IS NOT NULL)` vence a restritiva. Idem `analises_credito`.                                                                                                                                                  | `20260619185115:45` (aberta) vs `20260616013000:50` (restrita)                                                                                 | Corretor pode fabricar venda p/ qualquer corretor_id/valor → dispara `gerar_comissoes_v2`, infla ranking, metas e **elegibilidade da roleta** |
| C4  | **Webhook da landing sem auth, sem rate limit.** Insere leads via service-role e dispara `triar_e_distribuir_lead`.                                                                                                                                                                                                                             | `api/public/webhooks/landing.ts`                                                                                                               | Qualquer um injeta leads: spam na base, consumo da roleta, poluição de métricas                                                               |

## 2. Riscos altos (confiabilidade operacional)

| #   | Problema                                                                                                                                                                                                                                                                                                  | Evidência                                                                                                                                                            | Impacto                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A1  | **Push marcado como enviado sem entrega.** `sentIds.push(item.id)` roda incondicionalmente — 0 subscriptions ou falha transitória (500/429/timeout) ⇒ `sent_at` preenchido, notificação perdida p/ sempre, sem retry.                                                                                     | `hooks/push-dispatch.ts:125`                                                                                                                                         | Corretor não é avisado de visita/lead e ninguém fica sabendo    |
| A2  | **Fluxos multi-escrita sem atomicidade.** Agendar visita = insert `agendamentos` → sync Google → update status → follow-up, sem compensação. Se o update falhar, fica agendamento órfão (já espelhado no Google) com lead no status antigo. Igual em análise de crédito e pós-visita.                     | `appointment-stage-dialog.tsx:96-151`, `credit-analysis-dialog.tsx`, `visit-feedback-dialog.tsx`                                                                     | Estado inconsistente silencioso em fluxo crítico                |
| A3  | **Dedup de lead com race (check-then-insert, sem UNIQUE/lock).** Dois retries concorrentes do Zapier/n8n com o mesmo telefone passam ambos na checagem → 2 leads, 2 distribuições, 2 corretores notificados. Escopos inconsistentes: landing dedupa global, webhook/edge por projeto.                     | `webhooks/lead/$token.ts:144-206`, `lead-intake/index.ts:214-250`, `webhooks/landing.ts:126-210`; leads sem UNIQUE de telefone (`20260630145520` é índice não-único) | Lead duplicado + dupla distribuição                             |
| A4  | **Dois fluxos de "criar agendamento" divergem.** Modal do lead: move status p/ `agendado` + cria follow-up + invalida tudo. Página `/agendamentos`: só insere e invalida `["agendamentos"]` — não invalida `["agendamentos-lead"]` (aba do lead fica stale), não cria follow-up.                          | `appointment-stage-dialog.tsx` vs `agendamentos.tsx:247-267`                                                                                                         | Mesma ação, dois resultados; dados "somem" da tela do lead      |
| A5  | **Permissões de UI cosméticas.** `/painel-gestor` não redireciona corretor (renderiza painel vazio); `/inteligencia` sem guarda alguma (relatórios org-wide); `RegistrarVendaDialog` global lista TODOS os leads para qualquer papel; guardas não checam `loading` de `useUserRoles` (flash de conteúdo). | `painel-gestor.tsx:96`, `inteligencia.tsx`, `registrar-venda-dialog.tsx:82-96`, `corretores.tsx:183`                                                                 | Exposição de dados/estrutura de gestão a corretores; UX confusa |

## 3. Problemas médios

- **M1 — Duplo disparo do copiloto (n8n/WhatsApp).** Idempotência check-then-set em
  `copiloto-handoff.ts:116/219` — sem claim atômico, reprocessamentos disparam 2×.
- **M2 — Dedup de follow-up duplicado e com race.** `lib/follow-up.ts:125-166` e
  `registrar-contato-dialog.tsx:101-131` reimplementam a mesma janela ±1 dia separadamente.
- **M3 — Lacunas de histórico.** Não geram interação: mudança de temperatura em lote
  (`leads.index.tsx:947`), lixeira/restauração, transferência em lote pela UI, PATCH público de
  PII. Reatribuição via API gera; via UI em lote não — dois rastros diferentes.
- **M4 — Edge functions frágeis.** `sami-agendar-visita`/`sami-consultar-agenda`: secret sem
  timing-safe, sem dedup de agendamento (n8n repetido = visita duplicada), resolução de corretor
  por sufixo de telefone carregando todos os profiles. `admin-reset-password`: só enxerga os 200
  primeiros usuários, não timing-safe, sem rate limit.
- **M5 — Migrações não reproduzíveis.** `CREATE TABLE vendas/comissoes` duplicados sem guarda
  (`20260616013000`/`20260616130200` vs `20260619185115`) ⇒ `supabase db reset` quebra; CI não
  detecta. Pendência da auditoria anterior, ainda aberta.
- **M6 — Integridade e timezone.** FKs faltando (`leads.corretor_anterior_id`,
  `distribution_log.corretor_id`); dedup de alertas usa `created_at::date = now()::date` em UTC
  (3 funções) — janela errada entre 21h e meia-noite BRT; ILIKE sem escapar `%`/`_`; rate limit
  em memória por processo (inócuo em multi-instância); syncs externos (Banco Operacional, Google
  Calendar) silenciosos e sem fila de retry.
- **M7 — UX.** Erro de rede vira "lista vazia" (tarefas, agenda, hoje — sem estado de erro);
  botões sem `disabled` durante `isPending` (concluir tarefa, remover agendamento); form de metas
  envia `corretor_id=""`; WhatsApp abre antes do insert confirmar; dialogs de venda duplicados
  (`contract-sale` ≈ `registrar-venda`); padding duplo em abas de hub; input morto em tarefas.
- **M8 — Testes.** As 36 suítes são unit puras de derivação client-side; **zero** cobertura de
  servidor/SQL (distribuição com banco, RLS, dedup, triggers de comissão, webhooks). CI só roda
  testes/build se `LOVABLE_NPM_TOKEN` estiver configurado; hoje o job `build-test` não executa sem
  o secret (o `secret-scan`/gitleaks roda sempre). Além disso, ~100 arquivos não estão
  prettier-limpos no baseline (o lint nunca chegou a rodar no CI para detectar).

## 4. O que está bom (e não deve ser mexido)

- Motor de distribuição v3 (atômico, auditável, com fila de exceções e presença).
- `useLeadStatusMutation` (optimistic update com rollback correto + retry no toast).
- Higiene de PII na leitura pública (allowlist `PUBLIC_LEAD_FIELDS`) e comparação timing-safe
  nos guards TS existentes.
- Realtime invalidation (`use-realtime-invalidate.ts`) substituindo polling.
- Padrão de papéis `user_roles` + `has_role` SECURITY DEFINER com search_path fixo.

## 5. Plano de implementação (aprovado)

- **Etapa 1 — Críticos:** C1 (dual-key com kill-switch `PUBLIC_WRITE_ALLOW_READ_KEY` + auditoria),
  C2/C3 (migração RLS staging + policies restritas), C4 (rate limit + secret opcional na landing),
  A1 (outbox com retry/backoff), A2/A4 (helper único `criarAgendamento` com compensação e
  invalidação completa), A3 (RPC `criar_lead_se_nao_existe` com advisory lock, preservando a
  semântica de dedup por projeto; view de duplicatas; índice único guardado), M1 (claim atômico),
  A5 (guardas reais com redirect + filtro de leads por corretor nos dialogs de venda).
- **Etapa 2 — Estabilidade:** dedup de follow-up unificado; histórico consistente (helper
  `notaSistemaPayload` aplicado a temperatura em lote, transferência em lote, lixeira); edge
  functions endurecidas; reprodutibilidade de migrações + FKs + timezone; escapeLike; fim dos
  catch silenciosos.
- **Etapa 3 — Performance:** ganhos pontuais embutidos nas correções (filtros por corretor,
  busca por sufixo via LIKE, índices parciais). Mover agregações para views fica para quando
  houver banco de validação.
- **Etapa 4 — UX/UI:** estado de erro com retry, prevenção de duplo clique, validação de metas,
  WhatsApp sem sucesso falso, extração da lógica de venda, limpezas.
- **Etapa 5 — Testes:** suítes novas (write-api-auth, push-outbox, migrações estático,
  landing-webhook, agendamentos/compensação, vendas) + ampliação das existentes.

### Fora do escopo desta rodada (exigem banco vivo/decisão de produto)

Aplicar migrações e deploy de edge functions no ambiente vivo (entregues como arquivos);
mesclar/apagar duplicatas (view de relatório + decisão humana); mover agregações para views;
rate limit persistente; WhatsApp API oficial; isolamento da redistribuição por equipe (pendência
de produto da auditoria anterior); regenerar `types.ts`.

### Ações do usuário após o merge

1. Aplicar as migrações novas no Supabase (`supabase db push` ou painel).
2. Fazer deploy das edge functions alteradas (`sami-*`, `admin-reset-password`, `lead-intake`).
3. Definir secrets: `MCP_WRITE_API_KEY` nos clientes de escrita (n8n/MCP) e, quando migrados,
   `PUBLIC_WRITE_ALLOW_READ_KEY=false`; opcionalmente `LANDING_WEBHOOK_SECRET`.
4. Configurar `LOVABLE_NPM_TOKEN` no CI **ou** trocar o job para `npm ci` (o package-lock resolve
   tudo no registro público).
5. Consultar `vw_leads_telefone_duplicado` e decidir a limpeza de duplicatas históricas (depois
   disso o índice único de telefone pode ser criado).
