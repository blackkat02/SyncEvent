# SyncEvent

Full-stack platform for creating and managing events, built as a pnpm monorepo with a NestJS backend, a React frontend, and a shared types/validation package.

## Architecture

```
                         ┌────────────────────────┐
                         │        Browser          │
                         └────────────┬─────────────┘
                                      │ HTTP :5173
                         ┌────────────▼─────────────┐
                         │   frontend (React 19)     │
                         │   Vite · Redux Toolkit     │
                         │   RTK Query · React Router │
                         └────────────┬─────────────┘
                                      │ REST /api  :3000
                         ┌────────────▼─────────────┐
                         │   backend (NestJS 11)     │
                         │   JWT auth · class-validator│
                         │   Prisma ORM                │
                         └────────────┬─────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       │                              │
              ┌────────▼────────┐          ┌──────────▼─────────┐
              │   MySQL 8.0      │   or     │   PostgreSQL 16     │
              │   (profile:mysql)│          │   (profile:postgres)│
              └──────────────────┘          └─────────────────────┘
```

### Monorepo layout

```
apps/
  backend/    NestJS API — auth, events, Prisma
  frontend/   React SPA — Vite, Redux Toolkit, RTK Query
packages/
  shared/     Yup schemas & TypeScript types shared between frontend/backend
```

Both apps depend on `@syncevent/shared` (workspace package) for a single source of truth on DTOs and validation schemas, so a change to an API contract only needs to happen in one place.

### Dual-database support (MySQL / PostgreSQL)

The backend runs against either MySQL or PostgreSQL from the *same* Prisma schema. A small script, `apps/backend/scripts/check-db.js`, runs before every backend container start and:

1. Reads the target provider from `DB_PROVIDER` (`mysql` or `postgresql`).
2. Compares it against `prisma/migrations/migration_lock.toml` (the provider the current `migrations/` folder belongs to).
3. If they differ, moves the current `migrations/` folder into `prisma/.migrations_backup/<provider>/` and restores a matching backup for the target provider if one exists (otherwise Prisma creates fresh migrations).
4. Rewrites the `provider` field in `schema.prisma` to match the target.

Each backend container also runs `prisma generate` on startup (after the switch), so the Prisma Client bundled in the running container always matches the active provider — this matters because the client generated at Docker build time is baked for whatever provider was committed in the repo, and file edits to `schema.prisma` at runtime don't retroactively change an already-generated client.

MySQL and PostgreSQL are mutually exclusive at runtime (only one is meant to run at a time), selected via Docker Compose **profiles**.

## Tech stack

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 19, Vite, Redux Toolkit, RTK Query, React Router, React Hook Form, Tailwind |
| Backend   | NestJS 11, Prisma 6, Passport JWT, class-validator, Yup |
| Databases | MySQL 8.0 or PostgreSQL 16 (switchable) |
| Shared    | TypeScript, Yup — published as an internal workspace package |
| Infra     | Docker, Docker Compose (profiles), pnpm workspaces |

## Prerequisites

- Docker Desktop (with the engine running — check the tray icon before running any command)
- pnpm (only needed for local, non-Docker development)

## Running with Docker

Two Compose profiles are available: `mysql` (default choice) and `postgres`. Only one should run at a time — starting the other profile automatically stops and rebuilds its own set of containers, it does not touch the currently running one, so stop the active profile first if you're switching.

### MySQL

```bash
docker-compose --profile mysql up --build
```

### PostgreSQL

```bash
docker-compose --profile postgres up --build
```

### Stopping

```bash
# stop and remove containers + network for the active profile
docker-compose --profile mysql down      # or --profile postgres

# also wipe the database volume (irreversible — use if you need a clean DB,
# e.g. after a Postgres major-version bump makes the old volume incompatible)
docker-compose --profile mysql down -v   # or --profile postgres
```

### What gets started

| Service                              | Profile  | Purpose                                              | Port |
|---------------------------------------|----------|-------------------------------------------------------|------|
| `db-mysql`                            | mysql    | MySQL 8.0 database                                    | 3307 → 3306 |
| `db-postgres`                         | postgres | PostgreSQL 16 database                                 | 5432 |
| `backend-init` / `backend-init-postgres` | mysql / postgres | One-shot: runs `check-db.js`, `prisma generate`, `prisma db push`, seeds the DB, then exits | — |
| `backend` / `backend-postgres`        | mysql / postgres | NestJS API                                             | 3000 |
| `frontend`                            | both     | React SPA served by Vite                               | 5173 |

Once containers are up:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api

### Environment variables (`.env`)

```dotenv
# MySQL
MYSQL_ROOT_PASSWORD=rootpassword

# PostgreSQL
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=syncevent_db

# JWT (shared by both profiles)
JWT_SECRET=change_me
JWT_REFRESH_SECRET=change_me_too
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

`DATABASE_URL` and `DB_PROVIDER` are set directly in `docker-compose.yml` per service and don't need to be set in `.env` — this keeps the two profiles fully isolated from each other, so a value meant for one provider can never leak into the other's containers.

### Troubleshooting

- **`unable to get image ... dockerDesktopLinuxEngine`** — Docker Desktop isn't running. Start it and wait for "Engine running" before retrying.
- **`database files are incompatible with server` (Postgres)** — the `pgdata` volume was initialized by a different Postgres major version than the image now in use. Remove the volume: `docker-compose --profile postgres down` then `docker volume rm syncevent_pgdata` (check the exact name with `docker volume ls` first), then start again.
- **`Can't reach database server at db-mysql:3306` while running the postgres profile** — a leftover `DB_PROVIDER`/`DATABASE_URL` value pointing at the wrong host; these are hardcoded per-service in `docker-compose.yml` for this reason and shouldn't be overridden from `.env`.