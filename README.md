# SyncEvent

Full-stack platform for creating and managing events. The first niche is **chess**: tournaments, clubs and teams.

Built as a pnpm monorepo: a NestJS backend, a Next.js frontend (migrating from a Vite SPA), event-driven NestJS microservices over Kafka, Redis/BullMQ, a shared zod contracts package, a shared chess rules engine, and a Python sidecar for chess computations.

## Architecture

```
                      ┌──────────────────────────────┐
                      │           Browser            │
                      └───────────────┬──────────────┘
                                      │ HTTP :3001 (:5173 legacy)
                      ┌───────────────▼──────────────┐
                      │  frontend-next (Next.js 16)  │
                      │  Redux Toolkit · RTK Query   │
                      │  (frontend: legacy Vite SPA) │
                      └───────────────┬──────────────┘
                                      │ REST /api  :3000
                      ┌───────────────▼──────────────┐
                      │      backend (NestJS 11)     │
                      │  JWT + refresh rotation · zod│
                      │  Prisma ORM · BullMQ         │
                      └────────┬────────────┬────────┘
                               │            │
                ┌──────────────┘            └──────────────┐
                │                                          │
     ┌──────────▼───────────┐                  ┌───────────▼──────────┐
     │    PostgreSQL 16     │                  │  Redis 7   Kafka 3.9 │
     │                      │                  │  BullMQ    event bus │
     │                      │                  └───────────┬──────────┘
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
  backend/                NestJS REST API — auth, events, booking, outbox, scheduled tasks, Prisma
  frontend-next/          Next.js 16 frontend (target) — Redux Toolkit, RTK Query, port 3001
  frontend/               Legacy Vite + React SPA, port 5173 — being migrated to frontend-next
  analytics-service/      NestJS Kafka microservice — consumes domain events, records metrics
  notifications-service/  NestJS Kafka microservice — consumes domain events, notifies organizers
  chess-service/          Python (FastAPI) sidecar — rating, analysis, pairings (not in the pnpm workspace)
packages/
  shared/                 zod schemas, TypeScript types & Kafka event contracts
                          (topics + payloads) shared across every app
  chess-engine/           Chess rules (JS, Vitest) — one implementation for client and server
  eslint-rules/           Custom ESLint rules (Vitest)
```

Every app depends on `@syncevent/shared` (workspace package) for a single source of truth on DTOs, validation schemas, and Kafka topic/payload contracts, so a change to an API or event contract only needs to happen in one place.

### Event-driven services (Kafka)

`@syncevent/shared` defines the domain-event contracts in `EventTopics` (`event.user-joined`, `event.user-left`, `event.created`, `event.deleted`) together with their payload types. Two NestJS microservices consume these topics (both in `docker-compose.yml`):

- **`analytics-service`** — `analytics-consumer` group; logs join / leave / event-created / event-deleted.
- **`notifications-service`** — `notifications-consumer` group; notifies the organizer on join and leave.

**Delivery path:** `EventsService` writes an `OutboxEvent` row in the *same* Postgres transaction as the state change; `OutboxRelayService` polls that table (~1 s) and publishes each row to Kafka keyed by `eventId`, stamping `sentAt` only after the broker acks. At-least-once — consumers dedupe on `payload.messageId` (the outbox row id). Kafka being down never blocks a booking; the relay catches up when it returns.

The overbooking guarantee is **not** on this path — `joinEvent` claims the seat with a single atomic `UPDATE "Event" SET seatsTaken = seatsTaken + 1 WHERE … seatsTaken < capacity` inside a Read-Committed transaction (denormalised `Event.seatsTaken` counter, no `Serializable`, no retry loop). The join API is queued via Redis/BullMQ (`202 + requestId`, poll `GET /events/join-requests/:requestId`). Full plan: [`docs/architecture/booking-concurrency.md`](docs/architecture/booking-concurrency.md).

### Unified entrypoint

Both `backend` and `backend-init` share a single script: `apps/backend/scripts/entrypoint.sh`. It branches on the `MODE` environment variable:

