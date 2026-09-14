# SyncEvent — Project Diagnostic
Generated: 2026-09-14T18:05:39.137Z

## Project tree

```
├── .dockerignore
├── .env
├── .env.docker
├── .env.example
├── .gitattributes
├── .gitignore
├── .npmrc
├── .vscode/
│   └── settings.json
├── README.md
├── apps/
│   ├── .env.example
│   ├── .vscode
│   ├── analytics-service/
│   │   ├── .prettierrc
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── eslint.config.mjs
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── analytics/
│   │   │   │   ├── analytics.controller.ts
│   │   │   │   └── analytics.service.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   └── seen-messages.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   └── jest-e2e.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   ├── backend/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── .gitignore
│   │   ├── .prettierrc
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── env.ts
│   │   ├── eslint.config.mjs
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── .migrations_backup/
│   │   │   ├── migrations/
│   │   │   │   ├── 20260307202939_init/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260308202702_sync_schema_types/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260309151618_expand_user_and_add_events/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260310150113_init_full_schema/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260908000000_add_event_seats_taken/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260910000000_add_outbox_event/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260912000000_add_event_participant/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913000000_add_refresh_token_multi_session/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260914000000_add_refresh_token_revocation_metadata/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260914010000_add_scheduled_task_run/
│   │   │   │   │   └── migration.sql
│   │   │   │   └── migration_lock.toml
│   │   │   ├── prisma.module.ts
│   │   │   ├── prisma.service.spec.ts
│   │   │   ├── prisma.service.ts
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── prisma.config.ts
│   │   ├── scripts/
│   │   │   ├── check-db.js
│   │   │   ├── drive-seeded-tests.ts
│   │   │   ├── entrypoint.sh
│   │   │   └── smoke-booking.ts
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── access-token-blocklist.service.spec.ts
│   │   │   │   ├── access-token-blocklist.service.ts
│   │   │   │   ├── auth.controller.spec.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.service.spec.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── dto/
│   │   │   │   │   └── register.dto.ts
│   │   │   │   └── strategies/
│   │   │   │       ├── jwt.strategy.spec.ts
│   │   │   │       └── jwt.strategy.ts
│   │   │   ├── booking/
│   │   │   │   ├── booking-queue.service.spec.ts
│   │   │   │   ├── booking-queue.service.ts
│   │   │   │   ├── booking-status.service.spec.ts
│   │   │   │   ├── booking-status.service.ts
│   │   │   │   ├── booking.constants.ts
│   │   │   │   ├── booking.module.ts
│   │   │   │   ├── booking.processor.spec.ts
│   │   │   │   └── booking.processor.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   │   └── get-user.decorator.ts
│   │   │   │   ├── dto/
│   │   │   │   │   └── pagination.dto.ts
│   │   │   │   ├── filters/
│   │   │   │   │   ├── http-exception.filter.ts
│   │   │   │   │   ├── prisma-exception.filter.spec.ts
│   │   │   │   │   └── prisma-exception.filter.ts
│   │   │   │   ├── guards/
│   │   │   │   │   └── optional-auth.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── transform.interceptor.ts
│   │   │   │   ├── interfaces/
│   │   │   │   │   ├── auth.interface.ts
│   │   │   │   │   └── event.interface.ts
│   │   │   │   └── pipes/
│   │   │   ├── events/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-event.dto.ts
│   │   │   │   │   └── update-event.dto.ts
│   │   │   │   ├── entities/
│   │   │   │   │   └── event.entity.ts
│   │   │   │   ├── events.controller.ts
│   │   │   │   ├── events.module.ts
│   │   │   │   ├── events.service.spec.ts
│   │   │   │   └── events.service.ts
│   │   │   ├── kafka/
│   │   │   │   ├── kafka-producer.service.spec.ts
│   │   │   │   ├── kafka-producer.service.ts
│   │   │   │   └── kafka.module.ts
│   │   │   ├── main.ts
│   │   │   ├── outbox/
│   │   │   │   ├── outbox-relay.service.spec.ts
│   │   │   │   ├── outbox-relay.service.ts
│   │   │   │   └── outbox.module.ts
│   │   │   ├── redis/
│   │   │   │   ├── redis.module.ts
│   │   │   │   └── redis.service.ts
│   │   │   └── scheduled-tasks/
│   │   │       ├── scheduled-tasks.constants.ts
│   │   │       ├── scheduled-tasks.module.spec.ts
│   │   │       ├── scheduled-tasks.module.ts
│   │   │       ├── scheduled-tasks.processor.spec.ts
│   │   │       ├── scheduled-tasks.processor.ts
│   │   │       └── tasks/
│   │   │           ├── cleanup-refresh-tokens.task.spec.ts
│   │   │           └── cleanup-refresh-tokens.task.ts
│   │   ├── test/
│   │   │   ├── booking-concurrency.e2e-spec.ts
│   │   │   ├── jest-e2e.json
│   │   │   └── setup-env.ts
│   │   ├── tsconfig.build.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.spec.json
│   ├── frontend/
│   │   ├── .eslintrc.cjs
│   │   ├── .gitignore
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── eslint.config.js
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── public/
│   │   │   └── vite.svg
│   │   ├── src/
│   │   │   ├── App.css
│   │   │   ├── App.tsx
│   │   │   ├── assets/
│   │   │   │   └── react.svg
│   │   │   ├── components/
│   │   │   │   ├── UserBar/
│   │   │   │   │   └── UserBar.tsx
│   │   │   │   └── layout/
│   │   │   │       ├── Header.tsx
│   │   │   │       └── MainLayout.tsx
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── authApi.ts
│   │   │   │   │   ├── authSlice.ts
│   │   │   │   │   └── components/
│   │   │   │   │       ├── LoginForm.tsx
│   │   │   │   │       └── RegisterForm.tsx
│   │   │   │   ├── calendar/
│   │   │   │   │   └── components/
│   │   │   │   │       └── CalendarHeader.tsx
│   │   │   │   └── events/
│   │   │   │       ├── components/
│   │   │   │       │   └── EventCard.tsx
│   │   │   │       └── eventsApi.ts
│   │   │   ├── index.css
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   │   ├── CreateEventPage.tsx
│   │   │   │   ├── EventDetailsPage.tsx
│   │   │   │   ├── EventsPage.tsx
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── MyEventsCalendar.tsx
│   │   │   │   └── RegisterPage.tsx
│   │   │   ├── routes/
│   │   │   │   └── index.tsx
│   │   │   └── store/
│   │   │       ├── hooks.ts
│   │   │       ├── index.ts
│   │   │       └── store.ts
│   │   ├── tsconfig.app.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.node.json
│   │   └── vite.config.ts
│   └── notifications-service/
│       ├── .prettierrc
│       ├── Dockerfile
│       ├── README.md
│       ├── eslint.config.mjs
│       ├── nest-cli.json
│       ├── package.json
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── common/
│       │   │   └── seen-messages.ts
│       │   ├── main.ts
│       │   └── notifications/
│       │       ├── notifications.controller.ts
│       │       └── notifications.service.ts
│       ├── test/
│       │   └── jest-e2e.json
│       ├── tsconfig.build.json
│       └── tsconfig.json
├── build-log.txt
├── docker-compose.yml
├── docs/
│   ├── SESSION-HANDOFF-refresh-tokens.md
│   ├── SESSION-HANDOFF.md
│   └── architecture/
│       ├── booking-concurrency.md
│       ├── nestjs-zod-migration.md
│       ├── refresh-token-rotation.md
│       └── scheduled-tasks-worker.md
├── eslint.config.mjs
├── gather-project-info.mjs
├── package-lock.json
├── package.json
├── packages/
│   ├── eslint-rules/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── configs/
│   │   │   │   └── base.ts
│   │   │   ├── index.ts
│   │   │   ├── rules/
│   │   │   │   ├── index.ts
│   │   │   │   ├── no-full-entity-args.ts
│   │   │   │   └── no-prisma-in-controller.ts
│   │   │   └── utils/
│   │   │       └── createRule.ts
│   │   ├── tests/
│   │   │   ├── no-full-entity-args.test.ts
│   │   │   └── no-prisma-in-controller.test.ts
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── shared/
│       ├── package.json
│       ├── src/
│       │   ├── events/
│       │   │   └── event-topics.ts
│       │   ├── index.ts
│       │   ├── schemas/
│       │   │   ├── auth.schema.ts
│       │   │   └── event.schema.ts
│       │   └── types/
│       │       ├── api.response.ts
│       │       ├── auth.ts
│       │       ├── event.ts
│       │       └── pagination.types.ts
│       ├── tsconfig.json
│       └── tsup.config.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── project-diagnostic.md
├── terraform.tfstate
└── tsconfig.base.json
```

