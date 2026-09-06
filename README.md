# SyncEvent

Full-stack platform for creating and managing events, built as a pnpm monorepo with a NestJS backend, a React frontend, event-driven NestJS microservices (Kafka), Redis, and a shared types/validation package.

## Architecture

```
                      ┌──────────────────────────────┐
                      │           Browser            │
                      └───────────────┬──────────────┘
                                      │ HTTP :5173
                      ┌───────────────▼──────────────┐
                      │      frontend (React 19)     │
                      │   Vite · Redux Toolkit       │
                      │   RTK Query · React Router   │
                      └───────────────┬──────────────┘
                                      │ REST /api  :3000
                      ┌───────────────▼──────────────┐
                      │      backend (NestJS 11)     │
                      │   JWT auth · class-validator │
                      │   Prisma ORM                 │
                      └────────┬────────────┬────────┘
                               │            │
                ┌──────────────┘            └──────────────┐
                │                                          │
     ┌──────────▼───────────┐                  ┌───────────▼──────────┐
     │   MySQL 8.0    or    │                  │  Redis 7   Kafka 3.9 │
     │   PostgreSQL 16      │                  │  locks     event bus │
     │  (compose profile)   │                  └───────────┬──────────┘
     └──────────────────────┘                              │ domain events
                                            ┌──────────────┴──────────────┐
                                 ┌──────────▼─────────┐       ┌───────────▼────────────┐
                                 │  analytics-service │       │ notifications-service  │
                                 │   (Kafka consumer) │       │   (Kafka consumer)     │
                                 └────────────────────┘       └────────────────────────┘
```

### Monorepo layout

```
apps/
  backend/                NestJS REST API — auth, events, Prisma
  frontend/               React SPA — Vite, Redux Toolkit, RTK Query
  analytics-service/      NestJS Kafka microservice — consumes domain events, records metrics
  notifications-service/  NestJS Kafka microservice — consumes domain events, notifies organizers
packages/
  shared/                 Yup schemas, TypeScript types & Kafka event contracts
                          (topics + payloads) shared across every app
```

Every app depends on `@syncevent/shared` (workspace package) for a single source of truth on DTOs, validation schemas, and Kafka topic/payload contracts, so a change to an API or event contract only needs to happen in one place.

### Event-driven services (Kafka)

`@syncevent/shared` defines the domain-event contracts in `EventTopics` (`event.user-joined`, `event.user-left`, `event.created`, `event.deleted`) together with their payload types. Two NestJS microservices consume these topics:

- **`analytics-service`** — `analytics-consumer` group; logs/records join, leave and event-created metrics.
- **`notifications-service`** — `notifications-consumer` group; notifies the organizer when someone joins.

The backend carries a Kafka producer (`src/kafka`) and a Redis distributed-lock helper (`src/redis`). The infrastructure containers (`redis`, `kafka`) run as part of the default Compose stack. The consumer services have their own Dockerfiles but are not yet part of `docker-compose.yml`, and wiring the producer/lock into the request flow is in progress — today `joinEvent` guards against double-booking with a Prisma `Serializable` transaction plus a bounded retry on serialization conflicts (Postgres `40001` / Prisma `P2034`).

### Dual-database support (MySQL / PostgreSQL)

The backend runs against either MySQL or PostgreSQL from the *same* Prisma schema. A small script, `apps/backend/scripts/check-db.js`, runs before every backend container start and:

1. Reads the target provider from `DB_PROVIDER` (`mysql` or `postgresql`).
2. Compares it against `prisma/migrations/migration_lock.toml` (the provider the current `migrations/` folder belongs to).
3. If they differ, moves the current `migrations/` folder into `prisma/.migrations_backup/<provider>/` and restores a matching backup for the target provider if one exists (otherwise Prisma creates fresh migrations).
4. Rewrites the `provider` field in `schema.prisma` to match the target.

Each backend container also runs `prisma generate` on startup (after the switch), so the Prisma Client bundled in the running container always matches the active provider — this matters because the client generated at Docker build time is baked for whatever provider was committed in the repo, and file edits to `schema.prisma` at runtime don't retroactively change an already-generated client.

MySQL and PostgreSQL are mutually exclusive at runtime (only one is meant to run at a time), selected via Docker Compose **profiles**.

### Unified entrypoint

Both `backend` and `backend-init` (for either provider) share a single script: `apps/backend/scripts/entrypoint.sh`. It branches on the `MODE` environment variable:

- `MODE=init` — runs `check-db.js` → `prisma generate` → `prisma db push` → `seed.ts`, then exits (one-shot container)
- `MODE=serve` — runs `check-db.js` → `prisma generate` → starts the NestJS server (`node dist/src/main.js`)

