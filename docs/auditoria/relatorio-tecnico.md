# Auditoria Forense — CRM Seu Metro Quadrado · Relatório Técnico

**Data:** 2026-06-24 · **Stack:** TanStack Start (React 19) + TanStack Query + Radix/Tailwind +
Supabase (Postgres, RLS, Edge Functions, pg_cron, web-push) + IA (Lovable AI Gateway).
**Tamanho:** ~32k LOC, 90 migrations, ~30 telas, 2 edge functions, ~59 triggers, ~50 funções
`SECURITY DEFINER`, 8+ jobs `pg_cron`.

Cada achado relevante segue o formato: **Onde · Por que · Impacto financeiro · Impacto
operacional · Severidade · Solução ideal · Solução rápida · Esforço · Prioridade**.

Itens marcados ✅ **CORRIGIDO** foram implementados nesta auditoria (ver diff do branch).

---

## FASE 1 — Mapa do sistema

### Estrutura

- **Frontend:** `src/routes/_authenticated/*` (~30 telas), `src/components/*`, `src/hooks/*`
  (`use-auth`, `use-lead-status`, `use-realtime-invalidate`, `use-mobile`), domínio em
  `src/lib/*` (`leads.ts`, `metas.ts`, `copa.ts`, `oferta-ativa.ts`, `interacoes.ts`,
  `validators.ts`, `tarefas.ts`, etc.).
- **APIs públicas (server routes):** `src/routes/api/public/` — `leads/` (GET lista e por id),
  `metricas`, `webhooks/lead/$token` (POST por projeto), `hooks/push-dispatch` (cron).
- **Edge Functions (Deno):** `supabase/functions/lead-intake` (Facebook→Zapier),
  `notify-lead-transfer`.
- **Banco:** 90 migrations. Tabelas núcleo: `leads`, `profiles`/`user_roles`, `equipes`,
  `fila_distribuicao`, `distribution_log`, `lead_status_transitions`, `agendamentos`,
  `interacoes`, `tarefas`, `alertas`, `metas`, `vendas`, `comissoes`, `projetos`, `unidades`,
  `historico_precos`, `oferta_ativa*`, `copa_*`, `push_subscriptions`, `push_outbox`, lixeira/auditoria.
- **Jobs `pg_cron`:** `distribuicao-auto` (*/5min), `recalc-temperatura` (*/10min),
  `lembretes-visita` (*/5min), `alertar-tarefas-atrasadas` (hora), `alertar-agendamentos-proximos`
  (*/5min), `conceder-conquistas` (*/30min), `auto-checkout-presenca`/`consolidar-presenca`
  (diários), `reset-cotas-diarias`, `expirar-lixeira`, `alertar-leads-parados`.

### Fluxos principais

1. **Intake →** Facebook Lead Ads → Zapier → `lead-intake` → insere `leads` → `distribuir_lead`
   (rodízio) → notifica corretor (Z-API). Também há `webhooks/lead/$token` (por projeto, com
   dedup e qualificação por IA).
2. **Distribuição →** `distribuir_lead` (RPC, rodízio por posição na `fila_distribuicao`, com
   cota diária) + `processar_distribuicao_automatica` (cron) + `distribution_log` (auditoria).
3. **Funil →** status do lead → trigger `lead_status_transitions`; etapas que capturam dados
   (agendado, visita_realizada, analise_credito, contrato_fechado) exigem modal.
4. **Venda →** `registrar-venda`/`contract-sale-dialog` → insere `vendas` → trigger gera `comissoes`.
5. **Comunicação →** `interacoes` + templates + botão WhatsApp (`wa.me`) + push (`push_outbox`
   → `push-dispatch`).

---

## FASE 8 — Segurança (achados de maior severidade primeiro)

### S1 — Vazamento de PII na API pública de leitura ✅ CORRIGIDO
- **Onde:** `src/routes/api/public/leads/index.ts` (`select` com `cpf, renda_informada,
  entrada_disponivel, observacoes, telefone, email`) e `.../leads/$id.ts` (`select("*")`). Ambos
  usam `supabaseAdmin` (service-role, **ignora RLS**) via `src/integrations/supabase/client.server.ts`.
- **Por que:** a autenticação é uma **única chave estática** (`READ_API_KEY`, comparada de forma
  *timing-safe* em `src/lib/public-api-auth.ts`), **sem escopo por projeto/equipe e sem rate limit**.
  Quem tiver a chave lê **todos** os leads do sistema, incluindo CPF e renda.