## Config files

### docker-compose.yml

```
x-backend-base: &backend-base
  build:
    context: .
    dockerfile: apps/backend/Dockerfile
  command: ["sh", "/app/apps/backend/scripts/entrypoint.sh"]
  networks:
    - sync-network

x-backend-env-common: &backend-env-common
  PORT: ${PORT:-3000}
  JWT_SECRET: ${JWT_SECRET}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
  JWT_ACCESS_EXPIRES_IN: ${JWT_ACCESS_EXPIRES_IN}
  JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN}
  NODE_ENV: ${NODE_ENV:-development}
  CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173}
  # Redis-черга бронювання (Фаза 1) — RedisService/BullMQ підключаються сюди,
  # а не до "localhost" (дефолт поза контейнером), тож без цього backend
  # у compose тихо не знаходив би Redis.
  REDIS_HOST: redis
  REDIS_PORT: ${REDIS_PORT:-6379}
  # Kafka producer + outbox relay (Фаза 2). Внутрішня адреса брокера.
  KAFKA_BROKER: kafka:9092

services:
  # ---------- PostgreSQL (--profile postgres) ----------
  db-postgres:
    image: postgres:16-alpine
    container_name: sync-event-db-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 20s
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - sync-network
    profiles: ["postgres"]

  backend-init:
    <<: *backend-base
    container_name: sync-event-init
    environment:
      <<: *backend-env-common
      DB_PROVIDER: postgresql
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db-postgres:5432/${POSTGRES_DB}?schema=public
      MODE: init
    depends_on:
      db-postgres:
        condition: service_healthy
    profiles: ["postgres"]

  backend:
    <<: *backend-base
    container_name: sync-event-backend
    environment:
      <<: *backend-env-common
      DB_PROVIDER: postgresql
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db-postgres:5432/${POSTGRES_DB}?schema=public
      MODE: serve
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    depends_on:
      backend-init:
        condition: service_completed_successfully
    profiles: ["postgres"]

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: sync-event-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@syncevent.local}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
      PGADMIN_CONFIG_SERVER_MODE: "False"
    ports:
      - "${PGADMIN_LISTEN_PORT:-5050}:80"
    volumes:
      - pgadmin-data:/var/lib/pgadmin
    networks:
      - sync-network
    depends_on:
      db-postgres:
        condition: service_healthy
    profiles: ["postgres"]

  # ---------- MySQL (--profile mysql) ----------
  db-mysql:
    image: mysql:8.0
    container_name: sync-event-db-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
    ports:
      - "${MYSQL_PORT:-3307}:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "${MYSQL_USER}", "-p${MYSQL_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 20s
    volumes:
      - mysqldata:/var/lib/mysql
    networks:
      - sync-network
    profiles: ["mysql"]

  backend-init-mysql:
    <<: *backend-base
    container_name: sync-event-init-mysql
    environment:
      <<: *backend-env-common
      DB_PROVIDER: mysql
      DATABASE_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db-mysql:3306/${MYSQL_DATABASE}
      MODE: init
    depends_on:
      db-mysql:
        condition: service_healthy
    profiles: ["mysql"]

  backend-mysql:
    <<: *backend-base
    container_name: sync-event-backend-mysql
    environment:
      <<: *backend-env-common
      DB_PROVIDER: mysql
      DATABASE_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db-mysql:3306/${MYSQL_DATABASE}
      MODE: serve
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    depends_on:
      backend-init-mysql:
        condition: service_completed_successfully
    profiles: ["mysql"]

  frontend:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
    container_name: sync-event-frontend
    ports:
      - "${FRONTEND_PORT:-5173}:5173"
    environment:
      - VITE_API_URL=${VITE_API_URL:-http://localhost:3000/api}
    networks:
      - sync-network

  redis:
    image: redis:7-alpine
    container_name: sync-event-redis
    ports:
      - "${REDIS_PORT:-6379}:6379"
    networks:
      - sync-network

  kafka:
    image: apache/kafka:3.9.0
    container_name: sync-event-kafka
    ports:
      # In-container clients use kafka:9092. Host tools use localhost:29092.
      - "${KAFKA_HOST_PORT:-29092}:29092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      # Empty host ("://:9092") binds all interfaces. Do NOT use "0.0.0.0" — the
      # apache/kafka image's storage-format step falls back to KAFKA_LISTENERS
      # when building advertised.listeners and Kafka rejects the 0.0.0.0 meta-address.
      KAFKA_LISTENERS: CONTROLLER://:9093,PLAINTEXT://:9092,PLAINTEXT_HOST://:29092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      CLUSTER_ID: sync-event-kraft-cluster
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1"]
      interval: 10s
      timeout: 10s
      retries: 12
      start_period: 20s
    networks:
      - sync-network

  # One-shot: create the domain-event topics up front so consumers don't race
  # Kafka's lazy auto-creation on first connect ("This server does not host
  # this topic-partition", which kafkajs doesn't recover from cleanly).
  kafka-init:
    image: apache/kafka:3.9.0
    container_name: sync-event-kafka-init
    depends_on:
      kafka:
        condition: service_healthy
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        for t in event.user-joined event.user-left event.created event.deleted; do
          /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 \
            --create --if-not-exists --topic "$$t" --partitions 1 --replication-factor 1
        done
        /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
    networks:
      - sync-network

  # ---------- Kafka consumer microservices (always on, no DB needed) ----------
  analytics-service:
    build:
      context: .
      dockerfile: apps/analytics-service/Dockerfile
    container_name: sync-event-analytics
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      KAFKA_BROKER: kafka:9092
      KAFKAJS_NO_PARTITIONER_WARNING: "1"
    depends_on:
      kafka-init:
        condition: service_completed_successfully
    restart: on-failure
    networks:
      - sync-network

  notifications-service:
    build:
      context: .
      dockerfile: apps/notifications-service/Dockerfile
    container_name: sync-event-notifications
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      KAFKA_BROKER: kafka:9092
      KAFKAJS_NO_PARTITIONER_WARNING: "1"
    depends_on:
      kafka-init:
        condition: service_completed_successfully
    restart: on-failure
    networks:
      - sync-network

networks:
  sync-network:
    driver: bridge

volumes:
  mysqldata:
  pgdata:
  pgadmin-data:

```

