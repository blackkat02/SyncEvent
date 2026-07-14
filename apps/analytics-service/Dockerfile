FROM node:24-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
COPY apps/analytics-service/package.json ./apps/analytics-service/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/analytics-service ./apps/analytics-service

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/analytics-service
RUN pnpm run build

CMD ["node", "dist/main.js"]
