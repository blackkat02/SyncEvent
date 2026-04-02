# SyncEvent Monorepo

Проект для керування подіями. Побудований на NestJS, React та Prisma.

## Швидкий запуск через Docker

Для запуску всієї інфраструктури (Frontend, Backend, DB, PgAdmin) виконайте:

```bash
# Збірка та запуск усіх сервісів
docker-compose up --build

# Зупинка проекту
docker-compose down

# Перегляд логів бекенду
docker logs -f sync-event-backend
```

## Корисні команди для розробки

- **Rebuild Shared**: `pnpm --filter @syncevent/shared build`
- **Database Studio (Prisma)**: `npx prisma studio` (всередині контейнера бекенду)
