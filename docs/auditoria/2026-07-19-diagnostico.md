# Auditoria funcional — Onda 5 (2026-07-19) — Diagnóstico geral

**Escopo**: revisão funcional completa do CRM (funil, follow-ups, agendamentos, distribuição,
vendas/comissões, permissões, contagens, integrações), com correções e testes contra
**Postgres real** — a lacuna que nenhuma das 4 ondas anteriores conseguiu fechar.

**Base auditada**: HEAD `892bbb0` (branch `claude/crm-full-functional-audit-5eqr72`),
204 migrations, ~78 arquivos de teste vitest (todos mock), 5 edge functions.

## Estado inicial

O CRM chegou a esta onda em estado estrutural **bom**: as ondas 1–4 já haviam movido as
regras críticas para o banco (RLS por carteira via `pode_acessar_lead`, máquina de estados
na RPC `transicionar_lead` + guard contra UPDATE direto, integridade comercial com ledgers
idempotentes em `aprovar_venda`, webhook de landing idempotente, push com outbox atômico).
A verificação desta onda **confirma no banco em execução** que essas fundações funcionam:

- **Matriz de transições TS × SQL: 338 pares comparados, zero divergência.** O espelho do
  frontend (`src/lib/leads.ts`) e a função `transicao_lead_permitida` estão sincronizados,
  incluindo `SAIDA_EXIGE_GESTAO` (corretor não tira lead de fechado/perdido/pós-venda —
  barrado no banco, não só na UI).
- **Matriz RLS por papel (49 casos): sem divergências no núcleo.** Corretor só vê a própria
  carteira; gestor só a equipe; spoof de `corretor_id`/`autor_id` barrado por WITH CHECK;
  tarefas/agendamentos/interações herdam o escopo do lead.
- **`aprovar_venda` (24 casos): atômica, idempotente e imutável.** Segunda aprovação é
  no-op; concorrência serializada por FOR UPDATE; ledgers append-only invioláveis;
  fechar lead sem venda aprovada é bloqueado por trigger.

## Problemas críticos encontrados (e corrigidos nesta onda)

1. **`npm ci` quebrado na branch** — lockfile fora de sincronia com o package.json
   (`@lovable.dev/vite-tanstack-config` 2.7.4 × ^2.7.6): todo CI falhava. É o risco do
   dual-lockfile (bun + npm) se materializando.
2. **P1-5 (aberto desde jun/2026): replay das migrations quebrado.** 7 arquivos com
   CREATE duplicado (re-emissões de vendas/comissoes/analises_credito e da Copa) +
   patches de dados de produção com UUIDs fixos. Eram invisíveis porque nenhum gate
   validava migrations num Postgres real.
3. **Histórico de migrations reescrito diverge de produção.** Confirmado com o types.ts
   gerado do banco vivo: `comissoes`/`vendas`/`analises_credito` v1 nunca existiram em
   produção (o formato real é o v2), `copa_fases.semana_*` é INTEGER em produção mas a
   cadeia termina em TEXT, e a `copa_ranking()` viva de produção não está capturada em
   nenhuma migration do repo. Reconciliado por migrations guardadas (no-op em produção).
4. **`distribuir_lead_ponderado` roubava leads.** O motor por tier (20260718000305) não
   tinha guarda de idempotência (lead JÁ atribuído era reatribuído) nem lock (chamadas
   concorrentes duplicavam o distribution_log e avançavam o cursor SWRR 2×).
5. **Dedup de leads incompleto.** Leads SEM projeto não tinham nenhuma constraint
   (dois cadastros simultâneos = dois leads); variantes +55/local do mesmo telefone não
   colidiam (o DDI fazia parte da chave); lead na lixeira bloqueava o recadastro de
   cliente retornante; e a checagem do formulário era 100% client-side (check-then-insert).
6. **INSERT direto podia criar lead já `contrato_fechado`** sem venda aprovada (os guards
   só disparavam em UPDATE) — poluindo VGV/ranking sem passar pela aprovação.
7. **P1-4: erro de backend renderizado como "tudo em dia"/zeros** em dashboard/relatórios,
   painel do gestor e central de comando (consumidores só checavam `isLoading`).
8. **Espelho `proximo_followup` ressuscitava follow-up em lead morto** — tarefa pendente
   de tipo não-contato repovoava o campo após fechamento/perda.

## Problemas médios (corrigidos)

- Motor anti-perda de follow-up falhava em silêncio absoluto (`catch {}` sem telemetria).
- `bulkFollowup` em massa não passava pelo dedup canônico — duplicava tarefas.
- Rate limit da API pública era em memória por processo (multiplica por instância do
  Worker, zera a cada deploy).
- `lead-intake` comparava secret com `!==` (não timing-safe) e aceitava secret por query
  string sem aviso.
- Agregações client-side truncadas em silêncio (10k interações, 2000/1000 leads).
- `types.ts` defasado forçava 226 casts (teto 220 — o CI já estava vermelho); regenerado
  do schema real: 162.
- Página 500 do Worker em inglês.

## Verificações que mudaram o mapa (achados das ondas anteriores já resolvidos)

- **P1-1 (guard de auth desloga em erro transitório)**: JÁ corrigido no HEAD (retry 2×,
  signOut local só com negação real). Nesta onda ganhou teste de regressão
  (`tests/auth-guard.test.ts`) e a decisão foi extraída para `src/lib/conta-ativa.ts`.
- **P1-3 (notify-lead-transfer sem checagem de posse)**: JÁ corrigido — lê o lead com o
  JWT do chamador (RLS aplica).
- **Realtime sem debounce**: JÁ corrigido (coalescência de 500ms).
- **P2-12 (gestão agregando 10k interações no cliente)**: JÁ corrigido via RPC
  `gestao_metricas` com fallback — o truncamento restante era só do fallback e agora é
  sinalizado na UI.

## Riscos remanescentes (não corrigidos nesta onda — ver 2026-07-19-pendencias.md)

- `metas`: leitura global (`USING true`) e escrita de gestor sem escopo de equipe —
  decisão de produto pendente.
- Comissão de gerente/superintendente criada com `beneficiario_id NULL` quando a
  hierarquia não é resolvível.
- Elegibilidade divergente entre o motor canônico v3 e o ponderado (o ponderado ignora
  cota/% trabalhado do canônico); ponderado pula `aguardando_atendimento`.
- 3 gerações do motor de distribuição coexistem; estruturas legadas em paralelo
  (na_lixeira × deleted_at; fila_distribuicao × roletas; documentacoes × documentacao_versoes).
- Drift capturado: a `copa_ranking()` viva de produção não é reproduzível pelo repo.
- WhatsApp (Z-API) sem retry/fila própria (fallback: alertas in-app).
- Dual-lockfile mantido (não foi possível confirmar se o builder do Lovable usa bun).

## Números da onda

- **Suíte de banco nova**: `tests/db/` — 9 arquivos, 190+ casos contra Postgres real
  (sanidade, contrato FSM, RLS, venda, distribuição, dedup, follow-up, KPIs, jornadas).
- **Suíte vitest existente**: 628 testes verdes (85 arquivos) após as mudanças.
- **Migrations novas**: 4 (dedup hardening + guard de INSERT; reconciliação Copa;
  correções da suíte SQL; rate limit distribuído). 7 migrations históricas receberam
  guardas de idempotência (sem mudança de semântica).
- **CI**: novo job `db-tests` — replay do zero + suíte de banco a cada push.
