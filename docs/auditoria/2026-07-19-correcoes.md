# Auditoria funcional — Onda 5 (2026-07-19) — Relatório de correções

Cada item: causa-raiz → correção → arquivos → verificação. Commits pequenos por tema na
branch `claude/crm-full-functional-audit-5eqr72`.

## Infra e baseline

### 1. `npm ci` quebrado (lockfile fora de sincronia)

- **Causa-raiz**: o package.json exigia `@lovable.dev/vite-tanstack-config@^2.7.6` e o
  `package-lock.json` resolvia 2.7.4 — consequência do dual-lockfile (bun × npm).
- **Correção**: lockfile regenerado (`npm install`), sem outras mudanças.
- **Arquivos**: `package-lock.json`.
- **Verificação**: `npm ci` verde; CI desbloqueado.

### 2. P1-5 — replay das migrations quebrado desde jun/2026

- **Causa-raiz**: histórico reescrito pelo gerador — re-emissões de tabelas
  (vendas/comissoes/analises_credito/Copa) sem guardas; patches de dados de produção com
  UUIDs fixos; troca de tipo de retorno de função sem DROP.
- **Correção**: harness completo em `scripts/db-harness/` (shims de auth/storage/roles,
  extensões fake de pg_cron/pg_net, `apply.sh` transacional com rastreio, `reset.sh`,
  docker-compose) + **guardas de idempotência** em 7 migrations históricas (34 edições
  automáticas + 6 manuais, todas mecânicas: IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS
  antes do CREATE, seeds/patches condicionados à existência das linhas-alvo — nunca
  mudança de semântica; produção rastreia por versão e não re-executa).
  Migrations editadas: `20260615182703`, `20260615190826`, `20260615235954`,
  `20260616130200`, `20260616170432`, `20260619185115`, `20260702000028`,
  `20260718181441`.
- **Reconciliação com produção** (divergências do histórico reescrito, no-op em prod):
  `20260619185115` dropa as variantes v1 VAZIAS de `vendas`/`comissoes`/`analises_credito`
  (produção = v2, confirmado pelo types.ts do banco vivo) antes de criar o formato v2;
  `20260719121000` converte `copa_fases.semana_*` de text para integer (estado real de
  produção), com fallback pela ordem da fase para dados poluídos do replay.
- **Verificação**: replay do zero das 209 migrations em ~35s, zero erros — agora gate de CI.

## Banco / regras de negócio

### 3. Dedup de leads (migrations `20260719120000` + `20260719123000`)

- **Causa-raiz**: índice único condicional só para leads COM projeto; chave com DDI
  (variantes +55/local não colidiam); lixeira dentro da chave (cliente retornante
  bloqueado); checagem do formulário 100% client-side (corrida check-then-insert).
- **Correção**: índice único parcial também para leads SEM projeto; chave de ambos os
  índices = `right(telefone_digits(telefone), 10)` (DDD+número); lixeira fora da chave
  (restaurar lead conflitante é barrado explicitamente — gestor mescla); RPC
  `criar_lead_dedup` (advisory lock transacional + checagem + insert atômicos, espelhando
  a policy `pode_atribuir_lead`, sem vazar dados de outra carteira); views de relatório
  para limpeza humana (`vw_leads_sem_projeto_telefone_duplicado`). Nada é apagado
  automaticamente. Formulário "Novo lead" passou a usar a RPC.
- **Arquivos**: migrations acima; `src/features/leads/novo-lead-dialog.tsx`.
- **Verificação**: `tests/db/dedup-leads.test.ts` (31 casos, incluindo 23505 nas
  variantes de formatação e +55, lixeira liberando recadastro, `mesclar_leads`).

### 4. Guard de fechamento no INSERT (migration `20260719120000`)

- **Causa-raiz**: `validar_status_lead_via_rpc` e `proteger_fechamento_sem_venda_aprovada`
  só disparam em UPDATE — INSERT direto criava lead já `contrato_fechado`/`pos_venda`
  sem venda aprovada.
- **Correção**: trigger `trg_proteger_fechamento_insert` (BEFORE INSERT). Nenhum caminho
  legítimo insere lead fechado (importação usa status `novo`).
- **Verificação**: testado via psql (gestor bloqueado; corretor já era neutralizado pela
  normalização) e coberto pela suíte.

### 5. `distribuir_lead_ponderado` (migration `20260719123000`)

- **Causa-raiz**: motor por tier sem FOR UPDATE nem checagem de `corretor_id` — roubava
  lead já atribuído; concorrência duplicava log e avançava o cursor SWRR 2×.
- **Correção**: FOR UPDATE no lead + retorno `{ok:false, motivo:'ja_atribuido'}` +
  advisory lock do cursor por roleta; atribuição inicial não regride etapa de lead que já
  avançou no funil.
- **Verificação**: `tests/db/distribuicao-v3.test.ts` (concorrência com 2 conexões:
  exatamente 1 log de sucesso; lead de outro corretor intocado).

### 6. Espelho `proximo_followup` em lead encerrado (migration `20260719123000`)

- **Causa-raiz**: `sync_proximo_followup` não considerava o status do lead — tarefa
  pendente de tipo não-contato (visita/documentação/outro) repovoava o follow-up após
  fechamento/perda; criar tarefa em lead perdido também.
- **Correção**: espelho força NULL para lead em status terminal; backfill limpa resíduos.
- **Verificação**: `tests/db/followup-triggers.test.ts` (12 casos).

### 7. Rate limit distribuído (migration `20260719124000`)

