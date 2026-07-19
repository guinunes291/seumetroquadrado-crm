#!/usr/bin/env bash
# Instala as extensões fake (pg_cron/pg_net) no diretório de extensões do
# Postgres LOCAL (instalação de sistema, não Docker). Para Docker, o
# docker-compose.yml monta os mesmos arquivos por volume.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="${1:-$(pg_config --sharedir)/extension}"

cp "$HARNESS_DIR"/fake-extensions/pg_cron.control \
   "$HARNESS_DIR"/fake-extensions/pg_cron--1.0.sql \
   "$HARNESS_DIR"/fake-extensions/pg_net.control \
   "$HARNESS_DIR"/fake-extensions/pg_net--1.0.sql \
   "$EXT_DIR"/

echo "Extensões fake instaladas em $EXT_DIR"