This keeps the four backend-related services (`backend-init`, `backend`, `backend-init-mysql`, `backend-mysql`) free of duplicated shell logic — only their `environment` block differs (provider, connection string, mode).

## Tech stack

| Layer        | Stack |
|--------------|-------|
| Frontend     | React 19, Vite, Redux Toolkit, RTK Query, React Router, React Hook Form, Tailwind |
| Backend      | NestJS 11, Prisma 6, Passport JWT, class-validator, Yup |
| Microservices| NestJS 11 microservices over Kafka (`analytics-service`, `notifications-service`) |
| Messaging    | Apache Kafka 3.9 (`kafkajs` / `@nestjs/microservices`) |
| Cache / locks| Redis 7 (`ioredis`, `cache-manager`) |
| Databases    | MySQL 8.0 or PostgreSQL 16 (switchable) |
| Admin UI     | pgAdmin 4 (PostgreSQL profile only) |
| Shared       | TypeScript, Yup — published as an internal workspace package |
| Testing      | Jest + ts-jest (backend unit tests) |
| Infra        | Docker, Docker Compose (profiles), pnpm workspaces |

## Prerequisites

- Docker Desktop (with the engine running — check the tray icon before running any command)
- pnpm (only needed for local, non-Docker development)

## Two ways to run this project

| Method | Command | When to use |
|--------|---------|-------------|
| **Docker Compose** | `pnpm run dev:postgres` / `pnpm run dev:mysql` | Full stack incl. database — no local DB install needed, closest to production setup |
| **Local (`pnpm`)** | `pnpm run dev` | Faster iteration (hot reload without rebuilding images), requires a locally running MySQL or PostgreSQL instance |

Both methods run the same codebase; the difference is only *where* the database and Node processes run.

## Running locally without Docker

Requires a MySQL or PostgreSQL server already running on your machine (or reachable over the network) — this method does **not** start a database for you.

```bash
pnpm install
```

Set up `apps/backend/.env` (separate from the root `.env` used by Docker) with your local `DATABASE_URL` and `DB_PROVIDER`, then generate the Prisma Client and push the schema:

```bash
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma db push
```

Then start both apps in parallel:

```bash
pnpm run dev
```

Or start them separately, in two terminals:

```bash
pnpm run dev:backend    # NestJS on :3000
pnpm run dev:frontend   # Vite on :5173
```

## Running with Docker

Two Compose profiles are available: **`postgres`** (default) and **`mysql`** (opt-in). They are mutually exclusive — both stacks bind the same host port (`3000` for the backend), so running both profiles at once will fail with a port conflict. Stop the active profile before switching.

The default profile is set in `.env` via `COMPOSE_PROFILES=postgres`, so a plain `docker compose up` starts the PostgreSQL stack without any extra flags.

### PostgreSQL (default)

```bash
pnpm run dev:postgres
# equivalent to: docker compose up
```

### MySQL

```bash
pnpm run dev:mysql
# equivalent to: cross-env COMPOSE_PROFILES=mysql docker compose up
```

> `cross-env` is used instead of shell-specific syntax (`$env:VAR=...` in PowerShell vs `VAR=...` in bash) so both scripts work identically on Windows, macOS, and Linux.

### Stopping

```bash
docker compose down

# also wipe database volumes (irreversible — use for a clean DB,
# e.g. after a Postgres major-version bump makes the old volume incompatible)
docker compose down -v
```

### What gets started

| Service                                   | Profile  | Purpose                                                  | Port          |
|-------------------------------------------|----------|----------------------------------------------------------|---------------|
| `db-postgres`                             | postgres | PostgreSQL 16 database                                   | 5432          |
| `backend-init`                            | postgres | One-shot: `check-db.js` → `prisma generate` → `db push` → seed, then exits | —  |
| `backend`                                 | postgres | NestJS API                                               | 3000          |
| `pgadmin`                                 | postgres | pgAdmin 4 web UI, depends on `db-postgres` being healthy | 5050          |
| `db-mysql`                                | mysql    | MySQL 8.0 database                                       | 3307 → 3306   |
| `backend-init-mysql`                      | mysql    | Same as `backend-init`, targeting MySQL                  | —             |
| `backend-mysql`                           | mysql    | NestJS API, targeting MySQL                              | 3000          |
| `frontend`                                | always   | React SPA served by Vite                                 | 5173          |
| `redis`                                   | always   | Redis 7 — distributed locks / cache                      | 6379          |
| `kafka`                                   | always   | Apache Kafka 3.9 (KRaft) — domain-event bus              | 9092          |

> `redis` and `kafka` have no profile, so they start with either database profile.
> The `analytics-service` / `notifications-service` consumers are not in `docker-compose.yml` yet — run them locally against the Compose `kafka` broker (`KAFKA_BROKER=localhost:9092 pnpm --filter analytics-service start`).