- **Causa-raiz**: limiter em memória por processo — em Workers o teto efetivo multiplica
  pelo nº de instâncias e zera a cada deploy.
- **Correção**: tabela `api_rate_limits` + RPC `consumir_api_rate_limit` (janela fixa
  atômica, padrão do landing generalizado) + limpeza horária via cron;
  `requireApiClientScope` consome as duas camadas (memória como primeira barreira,
  banco como régua; indisponibilidade do banco degrada com log — rate limit não é
  autenticação).
- **Arquivos**: `src/lib/public-api-auth.ts` (`checkRateLimitDistribuido`),
  `src/lib/api-client-auth.server.ts`.

### 8. `lead-intake` (edge function)

- **Causa-raiz**: secret comparado com `!==` (vaza timing) e aceito por query string
  (vaza em logs de proxy/CDN) sem qualquer aviso.
- **Correção**: comparação em tempo constante (digest SHA-256 de ambos os lados);
  `?secret=` mantido por compatibilidade com o Zap atual, com log de deprecação
  (remoção = pendência, exige migrar o Zapier para o header antes).
- **Arquivos**: `supabase/functions/lead-intake/index.ts`.

## Frontend

### 9. P1-4 — erro renderizado como "tudo em dia"/zeros

- **Causa-raiz**: consumidores de useQuery só checavam `isLoading` e colapsavam
  `undefined → 0/[]`; erro de RPC virava dashboard zerado, "Tudo em dia", tabela vazia.
- **Correção**: `AsyncBoundary`/checagem explícita de `isError` com retry em CADA seção
  (falha isolada, sem derrubar a página): dashboard/relatórios (KPIs, situação agora,
  série diária, funil, ranking, urgentes, motivos de perda, redistribuições), painel do
  gestor (coluna Parados com "—" + aviso nomeando colunas afetadas, StatGrids, tabela de
  atividade incluindo erro de nomes), central de comando (widgets com número de decisão
  propagam isError). Inteligência já estava correta (commit 775ba13).
- **Arquivos**: `src/features/dashboard/relatorios-view.tsx`,
  `src/routes/_authenticated/painel-gestor.tsx`, `src/routes/_authenticated/hoje.tsx`,
  `src/features/command-center/widgets/*`.

### 10. Truncamento exposto

- **Correção**: flag `truncado` + aviso pt-BR ("mostrando os primeiros N…") quando o
  volume atinge o limite do caminho client-side: gestão (fallback de 10k interações),
  roleta (2000), leads por corretor (2000), leads landing (1000).
- **Arquivos**: `src/features/gestao/use-gestao-metricas.ts`,
  `src/features/distribuicao/queries.ts`, `src/features/gestao/leads-por-corretor-page.tsx`,
  `src/routes/_authenticated/leads-landing.tsx`.

### 11. Motor anti-perda audível

- **Causa-raiz**: `catch {}` — follow-up automático podia falhar para sempre sem ninguém saber.
- **Correção**: log com contexto + toast ("Etapa alterada, mas o follow-up automático
  falhou — crie manualmente"); a transição de etapa segue intacta.
- **Arquivos**: `src/hooks/use-lead-status.ts`.

### 12. `bulkFollowup` com dedup

- **Causa-raiz**: insert direto em `tarefas`, fora do dedup canônico — lote reaplicado
  duplicava follow-ups.
- **Correção**: passa por `garantirFollowUpAberto` por lead (atualiza em vez de duplicar).
- **Arquivos**: `src/features/leads/use-lead-mutations.ts`.

### 13. Guard de conta ativa testado (P1-1)

- **Correção**: decisão extraída para `src/lib/conta-ativa.ts` (`verificarContaAtiva`) e
  blindada por `tests/auth-guard.test.ts` (falha transitória NUNCA desloga; só negação
  real do banco encerra a sessão local). Comportamento inalterado.

### 14. `types.ts` regenerado do schema real

- **Causa-raiz**: types defasados forçavam 226 casts `as never` (teto 220 — CI vermelho).
- **Correção**: gerado do harness com as migrations aplicadas (postgres-meta, mesmo motor
  do CLI); 101 casts removidos onde ficaram desnecessários (restaurados apenas os 16
  arquivos onde o cast era load-bearing). Escapes: 226 → 162. Ajuste manual documentado:
  entrada de `copa_ranking()` usa o shape real de produção (drift registrado).
- **Arquivos**: `src/integrations/supabase/types.ts` + ~25 arquivos com casts removidos.

### 15. Página 500 do Worker em pt-BR

- **Arquivos**: `src/lib/error-page.ts`.

## Testes e CI

### 16. Suíte de banco `tests/db/` (novo)

9 arquivos contra Postgres real: `harness-sanidade`, `contrato-transicoes` (matriz
338 pares TS×SQL + comportamento da RPC), `rls-por-papel` (49 casos), `aprovar-venda`
(24: idempotência, imutabilidade, concorrência), `distribuicao-v3` (13: rodízio,
exceções, concorrência), `dedup-leads` (31), `followup-triggers` (12),
`kpis-consistencia`, `jornada-lead-venda`. Config própria (`vitest.db.config.ts`,
`npm run test:db`), helpers de identidade (`comoUsuario` = SET ROLE + claims JWT).

### 17. CI — job `db-tests`

Replay do zero (docker compose do harness com extensões fake montadas) + `npm run
test:db` a cada push. Toda migration futura que quebrar o replay ou uma regra testada
quebra o CI.
