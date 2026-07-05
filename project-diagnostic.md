# SyncEvent — Project Diagnostic
Generated: 2026-07-05T11:41:41.467Z

## Project tree

```
├── .env
├── .env.docker
├── .env.example
├── .gitignore
├── .npmrc
├── .vscode/
│   └── settings.json
├── README.md
├── apps/
│   ├── .env.example
│   ├── .vscode
│   ├── backend/
│   │   ├── .env.example
│   │   ├── .eslintrc.сjs
│   │   ├── .gitignore
│   │   ├── .prettierrc
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── env.d.ts
│   │   ├── env.d.ts.map
│   │   ├── env.js
│   │   ├── env.ts
│   │   ├── eslint.config.mjs
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   │   ├── 20260307202939_init/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260308202702_sync_schema_types/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260309151618_expand_user_and_add_events/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260310150113_init_full_schema/
│   │   │   │   │   └── migration.sql
│   │   │   │   └── migration_lock.toml
│   │   │   ├── prisma.module.d.ts
│   │   │   ├── prisma.module.d.ts.map
│   │   │   ├── prisma.module.js
│   │   │   ├── prisma.module.ts
│   │   │   ├── prisma.service.d.ts
│   │   │   ├── prisma.service.d.ts.map
│   │   │   ├── prisma.service.js
│   │   │   ├── prisma.service.spec.ts
│   │   │   ├── prisma.service.ts
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── prisma.config.ts
│   │   ├── scripts/
│   │   │   └── check-db.js
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.spec.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.service.spec.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── dto/
│   │   │   │   │   └── register.dto.ts
│   │   │   │   └── strategies/
│   │   │   │       └── jwt.strategy.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   │   └── get-user.decorator.ts
│   │   │   │   ├── dto/
│   │   │   │   │   └── pagination.dto.ts
│   │   │   │   ├── filters/
│   │   │   │   │   └── http-exception.filter.ts
│   │   │   │   ├── guards/
│   │   │   │   │   └── optional-auth.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── transform.interceptor.ts
│   │   │   │   ├── interfaces/
│   │   │   │   │   ├── auth.interface.ts
│   │   │   │   │   └── event.interface.ts
│   │   │   │   └── pipes/
│   │   │   │       └── yup-validation.pipe.ts
│   │   │   ├── events/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-event.dto.ts
│   │   │   │   │   └── update-event.dto.ts
│   │   │   │   ├── entities/
│   │   │   │   │   └── event.entity.ts
│   │   │   │   ├── events.controller.ts
│   │   │   │   ├── events.module.ts
│   │   │   │   └── events.service.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts
│   │   │   └── jest-e2e.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── .eslintrc.cjs
│       ├── .gitignore
│       ├── Dockerfile
│       ├── README.md
│       ├── eslint.config.js
│       ├── index.html
│       ├── package.json
│       ├── public/
│       │   └── vite.svg
│       ├── src/
│       │   ├── App.css
│       │   ├── App.tsx
│       │   ├── assets/
│       │   │   └── react.svg
│       │   ├── components/
│       │   │   ├── UserBar/
│       │   │   │   └── UserBar.tsx
│       │   │   └── layout/
│       │   │       ├── Header.tsx
│       │   │       └── MainLayout.tsx
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   ├── authApi.ts
│       │   │   │   ├── authSlice.ts
│       │   │   │   └── components/
│       │   │   │       ├── LoginForm.tsx
│       │   │   │       └── RegisterForm.tsx
│       │   │   ├── calendar/
│       │   │   │   └── components/
│       │   │   │       └── CalendarHeader.tsx
│       │   │   └── events/
│       │   │       ├── components/
│       │   │       │   └── EventCard.tsx
│       │   │       └── eventsApi.ts
│       │   ├── index.css
│       │   ├── main.tsx
│       │   ├── pages/
│       │   │   ├── CreateEventPage.tsx
│       │   │   ├── EventDetailsPage.tsx
│       │   │   ├── EventsPage.tsx
│       │   │   ├── LoginPage.tsx
│       │   │   ├── MyEventsCalendar.tsx
│       │   │   └── RegisterPage.tsx
│       │   ├── routes/
│       │   │   └── index.tsx
│       │   └── store/
│       │       ├── hooks.ts
│       │       ├── index.ts
│       │       └── store.ts
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── build-log.txt
├── docker-compose.yml
├── gather-project-info.mjs
├── package-lock.json
├── package.json
├── packages/
│   └── shared/
│       ├── package.json
│       ├── src/
│       │   ├── index.d.ts
│       │   ├── index.d.ts.map
│       │   ├── index.js
│       │   ├── index.ts
│       │   ├── schemas/
│       │   │   ├── auth.schema.d.ts
│       │   │   ├── auth.schema.d.ts.map
│       │   │   ├── auth.schema.js
│       │   │   ├── auth.schema.ts
│       │   │   ├── event.schema.d.ts
│       │   │   ├── event.schema.d.ts.map
│       │   │   ├── event.schema.js
│       │   │   └── event.schema.ts
│       │   └── types/
│       │       ├── api.response.d.ts
│       │       ├── api.response.d.ts.map
│       │       ├── api.response.js
│       │       ├── api.response.ts
│       │       ├── auth.d.ts
│       │       ├── auth.d.ts.map
│       │       ├── auth.js
│       │       ├── auth.ts
│       │       ├── event.d.ts
│       │       ├── event.d.ts.map
│       │       ├── event.js
│       │       ├── event.ts
│       │       ├── pagination.types.js
│       │       └── pagination.types.ts
│       ├── tsconfig.json
│       └── tsup.config.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── terraform.tfstate
└── tsconfig.base.json
```

