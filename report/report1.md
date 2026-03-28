# SyncEvent Repository Review Report

**Дата:** 2026-03-28  
**Проект:** SyncEvent (SyncFlow Monorepo)  
**Стек:** NestJS + React + Prisma + PostgreSQL + pnpm workspaces

---

## Summary

Монорепозиторій SyncFlow (NestJS + React + Prisma) має **критичні проблеми з безпекою та зламану збірку**. Пакет `@syncevent/shared` був видалено з `packages/shared/`, але код продовжує його імпортувати, що зробить будь-яку збірку неможливою. Крім того, виявлено численні проблеми з JWT секретами та конфігурацією Docker.

---

## Issues Found

| Severity | File:Line | Issue |
|----------|-----------|-------|
| **CRITICAL** | Multiple files | BROKEN BUILD: `@syncevent/shared` package deleted but still imported |
| **CRITICAL** | `auth.service.ts:86` | JWT_REFRESH_SECRET fallback to hardcoded `'refresh_secret'` |
| **CRITICAL** | `jwt.strategy.ts:12` | JWT_SECRET fallback to `'super_secret_key'` |
| **CRITICAL** | `docker-compose.yml:64-65` | Weak JWT secrets in production config |
| **CRITICAL** | `main.ts:23` | CORS `origin: true` allows any origin |
| **WARNING** | `docker-compose.yml:90` | Frontend VITE_API_URL uses localhost (won't work in Docker) |
| **WARNING** | `env.ts:2-8` | Non-null assertions without validation |
| **WARNING** | `prisma.service.ts` | No error handling for database connection |
| **SUGGESTION** | `authSlice.ts:23` | No refresh token logic on frontend |

---

## Detailed Findings

### 1. BROKEN BUILD - Missing Shared Package (CRITICAL - 95%)

**Files affected:**

| File | Line | Import |
|------|------|--------|
| `apps/backend/package.json` | 34 | `"@syncevent/shared": "workspace:*"` |
| `apps/frontend/package.json` | 14 | `"@syncevent/shared": "workspace:*"` |
| `apps/backend/src/auth/auth.service.ts` | 12 | `import { AuthResponse } from '@syncevent/shared'` |
| `apps/backend/src/auth/auth.controller.ts` | 21-25 | imports `registerSchema`, `AuthResponse`, `UserProfile`, `RegisterInput` |
| `apps/backend/src/auth/dto/register.dto.ts` | 2 | `import { RegisterInput } from '@syncevent/shared'` |
| `apps/backend/src/events/dto/create-event.dto.ts` | 3 | imports `CreateEventInput`, `EventVisibility` |
| `apps/backend/src/events/dto/update-event.dto.ts` | 3 | imports `UpdateEventInput`, `EventVisibility` |
| `apps/frontend/src/store/slices/auth/authSlice.ts` | 4 | imports `RegisterInput`, `AuthResponse` |

**Problem:** `packages/shared/` directory was deleted but still referenced. All imports will fail during build.

**Impact:** Project cannot build at all.

---

### 2. JWT Secret Fallbacks (CRITICAL - 95%)

**File:** `apps/backend/src/auth/auth.service.ts:86`
```typescript
secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret',
```

**File:** `apps/backend/src/auth/strategies/jwt.strategy.ts:12`
```typescript
secretOrKey: process.env.JWT_SECRET || 'super_secret_key',
```

**Problem:** If env vars are missing, system falls back to hardcoded weak secrets that are trivial to guess.

**Impact:** Authentication bypass possible if secrets not properly configured.

---

### 3. Weak Docker Secrets (CRITICAL - 90%)

**File:** `docker-compose.yml:64-65`
```yaml
environment:
  JWT_SECRET: "dev_access"
  JWT_REFRESH_SECRET: "dev_refresh"
```

**Problem:** These weak secrets are hardcoded in production Docker configuration.

**Impact:** JWT tokens can be forged by anyone who knows these strings.

---

### 4. CORS Misconfiguration (CRITICAL - 85%)

**File:** `apps/backend/src/main.ts:22-25`
```typescript
app.enableCors({
  origin: true,
  credentials: true,
});
```

**Problem:** `origin: true` allows any domain to make requests with credentials. This enables:
- Cross-site request forgery (CSRF)
- Data theft from authenticated users
- Unauthorized API access

**Impact:** Any malicious website can make authenticated requests on behalf of users.

---

### 5. Docker Frontend URL (WARNING - 85%)

**File:** `docker-compose.yml:90`
```yaml
environment:
  - VITE_API_URL=http://localhost:3000/api
```

**Problem:** `localhost` in Docker containers refers to the container itself, not the backend service. This URL will fail to connect.

**Impact:** Frontend cannot communicate with backend when running in Docker.

---

### 6. No Environment Validation (WARNING - 80%)

**File:** `apps/backend/env.ts:1-9`
```typescript
export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN!,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN!,
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};
```

**Problem:** App will crash at runtime with cryptic errors if env vars are missing, rather than failing fast with a clear message at startup.

**Impact:** Difficult debugging when configuration is wrong.

---

### 7. Missing Refresh Token Logic (WARNING - 75%)

**File:** `apps/frontend/src/store/slices/auth/authSlice.ts`

**Problem:** 
- Access token stored in localStorage
- No refresh token logic implemented
- After 15 minutes (JWT expiration), user must manually re-login

**Impact:** Poor user experience; tokens not properly rotated.

---

## Architecture Notes

### Monorepo Structure
```
SyncEvent/
├── apps/
│   ├── backend/          # NestJS API
│   │   ├── src/
│   │   │   ├── auth/    # Authentication module
│   │   │   ├── events/  # Events CRUD module
│   │   │   └── common/  # Shared utilities
│   │   ├── prisma/      # Database schema & migrations
│   │   └── Dockerfile
│   └── frontend/        # React + Vite
│       └── src/
│           ├── api/     # API client
│           ├── store/   # Redux slices
│           └── pages/   # Page components
├── packages/            # SHARED PACKAGE DELETED ❌
├── docker-compose.yml
└── pnpm-workspace.yaml
```

### Database Schema (Prisma)

**User Model:**
- id, email (unique), password, displayName, avatarUrl
- refreshToken (nullable)
- Relations: createdEvents, joinedEvents

**Event Model:**
- id, title, description, date, location, capacity
- visibility (PUBLIC/PRIVATE)
- authorId → User
- participants → User[]

### Authentication Flow
1. Register/Login → returns accessToken (15m) + refreshToken (7d)
2. Refresh token stored hashed in DB
3. Access token used for API auth via Bearer token
4. Refresh endpoint validates refresh token and issues new tokens

---

## Recommendations

### Immediate Actions Required

1. **Restore `packages/shared/` package** - Critical blocker
2. **Remove JWT secret fallbacks** - Security risk
3. **Fix CORS configuration** - Security risk
4. **Fix Docker networking** - Functional requirement

### Priority Order

1. **P0 (Critical):** Fix broken imports - project won't build
2. **P0 (Critical):** Remove weak JWT fallbacks
3. **P1 (High):** Fix CORS configuration
4. **P1 (High):** Fix Docker frontend URL
5. **P2 (Medium):** Add environment validation
6. **P2 (Medium):** Implement refresh token interceptor

---

## Files Requiring Changes

| Priority | File | Change Required |
|----------|------|-----------------|
| P0 | `packages/shared/*` | Recreate deleted package |
| P0 | `apps/backend/src/auth/auth.service.ts` | Remove fallback secret |
| P0 | `apps/backend/src/auth/strategies/jwt.strategy.ts` | Remove fallback secret |
| P0 | `apps/backend/src/auth/auth.controller.ts` | Update imports |
| P0 | `apps/backend/src/auth/dto/register.dto.ts` | Update imports |
| P0 | `apps/backend/src/events/dto/*.ts` | Update imports |
| P0 | `apps/frontend/src/store/slices/auth/authSlice.ts` | Update imports |
| P1 | `apps/backend/src/main.ts` | Fix CORS origin |
| P1 | `docker-compose.yml` | Fix secrets + frontend URL |
| P2 | `apps/backend/env.ts` | Add validation |

---

## Conclusion

**Recommendation:** NEEDS CHANGES

Проект має критичні проблеми, які блокують збірку та створюють серйозні ризики безпеки. Першочергово необхідно виправити проблеми з відсутнім пакетом `@syncevent/shared` та JWT секретами.
