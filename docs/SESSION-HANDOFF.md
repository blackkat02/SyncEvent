# Промпт для нової сесії — SyncEvent: booking concurrency + Kafka outbox

> Скопіюй цей файл у нову сесію Claude Code як стартовий контекст.
> Дата останньої роботи: **2026-09-10**. Гілка: `master`. Автор: Borys (solo).

---

## 0. Перше, що зробити в новій сесії

1. Прочитати **`docs/architecture/booking-concurrency.md`** — це джерело істини для рішення.
   Ключові розділи: §9 (поетапний план з чекбоксами), §13 (Фаза 0 покроково + журнал Фаз 1–2 та всіх інфра-фіксів).
2. Пам'ять Claude (підвантажується автоматично): `memory/booking-concurrency-design.md`,
   `memory/event-driven-scaffolding-state.md`, `memory/backend-unit-test-setup.md`.
3. Перевірити, що досі зелене:
   ```
   pnpm --filter @syncevent/shared build
   pnpm --filter backend test            # очікується 57 passed
   pnpm --filter backend exec nest build
   (cd apps/analytics-service && pnpm exec nest build)
   (cd apps/notifications-service && pnpm exec nest build)
   pnpm --filter frontend exec tsc -b    # має бути чисто
   ```

---

## 1. Що зроблено (весь working tree — НЕ закомічено)

### Фаза 0 — race condition при бронюванні останнього місця — **ГОТОВО**
- `Event.seatsTaken Int @default(0)` (`schema.prisma`) + міграція `20260908000000_add_event_seats_taken`
  (Postgres, backfill з `_JoinedEvents`).
- `EventsService.joinEvent` — один умовний `updateMany` (`increment seatsTaken WHERE participants none
  AND (capacity IS NULL OR seatsTaken < capacity)`) у `$transaction` (Read Committed). Прибрано
  `Serializable` + retry-цикл + гілку `P2034/40001`.
- `EventsService.leaveEvent` — `SELECT … FOR UPDATE` лок рядка `Event` + Prisma `disconnect` +
  `seatsTaken = GREATEST(seatsTaken-1, 0)`. Прибрано raw `DELETE` по `_JoinedEvents` (нестабільні `A`/`B`).
- `EventsService.create` — тепер ставить `seatsTaken: 1` (автор завжди учасник; без цього подія
  приймала б `capacity+1`). `seed.ts` вирівняно.
- `PrismaExceptionFilter` (`src/common/filters/`) — глобальний у `main.ts`: `P2002`→409, `P2025`→404,
  `P2024/P2028/P2034`→503, решта→500+лог. Сирі Prisma-повідомлення не витікають клієнту.
- Помилки join: `BadRequestException` (400) → `ConflictException` (409).
- Доказ: `apps/backend/test/booking-concurrency.e2e-spec.ts` (реальний Postgres, N паралельних join'ів).

### Фаза 1 — Redis-черга бронювання — **МАЙЖЕ ГОТОВО**
- `apps/backend/src/booking/`: BullMQ черга `event-booking`; `BookingQueueService` (enqueue,
  `Idempotency-Key` header → `requestId = sha256(userId:eventId:key)` з дедупом через статус, без ключа
  → `randomUUID`); `BookingProcessor` (`@Processor`/`WorkerHost`, per-event `RedisService.acquireLock`,
  пише CONFIRMED/REJECTED, **не перекидає** бізнес-відмову далі); `BookingStatusService`
  (Redis `reqstatus:{id}`, TTL 1h, несе `userId` для ownership-перевірки).
- `POST /events/:id/join` → `202 {requestId, statusUrl}`; `GET /events/join-requests/:requestId`
  (перевірка власника). `EventsModule` тепер `exports: [EventsService]`.
- `RedisModule` + `BullModule` + `KafkaModule` + `OutboxModule` підключено в `AppModule`.
- Фронтенд `eventsApi.ts`: `joinEvent` = `queryFn`, enqueue (з per-event idempotency-key з `Map`) →
  polling `join-requests/:id` 400мс/15с.
- Smoke: `apps/backend/scripts/smoke-booking.ts` (`pnpm --filter backend smoke:booking`).
- **Свідомо пропущено:** WS-канал `booking:{requestId}` (polling працює); Redis-лічильник `seatsLeft`.

### Фаза 2 — Kafka event bus + transactional outbox — **КОД ГОТОВИЙ, наживо доводиться**
- `OutboxEvent` модель (`schema.prisma`) + міграція `20260910000000_add_outbox_event` (**без FK на Event**).
- `EventsService`: `create`/`joinEvent`/`leaveEvent`/`remove` пишуть outbox-рядок у **тій самій**
  `$transaction` (helper `writeOutbox`; id рядка = `payload.messageId`).
- `apps/backend/src/outbox/outbox-relay.service.ts` — `setTimeout`-цикл 1с, batch 50, `sentAt` тільки
  після acku брокера (at-least-once), зупиняє батч на 1-й помилці, off-switch `OUTBOX_RELAY_DISABLED=true`.
- `KafkaProducerService.emit(topic, payload, key?)` → `{key, value}` + `await lastValueFrom`;
  `onModuleInit` не кидає на холодному брокері.
- `@syncevent/shared` `EventTopics`: `enum` → `as const` об'єкт (+ `DomainEventMeta {messageId, occurredAt}`
  у кожному payload). **Заодно виправило** дві старі помилки фронтового `tsc -b`.