### docker-compose.override.yml

_(not found at this path)_

### pnpm-workspace.yaml

```
packages:
  - apps/*
  - packages/*

onlyBuiltDependencies:
  - '@prisma/client'
  - '@prisma/engines'
  - '@scarf/scarf'
  - bcrypt
  - esbuild
  - prisma
  - unrs-resolver

```

### package.json

```
{
  "name": "sync-event",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "dev:backend": "pnpm --filter backend start:dev",
    "dev:frontend": "pnpm --filter frontend dev",
    "build": "tsup && tsc --emitDeclarationOnly --noEmit false",
    "lint": "pnpm -r lint",
    "db:generate": "pnpm --filter backend exec prisma generate",
    "db:studio": "pnpm --filter backend exec prisma studio",
    "db:migr": "pnpm --filter backend exec prisma migrate dev",
    "db:seed": "pnpm --filter backend run db:seed",
    "test:seeded": "pnpm --filter backend run test:seeded",
    "smoke:booking": "pnpm --filter backend run smoke:booking",
    "diagnose": "node gather-project-info.mjs",
    "dev:postgres": "cross-env COMPOSE_PROFILES=postgres docker compose up",
    "dev:mysql": "cross-env COMPOSE_PROFILES=mysql docker compose up",
    "build:eslint-rules": "pnpm --filter @syncevent/eslint-rules run build",
    "prebuild": "pnpm --filter @syncevent/eslint-rules run build",
    "test:eslint-rules": "pnpm --filter @syncevent/eslint-rules run test",
    "test:eslint-rules:watch": "pnpm --filter @syncevent/eslint-rules run test:watch"
  },
  "packageManager": "pnpm@10.30.2",
  "devDependencies": {
    "@syncevent/eslint-rules": "workspace:*",
    "@types/pg": "^8.20.0",
    "cross-env": "^10.1.0",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "tsup": "^8.0.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "@prisma/client",
      "@prisma/engines",
      "prisma",
      "bcrypt",
      "esbuild"
    ]
  }
}

```

