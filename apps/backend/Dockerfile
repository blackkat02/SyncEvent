FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Копіюємо конфіги воркспейсу
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Копіюємо package.json бекенду ТА shared пакета (важливо для встановлення зв'язків)
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

# Встановлюємо всі залежності воркспейсу
RUN pnpm install --frozen-lockfile

# Копіюємо вихідний код обох пакетів
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Генеруємо Prisma Client
WORKDIR /app/apps/backend
RUN npx prisma generate

EXPOSE 3000

# Використовуємо start:dev, але переконайся, що в package.json 
# шлях запуску відповідає структурі (node dist/apps/backend/src/main.js)
CMD ["pnpm", "run", "start:dev"]