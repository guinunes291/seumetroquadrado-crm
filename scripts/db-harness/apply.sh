#!/usr/bin/env bash
# Aplica os shims da plataforma + TODAS as migrations do repo, em ordem, num
# Postgres de teste. Para no primeiro erro com o nome do arquivo.
#
# Uso:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres \
#     bash scripts/db-harness/apply.sh
#
# Pré-requisito: as extensões fake (pg_cron/pg_net) instaladas no diretório de
# extensões do servidor — ver install-fake-extensions.sh e o README.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HARNESS_DIR/../.." && pwd)"
DB="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54329/postgres}"

PSQL=(psql "$DB" -q -v ON_ERROR_STOP=1 -X)

echo "==> Shims da plataforma"
for f in "$HARNESS_DIR"/00-roles.sql "$HARNESS_DIR"/01-auth-shim.sql "$HARNESS_DIR"/02-platform-shims.sql; do
  echo "    $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

# Rastreio por arquivo, como o runner real (que aplica por versão e nunca
# re-executa): permite retomar a aplicação do ponto da falha após um ajuste.
"${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS harness;
  CREATE TABLE IF NOT EXISTS harness.applied_migrations (
    filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

echo "==> Migrations ($(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l) arquivos)"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f")"
  done_already=$("${PSQL[@]}" -tAc \
    "SELECT 1 FROM harness.applied_migrations WHERE filename = '$base'")
  if [ "$done_already" = "1" ]; then
    continue
  fi
  echo "    $base"
  # -1: cada migration roda numa transação única, como o runner do Supabase.
  "${PSQL[@]}" -1 -f "$f"
  "${PSQL[@]}" -c "INSERT INTO harness.applied_migrations (filename) VALUES ('$base')"
done

echo "==> OK: todas as migrations aplicadas"