### .env.example

```
# ==============================
# Compose
# ==============================
COMPOSE_PROFILES=postgres

# ==============================
# Application
# ==============================
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173

# ==============================
# PostgreSQL (--profile postgres)
# ==============================
POSTGRES_USER=<postgres_user>
POSTGRES_PASSWORD=***REDACTED***
POSTGRES_DB=<ostgres_db_name>
POSTGRES_PORT=5432

# ==============================
# MySQL (--profile mysql)
# ==============================
MYSQL_ROOT_PASSWORD=***REDACTED***
MYSQL_USER=<mysql_user>
MYSQL_PASSWORD=***REDACTED***
MYSQL_DATABASE=<mysql_db_name>
MYSQL_PORT=3307

# ==============================
# Authentication (JWT)
# ==============================
JWT_SECRET=***REDACTED***
JWT_REFRESH_SECRET=***REDACTED***
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ==============================
# Backend / Frontend ports
# ==============================
BACKEND_PORT=3000
FRONTEND_PORT=5173
VITE_API_URL=http://localhost:3000/api

# ==============================
# Tools (pgAdmin)
# ==============================
PGADMIN_DEFAULT_EMAIL=<admin_email>
PGADMIN_DEFAULT_PASSWORD=***REDACTED***
PGADMIN_LISTEN_PORT=5050
# ==============================
# Redis
# ==============================
REDIS_HOST=redis
REDIS_PORT=6379

# ==============================
# Kafka
# ==============================
# Compose services reach the broker at kafka:9092 (hardcoded per-service in
# docker-compose.yml). A Node process on the host uses localhost:29092.
KAFKA_BROKER=localhost:29092
KAFKA_HOST_PORT=29092

```

