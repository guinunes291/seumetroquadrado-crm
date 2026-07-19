#!/usr/bin/env bash
# Recria o banco do harness do zero e reaplica shims + migrations.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54329/postgres}"

# Deriva a URL de manutenção (banco "template1") e o nome do banco-alvo.
DB_NAME="${DB##*/}"; DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${DB%/*}/template1"

psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -X \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$DB_NAME\";"

DATABASE_URL="$DB" bash "$HARNESS_DIR/apply.sh"