Once containers are up:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- pgAdmin (postgres profile only): http://localhost:5050

### Environment variables (`.env`)

Copy the template and fill in the placeholders:

```bash
cp .env.example .env
```

```dotenv
# Compose — active profile (postgres is the default; override per-command with cross-env for mysql)
COMPOSE_PROFILES=postgres

# Application
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173

# PostgreSQL (--profile postgres)
POSTGRES_USER=<postgres_user>
POSTGRES_PASSWORD=<postgres_password>
POSTGRES_DB=<postgres_db_name>
POSTGRES_PORT=5432

# MySQL (--profile mysql)
MYSQL_ROOT_PASSWORD=<mysql_root_password>
MYSQL_USER=<mysql_user>
MYSQL_PASSWORD=<mysql_password>
MYSQL_DATABASE=<mysql_db_name>
MYSQL_PORT=3307

# Authentication (JWT) — shared by both profiles
JWT_SECRET=<generate_a_long_random_string>
JWT_REFRESH_SECRET=<generate_a_different_long_random_string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Backend / Frontend ports
BACKEND_PORT=3000
FRONTEND_PORT=5173
VITE_API_URL=http://localhost:3000/api

# Tools (pgAdmin) — avoid reserved TLDs like .local/.test (they fail pgAdmin's email validation)
PGADMIN_DEFAULT_EMAIL=<admin_email>
PGADMIN_DEFAULT_PASSWORD=<admin_password>   # min. 6 characters
PGADMIN_LISTEN_PORT=5050

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Kafka
KAFKA_BROKER=kafka:9092
```

`DATABASE_URL` and `DB_PROVIDER` are set directly in `docker-compose.yml` per service and don't need to be set in `.env` — this keeps the two profiles fully isolated from each other, so a value meant for one provider can never leak into the other's containers. `REDIS_HOST` / `KAFKA_BROKER` default to `redis` / `kafka:9092` for containers; use `localhost` / `localhost:9092` when running a Node process on the host against the Compose stack.

### Troubleshooting

- **`unable to get image ... dockerDesktopLinuxEngine`** — Docker Desktop isn't running. Start it and wait for "Engine running" before retrying.
- **`port is already allocated` on `3000`** — both profiles are active at once. Check with `docker compose config --services`; if it lists both postgres and mysql services, your `.env` `COMPOSE_PROFILES` and an explicit `--profile`/`cross-env` flag are combining rather than overriding each other. Run `docker compose down` and start only one profile at a time.
- **`database files are incompatible with server` (Postgres)** — the `pgdata` volume was initialized by a different Postgres major version than the image now in use. Remove the volume: `docker compose down` then `docker volume rm syncevent_pgdata` (check the exact name with `docker volume ls` first), then start again.
- **`Can't reach database server at db-mysql:3306` while running the postgres profile** — a leftover `DB_PROVIDER`/`DATABASE_URL` value pointing at the wrong host; these are hardcoded per-service in `docker-compose.yml` for this reason and shouldn't be overridden from `.env`.
- **pgAdmin container exits immediately** — check `docker logs sync-event-pgadmin`. Common causes: `PGADMIN_DEFAULT_PASSWORD` shorter than 6 characters, or `PGADMIN_DEFAULT_EMAIL` using a reserved TLD (`.local`, `.test`, `.invalid`, `.example`) which fails pgAdmin's built-in email validation.
- **`failed to set up container networking: network ... not found`** — a stale Docker network state, usually after rapid `down`/`up` cycles. Fully quit Docker Desktop (not just `wsl --shutdown`), wait ~15s, restart it, and wait for "Engine running" before retrying.

## Testing

The backend has a Jest + ts-jest unit-test suite. Tests run against in-memory mocks (mocked `PrismaService`) — **no database, Redis or Kafka is required**.

```bash
pnpm --filter backend test          # run all unit tests (*.spec.ts under src/)
pnpm --filter backend test:watch    # watch mode
pnpm --filter backend test:cov      # with coverage report -> apps/backend/coverage/
pnpm --filter backend test:e2e      # e2e config (test/jest-e2e.json) — no specs yet
```

Setup lives in `apps/backend`:

- Jest config: the `"jest"` block in `package.json` — ts-jest transform via `tsconfig.spec.json`, `test/setup-env.ts` injects dummy env vars so modules that read `env.ts` at import time don't throw.
- Covered so far: `EventsService` (`src/events/events.service.spec.ts`) — create/date validation, pagination, `findOne`, join/leave with capacity + serialization-conflict retry, calendar, ownership checks on update/delete. `AuthService` / `AuthController` have smoke specs.