### apps/backend/Dockerfile

```
FROM node:24-alpine
# Pin to the repo's "packageManager" version so pnpm doesn't try to
# self-install/verify a different one (ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE).
RUN npm install -g pnpm@10.30.2
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
# --frozen-lockfile needs every workspace manifest to reconcile the lockfile.
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/analytics-service/package.json ./apps/analytics-service/
COPY apps/notifications-service/package.json ./apps/notifications-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-rules/package.json ./packages/eslint-rules/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
# Strip CRLF (Windows checkouts) so Alpine's /bin/sh can run the script.
RUN sed -i 's/\r$//' /app/apps/backend/scripts/entrypoint.sh \
 && chmod +x /app/apps/backend/scripts/entrypoint.sh

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

RUN pnpm --filter backend exec prisma generate --schema=/app/apps/backend/prisma/schema.prisma

WORKDIR /app/apps/backend

RUN pnpm run build

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
```

### apps/backend/package.json

```
{
  "name": "backend",
  "version": "0.0.1",
  "description": "",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:unit": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "db:seed": "ts-node prisma/seed.ts",
    "smoke:booking": "ts-node scripts/smoke-booking.ts",
    "test:seeded": "ts-node scripts/drive-seeded-tests.ts"
  },
  "dependencies": {
    "@nestjs/bullmq": "^12.0.0",
    "@nestjs/cache-manager": "^3.1.3",
    "@nestjs/common": "^11.0.1",
    "@nestjs/config": "^4.0.3",
    "@nestjs/core": "^11.0.1",
    "@nestjs/jwt": "^11.0.2",
    "@nestjs/mapped-types": "*",
    "@nestjs/microservices": "^11.1.28",
    "@nestjs/passport": "^11.0.5",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/swagger": "^11.2.6",
    "@nestjs/throttler": "^6.5.0",
    "@prisma/client": "^6.0.0",
    "@syncevent/shared": "workspace:*",
    "bcrypt": "^6.0.0",
    "bullmq": "^6.3.4",
    "cache-manager": "^7.2.9",
    "cache-manager-ioredis-yet": "^2.1.2",
    "cookie-parser": "^1.4.7",
    "ioredis": "^5.11.1",
    "kafkajs": "^2.2.4",
    "nestjs-zod": "^5.5.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.20.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.6.4"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.2.0",
    "@eslint/js": "^9.18.0",
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/bcrypt": "^6.0.0",
    "@types/cookie-parser": "^1.4.10",
    "@types/express": "^5.0.0",
    "@types/ioredis": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.7",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "dotenv": "^17.3.1",
    "eslint": "^9.18.0",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-prettier": "^5.2.2",
    "globals": "^16.0.0",
    "jest": "^30.0.0",
    "prettier": "^3.4.2",
    "prisma": "^6.0.0",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.2",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0"
  },
  "jest": {
    "moduleFileExtensions": [
      "ts",
      "js",
      "json"
    ],
    "rootDir": ".",
    "roots": [
      "<rootDir>/src"
    ],
    "testRegex": ".*\\.spec\\.ts$",
    "setupFiles": [
      "<rootDir>/test/setup-env.ts"
    ],
    "transform": {
      "^.+\\.(t|j)s$": [
        "ts-jest",
        {
          "tsconfig": "<rootDir>/tsconfig.spec.json"
        }
      ]
    },
    "collectCoverageFrom": [
      "src/**/*.(t|j)s"
    ],
    "coverageDirectory": "<rootDir>/coverage",
    "testEnvironment": "node"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}

```