## Config files

### docker-compose.yml

```
services:
  db-mysql:
    image: mysql:8.0
    container_name: sync-event-db-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_USER: user
      MYSQL_PASSWORD: password
      MYSQL_DATABASE: syncevent_db
    ports:
      - "3307:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "user", "-ppassword"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 20s
    volumes:
      - mysqldata:/var/lib/mysql
    networks:
      - sync-network

  backend-init:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    container_name: sync-event-init
    environment:
      DATABASE_URL: ${DATABASE_URL}
      DB_PROVIDER: ${DB_PROVIDER}
    networks:
      - sync-network
    depends_on:
      db-mysql:
        condition: service_healthy
    working_dir: /app/apps/backend
    command: >
      sh -c "
          node /app/apps/backend/scripts/check-db.js &&
          pnpm --filter backend exec prisma generate --schema=/app/apps/backend/prisma/schema.prisma &&
          pnpm --filter backend exec prisma db push --schema=/app/apps/backend/prisma/schema.prisma &&
          pnpm --filter backend exec ts-node /app/apps/backend/prisma/seed.ts
        "

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    container_name: sync-event-backend
    environment:
      DATABASE_URL: ${DATABASE_URL}
      DB_PROVIDER: ${DB_PROVIDER}
      PORT: 3000
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_ACCESS_EXPIRES_IN: ${JWT_ACCESS_EXPIRES_IN}
      JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN}
      NODE_ENV: development
      CORS_ORIGINS: "http://localhost:5173"
    ports:
      - "3000:3000"
    depends_on:
      backend-init:
        condition: service_completed_successfully
    networks:
      - sync-network
    command: >
      sh -c "
        node /app/apps/backend/scripts/check-db.js &&
        node dist/src/main.js
      "

  frontend:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
    container_name: sync-event-frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3000/api
    depends_on:
      - backend
    networks:
      - sync-network

networks:
  sync-network:
    driver: bridge

volumes:
  mysqldata:
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
    "db:studio": "pnpm --filter backend exec prisma studio"
  },
  "packageManager": "pnpm@10.30.2",
  "devDependencies": {
    "@types/pg": "^8.20.0",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "yup": "^1.7.1",
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
# Application
# ==============================
NODE_ENV=development
PORT=3000

# ==============================
# Database (PostgreSQL / Prisma)
# ==============================
# Host для Docker — 'db', для локального запуску — 'localhost'
POSTGRES_USER=user
POSTGRES_PASSWORD=***REDACTED***
POSTGRES_DB=syncevent_db

# Формат: postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public

# ==============================
# Authentication (JWT)
# ==============================
# Використовуйте довгі випадкові рядки для секретів
JWT_SECRET=***REDACTED***
JWT_REFRESH_SECRET=***REDACTED***

# Час життя токенів (наприклад: 15m, 1h, 7d)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ==============================
# Tools (pgAdmin)
# ==============================
PGADMIN_DEFAULT_EMAIL=admin@admin.com
PGADMIN_DEFAULT_PASSWORD=***REDACTED***
PGADMIN_LISTEN_PORT=5050
```

### apps/backend/Dockerfile

```
FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

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
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.1",
    "@nestjs/config": "^4.0.3",
    "@nestjs/core": "^11.0.1",
    "@nestjs/jwt": "^11.0.2",
    "@nestjs/mapped-types": "*",
    "@nestjs/passport": "^11.0.5",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/swagger": "^11.2.6",
    "@prisma/client": "^6.0.0",
    "@syncevent/shared": "workspace:*",
    "bcrypt": "^6.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "cookie-parser": "^1.4.7",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.20.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "yup": "^1.7.1"
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
      "js",
      "json",
      "ts"
    ],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
    "coverageDirectory": "../coverage",
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
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum Visibility {
  PUBLIC
  PRIVATE
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  password     String
  displayName  String?
  avatarUrl    String?
  refreshToken String?  @db.Text
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  createdEvents Event[] @relation("CreatedEvents")
  joinedEvents  Event[] @relation("JoinedEvents")
}

model Event {
  id           String     @id @default(cuid())
  title        String
  description  String?
  date         DateTime
  location     String
  capacity     Int?
  visibility   Visibility @default(PUBLIC)
  authorId     String
  author       User       @relation("CreatedEvents", fields: [authorId], references: [id])
  participants User[]     @relation("JoinedEvents")
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  @@index([authorId])
  @@index([visibility])
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
  if (!existsSync(envPath)) {
    console.error('❌ Error: DB_PROVIDER not set and .env file not found!');
    process.exit(1);
  }
  const envContent = readFileSync(envPath, 'utf8');
  const providerMatch = envContent.match(/^DB_PROVIDER\s*=\s*(\w+)/m);
  currentProvider = providerMatch
    ? providerMatch[1].trim().toLowerCase()
    : null;
}

currentProvider = currentProvider?.toLowerCase();

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
FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/frontend
EXPOSE 5173
CMD ["pnpm", "run", "dev", "--host"]
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
    "yup": "^1.7.1"
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
    "yup": "^1.7.1",
    "tsup": "^8.0.0"
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

