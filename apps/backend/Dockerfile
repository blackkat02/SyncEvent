FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
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