### apps/backend/prisma/schema.prisma

```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Visibility {
  PUBLIC
  PRIVATE
}

enum ParticipantStatus {
  CONFIRMED
  WAITLISTED
}

enum RevokedReason {
  ROTATED
  LOGOUT
  REUSE_DETECTED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  password     String
  displayName  String?
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  createdEvents  Event[]            @relation("CreatedEvents")
  participations EventParticipant[]
  refreshTokens  RefreshToken[]
}

model RefreshToken {
  id             String    @id @default(cuid())
  userId         String
  tokenHash      String    @db.Text
  familyId       String
  revoked        Boolean        @default(false)
  revokedAt      DateTime?
  revokedReason  RevokedReason?
  expiresAt      DateTime
  createdAt      DateTime       @default(now())
  userAgent      String?

  supersededAt   DateTime?
  supersededById String?

  accessJti      String?
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([familyId])
  @@index([userId])
  @@index([revoked, expiresAt])
  @@index([revokedReason, revokedAt])
}

/// Run history for every task in ScheduledTasksModule (scheduled-tasks-worker.md
/// §6 Фаза 2), written once per job by ScheduledTasksProcessor -- generic across
/// tasks so task 2, 3... get this for free, no per-task table.
model ScheduledTaskRun {
  id         String   @id @default(cuid())
  taskName   String
  startedAt  DateTime
  durationMs Int
  success    Boolean
  result     Json?
  error      String?

  @@index([taskName, startedAt])
}

model OutboxEvent {
  id        String    @id @default(cuid())
  topic     String
  key       String 
  payload   Json
  createdAt DateTime  @default(now())
  sentAt    DateTime?

  @@index([sentAt, createdAt])
}

model Event {
  id           String             @id @default(cuid())
  title        String
  description  String?
  date         DateTime
  location     String
  capacity     Int?
  seatsTaken   Int                @default(0)
  visibility   Visibility         @default(PUBLIC)
  authorId     String
  author       User               @relation("CreatedEvents", fields: [authorId], references: [id])
  participants EventParticipant[]
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  @@index([authorId])
  @@index([visibility])
}

model EventParticipant {
  eventId  String
  userId   String
  status   ParticipantStatus @default(CONFIRMED)
  joinedAt DateTime          @default(now())
  event    Event             @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([eventId, userId])
  @@index([userId])
}
```

### apps/backend/scripts/check-db.js

