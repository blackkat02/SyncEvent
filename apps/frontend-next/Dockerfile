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
COPY apps/frontend-next/package.json ./apps/frontend-next/
COPY apps/analytics-service/package.json ./apps/analytics-service/
COPY apps/notifications-service/package.json ./apps/notifications-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-rules/package.json ./packages/eslint-rules/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/frontend-next ./apps/frontend-next

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/frontend-next
EXPOSE 3001
# -H 0.0.0.0 is the Next.js equivalent of Vite's --host: without it, the dev
# server only listens inside the container's own loopback interface and the
# host-side port mapping below has nothing to connect to.
CMD ["pnpm", "--filter", "frontend-next", "exec", "next", "dev", "-p", "3001", "-H", "0.0.0.0"]
