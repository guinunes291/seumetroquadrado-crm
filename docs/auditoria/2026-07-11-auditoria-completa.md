# Auditoria Técnica Completa — Seu Metro Quadrado CRM

**Data:** 2026-07-11 · **Modo:** somente leitura (nenhum arquivo de código, migration, secret ou config foi alterado) · **Alvo:** branch `claude/smq-crm-technical-audit-mcxh67` @ `75d9e19` (64 commits à frente de `main` @ `f040409`), com mapa de risco do delta contra `main`.

**Método:** exploração dirigida (`rg`/`git`/leitura), gates locais reais (`npm ci`/typecheck/lint/testes/build), smoke test do artefato de produção com Playwright, e fan-out de 8 dimensões de auditoria com **verificação adversarial independente** de cada achado P0/P1 (37 subagentes; 5 achados eliminados por falsificação). Cada achado traz `arquivo:linha` e uma etiqueta epistêmica: **CONFIRMADO** (código lido e confere), **INFERÊNCIA** (deduzido de evidência indireta), **HIPÓTESE** (depende de estado não verificável — tipicamente o banco vivo).

**Limitações registradas (não enfraquecidas):**
- **Banco vivo não inspecionado.** A introspecção READ-ONLY de metadados via MCP Supabase (`list_migrations`/`list_tables`/`get_advisors`) exigia aprovação interativa não concedível no modo autônomo. A coluna "existe no vivo?" da matriz da Seção 7 é **INFERÊNCIA** a partir do repositório + `docs/auditoria/2026-07-11-evolucao-crm.md` (que declara o batch `20260710*`/`20260711*` como não aplicado). Nenhum SQL foi executado contra produção.
- **Smoke via `node-server`, não `workerd`.** O alvo de produção é Cloudflare Workers. Para servir o artefato localmente, refiz o build com `NITRO_PRESET=node-server`; **os assets client saíram byte-idênticos** (mesmos hashes) ao build `cloudflare-module`, então o lado navegador exercitado é exatamente o que embarca. Diferenças de runtime Workers (APIs `workerd`) não foram exercitadas.
- **Playwright só em rotas públicas** (`/auth`, `/vitrine-publica`, `/`), sem credenciais reais. Rotas autenticadas foram cobertas por análise estática.
- **`git fetch origin main` não disponível no sandbox;** o delta usou a ref `origin/main` local (`f040409`).
- **"main = produção lovable.app"** é INFERÊNCIA (o Lovable pode publicar de cópia própria); tratado como tal.

---

## 1. Resumo executivo

O CRM está, no código, **substancialmente mais maduro e mais seguro** do que a versão em produção: esta branch entrega invite-only, modelo de carteira (`pode_acessar_lead`), integridade de vendas com ledgers imutáveis, hardening de landing/webhook e read-models escaláveis. Os gates locais passam integralmente (typecheck, lint, **525 testes**, build, bundle-budget) e **o smoke test do artefato de produção renderiza sem tela branca, sem erro de console, sem chunk 404 e sem vazamento de segredo** — o incidente anterior de `useSyncExternalStore` **não se reproduz** no HEAD atual (há uma única cópia de React, no chunk `vendor-radix`, carregado antes do shim).

