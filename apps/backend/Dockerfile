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

RUN pnpm --filter @syncevent/shared build

WORKDIR /app/apps/backend
RUN npx prisma generate
RUN pnpm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]