---
name: verify
description: Como buildar, subir e dirigir este CRM (TanStack Start + Supabase) para verificar mudanças em runtime.
---

# Verificar mudanças neste repo

## Instalar

- `npm install` (não `npm ci` — o package-lock.json está defasado; **não commitar**
  o lockfile alterado: `git checkout -- package-lock.json` antes do commit).
- `bun install` falha em sandbox: o bun.lock resolve para o mirror privado do
  Lovable (europe-west1-npm.pkg.dev → 403). npm usa registry.npmjs.org.

## Subir o app

```bash
SUPABASE_URL=http://127.0.0.1:9999 \
SUPABASE_SERVICE_ROLE_KEY=fake \
<OUTROS_SECRETS>=... \
npx vite dev --host 127.0.0.1 --port 5199
```

- **`--host 127.0.0.1` é obrigatório** — o container não tem IPv6 e o default
  (`::`) morre com `EAFNOSUPPORT`.
- Subir o vite dev também regenera `src/routeTree.gen.ts` (commitar quando
  adicionar rota).

## Dirigir rotas de API server-side (webhooks etc.)

Sem Supabase real no sandbox: sirva um PostgREST fake em :9999 que loga cada
request e responde por prefixo de rota — os handlers do supabase-js só precisam
de status + JSON com o shape certo:

- `POST /rest/v1/<tabela>?select=...` + `.single()` → `201 {"id":"..."}`
- insert/update sem `.select()` → `201`/`204` corpo vazio
- `POST /rest/v1/rpc/<fn>` → o valor escalar/JSON da função

Inspecionar o log do mock mostra exatamente o que a rota gravaria no banco
(tabelas, colunas, corpos) — é a evidência que importa. Depois: `curl` nos
caminhos de erro (401/400/422) e nos fluxos felizes.

## Testes/lint (CI, não verificação)

`npx vitest run` · `npx eslint <arquivos>` · `npx tsc --noEmit` (o repo tem
3 erros de tipo pré-existentes em `_authenticated/route.tsx` e
`reset-password.tsx` — ignorar, conferir só os seus arquivos).