- `MODE=init` — runs `prisma generate` → `prisma migrate deploy` → `seed.ts`, then exits (one-shot container)
- `MODE=serve` — runs `prisma generate` → starts the NestJS server (`node dist/src/main.js`)

This keeps both backend services free of duplicated shell logic — only their `MODE` differs.

## Tech stack

| Layer        | Stack |
|--------------|-------|
| Frontend     | Next.js 16 (App Router), React 19, Redux Toolkit, RTK Query, React Hook Form, zod, Tailwind 4 |
| Legacy SPA   | React 19, Vite 7, React Router 7 — being migrated to Next.js |
| Backend      | NestJS 11, Prisma 6, Passport JWT, zod 4 (`nestjs-zod`), bcrypt (passwords), BullMQ |
| Microservices| NestJS 11 microservices over Kafka (`analytics-service`, `notifications-service`) |
| Messaging    | Apache Kafka 3.9 (`kafkajs` / `@nestjs/microservices`) |
| Queues / cache| Redis 7 (`ioredis`, BullMQ, `cache-manager`) |
| Database     | PostgreSQL 16 |
| Admin UI     | pgAdmin 4 |
| Shared       | TypeScript, zod 4 — internal workspace package built with tsup |
| Chess        | `@syncevent/chess-engine` (JS rules engine), `chess-service` (Python, FastAPI) |
| Testing      | Jest 30 + ts-jest (backend), Vitest (chess-engine, eslint-rules), pytest (chess-service) |
| Infra        | Docker, Docker Compose, pnpm workspaces |

## Authentication

- **Access token:** a JWT, lives 15 minutes, returned in the response body. The client sends it as `Authorization: Bearer …`. Each access token carries a `jti`, so a single token can be revoked through a Redis blocklist.
- **Refresh token:** a JWT, lives 7 days, stored only in an `httpOnly` `SameSite=Lax` cookie. The database keeps only its **SHA-256 hash**, never the raw token.
- **Multi-session:** every login creates its own session *family* (`RefreshToken.familyId`). Logging in on a second device doesn't log out the first.
- **Rotation:** each `POST /auth/refresh` revokes the current row and issues a new token in the same family. The rotation claim is a conditional `UPDATE … WHERE revoked = false`, so parallel refreshes can't fork a family.
- **Reuse detection:** if an already-rotated token comes back, the whole family is revoked (`REUSE_DETECTED`). A 10-second grace period covers the harmless case of two browser tabs refreshing at once.
- **Logout:** `POST /auth/logout` revokes the current session. `POST /auth/logout-all` revokes every session and adds their access-token `jti`s to the Redis blocklist.
- **Cleanup:** expired and revoked rows are deleted by a daily BullMQ job.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Returns `{ user, accessToken }` and sets the refresh cookie |
| `POST /api/auth/refresh` | Rotates the refresh cookie, returns a new `accessToken` |
| `GET /api/auth/profile` | Current user (Bearer) |
| `POST /api/auth/logout`, `POST /api/auth/logout-all` | Revoke one session / all sessions |

Design and phase log: [`docs/architecture/refresh-token-rotation.md`](docs/architecture/refresh-token-rotation.md). The frontend side (RTK Query, single-flight refresh on 401) is covered in [`docs/architecture/frontend-auth-rtk-query.md`](docs/architecture/frontend-auth-rtk-query.md).

**Known gaps** (from [`docs/review/backend-audit-2026-09-29.md`](docs/review/backend-audit-2026-09-29.md)):
- no rate limiting on `/auth/*` yet (`@nestjs/throttler` is installed but not wired up);
- refresh tokens aren't separated from access tokens by a `typ` claim.

## Chess

Chess is the platform's first niche. The current priority is the **chess foundation** ([`docs/architecture/chess-foundation.md`](docs/architecture/chess-foundation.md)). It is planned as 8 steps, each one stopped for review: privacy → a single game → moves through the engine → event type → tournament & players → rounds & pairings (over-the-board) → online tournament → approval-based registration. The game comes first; tournaments are built on top of a working game.

