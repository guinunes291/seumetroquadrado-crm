# Harness de banco local

Aplica **todas** as migrations de `supabase/migrations/` num Postgres 16 real
(local ou CI), com shims mínimos da plataforma Supabase (auth, storage,
pg_cron/pg_net fake). É o que permite testar RLS, RPCs e triggers de verdade
(`tests/db/`), coisa que a suíte vitest com mocks não cobre.

## Subir com Docker

```bash
npm run db:up      # postgres:16-alpine na porta 54329 (extensões fake montadas)
npm run db:apply   # shims + 204 migrations (~35s)
npm run test:db    # suíte SQL (tests/db)
npm run db:reset   # dropa e recria o banco, reaplica tudo
```

## Subir sem Docker (Postgres do sistema)

```bash
bash scripts/db-harness/install-fake-extensions.sh   # copia pg_cron/pg_net fake
initdb -D /tmp/pgharness/pgdata -U postgres --auth=trust
pg_ctl -D /tmp/pgharness/pgdata -o "-p 54329 -c fsync=off" start
npm run db:apply
```

`DATABASE_URL` (padrão `postgresql://postgres:postgres@localhost:54329/postgres`)
é respeitada por `apply.sh` e pelos testes de `tests/db/`.

## O que são os shims

| Arquivo | Conteúdo |
|---|---|
| `00-roles.sql` | roles `anon`/`authenticated`/`service_role`/`sandbox_exec` etc., schema `extensions`, `pg_trgm`/`unaccent`/`pgcrypto` reais, publication `supabase_realtime`, search_path |
| `01-auth-shim.sql` | schema `auth`: tabela `users` (colunas GoTrue usadas pelas migrations), `sessions`, `auth.uid()/role()/jwt()/email()` lendo `request.jwt.claims` |
| `02-platform-shims.sql` | schema `storage` (`buckets`, `objects`, `foldername()`), o resto vem das extensões fake |
| `fake-extensions/` | `pg_cron` (registra jobs em `cron.job`, não executa) e `pg_net` (registra requisições em `net.http_request_queue`, não faz HTTP) |

Como injetar identidade nos testes (o que o PostgREST faz por request):

```sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', false);
```

## Idempotência das migrations (P1-5)

O replay do zero quebrava desde jun/2026 (CREATE TABLE duplicado de
vendas/comissoes/analises_credito e re-emissões de objetos da Copa). As
migrations históricas afetadas receberam **apenas guardas de idempotência**
(`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, seeds
condicionados) — nunca mudança de semântica; produção rastreia migrations por
versão e não re-executa os arquivos editados. Detalhe por arquivo em
`docs/auditoria/2026-07-19-correcoes.md`.

Patches de dados de produção (UUIDs fixos de usuários/fases) são guardados por
existência da linha-alvo: rodam em produção, viram no-op em ambiente limpo.

`apply.sh` registra cada arquivo aplicado em `harness.applied_migrations` e
roda cada migration em transação única (`psql -1`), como o runner do Supabase.
