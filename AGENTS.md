# SyncEvent — інструкції для ШІ-агентів

Платформа для створення й керування івентами. Стартова ніша — шахи (турніри, клуби, команди).
Соло-проєкт, автор — Borys. Мова спілкування й документації — **українська**; ідентифікатори
коду — як у коді.

`CLAUDE.md` лише імпортує цей файл. У `apps/frontend-next/` діють **додаткові** правила Next.js 16
(`apps/frontend-next/AGENTS.md`, генерується `next dev` — не редагувати й не видаляти).

---

## Монорепо (pnpm workspace: `apps/*`, `packages/*`)

| Шлях | Що це |
|---|---|
| `apps/backend` | NestJS 11 REST API: auth (JWT + refresh-rotation), events, booking, outbox, Kafka, Redis, scheduled tasks. Prisma + PostgreSQL (`apps/backend/prisma/schema.prisma`) |
| `apps/frontend-next` | Next.js 16 + Redux Toolkit / RTK Query, порт 3001 — **цільовий фронтенд** |
| `apps/frontend` | Старий Vite + React SPA, порт 5173 — мігрується (`docs/architecture/nextjs-migration.md`) |
| `apps/analytics-service`, `apps/notifications-service` | NestJS Kafka-консюмери доменних подій |
| `packages/shared` | `@syncevent/shared`: zod-схеми, типи, Kafka-топіки й payload-и (`src/events/event-topics.ts`) — єдине джерело контрактів |
| `packages/chess-engine` | `@syncevent/chess-engine`: правила шахів (JS, vitest), перенесено з ChessB — рушій розвивається тут |
| `apps/chess-service` | Python (FastAPI), **не** в pnpm workspace: рейтинг, аналіз, жеребкування — поруч з backend (інваріант 6) |
| `packages/eslint-rules` | `@syncevent/eslint-rules`: власні ESLint-правила (vitest) |

`README.md` місцями застарів (згадує Yup і class-validator — валідація вже на zod).

## Команди (з кореня)

| Задача | Команда |
|---|---|
| Усе в Docker (Postgres, Redis, Kafka, сервіси) | `pnpm dev:docker` |
| Бекенд / Next-фронт локально | `pnpm dev:backend` / `pnpm dev:frontend-next` |
| Зібрати shared (після зміни контрактів) | `pnpm build:shared` |
| Prisma: generate / міграція / studio / seed | `pnpm db:generate` / `pnpm db:migr` / `pnpm db:studio` / `pnpm db:seed` |
| Юніт-тести бекенду (Jest) | `pnpm --filter backend test` |
| E2E бекенду | `pnpm --filter backend test:e2e` |
| Smoke бронювання / seeded-тести | `pnpm smoke:booking` / `pnpm test:seeded` |
| Лінт усього | `pnpm lint` |
| Тести ESLint-правил | `pnpm test:eslint-rules` |
| Тести шахового рушія | `pnpm --filter @syncevent/chess-engine test` |
| Python chess-service | див. `apps/chess-service/README.md` (venv + pytest) |

Нотатки:
- Jest у бекенді бере фіктивні env з `apps/backend/test/setup-env.ts` (`env.ts` падає без змінних).
- `nest build` пише в `dist/`. Скомпільовані `.js`/`.d.ts` поруч із `.ts` у `src/` — сміття, не комітити.
- Змінні оточення — `.env.example`. Kafka з хоста — `localhost:29092`, з контейнерів — `kafka:9092`.

## Архітектурні інваріанти (не порушувати без явного обговорення)

1. **Коректність обмежених ресурсів (місця, квоти) — лише Postgres-транзакція** з умовним
   `UPDATE … WHERE` + унікальні ключі. Не Redis-лічильник, не Kafka. → `booking-concurrency.md`
2. **Kafka транслює факти, що вже сталися**, через outbox у тій самій транзакції
   (`apps/backend/src/outbox/`). Консюмери дедуплікують за `messageId`.
3. **Відкладені дії й таймаути — BullMQ** + «лінива» перевірка при читанні. → `scheduled-tasks-worker.md`
4. **Обробники ідемпотентні:** умовний перехід статусу або унікальний ключ inbox-таблиці.
5. **Контракти — у `packages/shared`.** Зміна enum/DTO у Prisma чи API тягне зміну там.
6. **Python-сервіси (плануються для шахів) — поруч, не посередині:** не пишуть у чужі таблиці,
   результати — подіями. → `chess-multiplayer.md` §7
7. **Гроші — `Int` у мінімальних одиницях + `currency`.**

## Документація

- Архітектурні рішення: `docs/architecture/`. Індекс і **інструкція, як їх писати** —
  [`docs/architecture/AI-DESIGN-DOC-GUIDE.md`](docs/architecture/AI-DESIGN-DOC-GUIDE.md).
  Новий документ → за шаблоном звідти + рядок в її індексі.
- Аудити/рев'ю: `docs/review/`.
- Перед зміною підсистеми — прочитай її документ (шапка, §0 TL;DR, план, відкриті питання) і
  звір з кодом: документ може відставати.

| Тема | Документ |
|---|---|
| Бронювання, race condition, Redis-черга, Kafka + outbox | `docs/architecture/booking-concurrency.md` |
| Refresh-токени, мультисесії, reuse-detection | `docs/architecture/refresh-token-rotation.md` |
| BullMQ, заплановані задачі | `docs/architecture/scheduled-tasks-worker.md` |
| Міграція на zod (виконано) | `docs/architecture/nestjs-zod-migration.md` |
| Міграція фронтенду на Next.js | `docs/architecture/nextjs-migration.md` |
| Фронтенд-авторизація, RTK Query (менторський ТЗ) | `docs/architecture/frontend-auth-rtk-query.md` |
| Шахи: мультиплеєр, турніри, Python | `docs/architecture/chess-multiplayer.md` |
| Організації, приватність, шахова специфіка, платежі | `docs/architecture/organizations-and-monetization.md` |
| Шахова партія (hot-seat) у Next.js — менторський ТЗ, код пише Borys | `docs/architecture/chess-ui-nextjs.md` |
| Рушій проти chess.js: що перевірено, чого бракує | `docs/architecture/chess-engine-vs-chessjs.md` |
| **Поточний пріоритет:** фундамент під шаховий рушій (кроки 1–8, спочатку партія) | `docs/architecture/chess-foundation.md` |

## Як працювати

- **Поетапна робота за документом/чеклістом — по одному кроку, потім стоп на рев'ю.** Крок —
  одна зміна схеми + міграція, або один переписаний метод + type-check, або один тестовий набір +
  прогін. У підсумку кроку: що змінено, чим перевірено, знайдені баги — окремо.
- **Менторський режим** (документ позначений «код пише Borys»): давати аналіз, ТЗ і рев'ю, а не
  готову реалізацію.
- Реалізацію за проєктним документом не починати без явного запиту.
- Коміти — лише на прохання. Робоча гілка зазвичай feature-гілка; `master` — основна.
- Після кроку реалізації — оновити статус у шапці відповідного документа й план/журнал у ньому.