| Part | Where | State |
|---|---|---|
| Rules engine | `packages/chess-engine` | ✅ Legal moves, castling, en passant, promotion, mate/stalemate, SAN. 107 tests; cross-checked against chess.js on ~105k positions with 0 mismatches ([`chess-engine-vs-chessjs.md`](docs/architecture/chess-engine-vs-chessjs.md)) |
| Games & tournaments (backend) | `apps/backend` (`games`, `tournaments` modules) | 📝 Designed, not started |
| Hot-seat game UI | `apps/frontend-next` (`/chess`) | 📝 Spec ready ([`chess-ui-nextjs.md`](docs/architecture/chess-ui-nextjs.md)) |
| Rating (Glicko-2), analysis, Swiss pairings | `apps/chess-service` (Python) | 🧱 Skeleton with `GET /health`; see [its README](apps/chess-service/README.md) |

Design rules:
- **The engine sits behind a `ChessRules` port.** The backend is authoritative for moves; the client reuses the same engine for optimistic moves.
- **Tournaments know only game results, not chess mechanics.** The only link between the two is `Pairing.gameId`.
- **Python services work next to the backend, not in the middle.** They never write to the backend's tables and publish their results as Kafka events.

Multiplayer, clocks and the long-term tournament plan are in [`chess-multiplayer.md`](docs/architecture/chess-multiplayer.md). Organizations, privacy tiers and payments are in [`organizations-and-monetization.md`](docs/architecture/organizations-and-monetization.md).

## Engineering process: design docs & decision log

Non-trivial or cross-cutting changes go through a written design doc *before* the code — problem statement, options considered (and why the others were rejected), the chosen architecture, and a phased rollout plan with checkboxes. As the work actually ships, the doc gets a dated, append-only decision log: what landed, what broke, how it was fixed, what's still open — so the document stays the source of truth instead of drifting from the code.

The concrete example in this repo: [`docs/architecture/booking-concurrency.md`](docs/architecture/booking-concurrency.md) — the redesign of the event-booking race condition (Postgres conditional update + Redis queue + Kafka outbox). It captures the race-condition theory, why the original `Serializable` + retry approach was fragile, the target architecture, a 4-phase plan, and a running log of what was actually verified live (including bugs found only once real infra was up). Every design doc starts with a status header, so it doubles as a resumable snapshot of where the work stopped.

All design docs live in [`docs/architecture/`](docs/architecture/); audits and reviews live in [`docs/review/`](docs/review/).

This mirrors the "design doc" / RFC practice used at Google, Amazon, GitLab and most engineering orgs of any size for anything non-trivial, and the lighter-weight ADR (Architecture Decision Record) pattern for single, atomic decisions — writing the decision down is cheaper than reverting code built on the wrong one.

### Working with AI agents

The project is developed together with AI coding agents (Claude Code and others), under explicit rules:

- **One instruction file.** [`AGENTS.md`](AGENTS.md) holds the monorepo map, commands, architectural invariants and working rules; `CLAUDE.md` only imports it. The docs are written in Ukrainian.
- **Seven architectural invariants.** Examples: limited resources (seats, quotas) are guarded only by a Postgres transaction; Kafka carries facts that already happened, published through the outbox; handlers are idempotent; money is stored as `Int` in minor units. An agent may not break an invariant without an explicit discussion.
- **Design doc first.** An agent writes or updates a doc using the template and rules in [`docs/architecture/AI-DESIGN-DOC-GUIDE.md`](docs/architecture/AI-DESIGN-DOC-GUIDE.md) (status header, TL;DR, options, phased plan, open questions). Implementation starts only on an explicit request.
- **One step, then stop for review.** A step is one schema change plus its migration, or one rewritten method plus a type-check, or one test suite plus a run. Each step ends with a report: what changed, how it was verified, which bugs were found. After a step, the agent updates the doc's status and log.
- **Mentor mode.** Docs marked "code is written by Borys" (e.g. the frontend auth and chess UI specs) get analysis, a spec and code review from the agent, not a finished implementation.
- **Audits as input.** Findings like [`docs/review/backend-audit-2026-09-29.md`](docs/review/backend-audit-2026-09-29.md) become fixes with regression tests. Example: audit finding C1, where bcrypt compared only the first 72 bytes of a refresh JWT, was reproduced with a failing test on real JWTs before it was fixed.