O risco dominante é de **entrega/operação, não de código**: esta branch acopla, num único release, **~20 RPCs e ~8 tabelas novas** que o frontend exige **sem nenhum caminho de fallback**, e as migrations correspondentes estão documentadas como **não aplicadas ao Supabase vivo**. Como o deploy do frontend (GitHub→Lovable→Cloudflare) e a aplicação de migrations no Supabase são **desacoplados e manuais** — e o repositório tem precedente de aplicação manual de SQL (PRs #68, #72) —, publicar o frontend antes de aplicar o batch reproduz exatamente o incidente relatado: o guard de autenticação faz **logout global de todos os usuários**. Este é o único **P0** e é **bloqueante de release**.

Além do P0, cinco **P1** confirmados independem da ordem de deploy: (1) o guard desloga globalmente em qualquer erro **transitório** do RPC (timeout/5xx), mesmo com as migrations aplicadas; (2) a migration de maior timestamp **regride a autorização** de `transferir_leads`, permitindo a um gestor roubar leads de outra equipe; (3) a edge function `notify-lead-transfer` **não checa papel nem posse**; (4) as telas de decisão operacional (Central de Comando, Painel Gestor, Inteligência) **renderizam erro de backend como "tudo em dia"/zero** — o anti-padrão exato que o brief proíbe; (5) `supabase db reset` está quebrado, impedindo validar o batch localmente.

Contagem final pós-verificação adversarial: **1 P0, 5 P1, 20 P2, 14 P3** (5 achados candidatos foram eliminados por não sobreviverem à falsificação — ver Seção 5).

**Recomendação de release:** não publicar o frontend desta branch sem antes aplicar e validar o batch `20260709*`/`20260710*`/`20260711*` no Supabase vivo, corrigir a regressão de `transferir_leads`, tornar o guard tolerante a erro transitório, e propagar `isError` nas telas de decisão. Nada disso deve ser feito nesta etapa (somente leitura) — são as próximas ações propostas.

---

## 2. Estado atual confirmado

**Repositório e branch.** Working tree limpo. Branch `claude/smq-crm-technical-audit-mcxh67` @ `75d9e19`, 64 commits à frente de `main`/`origin/main` @ `f040409` ("Adicionou integrações MCP"). Delta: **268 arquivos, +40.327/−4.684**. `main` é a referência de produção (INFERÊNCIA).

**Gates locais executados (todos verdes) — [CONFIRMADO]:**

| Gate | Comando | Resultado |
|---|---|---|
| Instalação | `npm ci` | exit 0 |
| Typecheck | `tsc --noEmit` | exit 0 |
| Lint | `eslint` (`lint:ci`) | exit 0 |
| Orçamento de type-escapes | `scripts/check-type-escape-budget.mjs` | 228/242 |
| Testes | `vitest run` | **65 arquivos, 525 testes, 100% passa** |
| Build (cloudflare) | `vite build` | exit 0; gera `.output/server/wrangler.json` |
| Bundle budget | `scripts/check-bundle-budget.mjs` | passa (maior chunk 203 KB gzip < 250 KB) |

Ponto central: **todos os gates passam sem instanciar o app em navegador**. O CI (`.github/workflows/ci.yml`) tem a mesma composição — nenhum boot do artefato — então a classe de falha de tela branca/hidratação/chunk 404 é **indetectável no pipeline** (ver P2 "CI não boota o navegador").

**Smoke test do artefato de produção (Playwright/Chromium, build `node-server` com assets client idênticos ao `cloudflare-module`) — [CONFIRMADO]:**
- `/auth` → 200, React renderizado (rootHTML 5.334 chars); formulário de login visível (email + senha), branding "Seu Metro Quadrado / CRM Imobiliário", copy invite-only ("O acesso é exclusivo para profissionais convidados pela gestão"), botão "Continuar com Google".
- `/vitrine-publica` → 200, conteúdo renderizado.
- `/` (protegida) → redireciona para `/auth?next=%2F` (guard client-side sem sessão).
- **0 erros fatais** (nenhum `useSyncExternalStore`, `ChunkLoadError`, hidratação, `Minified React error`); **0 erros de console**; **0 chunks 404**; **0 segredos** no JS servido (apenas a publishable key pública, por design); **0 overflow horizontal** em 320/375/768/1024 e em zoom 200%.

**Packaging (análise do grafo real de chunks) — [CONFIRMADO]:** o `manualChunks` atual isola `@supabase`, `@radix-ui`, charts, ui e date; **React core existe em uma única cópia** (definido em `vendor-radix`, importado pelo entry, que contém `react-dom`/`createRoot`), e o entry importa `vendor-radix` estaticamente (eager), garantindo que React exista antes do shim `use-sync-external-store` rodar. O incidente `useSyncExternalStore` **não se reproduz**. A segurança, porém, é **emergente** da decisão de chunking (React "caiu" em `vendor-radix`), não fixada por teste — ver P3 "manualChunks frágil".

**Correções a hipóteses do próprio levantamento inicial (NÃO viraram achado):**
- **SECURITY DEFINER com `search_path`:** as 281 funções `SECURITY DEFINER` das migrations **têm** `SET search_path` no header — inclusive as antigas de junho. A suspeita inicial de omissão era falsa. [CONFIRMADO]
- **Kanban acessível:** o board (`leads-kanban-board.tsx`) tem alternativa acessível ao drag-and-drop (menu "Mudar etapa do lead", com `aria-live`, instruções e `role`/`aria-label`), e distingue erro de vazio — é, na prática, **o melhor exemplo de estados do repo**, não uma falha. [CONFIRMADO]
- **Segredos no histórico:** `.env` só teve chaves **públicas** (publishable key/URL/project id) em toda a história; nenhum `service_role`/JWT/`sk_` foi commitado. O cliente admin service-role (`client.server.ts`) só é importado em `*.server.ts`/`api/` — **não vaza para o bundle**. [CONFIRMADO]

---

## 3. Achados P0 — críticos

### P0-1 — Acoplamento de ordem de deploy: o frontend hard-depende de ~20 RPCs/~8 tabelas branch-only sem fallback, e o guard faz logout global em erro do RPC

- **Etiqueta:** núcleo **CONFIRMADO** (código); "produção quebrada agora" é **HIPÓTESE** (banco vivo não inspecionável).
- **Evidência (código, CONFIRMADO):**
  - Guard: `src/routes/_authenticated/route.tsx:63-72` — `const { data: contaAtiva, error: accountError } = await supabase.rpc("conta_atual_ativa")` seguido de `if (accountError || !contaAtiva) { await supabase.auth.signOut({ scope: "global" }); throw redirect({ to: "/auth", ... }) }`. Sem `try/catch`, sem tratamento de `PGRST202`/função ausente. O `beforeLoad` roda a cada navegação (`ssr:false`, `route.tsx:56`).
  - `conta_atual_ativa()` é definida **exclusivamente** em `supabase/migrations/20260711120000_invite_only_lead_access.sql:85` (grep em toda a pasta retorna só este arquivo). Ausente em `origin/main` (o guard do parent só chamava `getUser()`).
  - Ausência total de fallback: `rg` por `PGRST202`/versões v1/try-catch de RPC em `src/` retorna **zero**; todo consumidor faz `if (error) throw error` (`src/lib/lead-transitions.ts:16`, `src/components/leads-kanban-board.tsx:134`, `src/routes/_authenticated/ranking.tsx:802`, etc.).
  - Desacoplamento de deploy: `docs/auditoria/2026-07-11-evolucao-crm.md:8-10,36,65` descreve a ordem obrigatória e o pré-flight como **processo manual**, sem enforcement no único workflow de CI. Precedente de aplicação manual de SQL: commits `53bd605` (#72) e `cfe9510` (#68) "SQL consolidado … para aplicação manual".
- **Cenário de falha:** o frontend do HEAD é publicado no Cloudflare **antes** de aplicar o batch `20260711*` no Supabase vivo. Toda navegação autenticada chama `conta_atual_ativa`; a função não existe → PostgREST retorna `PGRST202`/404 → `accountError` truthy → `signOut({scope:'global'})` para **100% dos usuários, inclusive admins**, sem tela para corrigir (o re-login refaz o guard e desloga de novo). Em paralelo, Kanban, transições de status, distribuição v3, atendimento, aprovação de vendas, vitrine, SamiQ, modo-visita e push **quebram** por dependerem de RPCs/tabelas do mesmo batch (enumeração completa na Seção 7). **É o incidente descrito no brief.**
- **Por que P0 (e não P2, como a verificação adversarial individual sugeriu):** os verificadores rebaixaram cada item individual argumentando, corretamente, que migration e código coabitam o mesmo commit e **normalmente** sobem juntos pelo tooling do Supabase — logo a falha exigiria um erro operacional. Mantenho o **risco sistêmico de release** em P0 porque: (a) o estado documentado do vivo é "batch não aplicado"; (b) o deploy Lovable↔Supabase é **desacoplado e manual**, com precedente de SQL aplicado à mão; (c) **o incidente já ocorreu** exatamente assim; (d) não há **nenhum** fallback amortecedor. A parte genuinamente incerta — se a produção está quebrada **neste instante** — é HIPÓTESE apenas porque a introspecção do banco vivo foi bloqueada.
- **Correção proposta (não implementar agora):** tornar o deploy transacional — **gate de CI/CD que confirma no schema vivo a existência dos RPCs/tabelas do batch antes de publicar o frontend**; e/ou, no guard, distinguir `PGRST202`/timeout/5xx de negação real de acesso e **não deslogar** nesses casos (degradar para "tentar novamente" preservando a sessão). Aplicar e validar todo o batch `20260709*`/`20260710*`/`20260711*` antes de qualquer publicação. Ver também P1-1 (o guard é perigoso mesmo com a migration aplicada).

---

## 4. Achados P1 — altos

### P1-1 — Guard desloga globalmente em qualquer erro transitório do RPC (revoga todas as sessões, todos os dispositivos)
- **Etiqueta:** CONFIRMADO. **Independe da ordem de deploy** — vale mesmo com a migration aplicada.
- **Evidência:** `src/routes/_authenticated/route.tsx:64,67,57`. `if (accountError || !contaAtiva)` trata **qualquer** `accountError` como conta inativa; `signOut({ scope: "global" })` revoga os refresh tokens de **todas** as sessões/dispositivos, não só a aba. É o único `signOut` com escopo `global` do repo (`app-sidebar.tsx:140` e `reset-password.tsx:45` usam escopo local).
- **Cenário:** `conta_atual_ativa` é RPC PostgREST (serviço distinto do GoTrue). Um `statement_timeout` do Postgres, esgotamento de pool no plantão de leads, ou um 503/524 do PostgREST torna `accountError != null` enquanto o login segue acessível → todos os corretores são deslogados de celular **e** desktop simultaneamente, sem retry nem backoff. A distinção `motivo: accountError ? "validacao" : "inativa"` (`:70`) é apenas cosmética na mensagem.
- **Correção:** em erro de rede/timeout/5xx, 1–2 retries com backoff e, persistindo, degradar para "tentar novamente" **sem** `signOut`; reservar `signOut` a `contaAtiva === false` explícito; se ainda deslogar, usar `scope: 'local'`.

### P1-2 — `transferir_leads` regride para gate fraco na última migration: gestor rouba/despeja leads entre equipes
- **Etiqueta:** CONFIRMADO. **Determinístico** (a última definição vence), independe de estado vivo além da aplicação do batch.
- **Evidência:** `supabase/migrations/20260711123500_related_lead_rls.sql:46-154` define `transferir_leads` com gate forte (`is_active_member` + `pode_atribuir_lead(_caller,_corretor)` + `pode_acessar_lead` por lead + destino `status_conta='ativa'` + reatribuição de agendamentos/tarefas + resolução de `distribuicao_excecoes`). Porém `supabase/migrations/20260711201106_19f1221e-…​.sql:321-376` (timestamp **20:11:06 > 12:35:00**, portanto a definição vigente) faz `CREATE OR REPLACE` com gate fraco: só `has_role(admin) OR has_role(gestor)` (superintendente vira 'forbidden'), valida apenas `p.ativo` (não `status_conta`), e **não** chama `pode_atribuir_lead` nem `pode_acessar_lead` por lead. A função é `SECURITY DEFINER` com `GRANT EXECUTE` a `authenticated` → a RLS de `leads` não se aplica dentro dela. Consumo direto em `src/routes/_authenticated/leads-por-corretor.tsx:179`.
- **Cenário:** um gestor autenticado chama `supabase.rpc('transferir_leads',{_ids:[...], _corretor:X})` com IDs de leads de **outra** equipe e destino em qualquer equipe ativa → transfere/rouba a carteira alheia; superintendente perde a capacidade; agendamentos/tarefas deixam de ser reatribuídos.
- **Correção:** remover/substituir a redefinição fraca de `20260711201106` (reaplicar a versão forte de `123500` numa migration posterior), preservando `pode_atribuir_lead`, `pode_acessar_lead` por lead, `status_conta='ativa'` no destino, o papel superintendente e a reatribuição de agendamentos/tarefas; fixar com teste em `commercial-consumers.test`.

### P1-3 — Edge `notify-lead-transfer` sem checagem de papel/posse: qualquer autenticado exfiltra PII de lead e faz phishing de corretor
- **Etiqueta:** CONFIRMADO.
- **Evidência:** `supabase/functions/notify-lead-transfer/index.ts:70` (`Deno.serve` sem `getUser()`/checagem), `:84` (client com `SUPABASE_SERVICE_ROLE_KEY`, bypass de RLS), `:89-93` (lê `leads(nome,origem,projeto_nome,renda_informada)` por `lead_id` arbitrário do body), `:95` (404 `lead_not_found`). Não listada em `config.toml` → `verify_jwt=true` default (exige apenas um JWT válido — qualquer corretor), sem escopo de papel.
- **Cenário:** um corretor autenticado aponta `lead_id` de qualquer lead e `corretor_id` para o próprio profile → recebe PII de lead alheio (bypass de RLS via service role); ou dispara WhatsApp falso de "lead transferido" para qualquer colega; e enumera existência/origem via respostas distintas (`404` vs `skipped:origem_nao_facebook` vs `ok,notificacao`). Atenuante parcial: IDs são UUIDs (dificulta enumeração cega em massa), mas não impede o abuso com IDs conhecidos.
- **Correção:** no início do handler, criar `userClient` com o `Authorization` do chamador, `getUser()`, e exigir `has_role` gestor/admin **ou** que o chamador seja o corretor de origem/dono do lead, antes de usar o service role.

### P1-4 — Erro de backend renderizado como "tudo em dia"/zero nas telas de decisão (Central de Comando, Painel Gestor, Inteligência)
- **Etiqueta:** CONFIRMADO. É o anti-padrão que o brief proíbe explicitamente.
- **Evidência:** `src/features/dashboard/queries.ts` faz `if (error) throw error` em todos os hooks operacionais; os consumidores só checam `isLoading`, **nunca** `isError`, e colapsam `undefined → 0/[]`: `src/features/dashboard/relatorios-view.tsx:241` (`data?.[key] ?? 0` → todos os KPIs zerados), `:477` ("Tudo em dia — nenhum lead parado…"); `src/routes/_authenticated/hoje.tsx:435,527,582` ("Sem compromissos hoje.", "Nada pendente. 🎉", MissionQueue vazia — o núcleo da página); `src/routes/_authenticated/painel-gestor.tsx:436,519` ("Nenhuma interação registrada…", "Nenhum lead parado agora. 👏"); `src/features/inteligencia/insights-panel.tsx:50`. O `QueryClient` (`router.tsx:6-20`) não tem `throwOnError`/`onError`/ErrorBoundary global, e o `retry` retorna `false` para status < 500 → um 403 de RLS exibe estado falso-vazio **imediata e persistentemente**.
- **Cenário:** durante um outage do Supabase (ou um 403 de permissão), corretor/gestor vê um dia "perfeitamente calmo e zerado", indistinguível de sucesso, e deixa de atender leads SLA-crítico. O guardrail anti-perda vira no-op silencioso. Perda de receita direta.
- **Correção:** propagar `isError` aos componentes e renderizar estado de erro explícito (com "Tentar novamente") **antes** de qualquer estado vazio/celebratório; nunca colapsar `undefined → 0/[]` em superfícies de decisão (usar sentinela "—", como `leads.index.tsx:1215` já faz); envolver as seções em `AsyncBoundary` (que já existe e é usado em 3 páginas).

### P1-5 — `supabase db reset` quebrado e nenhum gate valida migrations: o batch do P0 não pode ser validado localmente
- **Etiqueta:** CONFIRMADO.
- **Evidência:** `CREATE TABLE` duplicado sem `IF NOT EXISTS` — `vendas` em `20260616013000:14` (com `IF NOT EXISTS`) recriada em `20260619185115:5` (puro); `comissoes` em `20260616130200:166` recriada em `20260619185115:64`; `analises_credito` idem `:39`/`:121`. `tests/migrations.test.ts` **opta explicitamente** por não cobrir isso (comentário nas linhas finais). O único workflow de CI não roda migrations.
- **Cenário:** `supabase db reset` falha ("relation already exists"), então a equipe não consegue reconstruir o schema do zero para validar localmente o batch cujo deploy-order é o P0. Compõe o risco de release: sem `db reset`, a validação de RLS/migrations vira manual e sujeita a erro.
- **Correção:** tornar idempotentes as definições duplicadas (`IF NOT EXISTS` / consolidação), e adicionar ao CI um job que aplique as migrations num Postgres efêmero (`supabase db reset` ou `psql` sobre um container) — validando RLS localmente, sem tocar produção.

---

## 5. Achados P2 — médios

> Os itens de "ordem de deploy" individuais (Kanban v2, `transicionar_lead`, distribuição v3, atendimento v2, `aprovar_venda`, vitrine, modo-visita, etc.) **foram consolidados no P0-1** e enumerados na matriz da Seção 7; não são repetidos aqui.

**Segurança / autorização (estado vivo inferido):**
- **P2-1 [HIPÓTESE] `signup-enforcement-config-only`** — invite-only depende de `enable_signup=false` no `supabase/config.toml` (só o stack local; a flag do projeto vivo é do dashboard, não versionada). Se o vivo tiver signup habilitado, a anon key pública permite auto-cadastro e o `handle_new_user` legado (`20260615132234`, `:103`) atribui papel `corretor`. Mitigado no batch pendente (`handle_new_user` invite-aware + `has_role` exigindo `is_active_member`). Ev.: `supabase/config.toml:7`, `20260615132234_…​.sql:100-103`, `src/routes/auth.tsx:103`.
- **P2-2 [HIPÓTESE] `landing-pii-any-authenticated`** — no vivo, `leads_landing` tem `SELECT USING(true)`: qualquer corretor lê **todo lead inbound** (PII). A policy restrita foi dropada em `20260624235650:1-2` e só é reescrita com escopo de carteira no batch pendente (`20260711120000:552`). Ev.: `20260624234315_…​.sql:44`, `20260624235650_…​.sql:2`.
- **P2-3 [INFERÊNCIA] `gestor-sem-escopo-de-equipe`** — no vivo, o papel `gestor` (e frequentemente superintendente) enxerga leads/vendas/comissões/agendamentos de **todas as equipes** (policies `has_role` sem predicado de equipe). O batch pendente reescreve tudo para `pode_acessar_lead` com escopo de equipe. Ver Seção 8.
- **P2-4 [CONFIRMADO] `reference-tables-using-true`** — `metas`, `projetos`, `copa_*`, `distribuicao_config`, `templates_comissao`, `unidades`, `scripts_vendas`, `objecoes` têm `SELECT USING(true)` (leitura por qualquer autenticado) no vivo **e** pós-migration. Aceitável para alguns (catálogo), questionável para `metas`.
- **P2-5 [CONFIRMADO] `profiles-visiveis-a-todos`** — `profiles` legível por todo membro (nome/telefone) sem escopo de equipe: vivo `USING(true)`, pós-migration ainda global (`auth.uid()=id OR is_active_member`). Ev.: `20260615132234:117`, `20260711120000` (profiles select).
- **P2-6 [CONFIRMADO] `lead-intake-secret`** — `supabase/functions/lead-intake/index.ts:116` compara o secret com `!==` (não timing-safe) e `:115` **aceita o secret via query string** (`?secret=`), que vaza em access logs/proxy/Referer. Contraste com `admin-reset-password` e a API pública, que usam comparação timing-safe. Correção: digest SHA-256 + comparação constante; exigir sempre o header `x-webhook-secret`.
- **P2-7 [INFERÊNCIA] `inmemory-ratelimit-ineffective-workers`** — rate limits são `Map` in-memory por isolate (`src/lib/rate-limit.ts:5`, `admin-reset-password/index.ts:22`). Em Cloudflare Workers, requests se espalham por isolates efêmeros → o limite (inclusive o 5/min do `ADMIN_RESET_TOKEN`) é quase inócuo contra ataque distribuído. Mover para a borda (Cloudflare Rate Limiting/Turnstile) ou store compartilhado (KV/Durable Objects/Postgres).
- **P2-8 [INFERÊNCIA] `public-api-contact-pii-broad`** — a API pública de leitura inclui `email` e `telefone` de leads (`src/lib/public-api-auth.ts:16-17`); um cliente `leads:read` sem restrição de equipe/projeto pagina toda a base via `supabaseAdmin` (`src/routes/api/public/leads/index.ts:64-69`). Exigir escopo de equipe/projeto obrigatório ou escopo `leads:pii` explícito e auditado.

**Integridade comercial:**
- **P2-9 [CONFIRMADO] `comissao-mutacoes-cliente-bloqueadas`** — assim que o batch for aplicado, `validar_mutacao_comissao` (`20260711122000:762`) barra `authenticated` de alterar `beneficiario_id`/`percentual_desconto`/`valor_liquido`, mas o cliente expõe exatamente essas ações (`src/lib/comissoes.ts:414,426`, acionadas em `comissoes.tsx:709,731`) → atribuição de beneficiário e desconto **quebram** para gestores, sem alternativa. Expor RPCs `SECURITY DEFINER` dedicadas que gravem no ledger.
- **P2-10 [INFERÊNCIA] `gestor-auto-aprova-propria-venda`** — `aprovar_venda` (`20260711122000:960`) exige papel de gestão + `pode_acessar_lead`, mas **não** impede `aprovado_por = corretor_id`: um gestor que também atua como corretor registra e aprova a própria venda, gerando a própria comissão sem revisão independente. Bloquear `auth.uid() = corretor_id` para a decisão "aprovada".
- **P2-11 [HIPÓTESE] `dedup-global-check-then-insert`** — o webhook por token faz check-then-insert (`buscar_lead_ativo_por_telefone_global` em `webhooks/lead/$token.ts:156`, insert em `:222`); o único índice único é **parcial por (projeto, telefone)** e criado só se a base já estiver limpa (`20260710122000:48`). Dois POSTs simultâneos do mesmo telefone para **projetos diferentes** passam ambos e criam 2 leads → dupla distribuição/custo. Fazer o dedup atômico no banco (advisory lock/constraint + tratamento de `23505`).

**Escala / performance (cortes silenciosos e tempestades):**
- **P2-12 [CONFIRMADO] `gestor-atividade-10k-client-agg`** — Painel do gestor baixa até **10.000** interações e agrega por corretor/tipo num `reduce` em JS (`painel-gestor.tsx:221,255-283`); acima de 10k o resultado é **truncado** e a contagem por corretor fica errada. Substituir por RPC com `GROUP BY`.
- **P2-13 [CONFIRMADO] `realtime-no-debounce-full-table-storm`** — `useRealtimeInvalidate` assina `postgres_changes event:'*'` na tabela inteira sem filtro e invalida sem debounce (`use-realtime-invalidate.ts:27,32`); uma transferência em lote de 100 leads (`leads.index.tsx:940`) gera ~100 eventos → ~100 refetches **em todos os clientes conectados**. Adicionar debounce/coalescing (300–500 ms) e filtro server-side (`corretor_id=eq.<uid>`).
- **P2-14 [CONFIRMADO] `leads-por-corretor-2000-silent-cap`** — busca 2.000 leads e agrega stats no cliente **sem aviso** de truncamento (`leads-por-corretor.tsx:103,132`); gestor decide redistribuição sobre dados incompletos. RPC com `GROUP BY corretor_id,status`.
- **P2-15 [CONFIRMADO] `leads-contato-filter-1000-wrong-results`** — filtros de contato em `leads.index` só analisam os 1.000 leads mais prioritários (`leads.index.tsx:689,739`); leads além do teto nunca aparecem no filtro (embora haja banner em `:2015`). Empurrar o critério para dentro da RPC `leads_filtered`.

**UX / operação:**
- **P2-16 [CONFIRMADO] `rotas-sem-distincao-erro-vazio`** — apenas ~12 de ~40 rotas autenticadas tratam `isError`; as demais (hoje, painel-gestor, metas, conquistas, leads-por-corretor, distribuição, etc.) caem no ramo de dados vazios em falha de carga. Padronizar `AsyncBoundary`/`QueryErrorState`; considerar um lint que barre `?? []`/`?? 0` sobre `.data` sem `isError` adjacente.
- **P2-17 [CONFIRMADO] `pagina-erro-worker-em-ingles`** — a página de erro 500 do Worker está 100% em inglês e sem branding num app pt-BR (`src/lib/error-page.ts`). Traduzir e aplicar identidade.
- **P2-18 [CONFIRMADO] `no-rollback-canary-observability`** — não há rollback automático, canário ou healthcheck pós-deploy; nada detecta tela branca em produção. Rollback/canário são apenas documentais (`docs/auditoria/2026-07-11-evolucao-crm.md`), sem enforcement.
- **P2-19 [CONFIRMADO] `gitleaks-default-config-env-tracked`** — gitleaks roda com regras default sem allowlist, e `.env` continua **trackeado em `origin/main`** (removido só nesta branch); o anti-padrão de commitar `.env` nunca é bloqueado no pipeline. Só chaves públicas estão expostas, mas a higiene deve ser corrigida (git-rm no `main` + histórico não é urgente por serem públicas).
- **P2-20 [CONFIRMADO] `ci-no-browser-boot`** — o CI aprova o build sem nunca bootar o artefato: tela branca / hidratação / chunk 404 / `useSyncExternalStore` SSR passam verdes. *(A verificação adversarial rebaixou para P3 por "estrutura verdadeira, mas severidade discutível"; mantenho em P2 por ser exatamente o gap de CI que o brief aponta como causa do incidente.)* Adicionar smoke Playwright sobre o build de produção testando `/`, `/auth` e uma rota pública, reprovando em erro de console não permitido — o método usado nesta auditoria (Seção 2) serve de base.

---

## 6. Achados P3 — melhorias

**Ordem de deploy / packaging:**
- **P3-1 [CONFIRMADO] `vite-manualchunks-latente`** — `manualChunks` é novo neste delta e já causou tela-preta por `useSyncExternalStore` **dentro da própria branch** (corrigido em `3c0b611`, removendo react/tanstack dos chunks); o HEAD está correto (confirmado empiricamente no smoke), mas **frágil a reintrodução** e sem guard de CI. Fixar com smoke test + asserção de cópia única de React. Ev.: `vite.config.ts:41-62`.
- **P3-2 [CONFIRMADO] `dual-lockfile-drift`** — `bun.lock` e `package-lock.json` resolvem versões **diferentes** (react `19.2.5` vs `19.2.7`; router `1.168.25` vs `1.170.15`); o CI valida via `npm ci` uma árvore que pode divergir do que o Lovable publica (INFERÊNCIA sobre o gerenciador do deploy). Ev.: `bun.lock:1704`, `package-lock.json:12823`. Escolher um único gerenciador ou sincronizar/versionar a escolha.
- **P3-3..P3-8 [CONFIRMADO] itens de deploy-order rebaixados** — `transicionar-lead-sem-fallback`, `marcar-lead-perdido-v2`, `distribuicao-v3`, `atendimento-inbox-v2`, `aprovar-venda`, `vitrine`, `modo-visita`, `ausencia-total-de-fallback-pgrst202`: todos são componentes do P0-1 (co-deploy da migration mitiga o item isolado). Endereçados pela correção do P0.

**Escala:**
- **P3-9 [CONFIRMADO] `query-keys-sem-user-equipe`** — chaves de dashboard/copa/ranking/distribuição sem `user.id`/equipe dependem só de `queryClient.clear()` para isolamento (`use-auth.tsx:52`), que não roda no primeiro login. `leads.index` já corrige incluindo `uid` na base key — replicar. Ev.: `dashboard/queries.ts:11`, `copa.tsx:170`, `ranking.tsx:800`.
- **P3-10 [CONFIRMADO] `realtime-multiplos-canais-por-pagina`** — cada `useRealtimeInvalidate` abre um canal com nome aleatório; `atendimento.tsx:65-67` abre 3 canais numa página. Usar o array de tables num canal único.
- **P3-11 [CONFIRMADO] `hoje-sem-acao-300-cap`** e **P3-12 [CONFIRMADO] `distribuicao-recebidos-semana-2000`** — cortes silenciosos (`hoje.tsx:285` limita 300; `distribuicao/queries.ts:340` limita 2000) com join/contagem em JS. Mover para RPCs agregadas.
- **P3-13 [CONFIRMADO] `recharts-eager-inteligencia`** — `recharts` importado estaticamente em `relatorios-view.tsx:27`; lazy-load no ponto de uso melhora o TTI de Inteligência.

**Integridade / UX / autorização:**
- **P3-14 [INFERÊNCIA] `taxa-conversao-formula-divergente`** — conversão calculada com denominador diferente no cliente (`metas.ts:130`, vendas/leads_atendidos) e no ranking do DB (`20260711124000:740`, vendas/recebidos), além de fuso local vs `America/Sao_Paulo`; o mesmo corretor aparece com taxas diferentes por tela. Unificar a fonte de verdade.
- **P3-15 [CONFIRMADO] `validacao-toast-sem-foco`** — validação de formulário via toast efêmero, sem foco no primeiro erro nem associação acessível ao campo.
- **P3-16 [CONFIRMADO] `queries-dropdown-engolem-erro`** — queries secundárias (dropdowns) engolem erro sem sinalizar.
- **P3-17 [INFERÊNCIA] `texto-minusculo-baixo-contraste`** — texto 9–11px em `muted-foreground` (denso no Kanban) compromete contraste/legibilidade.
- **P3-18 [CONFIRMADO] `configuracoes-ui-mais-restrita-que-db`** — UI de configurações gateada em `isAdmin`, mas o DB permite `gestor` mutar `distribuicao_config` via API direta (divergência UI×DB).
- **P3-19 [CONFIRMADO] `superintendente-subgateado-na-ui`** — papel `superintendente` calculado na UI mas excluído de `canManage/podeVer` em várias telas, enquanto o DB concede acesso amplo.
- **P3-20 [INFERÊNCIA] `stg-rls-off-defense-in-depth`** — `stg_*` (PII crua de importação) sem RLS no histórico aplicado; mitigado por `GRANT` só a `service_role`/`sandbox_exec` (não exposto ao PostgREST), corrigido no batch com RLS + `REVOKE`.

---

## 7. Matriz frontend versus schema necessário

Derivada de extração exaustiva (`.from`/`.rpc`/`.channel`/`.storage.from` em `src/`) cruzada com `git diff --name-only origin/main...HEAD -- supabase/migrations/`. **"Só na branch? = S"** significa: a migration que cria a entidade existe apenas nesta branch e, segundo `docs/auditoria/2026-07-11-evolucao-crm.md`, **não foi aplicada ao Supabase vivo** (INFERÊNCIA — o vivo não foi inspecionado). **Nenhum** consumidor tem fallback para `PGRST202`. `types.ts` (gerado) **não** foi usado como prova de existência no vivo.

### 7a. Dependências NOVAS sem fallback (cluster de risco — compõem o P0-1)

| Entidade | Tipo | Usada em (arquivo:linha) | Migration que cria | Só na branch? | Fallback? | Risco se deploy sem migration |
|---|---|---|---|---|---|---|
| `conta_atual_ativa` | rpc | `route.tsx:63`; `documentacao-storage.server.ts:51`; `vitrine-publica.server.ts:53` | `20260711120000` | **S** | não (guard faz signOut) | **P0 — logout global de todos** |
| `transicionar_lead` | rpc | `lead-transitions.ts:16` | `20260711122000` | **S** | não | nenhuma etapa de lead muda |
| `pipeline_stage_page_v2` | rpc | `leads-kanban-board.tsx:134,189` | `20260711124000` | **S** | não | Kanban vazio/erro |
| `pipeline_snapshot_v2` | rpc | `leads-kanban-board.tsx:148`; `samiq.functions.ts:141` | `20260711124000` | **S** | não | Kanban/SamiQ quebram |
| `ranking_periodo_v2` | rpc | `ranking.tsx:802,814,832` | `20260711124000` | **S** | não | página de ranking quebra |
| `marcar_lead_perdido_v2` | rpc | `perdido-dialog.tsx:53` | `20260711123500` | **S** | não (v1 existe, não usado) | não marca perdido |
| `triar_e_distribuir_lead` | rpc | `leads.index.tsx:884,2275`; `webhooks/landing.ts:581,624` | `20260709120200` | **S** | não (landing engole erro) | triagem + captação landing param |
| `distribuir_lead_v3` | rpc | `distribuicao/queries.ts:499` | `20260709120200` | **S** | não | motor de distribuição quebra |
| `painel_distribuicao_resumo`, `minha_elegibilidade`, `elegibilidade_roleta`, `gerenciar_participante_roleta`, `resolver_excecao`, `vendas_mes_anterior`, `atualizar_distribuicao_setting` | rpc | `distribuicao/queries.ts` | `20260709120200` | **S** | não | painel/roleta/exceções quebram |
| `aprovar_venda` | rpc | `pending-sales-approval.tsx:91` | `20260711122000` | **S** | não | gestor não aprova venda |
| `atendimento_inbox_v2` | rpc | `atendimento.tsx:56`; `samiq.functions.ts:151` | `20260711127000` | **S** | não | inbox de atendimento não carrega |
| `fechamento_sinais_v1` | rpc | `fechamento-view.tsx:41` | `20260711134000` | **S** | não | painel de sinais |
| `criar/obter/listar/revogar_vitrine_link`, `registrar_vitrine_evento`, `consumir_vitrine_requisicao` | rpc | `vitrine-publica.server.ts:53,68,…` | `20260711132000` | **S** | não | Vitrine inteira + rota pública |
| `salvar_modo_visita` | rpc | `modo-visita-page.tsx:268` | `20260711133000` | **S** | não | conclusão de visita falha |
| `transicionar_lead_api_perda` | rpc | `api/public/leads/$id.perda.ts:151` | `20260711130000` | **S** | não | API pública de perda |
| `samiq_reservar/finalizar_execucao` | rpc | `samiq-governance.server.ts:45,88` | `20260711131000` | **S** | não (server 503 explícito) | SamiQ inoperante |
| `claim_push_outbox` | rpc | `api/public/hooks/push-dispatch.ts:59` | `20260711121000` | **S** | não | push nunca enviado |
| `visita_execucoes` | table | `modo-visita-page.tsx:225` | `20260711133000` | **S** | não | INSERT falha (tabela inexistente) |
| `documentacao_versoes` | table | `api/documentacao.ts:112` | `20260711121500` | **S** | não | versionamento de docs |
| `api_clientes`, `api_cliente_escopos`, `api_cliente_auditoria` | table | `api-client-auth.server.ts` | `20260711125000` | **S** | 503 explícito | API pública x-api-key nega tudo |
| `roletas`, `roleta_participantes_log`, `distribuicao_settings`, `distribuicao_excecoes`, `distribuicao_log_contexto` | table | `distribuicao/queries.ts` | `20260709120100` | **S** | não | painel de distribuição quebra |

### 7b. Dependências que JÁ existem no vivo (on-main) — seguras

`has_role`, `marcar_presenca`, `marcar_presenca_admin`, `leads_filtered`, `leads_status_counts` (mesma assinatura, não redefinidas), `leads_com_sla`, `buscar_lead_duplicado`, `mesclar_leads`, `detectar_duplicatas_leads`, `restaurar_registro`, `pode_escrever`, `regenerar_webhook_token`, `get_projeto_webhook_token`, `processar_distribuicao_automatica`, `preview/create/atribuir_oferta_ativa`, `marcar_lead_perdido` (v1), todos os `copa_*` (rpc). Tabelas núcleo (`leads`, `projetos`, `profiles`, `user_roles`, `interacoes`, `tarefas`, `agendamentos`, `vendas`, `comissoes`, `metas`, `equipes`, `documentacoes`, `ofertas_ativas`, `push_outbox`, `lead_eventos`, `leads_landing`, `google_calendar_connections`, `copa_*`, etc.). Bucket privado `documentacao`. Canais realtime `copa-live` e `alertas-realtime`. **Nota importante:** a **lista** de leads (`leads.index`) usa `leads_filtered`/`leads_status_counts` que **existem** no vivo — só o Kanban e a triagem quebram sem o batch.

**Conclusão da matriz:** o risco A2 é quase inteiramente **deploy-order**. Publicar o frontend antes de aplicar/validar `20260709*`/`20260710*`/`20260711*` causa lockout de autenticação (P0) e quebra Kanban, transições, distribuição, atendimento, vendas, vitrine, SamiQ, modo-visita e push. A regra de ouro: **aplicar e verificar todo o batch no vivo antes de qualquer publicação do frontend**.

---

## 8. Matriz de autorização por papel

Papéis do enum `app_role`: **admin, gestor, corretor, superintendente** (superintendente adicionado em `20260615230000:15`). **anon:** sem policies nas entidades de negócio. **service_role:** bypassa RLS (uso server-side/edge). Duas leituras onde o batch muda a policy: **VIVO** (inferido, última migration ≤ `20260709*`) vs **PÓS** (com batch `20260711*`, documentado como não aplicado). `S/I/U/D` = SELECT/INSERT/UPDATE/DELETE. Análise estática das migrations — o banco vivo não foi consultado.

### leads
| Papel | VIVO (pré-batch) | PÓS (`20260711120000`) |
|---|---|---|
| corretor | S/U: próprio (`corretor_id=uid`); I: próprio; D: não [CONFIRMADO] | S/U: `pode_acessar_lead` (carteira); I: `pode_atribuir_lead`; D: não |
| gestor | **S/I/U: TODOS** (`has_role`, sem equipe) — **furo cross-equipe** [CONFIRMADO]; D: não | S/U: só leads da sua equipe (`pode_acessar_lead`); D: não |
| superintendente | S/U: sem SELECT global no legado [INFERÊNCIA] | S/U: global; D: sim |
| admin | tudo; D: sim | tudo; D: admin ou superintendente |

### leads_landing (inbound/PII)
| Papel | VIVO | PÓS |
|---|---|---|
| corretor | **S: TODOS via `USING(true)`** — furo PII [HIPÓTESE, P2-2] | S: só se `pode_acessar_lead`, ou (`lead_id` NULL e admin/super) |
| gestor | S/U: todos | escopo carteira; `lead_id` NULL fail-closed |
| admin/super | S/U/D | S/U todos; D admin/super |

### vendas
| Papel | VIVO | PÓS (`20260711122000`) |
|---|---|---|
| corretor | S: próprio; **I: qualquer** (`WITH CHECK auth.uid() NOT NULL` na definição `20260619185115:45`) [HIPÓTESE — ver nota]; U: próprio; D: `criado_por=uid` | S/U: só venda de lead da carteira; I: `criado_por=uid`+`corretor=uid`+status inicial+lead da carteira; D: revogado |
| gestor/super | **S/U: TODOS** (`has_role`, sem equipe) — furo | escopo carteira |
| admin | tudo | tudo dentro da integridade |

> **Nota:** a policy fraca `vendas_insert_auth` foi **dropada** por `20260710120000:41` e `20260711122000` (por isso o achado "forge" foi eliminado na verificação — Seção 5). No estado exato pré-batch aplicado, ela pode existir; no repositório atual, está removida.

### comissoes
| Papel | VIVO | PÓS |
|---|---|---|
| corretor | S: `beneficiario_id=uid`; I/U/D: não | S: `beneficiario_id=uid` ou venda da carteira; I/D: revogado |
| gestor/super | **S/I/U: TODOS** (`has_role`) — furo | S: escopo carteira; U: gestão + venda da carteira |
| admin | tudo | tudo |

### agendamentos / tarefas / interacoes / visitas / analises_credito / documentacoes / lead_eventos / lead_status_transitions
| Papel | VIVO | PÓS (`20260711123500`/`20260711120000`) |
|---|---|---|
| corretor | próprio/dos seus leads; alguns INSERT abertos (`auth.uid() NOT NULL`) no legado [INFERÊNCIA] | tudo unificado em `pode_acessar_lead(lead_id)` — carteira estrita |
| gestor | **global** (`has_role`) — furo cross-equipe | escopo equipe via `pode_acessar_lead` |
| admin/super | global | global |

### profiles / user_roles / equipes
| Entidade | VIVO | PÓS |
|---|---|---|
| profiles | **S: `USING(true)`** — todos leem nome/telefone [P2-5]; U: próprio | S: `auth.uid()=id OR is_active_member` (ainda global); U só via RPC `atualizar_meu_perfil` |
| user_roles | corretor lê os próprios; admin S/I/D todos | igual (batch não altera) |
| equipes | S: `USING(true)`; gestor U própria; admin U/D | igual |

### Tabelas de referência (VIVO = PÓS)
`metas`, `projetos`, `distribuicao_config`, `templates_comissao`, `copa_*`, `roletas`, `unidades`, `scripts_vendas`, `objecoes`: **S: `USING(true)`** (leitura global) [P2-4]; escrita `has_role admin OR gestor`; corretor só leitura.

### API-clientes e stg_* (PII)
| Entidade | Acesso |
|---|---|
| `api_clientes`/escopos/auditoria (tabela nova) | `authenticated`/`anon`: `REVOKE ALL`; `service_role`: `GRANT ALL` |
| `stg_*` (PII crua) | VIVO: sem RLS mas sem GRANT a `authenticated`/`anon` (bloqueado no PostgREST) [INFERÊNCIA]; PÓS: RLS on + `REVOKE` [P3-20] |

**Tema central de isolamento:** no **VIVO**, o papel `gestor` (e frequentemente superintendente) tem visibilidade **global sem predicado de equipe** em quase todas as entidades de lead/venda/comissão/agendamento; o batch pendente reescreve tudo para `pode_acessar_lead` com escopo de equipe. Os furos de maior impacto no vivo são `leads_landing USING(true)` (corretor lê PII inbound) e a visibilidade cross-equipe do gestor. O **UI-gating** (`isAdmin/isGestor/isSuperintendente/isCorretor` em `src/hooks/use-auth.tsx:125-128`) é majoritariamente **mais restrito** que o DB (esconde botões), com as divergências notáveis de Configurações (P3-18) e superintendente sub-gateado (P3-19).

---

### Nota de método sobre a verificação adversarial

Dos 62 achados brutos, **5 foram eliminados** por não sobreviverem à falsificação independente: `vendas-insert-auth-forge` (policy fraca já dropada por migrations posteriores), `venda-ativa-sem-unique-no-live` (cenário hidrida "código novo + banco antigo" logicamente incoerente), e três itens de "RPC branch-only" (`samiq/push/documentacao`) por serem componentes do P0-1 e não defeitos isolados. Vários candidatos P0/P1 de deploy-order foram **rebaixados** individualmente pelos verificadores (migration co-deploya com o código) — decisão que respeito no nível do item, mas cujo **risco sistêmico de release** reconsolidei como P0-1 pelos motivos expostos na Seção 3. Onde mantive uma severidade acima do veredito adversarial (P0-1, P2-20), a divergência está sinalizada no texto.

*Fim do relatório. Nenhuma alteração de código, migration, secret ou configuração foi realizada nesta auditoria.*
