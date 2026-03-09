FROM node:20-alpine

# Встановлюємо pnpm глобально
RUN npm install -g pnpm

WORKDIR /app

# Копіюємо файли конфігурації монорепозиторію
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/

# Встановлюємо залежності (використовуємо frozen-lockfile для стабільності)
RUN pnpm install --frozen-lockfile

# Копіюємо сирці бекенду
COPY apps/backend ./apps/backend

# Генеруємо Prisma Client всередині контейнера (це критично!)
WORKDIR /app/apps/backend
RUN npx prisma generate

EXPOSE 3000

# Команда запуску береться з docker-compose