## Prerequisites

- Docker Desktop (with the engine running — check the tray icon before running any command)
- pnpm (only needed for local, non-Docker development)

## Two ways to run this project

| Method | Command | When to use |
|--------|---------|-------------|
| **Docker Compose** | `pnpm run dev:docker` | Full stack incl. database — no local DB install needed, closest to production setup |
| **Local (`pnpm`)** | `pnpm run dev` | Faster iteration (hot reload without rebuilding images), requires a locally running PostgreSQL instance |

Both methods run the same codebase; the difference is only *where* the database and Node processes run.

## Running locally without Docker

Requires a PostgreSQL server already running on your machine (or reachable over the network) — this method does **not** start a database for you.

```bash
pnpm install
```

Set up `apps/backend/.env` (separate from the root `.env` used by Docker) with your local `DATABASE_URL`, then generate the Prisma Client and push the schema:

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
pnpm run dev:backend        # NestJS on :3000
pnpm run dev:frontend-next  # Next.js on :3001
pnpm run dev:frontend       # legacy Vite SPA on :5173
```

## Running with Docker

```bash
pnpm run dev:docker
# equivalent to: docker compose up
```

### Stopping

```bash
docker compose down

# also wipe database volumes (irreversible — use for a clean DB,
# e.g. after a Postgres major-version bump makes the old volume incompatible)
docker compose down -v
```

### What gets started

| Service                 | Purpose                                                           | Port          |
|-------------------------|-------------------------------------------------------------------|---------------|
| `db-postgres`           | PostgreSQL 16 database                                            | 5432          |
| `backend-init`          | One-shot: `prisma generate` → `migrate deploy` → seed, then exits | —             |
| `backend`               | NestJS API                                                        | 3000          |
| `pgadmin`               | pgAdmin 4 web UI, depends on `db-postgres` being healthy          | 5050          |
| `frontend`              | React SPA served by Vite                                          | 5173          |
| `frontend-next`         | Next.js frontend (migration in progress)                          | 3001          |
| `redis`                 | Redis 7 — BullMQ booking queue, locks, cache                      | 6379          |
| `kafka`                 | Apache Kafka 3.9 (KRaft) — domain-event bus                       | 29092 (host)  |
| `kafka-init`            | One-shot: creates the domain-event topics, then exits             | —             |
| `analytics-service`     | Kafka consumer                                                    | —             |
| `notifications-service` | Kafka consumer                                                    | —             |

Once containers are up:

- Frontend (Next.js): http://localhost:3001
- Legacy frontend (Vite): http://localhost:5173
- Backend API: http://localhost:3000/api
- pgAdmin: http://localhost:5050

### Environment variables (`.env`)

Copy the template and fill in the placeholders:

```bash
cp .env.example .env
```

```dotenv
# Application
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173

# PostgreSQL
POSTGRES_USER=<postgres_user>
POSTGRES_PASSWORD=<postgres_password>
POSTGRES_DB=<postgres_db_name>
POSTGRES_PORT=5432

# Authentication (JWT)
JWT_SECRET=<generate_a_long_random_string>
JWT_REFRESH_SECRET=<generate_a_different_long_random_string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Backend / Frontend ports
BACKEND_PORT=3000
FRONTEND_PORT=5173
FRONTEND_NEXT_PORT=3001
VITE_API_URL=http://localhost:3000/api

