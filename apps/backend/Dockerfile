FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile

COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

RUN npx prisma generate

EXPOSE 3000

CMD ["pnpm", "run", "start:dev"]