- Мікросервіси: `analytics-service` слухає `USER_JOINED/USER_LEFT/EVENT_CREATED/EVENT_DELETED`;
  `notifications-service` — `USER_JOINED/USER_LEFT`. Дедуп через in-memory `SeenMessages` (по `messageId`).
  Прибрано мертвий Hello-World scaffold. **Виправлено їх `tsconfig.json`** (не було
  `experimentalDecorators`/`emitDecoratorMetadata` → `@EventPattern` не компілювався).
- Unit: `outbox-relay.service.spec.ts`, `kafka-producer.service.spec.ts`, outbox-асерти в
  `events.service.spec.ts`. Разом **57 зелених**.

### Інфра / Docker фікси цієї сесії
- **Усі 4 Dockerfile**: копіюють усі 6 воркспейс-`package.json` перед `pnpm install` (було 2 → падало
  `... missing from pnpm-lock.yaml`); `RUN npm install -g pnpm@10.30.2` (pin під `packageManager`);
  `.npmrc` → `manage-package-manager-versions=false`.
- **`docker-compose.yml`**:
  - `kafka` — повний KRaft-конфіг; лісенери через **порожній хост** (`CONTROLLER://:9093,PLAINTEXT://:9092,
    PLAINTEXT_HOST://:29092`) — з `0.0.0.0` падало (`nonroutable meta-address`). Внутрішня адреса
    `kafka:9092`, хостова **`localhost:29092`** (порт змінено з 9092!). Healthcheck.
  - **`kafka-init`** — one-shot: `kafka-topics.sh --create` для 4 топіків (щоб консюмери не гонилися з
    lazy auto-create → `This server does not host this topic-partition`).
  - `analytics-service` + `notifications-service` — додано (завжди, без профілю), `depends_on: kafka-init`,
    `restart: on-failure`, `KAFKAJS_NO_PARTITIONER_WARNING=1`.
  - backend `x-backend-env-common`: `KAFKA_BROKER: kafka:9092`.
- Мікросервіси `main.ts`: kafkajs `retry: { retries: 10, … }`, `allowAutoTopicCreation`.
- **`entrypoint.sh`** переведено CRLF → LF; `.gitattributes` (`*.sh eol=lf`); `sed -i 's/\r$//'` у
  backend Dockerfile (Windows-checkout давав exit 127 `line 3: : not found`).
- **`.env`** створено (gitignored) з dev-значеннями; JWT-секрети згенеровано.

---

## 2. Виявлені проблеми / відкриті питання

1. **Нічого не закомічено.** ~40 змінених + ~12 нових файлів + `docs/`. Потрібне ревʼю і розбиття на
   осмислені коміти (Phase 0 / Phase 1 / Phase 2 / infra-fixes / docs).
2. ~~**Наживо не підтверджено**~~ — ✅ **зроблено 2026-09-11**: `docker compose up -d --build` пройшов
   без правок; `pnpm smoke:booking`, `SMOKE_KAFKA=1 pnpm smoke:booking`, `pnpm test:e2e`
   (booking-concurrency) та `docker compose logs` consumer-ів усі підтвердили повний прогін
   enqueue → worker → Postgres → outbox → Kafka → consumer. Один дрібний баг знайдено й
   виправлено (сам `smoke-booking.ts`, не логіка бронювання) — деталі: Крок 7 у
   `docs/architecture/booking-concurrency.md`.
3. **`The group coordinator is not available`** одразу після старту Kafka — **транзієнт**: KRaft створює
   `__consumer_offsets` (50 партицій), координатор груп ще не готовий. kafkajs ретраїть (`retries: 10`),
   `restart: on-failure` підстраховує. Має самозникнути за ~15–30с. Якщо ні — дивитись логи `kafka`.
4. **Consumer idempotency — тільки in-memory** (`SeenMessages`, process-local). Після рестарту —
   переобробка. Прийнятно поки хендлери лише логують. Коли зʼявиться реальний sink (БД/лист) —
   перенести на Redis `SET NX` або таблицю `processed_messages`.
5. **Residual race в `joinEvent`:** два абсолютно одночасні запити ТОГО САМОГО юзера можуть
   пере-інкрементити `seatsTaken` на 1 (складений PK `_JoinedEvents` не дає дублю членства; це дрейф
   лічильника одного юзера, НЕ овербукінг інших). Закривається явною моделлю `EventParticipant`.