# Tools (pgAdmin) — avoid reserved TLDs like .local/.test (they fail pgAdmin's email validation)
PGADMIN_DEFAULT_EMAIL=<admin_email>
PGADMIN_DEFAULT_PASSWORD=<admin_password>   # min. 6 characters
PGADMIN_LISTEN_PORT=5050

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Kafka — Compose services use kafka:9092 (set in docker-compose.yml)
KAFKA_BROKER=localhost:29092
KAFKA_HOST_PORT=29092
```

`DATABASE_URL` is set directly in `docker-compose.yml` per service (built from the `POSTGRES_*` values) and doesn't need to be set in `.env`. Containers reach Redis and Kafka at `redis` / `kafka:9092`. A Node process on the host reaches them at `localhost` / `localhost:29092`.

### Troubleshooting

- **`unable to get image ... dockerDesktopLinuxEngine`** — Docker Desktop isn't running. Start it and wait for "Engine running" before retrying.
- **`database files are incompatible with server` (Postgres)** — the `pgdata` volume was initialized by a different Postgres major version than the image now in use. Remove the volume: `docker compose down` then `docker volume rm syncevent_pgdata` (check the exact name with `docker volume ls` first), then start again.
- **pgAdmin container exits immediately** — check `docker logs sync-event-pgadmin`. Common causes: `PGADMIN_DEFAULT_PASSWORD` shorter than 6 characters, or `PGADMIN_DEFAULT_EMAIL` using a reserved TLD (`.local`, `.test`, `.invalid`, `.example`) which fails pgAdmin's built-in email validation.
- **`failed to set up container networking: network ... not found`** — a stale Docker network state, usually after rapid `down`/`up` cycles. Fully quit Docker Desktop (not just `wsl --shutdown`), wait ~15s, restart it, and wait for "Engine running" before retrying.

## Testing

The backend has a Jest + ts-jest unit-test suite. Tests run against in-memory mocks (mocked `PrismaService`) — **no database, Redis or Kafka is required**. The chess engine and the ESLint rules use Vitest; `chess-service` uses pytest (see [its README](apps/chess-service/README.md)).

```bash
pnpm --filter @syncevent/chess-engine test
pnpm test:eslint-rules
```

Backend:

```bash
pnpm --filter backend test          # run all unit tests (*.spec.ts under src/)
pnpm --filter backend test:watch    # watch mode
pnpm --filter backend test:cov      # with coverage report -> apps/backend/coverage/
pnpm --filter backend test:e2e      # real-Postgres specs (test/*.e2e-spec.ts) — needs a DB
```

Two checks need live infrastructure (they are **not** part of `pnpm test`):

```bash
# Race-condition proof: N concurrent joiners on a capacity-1 event, real Postgres.
DATABASE_URL=postgresql://user:password@localhost:5432/syncevent_db?schema=public \
  pnpm --filter backend test:e2e

# Phase 1 booking-queue smoke test: real Redis + Postgres, whole enqueue→worker→status path.
# Prereqs + env in the file header (apps/backend/scripts/smoke-booking.ts).
docker compose up -d db-postgres redis
DATABASE_URL=... REDIS_HOST=localhost pnpm --filter backend smoke:booking
```

Setup lives in `apps/backend`:

- Jest config: the `"jest"` block in `package.json` — ts-jest transform via `tsconfig.spec.json`, `test/setup-env.ts` injects dummy env vars so modules that read `env.ts` at import time don't throw.
- Covered so far: `EventsService` (`src/events/events.service.spec.ts`) — create/date validation (author counts as the first seat), pagination, `findOne`, join/leave with the guarded conditional-increment capacity check (full → 409, already joined → 409) and same-transaction outbox writes, calendar, ownership checks on update/delete. `BookingQueueService` / `BookingStatusService` / `BookingProcessor`, `OutboxRelayService`, `KafkaProducerService`, and `PrismaExceptionFilter` have their own specs. `AuthService` covers multi-session, rotation, reuse detection, the grace period, concurrent refreshes, logout-all, and a real-JWT regression suite for the bcrypt 72-byte bug (audit C1). `AuthController` has a smoke spec.
- The join flow is queued (`POST /events/:id/join` → `202 { requestId }`, poll `GET /events/join-requests/:requestId`). Send an `Idempotency-Key` header to make a retry or double-submit collapse onto the same request.