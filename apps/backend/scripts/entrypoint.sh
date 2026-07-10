#!/bin/sh
set -e  # падати одразу на першій же неуспішній команді

SCHEMA="${PRISMA_SCHEMA:-/app/apps/backend/prisma/schema.prisma}"

echo ">> [entrypoint] MODE=${MODE} DB_PROVIDER=${DB_PROVIDER}"

if [ -z "$MODE" ]; then
  echo "!! MODE не встановлено. Очікується 'init' або 'serve'." >&2
  exit 1
fi

# 1. Перевірка з'єднання з БД (спільна для обох режимів)
node /app/apps/backend/scripts/check-db.js

# 2. Генерація Prisma Client під поточний DB_PROVIDER
pnpm --filter backend exec prisma generate --schema="$SCHEMA"

case "$MODE" in
  init)
    echo ">> [entrypoint] Running migrations + seed"
    pnpm --filter backend exec prisma db push --schema="$SCHEMA"
    pnpm --filter backend exec ts-node /app/apps/backend/prisma/seed.ts
    echo ">> [entrypoint] Init complete"
    ;;
  serve)
    echo ">> [entrypoint] Starting server"
    # exec замінює sh на node-процес — сигнали (SIGTERM) доходять напряму
    exec node /app/apps/backend/dist/src/main.js
    ;;
  *)
    echo "!! Невідомий MODE: '$MODE'. Очікується 'init' або 'serve'." >&2
    exit 1
    ;;
esac