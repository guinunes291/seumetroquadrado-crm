## Objetivo

Enriquecer a tabela `profiles` com todos os campos do CSV `users_20260615_194040.csv` e atualizar os corretores existentes (match por email), devolvendo um relatório dos que não têm conta no sistema.

## 1. Migration — expandir `profiles`

Adicionar colunas (todas nullable, sem quebrar registros existentes):

| Coluna | Tipo | Origem CSV |
|---|---|---|
| `legacy_user_id` | bigint UNIQUE | `id` |
| `cpf` | text | `cpf` (normalizado, só dígitos) |
| `data_nascimento` | date | `dataNascimento` |
| `creci` | text | `creci` |
| `data_credenciamento` | date | `dataCredenciamento` |
| `data_descredenciamento` | date | `dataDescredenciamento` |
| `situacao` | text | `situacao` |
| `foto_url` | text | `fotoUrl` (também copiada para `avatar_url` se vazio) |
| `logradouro` | text | idem |
| `numero` | text | idem |
| `complemento` | text | idem |
| `bairro` | text | idem |
| `cidade` | text | idem |
| `estado` | text (2) | idem |
| `cep` | text | idem (só dígitos) |
| `codigo_indicacao` | text | idem |
| `limite_diario_leads` | int default 50 | idem |
| `limite_diario_webhook` | int default 10 | idem |
| `google_calendar_enabled` | bool default false | idem |
| `perfil_completo` | bool default false | idem |
| `acessa_links_uteis` | bool default false | idem |

Não traz: `openId`, `loginMethod`, `lastSignedIn`, `status` (presença), `equipeId` (IDs do sistema antigo não batem), `googleRefreshToken` (sensível, deve vir por OAuth).

Índice único parcial em `cpf` (quando não nulo). Sem mudança em policies/grants — herdam o que já existe em profiles.

## 2. Import — atualizar corretores existentes

Server function admin-only (`createServerFn` + `supabaseAdmin`, gate por `has_role('admin')`) chamada uma vez via botão temporário ou direto pelo agente:

1. Ler CSV embarcado (committo em `src/data/seed/users_legacy.json` ou rodo via psql `\copy` para tabela temporária).
2. Para cada linha:
   - Normalizar email (`lower(trim)`)
   - Buscar `profiles` por email.
   - Se existe: `UPDATE` preenchendo TODOS os campos novos + `telefone`, `avatar_url` (só se vazio), `cargo` ← `role`, `data_admissao` ← `dataCredenciamento`.
   - Se não existe: registrar em lista `faltantes[]` com `{legacy_id, name, email, role}`.
3. Atualizar `user_roles` para refletir o `role` do CSV (`admin`/`gestor`/`superintendente`/`corretor`) quando o profile existe — mapear `superintendente` → manter como `gestor` ou criar enum (a decidir; default = manter `gestor`).

Output: relatório `{atualizados: N, faltantes: [...]}` salvo em `/mnt/documents/import-corretores-relatorio.json` e exibido no chat.

## 3. Entrega do relatório

Listo no chat os corretores faltantes (nome + email + role esperado) para você decidir convidar manualmente depois.

## Detalhes técnicos

- O CSV tem 31 linhas — operação rápida, faço direto via `supabase--insert` em batch após a migration.
- CPF: alguns vêm formatados (`115.444.674-35`), outros não — normalizo com regex.
- Datas: vêm como `2026-01-17 17:25:00` — cast para `date` extraindo só YYYY-MM-DD.
- `role` no CSV tem `superintendente` que não existe no enum `app_role` (admin/gestor/corretor). Vou mapear `superintendente` → `gestor` por padrão; confirma se prefere outro.
- Nada muda no front nessa entrega — só schema + dados. Telas que mostram esses campos (meu-perfil, equipes) ficam como follow-up se você quiser.

## Pontos a confirmar antes de implementar

1. `superintendente` → mapear para `gestor` ou criar novo valor no enum?
2. Quando o CSV tem `fotoUrl` mas o profile já tem `avatar_url`, sobrescrevo ou preservo? (default sugerido: preservar)