- **Impacto financeiro:** vazamento de base completa de leads = multa LGPD (até 2% do faturamento)
  + perda competitiva (concorrente compra/usa a base) + fraude contra os leads.
- **Impacto operacional:** incidente de dados, necessidade de notificar ANPD/titulares, rotação
  de chave e auditoria forense.
- **Severidade:** **P0.**
- **Solução ideal:** chaves por consumidor/projeto + escopo obrigatório + rate limit de borda +
  log de acesso; idealmente não usar service-role e sim um papel restrito de leitura.
- **Solução rápida (aplicada):** allowlist de campos sem PII (`PUBLIC_LEAD_FIELDS`/`PUBLIC_LEAD_SELECT`)
  + rate limit por chave/IP (60 req/min) em `public-api-auth.ts`.
- **Esforço:** rápido 0.5d (feito); ideal 3-5d.
- **Prioridade:** máxima.

### S2 — push-dispatch autenticado por chave pública
- **Onde:** `src/routes/api/public/hooks/push-dispatch.ts:12-19` — compara `apikey` (com `!==`,
  não constante) contra `SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY` (chave **pública**,
  presente no bundle do cliente).
- **Por que:** qualquer pessoa com a anon key (pública por design) pode chamar o endpoint.
- **Impacto financeiro/operacional:** baixo-médio — o payload vem de `push_outbox` (não do
  request), então não há injeção de conteúdo; o abuso possível é *flush* antecipado da fila e
  consumo de recursos (sem rate limit).
- **Severidade:** **P1** (raio de dano limitado).
- **Solução ideal:** segredo dedicado (não a anon key) + comparação *timing-safe* + rate limit;
  ou restringir a origem (cron interno) por rede.
- **Solução rápida:** trocar por um `PUSH_DISPATCH_SECRET` próprio e `timingSafeEqual`.
- **Esforço:** 0.5d. **Prioridade:** alta.

### S3 — Guard de autenticação apenas no cliente
- **Onde:** `src/routes/_authenticated/route.tsx` (`ssr:false`, `supabase.auth.getUser()` no
  `beforeLoad`).
- **Por que:** a verificação roda no cliente; um token forjado/manipulado no localStorage
  permite renderizar a UI autenticada. **Os dados continuam protegidos por RLS** (mitigação real).
- **Impacto:** info-disclosure de estrutura de telas/campos; não há acesso a dados sem sessão válida.
- **Severidade:** **P2.**
- **Solução ideal:** validar a sessão no servidor (loader server-side) nas rotas protegidas.
- **Esforço:** 1-2d. **Prioridade:** média.

### S4 — Segredos e versionamento
- **Onde:** `.env` versionado (apenas chaves **públicas**: `VITE_SUPABASE_*`, project id) — não há
  service-role no `.env`; `client.server.ts` lê `SUPABASE_SERVICE_ROLE_KEY` do ambiente (correto).
- **Por que:** mesmo sendo chaves públicas, versionar `.env` normaliza o hábito e facilita um
  vazamento futuro de segredo real.
- **Severidade:** **P2.**
- **Solução:** `.env` no `.gitignore` + `.env.example`; *secret scanning* no CI (gitleaks/trufflehog).
- **Esforço:** 0.5d.

### S5 — RLS por projeto na (re)distribuição
- **Onde:** RPCs `distribuir_lead`/redistribuição (várias migrations). Checam papel
  (`has_role`) mas não necessariamente o vínculo do gestor com o projeto/equipe do lead.
- **Por que:** um gestor poderia, chamando a RPC diretamente, reatribuir leads de outra equipe/projeto.
- **Impacto:** "roubo" de leads entre equipes; disputa de comissão.
- **Severidade:** **P1** (requer validação do modelo de papéis em produção).
- **Solução:** adicionar verificação de escopo (projeto/equipe do gestor) nas RPCs e policies.
- **Esforço:** 1-2d. **Prioridade:** alta — **não auto-aplicado** (exige validação com dados reais).

---

## FASE 2/3 — Auditoria de código e falhas silenciosas

### B1 — `lead-intake` sem idempotência/dedup ✅ CORRIGIDO
- **Onde:** `supabase/functions/lead-intake/index.ts` (insert direto, sem checar duplicata; ao
  contrário do `webhooks/lead/$token`, que usa `buscar_lead_duplicado`). Não há `UNIQUE` em
  telefone no schema.
