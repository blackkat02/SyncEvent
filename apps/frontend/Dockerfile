FROM node:24-alpine
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

RUN cd /app/packages/shared && /app/node_modules/.bin/tsup && /app/node_modules/.bin/tsc --emitDeclarationOnly --noEmit false

WORKDIR /app/apps/frontend
EXPOSE 5173
CMD ["pnpm", "--filter", "frontend", "exec", "vite", "--host"]