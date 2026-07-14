FROM node:24-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
COPY apps/notifications-service/package.json ./apps/notifications-service/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/notifications-service ./apps/notifications-service

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/notifications-service
RUN pnpm run build

CMD ["node", "dist/main.js"]
