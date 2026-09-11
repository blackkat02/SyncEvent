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
COPY apps/notifications-service ./apps/notifications-service

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/notifications-service
RUN pnpm run build

CMD ["node", "dist/main.js"]