6. **`prisma db push` не запускає backfill з міграцій.** Контейнер робить `db push` → нова колонка/таблиця
   створюється, але SQL-backfill із файлів міграцій НЕ виконується. На чистій БД + seed усе ок. Для
   наявних даних — виконати backfill вручну (SQL у §13 доку) або перевести init на `prisma migrate deploy`.
7. **MySQL vs Postgres:** `schema.prisma` закомічено як `provider = "mysql"`, `check-db.js` міняє на
   старті контейнера. Міграції — Postgres. Outbox-міграція — Postgres SQL (`JSONB`). `Json`-тип працює на
   обох. Фаза 4 прибирає MySQL повністю.
8. **WS-канал не зроблено** — фронт лише polling (працює). Окрема більша задача (gateway + socket.io + фронт).
9. **Образи мікросервісів роздуті** — роблять повний monorepo `pnpm install` (тягнуть і backend-залежності).
   Оптимізувати `pnpm deploy` / multi-stage пізніше.
10. **Kafka host-порт змінено 9092 → 29092.** Будь-які локальні скрипти/нотатки оновити.

---

## 3. Що робити далі (за пріоритетом)

1. ~~**Догнати наживо Фази 1–2.**~~ ✅ **зроблено 2026-09-11** — усе зелене, деталі в Кроці 7
   (`docs/architecture/booking-concurrency.md`).
2. **Ревʼю + commit** усього working tree. ← **наступний крок**
3. **Явна модель `EventParticipant { eventId, userId, @@id([eventId,userId]) }`** (місток до Фази 3).
   Потрібна для вейтлісту й закриває residual race (#5). Велика зміна: implicit M:N → explicit,
   `connect/disconnect` → `create/delete`, оновити `findAll`/`findOne`/`findMyCalendar`/`seed`/специ.
   Використати `@map`/`@@map` щоб зафіксувати фізичні імена колонок (обговорено — уникає «тихого свапу»
   як з `A`/`B`).
4. **Фаза 3 — вейтліст.** Redis sorted-set `waitlist:{eventId}` (score=timestamp); на `event.user-left`
   → підняти першого → enqueue join → `event.waitlist-promoted`; `event.capacity-changed` → злити чергу.
   Нові топіки в `EventTopics`.
5. **Фаза 4 — прибрати MySQL.** Видалити `--profile mysql`, `DB_PROVIDER`, гілки `check-db.js`/`entrypoint.sh`;
   зафіксувати `provider = "postgresql"`; увімкнути Postgres-специфіку (`FOR UPDATE SKIP LOCKED` у relay).
6. **Опційно:** WS-канал замість polling; consumer-дедуп у Redis; `BOOKING_REJECTED` best-effort з
   `BookingProcessor`; outbox relay `FOR UPDATE SKIP LOCKED` (коли >1 інстанс backend).

---

## 4. Команди-довідник

| Дія | Команда |
|---|---|
| Backend unit-тести | `pnpm --filter backend test` (57 зелених) |
| Backend build | `pnpm --filter backend exec nest build` |
| Shared build (після зміни `packages/shared`!) | `pnpm --filter @syncevent/shared build` |
| Мікросервіс build | `cd apps/analytics-service && pnpm exec nest build` |
| Frontend typecheck | `pnpm --filter frontend exec tsc -b` (чисто) |
| Smoke (черга) | `pnpm --filter backend smoke:booking` |
| Smoke + Kafka | `SMOKE_KAFKA=1 KAFKA_BROKER=localhost:29092 pnpm --filter backend smoke:booking` |
| Повний стек | `docker compose up -d --build` (профіль `postgres` у `.env`) |
| Тільки Kafka-пайплайн | `docker compose up -d --build kafka kafka-init redis analytics-service notifications-service` |
| Логи консюмерів | `docker compose logs -f analytics-service notifications-service` |
| Відновити сесію Claude | `cd D:\Projects\SyncEvent && claude -r` |

**Порти:** backend 3000, frontend 5173, Postgres 5432, Redis 6379, **Kafka (host) 29092**, pgAdmin 5050.

---

## 5. Ключові файли

- `docs/architecture/booking-concurrency.md` — дизайн + журнал (§13).
- `apps/backend/src/events/events.service.ts` — `joinEvent`/`leaveEvent`/`create`/`remove` + `writeOutbox`.
- `apps/backend/src/booking/` — черга бронювання.
- `apps/backend/src/outbox/outbox-relay.service.ts` — relay.
- `apps/backend/src/kafka/kafka-producer.service.ts` — `emit(topic, payload, key?)`.
- `apps/backend/scripts/smoke-booking.ts` — live smoke (шапка = runbook).
- `packages/shared/src/events/event-topics.ts` — контракти топіків.
- `apps/{analytics,notifications}-service/src/` — консюмери.
- `docker-compose.yml` — kafka / kafka-init / консюмери.