- **Por que:** retry do Zapier (timeout/erro de rede) reenviava o mesmo lead → inserções repetidas.
- **Impacto financeiro:** métricas/conversão infladas, cota de distribuição consumida por
  fantasmas, risco de comissão sobre lead duplicado.
- **Impacto operacional:** dois corretores tratando o mesmo cliente; base suja.
- **Severidade:** **P0.**
- **Solução ideal:** `UNIQUE` parcial em `(projeto_id, telefone_normalizado) WHERE deleted_at IS
  NULL` + chave de idempotência do webhook.
- **Solução rápida (aplicada):** normalizar telefone (só dígitos) e, antes do insert, chamar
  `buscar_lead_duplicado(projeto_id, telefone)`; se existir, retornar `deduplicado:true`.
- **Esforço:** rápido 0.5d (feito); ideal +1d (constraint no banco).
- **Prioridade:** máxima.

### B2 — Falha silenciosa de notificação no intake ✅ CORRIGIDO
- **Onde:** `lead-intake/index.ts` — `notificarCorretor` retorna string de erro
  (`falhou_*`/`erro:*`) mas o handler responde `{ok:true}`; o Zapier marca sucesso.
- **Por que:** notificação não-bloqueante por design, sem fallback visível.
- **Impacto:** lead distribuído mas corretor nunca avisado → lead "esfria", SLA estoura,
  **perda de venda**.
- **Severidade:** **P0.**
- **Solução ideal:** retry com backoff + dead-letter + visibilidade no painel do gestor.
- **Solução rápida (aplicada):** se a notificação ≠ `enviada`, inserir um **alerta in-app**
  (`alertas`, tipo `lead_novo`) para o corretor.
- **Esforço:** rápido 0.5d (feito). **Prioridade:** máxima.

### B3 — Registro de WhatsApp gravado depois de abrir a janela ✅ CORRIGIDO
- **Onde:** `src/routes/_authenticated/leads.$leadId.tsx` (mutation `enviarWhatsapp`):
  `window.open` ocorria antes do `insert` em `interacoes`.
- **Por que:** se o insert falhasse (rede), a janela já estava aberta e o histórico se perdia
  silenciosamente.
- **Impacto:** histórico de atendimento incompleto → auditoria de SLA e handoff prejudicados.
- **Severidade:** **P1.**
- **Solução rápida (aplicada):** gravar a interação **antes** do `window.open` (abre mesmo assim,
  mas o erro de log é surfaceado).
- **Esforço:** trivial (feito).

### B4 — Migrations não reproduzíveis (DR)
- **Onde:** `supabase/migrations/20260616130200_*.sql:166` e `20260619185115_*.sql:64` — **dois**
  `CREATE TABLE public.comissoes` com colunas divergentes, **sem `IF NOT EXISTS` e sem `DROP`**.
- **Por que:** o histórico de migrations foi editado à mão; o schema real provavelmente vem de um
  snapshot do Lovable Cloud, não do replay sequencial.
- **Impacto financeiro/operacional:** `supabase db reset`/ambiente novo **falha** → impossível
  recriar staging, recuperação de desastre comprometida, divergência schema↔migrations.
- **Severidade:** **P0** (confiabilidade), **não auto-aplicado** (exige validar com banco).
- **Solução ideal:** consolidar a definição final de `comissoes` numa migration idempotente;
  validar `db reset` num ambiente limpo; adotar *shadow database* no CI.
- **Esforço:** 1-2d. **Prioridade:** alta.

### B5 — Tratamento de erros / casts
- **Onde:** uso difundido de `as never`/`as any` em chamadas Supabase (`copa.tsx`,
  `leads.index.tsx`, dialogs de venda) e RPCs.
- **Por que:** contornar tipos gerados; mascara erros de schema em refactors.
- **Severidade:** **P2.** **Solução:** regenerar `types.ts` e remover casts; *lint rule* contra `any`.
- **Esforço:** 2-3d.

---

## FASE 6 — Dados e duplicidade

- **Sem `UNIQUE` em telefone/email/cpf** nos `leads` (só `legacy_id UNIQUE`). A dedup é apenas
  aplicacional (`buscar_lead_duplicado`, agora também no intake — ver B1). Recomenda-se constraint
  parcial por projeto. **P1.**
- A tela **Duplicatas** + `buscar_lead_duplicado` cobrem detecção/merge — bom, mas a prevenção no
  ponto de entrada é o que evita o problema (corrigido no intake).