```
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const appRoot = join(__filename, '../../..');
const backendDir = join(__filename, '../..');

const prismaDir = join(backendDir, 'prisma');
const migrationsPath = join(prismaDir, 'migrations');
const lockFilePath = join(migrationsPath, 'migration_lock.toml');
const backupRootDir = join(prismaDir, '.migrations_backup');

let currentProvider = process.env.DB_PROVIDER;

if (!currentProvider) {
  const envPath = join(appRoot, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const providerMatch = envContent.match(/^DB_PROVIDER\s*=\s*(\w+)/m);
    currentProvider = providerMatch
      ? providerMatch[1].trim().toLowerCase()
      : null;
  }
}

// PostgreSQL is the project's target DB (docs/architecture/
// booking-concurrency.md §0) and schema.prisma ships committed with
// provider = "postgresql", so it's the default when nothing else says
// otherwise. Only testing against MySQL needs an explicit DB_PROVIDER=mysql
// (or a `DB_PROVIDER=mysql` line in .env).
currentProvider = (currentProvider ?? 'postgresql').toLowerCase();

if (
  !currentProvider ||
  (currentProvider !== 'mysql' && currentProvider !== 'postgresql')
) {
  console.error(
    '❌ Error: DB_PROVIDER must be either "mysql" or "postgresql"!',
  );
  process.exit(1);
}

if (!existsSync(backupRootDir)) {
  mkdirSync(backupRootDir, { recursive: true });
}

let lockedProvider = null;
if (existsSync(lockFilePath)) {
  const lockContent = readFileSync(lockFilePath, 'utf8');
  const lockMatch = lockContent.match(/^provider\s*=\s*"(\w+)"/m);
  lockedProvider = lockMatch ? lockMatch[1].trim().toLowerCase() : null;
}

console.log(
  `🔍 [DB-MANAGER] Target: [${currentProvider.toUpperCase()}] | Lock: [${lockedProvider ? lockedProvider.toUpperCase() : 'NONE'}]`,
);

if (lockedProvider && lockedProvider !== currentProvider) {
  const targetBackupDir = join(backupRootDir, lockedProvider);
  if (existsSync(targetBackupDir))
    rmSync(targetBackupDir, { recursive: true, force: true });
  cpSync(migrationsPath, targetBackupDir, { recursive: true });
  rmSync(migrationsPath, { recursive: true, force: true });
  console.log(
    `📦 [BACKUP] Moved [${lockedProvider.toUpperCase()}] migrations to backup.`,
  );
}

if (!existsSync(migrationsPath)) {
  const ourBackupDir = join(backupRootDir, currentProvider);
  if (existsSync(ourBackupDir)) {
    cpSync(ourBackupDir, migrationsPath, { recursive: true });
    rmSync(ourBackupDir, { recursive: true, force: true });
    console.log(
      `🔄 [RESTORE] Restored [${currentProvider.toUpperCase()}] migrations from backup.`,
    );
  } else {
    console.log(
      `🌱 [INIT] No migrations for [${currentProvider.toUpperCase()}]. Prisma will create them.`,
    );
  }
} else {
  console.log(
    `✅ [READY] Migrations match [${currentProvider.toUpperCase()}].`,
  );
}

const schemaPath = join(prismaDir, 'schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf8');
const updatedSchema = schemaContent.replace(
  /(datasource\s+db\s*\{[^}]*provider\s*=\s*")[^"]*(")/,
  `$1${currentProvider}$2`,
);
if (updatedSchema !== schemaContent) {
  writeFileSync(schemaPath, updatedSchema, 'utf8');
  console.log(
    `✏️  [SCHEMA] Provider set to [${currentProvider.toUpperCase()}].`,
  );
} else {
  console.log(
    `✏️  [SCHEMA] Provider already [${currentProvider.toUpperCase()}], no changes.`,
  );
}

```

### apps/frontend/Dockerfile

```
FROM node:24-alpine
# Pin to the repo's "packageManager" version so pnpm doesn't try to
# self-install/verify a different one (ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE).
RUN npm install -g pnpm@10.30.2
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
# --frozen-lockfile needs every workspace manifest to reconcile the lockfile.
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/analytics-service/package.json ./apps/analytics-service/
COPY apps/notifications-service/package.json ./apps/notifications-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-rules/package.json ./packages/eslint-rules/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/frontend
EXPOSE 5173
CMD ["pnpm", "--filter", "frontend", "exec", "vite", "--host"]
```

### apps/frontend/package.json

```
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@reduxjs/toolkit": "^2.11.2",
    "@syncevent/shared": "workspace:*",
    "axios": "^1.13.6",
    "date-fns": "^4.2.1",
    "lucide-react": "^1.16.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.71.2",
    "react-redux": "^9.2.0",
    "react-router-dom": "^7.13.1",
    "zod": "^4.6.4"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@tailwindcss/vite": "^4.2.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.27",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "postcss": "^8.5.8",
    "tailwindcss": "^4.2.1",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1"
  }
}

```

### packages/shared/package.json

```
{
  "name": "@syncevent/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup && tsc --emitDeclarationOnly --noEmit false"
  },
  "dependencies": {
    "tsup": "^8.0.0",
    "zod": "^4.6.4"
  },
  "devDependencies": {
    "tsup": "^8.0.0"
  }
}

```

### packages/shared/tsup.config.ts

```
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  tsconfig: './tsconfig.json',
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  skipNodeModulesBundle: true,
});

```

### tsconfig.base.json

```
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  }
}
```

### Dockerfile.backend-init

_(not found at this path)_

### docker/backend-init.Dockerfile

_(not found at this path)_