- Risco de **dados órfãos**: colunas de auditoria como `corretor_anterior_id` sem FK explícita.
  Validar política `ON DELETE` em todas as FKs para `auth.users`/`profiles`. **P2.**

---

## FASE 7 — Performance e escala

- **Agregações client-side** em `ranking.tsx` (1187 linhas, relógio de 1s + animações forçando
  re-render), `dashboard.tsx`, `copa.tsx` (1969 linhas). A 1M+ leads isso fica caro no navegador
  e na rede. **P1 — mover para views/materialized views ou RPCs agregadoras no servidor.**
- **`recalcular_temperatura_leads`** (cron */10min) varre a tabela inteira com múltiplas
  comparações de tempo por linha. **P1 — índice composto parcial `(deleted_at, na_lixeira,
  status)` e atualização em lote/somente-mudou.**
- **Índices:** `idx_leads_temperatura`/`idx_leads_origem` sem cláusula parcial; faltam compostos
  para filtros combinados (`corretor_id,status`) e para o kanban "meus leads". **P2.**
- **Re-renders/memória:** subscriptions realtime por componente (copa/kanban/oferta) com cleanup
  dependente de `[qc]`; risco de acúmulo em navegação repetida. **P2 — gerenciador central de
  realtime.**
- **Custo de IA:** `src/lib/match-ia.functions.ts` envia até 200 projetos por chamada ao LLM, sem
  cache nem rate limit por usuário. **P1 financeiro — cache do catálogo + limite por usuário.**

---

## FASE 4/5 — Operacional e UX

Funil: `Lead → Aguardando atendimento (SLA 2h) → Em atendimento → Aguardando retorno → Agendado
→ Visita realizada → Análise de crédito → Contrato fechado → Pós-venda` (+ `Perdido` com motivo).
Etapas com captura de dados exigem modal (correto). Achados consolidados por severidade:

### P0 (impedem trabalho ou perdem dado/decisão)
- **UX-1.** Falha de status no kanban (drag) reverte a UI silenciosamente, sem retry visível —
  o lead "volta" de coluna e o corretor pode não perceber (`kanban.tsx`). Adicionar toast com
  ação **Tentar novamente** e estado de erro no card.
- **UX-2.** Import de leads não exibe **erros linha a linha** (o array `detalhes` é calculado mas
  não mostrado) — o usuário não sabe o que corrigir (`import-leads-dialog.tsx`).
- **UX-3.** Criar "Oferta Ativa" sem validar nome/filtros vazios → campanhas quebradas
  (`oferta-ativa.nova.tsx`).

### P1 (atrito relevante / risco de dado ruim)
- **UX-4.** Edição de lead sem validação de CPF/renda/entrada → dados sujos no relatório
  (`leads.$leadId.tsx`). Validar formato e normalizar.
- **UX-5.** Sem confirmação de "alterações não salvas" ao fechar dialogs de edição/venda/WhatsApp
  (perda de digitação — comportamento padrão, mas custoso em formulários longos). Adicionar
  `useFormDirty` + confirmação.
- **UX-6.** Marcar "contatado" na oferta ativa sem update otimista → tela em branco 2-3s no mobile
  (`oferta-ativa.$ofertaId.tsx`).
- **UX-7.** Invalidação de cache por nomes de tabela em string (sem type-safety) e chaves
  invalidadas inexistentes (ex.: `copa:semanal`) → dados possivelmente *stale*.
- **UX-8.** Mapeamento de colunas do import perdido ao voltar etapa (sem persistência).

### P2 (polimento / produtividade)
- **UX-9.** Mudar status exige 3 cliques (menu → modal → confirmar); botões diretos por etapa.
- **UX-10.** Registrar interação fecha o dialog a cada item; permitir "registrar e continuar".
- **UX-11.** Criar follow-up exige ir a Tarefas; oferecer 1-clique no detalhe do lead.
- **UX-12.** Três caminhos redundantes para mudar status no detalhe (botões + dropdown + menu) —
  remover o dropdown "Mudar para…".
- **UX-13.** Status legado `qualificado`/`proposta_enviada`/`pos_venda` fora do `LEAD_STATUS_ORDER`
  — limpar enum/labels.
- **UX-14.** Kanban com colunas `w-72` fixas (~3400px) quebra no mobile; copa com estilos inline
  sem breakpoints; tabela de leads com headers apertados no mobile.
- **UX-15.** Campo `avancado` da oferta é lido mas não há UI para setá-lo (feature incompleta).
- **UX-16.** Pontuação da Copa aceita valores negativos sem validação.
- **UX-17.** Import: encoding (UTF-8 vs Latin-1) e dedup por formatação de telefone podem falhar
  (a dedup do intake já normaliza — alinhar o import à mesma regra).
- **UX-18.** Acessibilidade: cards do kanban sem `role`/teclado; faltam labels ARIA.
- **UX-19.** Invalidações amplas (`["leads"]`) re-rodam queries pesadas; mirar chaves específicas
  e incluir `leads-status-counts` após transferência em massa.
- **UX-20.** Estado derivado guardado em estado (`debouncedSearch`) e `useEffect` de paginação com
  8 dependências — fonte de bugs sutis; usar derivação/seleção.

---

## FASE 9 — IA e automação (oportunidades)

| Automação | Impacto | Complexidade | ROI | Prioridade |
|-----------|---------|--------------|-----|-----------|
| Score/priorização de lead (probabilidade de conversão) | Alto | Média | Alto | P1 |
| Distribuição inteligente (afinidade corretor×perfil, não só rodízio) | Alto | Média | Alto | P1 |
| Follow-up automático (sequências por estágio/temperatura) | Alto | Média | Alto | P1 |
| Pré-análise MCMV automática (renda/FGTS → faixa/elegibilidade) | Alto | Média-Alta | Alto | P1 |
| Recomendação de imóvel (já há base no match IA — falta persistir/aprender) | Médio | Média | Médio | P2 |
| Auditoria de atendimento (qualidade de interações) | Médio | Média | Médio | P2 |
| Score de corretor (produtividade/conversão) | Médio | Baixa | Médio | P2 |

Observação: o custo de IA precisa de teto/caching (ver Performance) antes de ampliar uso.

---

## FASE 10 — Produto (gaps vs. mercado)

Comparado a Salesforce/HubSpot/Pipedrive/RD/Kommo/Zoho/PipeRun, faltam principalmente itens já
mapeados em `.lovable/roadmap-restante.md`: **WhatsApp oficial** (hoje só `wa.me`),
**comissões/contratos/propostas** completos (com PDF/assinatura), **pré-análise/documentação**,
**oferta/carteira ativa**, **agendamento público (Calendly-like)**, **integrações** (Google
Sheets/Calendar, BI, Zapier/Make de saída), **relatórios/BI** e **app mobile/PWA instalável**.

---

## Falsos positivos / itens já corrigidos (transparência)

A varredura inicial apontou estes "P0" que **não procedem** no código atual:

1. **"Race condition de dupla atribuição em `distribuir_lead`"** — a versão vigente
   (`supabase/migrations/20260617205622_*.sql`) usa `FOR UPDATE SKIP LOCKED` ao selecionar/
   incrementar a fila. A varredura citou uma migration **superada** (`20260615133551`). Mitigado.
2. **"`superintendente` não existe no enum `app_role`"** — existe: adicionado em
   `20260615230000_*.sql:15` (`ALTER TYPE ... ADD VALUE 'superintendente'`).
3. **"`READ_API_KEY` comparada sem proteção a timing attack"** — falso: usa `timingSafeEqual`
   (`src/lib/public-api-auth.ts`).
4. **"Webhook por token vulnerável a timing attack"** — é um lookup indexado no banco
   (`.eq("webhook_token", …)`), não comparação de string; risco prático desprezível. O ponto
   válido ali é ausência de rate limit (P2).
5. **Maioria dos "P0 de perda de dados" de formulário** — fechar um dialog descartando input não
   salvo é comportamento padrão de UI; vira recomendação de UX (confirmação de alterações não
   salvas, UX-5), não bug.

---

## Limitação desta auditoria

Não foi possível rodar `vitest`/`lint`/`build` completos no ambiente: o registro de pacotes
configurado (`europe-west4-npm.pkg.dev`, cache privado do Lovable) está **bloqueado pela política
de egresso** (403) e o `bun.lock` fixa as URLs nesse registro. Conforme a política do proxy, não
roteamos ao redor do bloqueio. Os **10 testes novos** foram validados isoladamente com o runner do
Bun (pure modules, sem `node_modules`). As edições restantes foram revisadas estaticamente e não
tocam os módulos cujas dependências faltam. Recomenda-se rodar a suíte completa num ambiente com
acesso ao registro (ou via CI) — ver `roadmap.md`.
