# Бронювання подій: race condition і цільова архітектура

> Статус: **проєкт рішення** (draft). Соло-проєкт, автор — Borys.
> Останнє оновлення: 2026-09-10 (Фаза 0 і 2 — код готовий; Фаза 1 — майже).
> Пов'язаний код: `apps/backend/src/events/events.service.ts` (`joinEvent`/`leaveEvent`),
> `apps/backend/src/redis/`, `apps/backend/src/kafka/`, `packages/shared/src/events/event-topics.ts`,
> `apps/analytics-service`, `apps/notifications-service`.

---

## 0. TL;DR / рішення

1. **MySQL ігноруємо**, цільова БД — **PostgreSQL** (MySQL приберемо у Фазі 4).
2. **Race condition при бронюванні останнього місця реальний.** Поточний код (`SELECT count → перевірка → INSERT` у `Serializable` + retry на `P2034`/`40001`) тримається лише на тому, що Serializable примусово створює deadlock, а retry його «розрулює». Крихко + половина обробки помилок — мертвий Postgres-код на MySQL.
3. **Гарантію «не переовербукати» дає лише Postgres**: умовний `UPDATE ... WHERE seatsTaken < capacity` + `@@id([eventId, userId])` в одній транзакції.
4. **Redis-черга** керує командою бронювання (асинхронність, backpressure, retry, серіалізація per-event).
5. **Kafka** лише транслює факти, що вже сталися (нотифікації, аналітика, вейтліст). Не на критичному шляху коректності.
6. Впроваджуємо поетапно: Фаза 0 (коректність) → 1 (Redis-черга) → 2 (Kafka + outbox) → 3 (вейтліст) → 4 (прибрати MySQL).

---

## 1. Ментальна модель: три ролі

| Роль | Хто | Навіщо |
|---|---|---|
| **Джерело істини** (скільки місць зайнято) | **Postgres** | Єдине місце ухвалення рішення «є місце / немає». Транзакція + унікальний ключ = гарантія. |
| **Command bus / черга бронювання** | **Redis (черга)** | Асинхронність, backpressure під набігом, retry з backoff, серіалізація per-event, «притримати місце на N хв». |
| **Event bus / розсилка фактів** | **Kafka** | Fan-out того, що **вже сталося**, до незалежних споживачів. НЕ на критичному шляху коректності. |

Правило: **Redis-черга керує записом, який не має переовербукати. Kafka лише транслює результат.**
Якщо Kafka лежить — бронювання працює, нотифікації просто приходять із затримкою.

---

## 2. Теорія race condition

### 2.1. Класичний TOCTOU (check-then-act)

Логіка «прочитати кількість → перевірити → вставити» має вікно між перевіркою і дією.
Два запити за останнє місце (`count = capacity − 1`):

| Крок | R1 | R2 |
|---|---|---|
| 1 | `COUNT` → `capacity−1` | |
| 2 | | `COUNT` → `capacity−1` |
| 3 | `capacity−1 < capacity` ✅ | `capacity−1 < capacity` ✅ |
| 4 | `INSERT (event, userA)` | `INSERT (event, userB)` |
| 5 | commit → `count = capacity` | commit → `count = capacity + 1` ← **овербукінг** |

Небезпека — **фантомний рядок** (phantom): `COUNT` в R1 мав би побачити вставку R2, але вона з'явилась після зчитування.

### 2.2. Рівні ізоляції

- **READ COMMITTED / REPEATABLE READ**: `SELECT COUNT(*)` — неблокуючий snapshot-read, локів на діапазон не бере. Дві вставки різних PK не конфліктують → обидві коммітяться → **овербукінг**.
- **SERIALIZABLE (Postgres, SSI)**: детектує читання-запис аномалію між транзакціями і кидає `40001 serialization_failure` (Prisma `P2034`) одній із транзакцій. З коректним retry — працює, але кожна конкурентна пара join'ів має шанс на відкат.
- **SERIALIZABLE (MySGL/InnoDB)**: `SELECT` → `LOCK IN SHARE MODE`, next-key/gap-локи → concurrent INSERT'и дають **deadlock** (`1213` → `P2034`). «Працює» через deadlock + retry.

### 2.3. Проблеми поточного коду `joinEvent`

1. **Плутанина MySQL vs Postgres**: гілка `err.meta.code === '40001'` — Postgres-only; на MySQL приходить `1213`/`1205`. `1205` (lock wait timeout → `P2024`) не ловиться → летить 500.
2. **Deadlock/serialization-конфлікт на *кожному* конкурентному join**, не лише на останньому місці.
3. **Замалий retry (3), без backoff/jitter** → під набігом користувач ловить необроблений 500.
4. **`capacity === null` → перевірки немає** (безліміт), API не розрізняє «безліміт» і «забули».
5. **Подвійний join** — теж check-then-act; `connect` на неявному M:N дає `INSERT` у `_JoinedEvents`, дубль впаде на `UNIQUE(A,B)` з `P2002` → не ловиться, 500.
6. **Serializable на всю транзакцію** штрафує спокійний неконкурентний шлях.
7. **Тести (`events.service.spec.ts`) мокають Prisma повністю** — гонки не перевіряються.

---

## 3. Цільова архітектура

```
                    ┌─────────────┐
   POST /join       │   Frontend  │◄──── WS/SSE: booking:{requestId} → confirmed|rejected
       │            └─────────────┘
       ▼
┌──────────────────────────────────────────────┐
│  backend (API)                               │
│  • auth, валідація                           │
│  • idempotency (Redis: reqId → status)       │
│  • enqueue job → Redis-черга "event-booking" │
│  • 202 Accepted { requestId }                │
└───────────────┬──────────────────────────────┘
                │  Redis queue (BullMQ / Redis Streams)
                │  job = { eventId, userId, requestId }
                ▼
┌──────────────────────────────────────────────┐
│  booking worker (у backend або окремий svc)  │
│  1. Redis lock  lock:event:{eventId}         │  ← серіалізація per-event
│  2. Redis counter  event:{id}:seats  (DECR)  │  ← швидкий fast-fail (best-effort)
│  3. Postgres TX:                              │  ← ГАРАНТІЯ:
│       INSERT EventParticipant (PK eventId,userId)
│       UPDATE Event SET seatsTaken+1           │
│         WHERE capacity IS NULL OR seatsTaken<capacity
│       INSERT outbox_events (...)              │  ← transactional outbox
│  4. update requestId → CONFIRMED|REJECTED     │
│  5. push WS/SSE                               │
└───────────────┬──────────────────────────────┘
                │  outbox relay (poller або Debezium CDC)
                ▼
        ┌───────────────┐   key = eventId (per-event ordering)
        │     Kafka     │   event.user-joined / user-left /
        │               │   booking-rejected / waitlist-promoted / ...
        └──┬────────┬───┬┘
           ▼        ▼   ▼
   notifications  analytics  waitlist
    -consumer     -consumer  -consumer
```

---

## 4. Потік бронювання (по кроках)

**Синхронна частина (мс):**

1. `POST /events/:id/join`. Guard JWT → `userId`.
2. Idempotency: `requestId = hash(userId + eventId + idempotencyKey?)`.
   `SET reqstatus:{requestId} PENDING EX 3600 NX`. Ключ уже є → віддаємо поточний статус (захист від подвійного кліку).
3. `queue.add('join', { eventId, userId, requestId }, { jobId: requestId, attempts: 5, backoff: { type: 'exponential', delay: 200 } })`.
4. Відповідь `202 Accepted { requestId, statusUrl: '/events/join-requests/{requestId}' }`.

**Асинхронна частина (worker):**

5. `RedisService.acquireLock('lock:event:' + eventId, 10_000)`. Не взяли → `throw` (BullMQ повторить job із backoff). Усі бажаючі однієї події вишиковуються без DB-контенції.
6. *(опційно)* `DECR event:{id}:seatsLeft`. Якщо `< 0` → `INCR` назад, одразу `REJECTED (full)`, Postgres не чіпаємо. Запобіжник під набігом; лічильник періодично звіряється.
7. **Postgres-транзакція (READ COMMITTED достатньо — per-event серіалізовано локом):**
   ```sql
   INSERT INTO "EventParticipant" (eventId, userId) VALUES (...);   -- дубль → 23505 → REJECTED (already joined)
   UPDATE "Event" SET "seatsTaken" = "seatsTaken" + 1
     WHERE id = :eventId AND ("capacity" IS NULL OR "seatsTaken" < "capacity");
   -- affectedRows = 0 → throw → відкат прибирає INSERT → REJECTED (full)
   INSERT INTO outbox_events (topic, key, payload) VALUES ('event.user-joined', :eventId, :json);
   ```
8. `SET reqstatus:{requestId} CONFIRMED` (або `REJECTED:<reason>`) `EX 3600`.
9. Push у WS-канал `booking:{requestId}`. Звільнити Redis-лок (`finally`).
10. **Outbox relay** (окремий цикл ~500 мс або Debezium): читає незіслані `outbox_events`, `kafkaProducer.emit(topic, { key, value })`, ставить `sentAt`.

**Клієнт** дізнається результат: WebSocket/SSE (миттєво) або polling `GET /events/join-requests/:id`.

---

## 5. Захист від овербукінгу — defense in depth

| # | Шар | Що дає | Гарантія? |
|---|---|---|---|
| 1 | Idempotency-ключ (Redis) | дедуп подвійних кліків/ретраїв | ні |
| 2 | Redis-черга + `attempts/backoff` | асинхронність, згладжування піків | ні |
| 3 | Redis-лок `lock:event:{id}` | серіалізація per-event → нуль DB-deadlock | ні (TTL, failover) |
| 4 | Redis-лічильник `seatsLeft` | миттєвий fast-fail «явно повна» | ні (best-effort, звіряється) |
| 5 | **Postgres: умовний `UPDATE ... WHERE seatsTaken < capacity` + `@@id([eventId,userId])` в одній TX** | **фактична гарантія «не більше capacity» і «не двічі»** | **ТАК** |
| 6 | Transactional outbox | Kafka-подія не губиться при краші між commit і emit | так (at-least-once) |
| 7 | Ідемпотентні consumer-и (дедуп за `eventId`) | коректність при redelivery Kafka | так |

Прибрати шари 3–4 — система все ще коректна, лише повільніша під навантаженням.

---

## 6. Kafka: топіки, ключі, групи, outbox

### 6.1. Топіки (розширення `packages/shared/src/events/event-topics.ts`)

```ts
export enum EventTopics {
  USER_JOINED       = 'event.user-joined',      // є
  USER_LEFT         = 'event.user-left',         // є
  EVENT_CREATED     = 'event.created',           // є
  EVENT_DELETED     = 'event.deleted',           // є
  BOOKING_REJECTED  = 'event.booking-rejected',  // нове: full|closed — сигнал попиту + лист "місць немає"
  WAITLIST_JOINED   = 'event.waitlist-joined',   // нове
  WAITLIST_PROMOTED = 'event.waitlist-promoted', // нове: місце звільнилось → підняли наступного
  CAPACITY_CHANGED  = 'event.capacity-changed',  // нове: організатор збільшив ліміт → злити вейтліст
}
```

### 6.2. Ключ повідомлення = `eventId` (обов'язково)

Kafka гарантує порядок у межах партиції, партиція визначається ключем. Без ключа `user-left` може обігнати `user-joined`.
`KafkaProducerService.emit` треба розширити: `emit(topic, payload, key)`.

### 6.3. Consumer groups (уже правильно закладено)

Кожен сервіс — своя група: `notifications-consumer`, `analytics-consumer`, `+ waitlist-consumer`.
Одне повідомлення обробляють усі групи; всередині групи — один інстанс. Масштабування читача = більше інстансів (до кількості партицій).

### 6.4. Transactional Outbox — чому не «commit + emit»

Наївне «зберегли в Postgres, потім `producer.emit`»: краш між рядками → учасник у БД є, події в Kafka немає.
Outbox: рядок у `outbox_events` пишеться **тією ж транзакцією**; relay його публікує та ставить `sentAt`.
At-least-once → всі consumer-и ідемпотентні (дедуп за `payload.eventId` + тип, або окремий id повідомлення).

```prisma
model OutboxEvent {
  id        String    @id @default(cuid())
  topic     String
  key       String                    // eventId
  payload   Json
  createdAt DateTime  @default(now())
  sentAt    DateTime?
  @@index([sentAt, createdAt])
}
```

Relay v1 — поллер у backend (`SELECT ... WHERE sentAt IS NULL ORDER BY createdAt LIMIT 100 FOR UPDATE SKIP LOCKED`).
Relay v2 — Debezium CDC.

---

## 7. Декомпозиція мікросервісів

### 7.1. Зараз (Фаза 1): booking всередині `backend`

- `backend` = API + booking worker (той самий процес або `MODE=worker`) + outbox relay.
- `analytics-service`, `notifications-service` — **додати в `docker-compose.yml`** (зараз їх там немає).
- Причина: booking тісно зв'язаний з `Event`/`EventParticipant`. Виносити зарано.

### 7.2. Потім (Фаза 3, за потреби): окремий `booking-service`

- Володіє `Event`, `EventParticipant`, `Waitlist`, `OutboxEvent`, лічильниками.
- `backend` → API-gateway: `POST /join` проксі в чергу; читання подій — синхронний виклик або CQRS read-модель з Kafka.
- Шов уже зараз: уся логіка місткості в одному `BookingService` + черзі `event-booking`.

### 7.3. Роль сервісів

| Сервіс | Транспорт | Відповідальність |
|---|---|---|
| `backend` | HTTP | auth, CRUD подій, приймання команд, WS-пуш статусів, (Фаза 1) booking worker + outbox relay |
| `booking-service` *(Фаза 3)* | Redis queue + Kafka | вся логіка місткості, вейтліст, притримання місць |
| `notifications-service` | Kafka consumer | лист/пуш організатору про join, користувачу про rejected/promoted |
| `analytics-service` | Kafka consumer | лічильники join/leave, «попит > місткість», воронка |
| `waitlist-service` *(або логіка в booking)* | Kafka consumer + Redis | на `user-left`/`capacity-changed` → підняти наступного, enqueue join |

---

## 8. Режими відмови

| Відмова | Наслідок | Лікування |
|---|---|---|
| Redis лежить (черга) | не приймаються нові бронювання | API → `503`; дані Postgres цілі; Redis з AOF everysec відновиться |
| Redis-лок протух під час довгої TX | дві job-и для однієї події паралельно | шар 5 (Postgres) не дасть овербук; лок — лише оптимізація |
| Redis-лічильник розійшовся з Postgres | fast-fail помиляється | шар 5 — фінальний арбітр; звіряння `seatsLeft = capacity - COUNT(*)` раз на N хв + на кожен `user-left` |
| Worker помер після commit, до WS-пушу | клієнт не бачить статусу | статус у Redis уже `CONFIRMED`; клієнт добере через polling |
| Worker помер між commit і `reqstatus` | job повернеться в чергу | INSERT впаде на PK → `23505` → трактуємо як `CONFIRMED` (ідемпотентно) |
| Kafka лежить | outbox накопичується | бронювання працює; relay дошле; consumer-и ідемпотентні |
| Дубль у Kafka | подвійна нотифікація / +1 в аналітиці | дедуп за id повідомлення (таблиця `processed_messages` або Redis `SET NX`) |
| Prisma `P2028` (TX timeout) | job впав | TX коротка (3 statement), per-event серіалізовано → BullMQ повторить |

---

## 9. Поетапний план

### Фаза 0 — фундамент коректності (без черги, без Kafka)

- [ ] Явний зв'язок: `EventParticipant { @@id([eventId, userId]) }` + `Event.seatsTaken Int @default(0)`.
- [ ] Міграція + backfill `seatsTaken`.
- [ ] `joinEvent`/`leaveEvent` → умовний `UPDATE ... WHERE seatsTaken < capacity` в TX; catch `23505`/`P2002` → `ConflictException`.
- [ ] `PrismaExceptionFilter`: Prisma-помилки → 409/503, ніколи не 500.
- [ ] Інтеграційний тест: `capacity=1`, N паралельних `joinEvent` → рівно 1 переможець + N−1 чистих 409.
- [ ] Прибрати `isolationLevel: 'Serializable'` + retry-цикл із `40001`.

> **Після Фази 0 race condition усунено повністю.** Далі — про масштаб і decoupling.

### Фаза 1 — Redis-черга

- [x] `bullmq` + `@nestjs/bullmq`; черга `event-booking`; worker з `RedisService.acquireLock` per-event. ✅ (2026-09-09)
- [x] `POST /join` → enqueue + `202`; `GET /events/join-requests/:id`. ✅ (2026-09-09)
- [ ] WS-канал `booking:{requestId}` — **не зроблено**, клієнт зараз лише polling'ом (`GET join-requests/:id` кожні 400мс, timeout 15с). Окрема, більша задача (gateway + socket.io + фронтенд); polling — повноцінна, робоча реалізація асинхронного флоу сама по собі.
- [x] Idempotency-ключ від клієнта. ✅ (2026-09-10) `POST /join` приймає заголовок `Idempotency-Key` (8–200 символів). Є ключ → `requestId = sha256(userId : eventId : key)` — детермінований, тож retry/подвійний сабміт мапиться в ту саму job і той самий кешований результат; хеш зі `userId` робить id невгадуваним і не дає ключу одного клієнта зіткнутися з ключем іншого. Немає ключа → `randomUUID()` як раніше (зворотна сумісність). `enqueueJoin` перевіряє `BookingStatusService.getStatus(requestId)` перед `queue.add` — уже бачили цей ключ → віддаємо `requestId` без повторної постановки; конкурентна гонка нешкідлива (`jobId: requestId` — власний dedupe BullMQ, `setPending` ідемпотентний). Фронтенд `eventsApi.ts`: `Map<eventId, key>` тримає один ключ на подію, поки join «в польоті» (очищається у `finally`), тож подвійний клік/ремоунт мапиться в ту саму job.
  Первісний план був `hash(userId+eventId)` **без** клієнтського ключа — відкинуто: збігався б для легітимного повторного join після leave в межах 1-год TTL статусу і повертав би застарілий результат. Клієнтський ключ це знімає (кожна нова дія користувача → новий UUID).
- [ ] Redis-лічильник `seatsLeft` + звіряння — **опційний fast-fail, пропущено**. Захисна оптимізація під навантаженням, не потрібна для коректності (Postgres — фінальний арбітр).
- [x] `RedisModule` підключити в `AppModule`. ✅ (2026-09-09)
- [x] Live smoke-тест: `apps/backend/scripts/smoke-booking.ts` (`pnpm --filter backend smoke:booking`). ✅ написано (2026-09-10), ✅ **прогнано наживо (2026-09-11)** — див. Крок 7 нижче (знадобився дрібний фікс самого скрипта, не логіки бронювання). Піднімає справжній `AppModule` як application context (весь пайплайн без HTTP): BullMQ enqueue на Redis → `@Processor` worker → per-event Redis-лок → `EventsService.joinEvent` на Postgres → читання статусу. Перевіряє: N конкурентних join'ів на подію з `capacity=1` → рівно 1 CONFIRMED, N−1 REJECTED, `seatsTaken===1`, 1 рядок учасника; + подвійний enqueue з тим самим `Idempotency-Key` → один `requestId`, одне місце.

**Реалізація (2026-09-09):** `apps/backend/src/booking/` — `booking.module.ts` (`@Global()`, як `RedisModule`/`KafkaModule`, щоб `EventsController` міг інжектити чергу без циклічного імпорту; реєструє `BullModule.registerQueue({name: 'event-booking'})` + імпортує `EventsModule`), `booking-queue.service.ts` (enqueue + `BookingStatusService.setPending` перед `queue.add`), `booking.processor.ts` (`@Processor('event-booking')` / `WorkerHost`: `RedisService.acquireLock` → якщо не взяли лок, кидає — BullMQ ретраїть job з backoff; інакше викликає `EventsService.joinEvent`, пише `CONFIRMED`/`REJECTED` у статус, **не перекидає помилку далі** — "подія повна"/"вже учасник" не транзієнтні, ретраїти нема сенсу — і завжди звільняє лок у `finally`), `booking-status.service.ts` (Redis `reqstatus:{requestId}`, TTL 3600с). `EventsModule` тепер `exports: [EventsService]` (треба для `BookingModule`). `EventsController.join` → `202 {requestId, statusUrl}`; новий `GET join-requests/:requestId` (розміщений **до** `@Get(':id')`, як і існуючий `me/calendar`, — інакше `:id` перехопив би `join-requests` як параметр). `docker-compose.yml`: `x-backend-env-common` не мав `REDIS_HOST`/`REDIS_PORT` — додано (без цього `RedisService` в контейнері намагався б `localhost`, а не сервіс `redis`). Фронтенд `eventsApi.ts`: `joinEvent` — тепер `queryFn`, що POST-ить (enqueue), потім поллить `join-requests/:requestId` кожні 400мс/timeout 15с; `EventDetailsPage.tsx` вже мав `isJoining` з `mutation.isLoading` — покриває весь час polling без змін.

Юніт-тести: `booking-status.service.spec.ts`, `booking-queue.service.spec.ts`, `booking.processor.spec.ts` (48 зелених у сумі по бекенду станом на 2026-09-10). У двох специ довелось замокати `@nestjs/bullmq` (`InjectQueue`/`Processor`/`WorkerHost`) — пакет ESM-only без CJS-збірки, Jest-овий CJS module loader не вміє його `require()`; це проблема лише тест-раннера, у справжньому Node 22.12 `require(esm)` синхронний і працює нативно. `nest build` компілюється чисто.

**Оновлення 2026-09-10 — виправлено `create()`:** `EventsService.create` завжди `connect`-ить автора учасником, але не ставив `seatsTaken` → нова подія мала `seatsTaken=0` при 1 учаснику, тобто приймала б `capacity+1` людей. Тепер `create` пише `seatsTaken: 1`; `seed.ts` `event-private` вирівняно (додано `connect` автора + `seatsTaken: 1`). Backfill наявних подій уже коректний — рахує рядки `_JoinedEvents`, які включають автора.

**Фронтенд `tsc -b`:** на HEAD було 2 помилки, НЕ з роботи по чергах (підтверджено `git stash`) — обидві виправлено у Фазі 2: невживаний імпорт `EventResponse` в `EventDetailsPage.tsx` прибрано; `event-topics.ts` `enum`→`as const` зняло конфлікт з `erasableSyntaxOnly`. Тепер `tsc -b` чистий.

**Не перевірено наживо:** Docker Desktop не запущений у цьому середовищі, тож реальний прогін (`smoke:booking`) через живий Redis+Postgres не підтверджено — тільки компіляція + мок-юніт-тести.

### Фаза 2 — Kafka event bus + outbox ✅ (код готовий 2026-09-10, наживо не прогнано)

- [x] `OutboxEvent` модель + relay-поллер. `apps/backend/prisma/schema.prisma` + міграція `20260910000000_add_outbox_event`; `apps/backend/src/outbox/outbox-relay.service.ts` (`setTimeout`-цикл 1с, batch 50, `sentAt` тільки після acku брокера — at-least-once; зупиняє батч на першій помилці, щоб не ламати порядок; `OUTBOX_RELAY_DISABLED=true` вимикає). **Без FK на `Event`** — рядок `event.deleted` мусить пережити подію.
- [x] Розширити `EventTopics`; `emit(topic, payload, key)`. `EventTopics`: `enum` → `as const` об'єкт (заодно прибрало помилку `erasableSyntaxOnly` на фронті) + `DomainEventMeta { messageId, occurredAt }` у кожному payload (`messageId` = id рядка outbox, для дедупу консюмером). `KafkaProducerService.emit(topic, payload, key?)` → `{ key, value }`, `await lastValueFrom(...)` (резолвиться після acku), `onModuleInit` не кидає на холодному брокері (§8).
- [x] `KafkaModule` + `OutboxModule` підключено в `AppModule`.
- [x] `analytics-service` + `notifications-service` у `docker-compose.yml` (завжди, без профілю, як redis/kafka; `depends_on: kafka healthy`). `kafka` отримав повний KRaft-конфіг (два лісенери: `PLAINTEXT://kafka:9092` внутрішній, `PLAINTEXT_HOST://localhost:29092` для хоста) + healthcheck. **Було зламано:** обидва сервіси не збиралися (`nest build` — 9 помилок TS1241) бо в їх `tsconfig.json` не було `experimentalDecorators`/`emitDecoratorMetadata` — додано (як у backend). Прибрано мертвий Hello-World scaffold (`app.controller`/`app.service`/специ/e2e).
- [x] Consumer-и: `AnalyticsService`/`NotificationsService` мають дедуп через `SeenMessages` (in-memory bounded set по `messageId`) — process-local, після рестарту переобробка; коли з'явиться реальний запис, перенести в Redis `SET NX`/таблицю. Досі лише логують. `analytics` тепер слухає ще й `EVENT_DELETED`; `notifications` — ще й `USER_LEFT`.
- [x] Outbox-рядки пишуться в **тій самій транзакції** що й зміна стану: `create` (EVENT_CREATED), `joinEvent` (USER_JOINED), `leaveEvent` (USER_LEFT), `remove` (EVENT_DELETED) — усі загорнуті в `$transaction`.

**Не в цій фазі (свідомо):** `BOOKING_REJECTED` (rejection не є зміною стану БД — не через outbox; кандидат на best-effort emit із `BookingProcessor`); `FOR UPDATE SKIP LOCKED` у relay (потрібен лише при >1 інстансі backend); Debezium CDC.

**Dockerfile fix (2026-09-10):** усі 4 `Dockerfile` копіювали лише свій + `shared/package.json` перед `pnpm install --frozen-lockfile` — а воркспейс має 6 пакетів (+`apps/backend`, `apps/frontend`, `apps/notifications-service`, `packages/eslint-rules` — останній root devDep). `--frozen-lockfile` не міг звірити lockfile → `... is missing from pnpm-lock.yaml`, збірка `notifications-service`/`analytics-service` падала. Латентний баг, вилазить бо сервіси вперше збираються в compose. Тепер копіюються всі 6 маніфестів (образи більші — повний monorepo-install; оптимізувати `pnpm deploy` пізніше). Далі вилізло `ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE` — `npm install -g pnpm` тягнув latest (12.x), а `packageManager` у root = `pnpm@10.30.2` → pnpm намагався верифікувати `@pnpm/exe`. Фікс: `npm install -g pnpm@10.30.2` у всіх Dockerfile + `manage-package-manager-versions=false` у `.npmrc`. Потім `kafka` падав: `advertised.listeners cannot use the nonroutable meta-address 0.0.0.0` — образ `apache/kafka` під час storage-format кроку бере `advertised.listeners` з `KAFKA_LISTENERS`, а там був літеральний `0.0.0.0`. Фікс: `KAFKA_LISTENERS` через порожній хост (`CONTROLLER://:9093,PLAINTEXT://:9092,PLAINTEXT_HOST://:29092`). `.env` створено локально (gitignored) з dev-значеннями. Далі: `backend-init` падав з exit 127 (`entrypoint.sh: line 3: : not found`) — CRLF від Windows-checkout; фікс: перевів `entrypoint.sh` у LF + `.gitattributes` (`*.sh eol=lf`) + `sed -i 's/\r$//'` у backend Dockerfile. І консюмери крешились на старті (`This server does not host this topic-partition` — гонка з lazy auto-create топіків, kafkajs не відновлюється); фікс: `kafka-init` (one-shot, `kafka-topics.sh --create` для 4 топіків) + консюмери `depends_on kafka-init` + `restart: on-failure` + kafkajs `retry` у `main.ts`.

**Перевірка:** unit — `outbox-relay.service.spec.ts`, `kafka-producer.service.spec.ts`, outbox-асерти в `events.service.spec.ts` (57 зелених разом). `smoke-booking.ts` крок [3] перевіряє написання outbox-рядка; `SMOKE_KAFKA=1` + брокер — чекає `sentAt`. **Наживо не прогнано** — тут немає Docker; але `docker compose config` валідний і `pnpm install --frozen-lockfile` у змодельованому build-контексті проходить.

### Фаза 3 — вейтліст (+ за потреби окремий `booking-service`)

- [ ] Redis sorted-set `waitlist:{eventId}` (score = timestamp).
- [ ] На `event.user-left` → підняти першого → enqueue join → `event.waitlist-promoted`.
- [ ] `event.capacity-changed` → злити вейтліст.

### Фаза 4 — прибрати MySQL

- [ ] Видалити `--profile mysql`, `DB_PROVIDER`, гілки в `entrypoint.sh`.
- [ ] Зафіксувати `provider = "postgresql"`.
- [ ] Увімкнути Postgres-специфічне: `FOR UPDATE SKIP LOCKED` для relay, partial indexes.

---

## 10. Конкретні перші зміни в коді

1. `apps/backend/prisma/schema.prisma` — `EventParticipant`, `Event.seatsTaken`, `OutboxEvent`; міграція + backfill.
2. `apps/backend/src/events/events.service.ts` — переписати `joinEvent`/`leaveEvent` на умовний write (Фаза 0).
3. `apps/backend/src/common/filters/prisma-exception.filter.ts` — новий.
4. `apps/backend/src/app.module.ts` — підключити `RedisModule`, `KafkaModule`, `BullModule`.
5. `apps/backend/src/redis/redis.service.ts` — додати `acquireLockWithRetry(key, ttl, timeout)`.
6. `apps/backend/src/booking/` — новий модуль: `booking.queue.ts`, `booking.processor.ts`, `booking-status.service.ts`.
7. `apps/backend/src/kafka/kafka-producer.service.ts` — `emit(topic, payload, key)`.
8. `apps/backend/src/outbox/outbox-relay.service.ts` — новий.
9. `packages/shared/src/events/event-topics.ts` — нові топіки + payload-інтерфейси.
10. `docker-compose.yml` — сервіси `analytics-service`, `notifications-service`; Redis з `--appendonly yes`.

---

## 11. Довідка: чому не інші варіанти

| Варіант | Чому відхилено як основний |
|---|---|
| Тільки `SELECT ... FOR UPDATE` на рядку `Event` | Коректно і найпростіше, але серіалізує всі join'и до події та не дає decoupling. Годиться як Фаза 0-alt, якщо не хочемо `seatsTaken`. |
| Тільки Serializable + кращий retry | Пластир: лишається податок на відкати; не вирішує decoupling. |
| Redis як джерело істини (лічильник) | Redis стає SoT → потрібна сильна persistence, звіряння, складні failure-режими. Лишаємо як cache (шар 4). |
| Kafka для самої команди бронювання (партиція = eventId) | Працює (природна серіалізація), але немає зручних per-job retry/delay/DLQ як у BullMQ; rebalance-паузи; «відповідь на конкретний запит» складніша. |
| Redlock (N нод) | Важче, і все одно не гарантія без DB-backstop. Для соло-проєкту — single-node Redis-лок + шар 5 достатньо. |

---

## 12. Як відновити контекст роботи

- **Сесія Claude Code**: `cd D:\Projects\SyncEvent && claude -r` → вибрати потрібну розмову.
- **Продовжити останню**: `claude -c`.
- **Пам'ять Claude**: `memory/booking-concurrency-design.md` — покажчик на цей документ, підвантажується автоматично навіть у новій сесії.
- **Цей документ** — джерело істини для рішення; оновлювати при зміні плану.

---

## 13. Покроковий план: оновлення приєднання учасника до події (Фаза 0)

> Мета цієї фази — **повністю прибрати race condition** у `joinEvent`/`leaveEvent`
> без Redis-черги і без Kafka. Дрібні, окремо-мерджабельні кроки; після кожного
> проєкт компілюється і тести зелені.
>
> Зауваги по інфраструктурі:
> - **Оновлено 2026-09-11:** репозиторій тепер закомічено з `provider = "postgresql"`
>   напряму (раніше — `mysql`, історичний артефакт зі старту проєкту, який ламав кожен
>   host-side скрипт: `DATABASE_URL` не збігалась із заявленим провайдером без ручного
>   `check-db.js` наперед). `check-db.js` більше не потрібен для звичайного Postgres-шляху —
>   він і далі підміняє провайдер + теку `migrations/`, але **лише коли явно попросили
>   MySQL** (`DB_PROVIDER=mysql`); без `DB_PROVIDER` дефолт тепер `postgresql`, що збігається
>   з тим, що вже закомічено. Цільовий провайдер — PostgreSQL (`migration_lock.toml` і так уже
>   був `postgresql`), тому SQL міграцій і далі пишемо під Postgres.
> - Контейнер застосовує схему через **`prisma db push`**, а не `migrate deploy`.
>   `db push` додасть нову колонку з дефолтом, але **не виконає backfill** із файлу
>   міграції. Для наявних даних backfill треба або запустити вручну (SQL нижче), або
>   перевести init-крок на `prisma migrate deploy`. На чистій БД + seed питання немає.

### Крок 1 — денормалізований лічильник `Event.seatsTaken` ✅ (зроблено)

Аддитивна зміна схеми, **без зміни поведінки**. Це фундамент для умовного
`UPDATE ... WHERE seatsTaken < capacity` у кроці 2.

- `prisma/schema.prisma`: `Event.seatsTaken Int @default(0)`.
- `prisma/migrations/20260908000000_add_event_seats_taken/migration.sql`: `ADD COLUMN`
  + backfill із неявної join-таблиці `_JoinedEvents` (`A` = eventId, `B` = userId).
- `prisma/seed.ts`: проставлено `seatsTaken` для сідованих подій (консистентність із `participants`).
- Код сервісу поки не чіпаємо; існуючі unit-тести проходять без змін.
- Ручний backfill (якщо БД уже має дані і застосування йде через `db push`):
  ```sql
  UPDATE "Event" e
  SET "seatsTaken" = sub.cnt
  FROM (SELECT "A" AS event_id, COUNT(*)::int AS cnt FROM "_JoinedEvents" GROUP BY "A") sub
  WHERE e.id = sub.event_id;
  ```

### Крок 2 — переписати `joinEvent` на умовний запис у транзакції ✅ (зроблено 2026-09-09)

Прибрано `maxRetries`, `for`-цикл, `isolationLevel: 'Serializable'`, гілку `P2034/40001`,
імпорт `Prisma`. `BadRequestException` для join → `ConflictException` (409).

Реалізована логіка (`this.prisma.$transaction`, Read Committed) — **порядок відрізняється
від початкового ескізу**: неявний `connect` у Prisma ідемпотентний (не кидає `P2002` на
дублі), тож захист «не двічі» винесено в `WHERE` самого інкремента, а не в окремий `connect`:

1. **Один** умовний `updateMany` (Prisma field reference, Prisma 6):
   ```ts
   const { count } = await tx.event.updateMany({
     where: {
       id: eventId,
       participants: { none: { id: userId } },            // ще не учасник
       OR: [{ capacity: null }, { seatsTaken: { lt: this.prisma.event.fields.capacity } }],
     },
     data: { seatsTaken: { increment: 1 } },
   });
   ```
   Паралельні join'и серіалізуються на рядковому локі `Event`; другий за останнім
   місцем перечитує рядок → `seatsTaken === capacity` → `count === 0`.
2. `count === 0` → дешеве читання `findUnique` (`select: participants where id=userId`):
   немає події → `NotFoundException`; є членство → `ConflictException('You are already a participant')`;
   інакше → `ConflictException('Event is full')`.
3. Інакше — `tx.event.update({ … connect …, include: { _count } })` останньою дією
   (кидок до цього відкотив би інкремент).

Залишковий ризик: **абсолютно одночасні** два запити того самого користувача можуть
пере-інкрементити `seatsTaken` на 1 (складений PK `_JoinedEvents` не дасть дублю членства,
але EPQ-перевірка підзапиду `participants: { none }` може не побачити щойно закоммічений
рядок). Це self-inflicted дрейф лічильника одного юзера, не овербукінг інших.

**Закрито на рівні Redis-черги (2026-09-11):** `pending-join:{eventId}:{userId}` — claim
через `RedisService.setIfAbsent` (`SET key value EX ttl NX GET`) у `BookingQueueService.
enqueueJoin`, незалежно від того, чи клієнт надіслав `Idempotency-Key`. Перший виклик
захоплює слот і ставить job у чергу; будь-який інший виклик для того самого `(eventId,
userId)`, поки перший ще не осів (CONFIRMED/REJECTED), отримує назад **той самий**
`requestId` замість того, щоб ставити другу job — тож на цей `(eventId, userId)` у черзі
ніколи не буває двох одночасних job, і другий `joinEvent` просто не стається. `Booking
Processor` знімає claim у `finally` (compare-and-delete через `releaseLock`) одразу після
запису фінального статусу; TTL 60с — запобіжник, якщо воркер впаде до `finally` (див.
`PENDING_JOIN_TTL_SECONDS`). Залишається живим лише для прямих викликів `EventsService.
joinEvent`, що обходять чергу (не HTTP-шлях; на нього і покладена ціль цього шару) —
явна модель `EventParticipant` (див. «Місток у наступні фази») закриє й цей випадок повністю.

Тести: unit-кейси retry/serialization видалено; додано моки `updateMany` (`{ count }`),
`event.fields`, перевірку `where` умовного інкремента, кейси 409. `pnpm --filter backend test` — 25 зелених.
README (розділи *Event-driven services* / *Testing*) і `@ApiResponse` контролера оновлено (400 → 404/409).

### Крок 3 — `leaveEvent` симетрично ✅ (зроблено 2026-09-09)

Транзакція:
1. `SELECT id FROM "Event" WHERE id = ... FOR UPDATE` — лочить рядок `Event`,
   серіалізує конкурентні join/leave на цій же події (як і `updateMany` в `joinEvent`).
2. Перевірка через Prisma Client (`event.findUnique` з `participants: { where: { id: userId } }`):
   404 якщо події нема, 403 якщо автор, 409 якщо не учасник.
3. `disconnect` через `tx.event.update(...)` (Prisma Client, не сирий SQL).
4. `UPDATE "Event" SET "seatsTaken" = GREATEST("seatsTaken" - 1, 0) WHERE id = ...`.
5. Автор події не може вийти зі своєї події — вирішено (2026-09-09): перевірка `authorId === userId`.

**Ревʼю-фікс (2026-09-09):** початкова версія робила `DELETE FROM "_JoinedEvents" WHERE "A" = eventId AND "B" = userId` напряму — але `"A"`/`"B"` для неявної M:N-таблиці Prisma призначає за алфавітним порядком назв моделей, це недокументована внутрішня деталь, не публічний контракт. Перейменування моделі (`Event`→щось після `User` за алфавітом, або навпаки) тихо міняє місцями колонки без жодної помилки компіляції — TS не бачить семантику всередині raw-SQL-темплейту. Замінено на лок рядка `Event` (наша модель, видима назва) + перевірку/`disconnect` через Prisma Client API, який сам знає актуальне мапування `A`/`B`. Raw SQL лишився лише для `"Event"`/`"seatsTaken"` — наших власних, явних імен.

### Крок 4 — `PrismaExceptionFilter` ✅ (зроблено 2026-09-09)

`apps/backend/src/common/filters/prisma-exception.filter.ts`, `@Catch(Prisma.PrismaClientKnownRequestError)`,
зареєстрований глобально в `main.ts` поруч із `HttpExceptionFilter`:
`P2002` → 409, `P2025` → 404, `P2024/P2028/P2034` → 503, решта → 500 + `Logger.error` (стек тільки в лог).
Клієнту завжди йде безпечне повідомлення з мапи `MESSAGE_BY_CODE`, сирий `exception.message` (може містити
назви таблиць/колонок) ніколи не потрапляє у відповідь. Прибирає 500-ки з «сирих» Prisma-помилок на всьому
API, не лише в join/leave. Юніт-тести — `prisma-exception.filter.spec.ts` (7 кейсів, мок `ArgumentsHost` без
підняття Nest-додатку).

### Крок 5 — тести

- **Unit** (`events.service.spec.ts`): прибрати кейси retry/serialization; додати моки `updateMany`
  (повертає `{ count }`) і перевірку `where` умовного апдейту; кейси «повна» → 409, «вже учасник» → 409.
- **Інтеграційний** (реальний Postgres — testcontainers або compose test-БД): `capacity = 1`,
  `Promise.allSettled` з N паралельних `joinEvent` → рівно 1 fulfilled, N−1 `ConflictException`,
  `seatsTaken === 1`, рядків у `_JoinedEvents` === 1. Це і є доказ усунення гонки.

### Крок 6 — прибрати мертвий код ✅ (зроблено разом із кроком 2)

Видалено імпорт `Prisma` та коментарі про `40001` в `events.service.ts`; README-абзац
про «Serializable + bounded retry» оновлено на новий підхід (+ посилання на цей документ).

> Після кроків 1–6 гонку усунено. Далі — Фаза 1 (Redis-черга) за розділом 9.

### Крок 7 — наживо підтверджено (2026-09-11)

Docker Desktop піднято вперше в цьому середовищі; `docker compose up -d --build` пройшов
без правок compose/Dockerfile. Послідовність зі §3.1 підтвердилась 1:1: `kafka` → healthy,
`kafka-init` створив 4 топіки й вийшов 0, `backend-init` (`db push`, схема вже в синку) вийшов 0,
`backend`/`analytics-service`/`notifications-service` стартували. Разове `The group coordinator
is not available` на консюмерах при старті (проблема #3 у §2) — самозникло за ~1с, обидві групи
приєднались і отримали партиції.

**Знайдено і виправлено:** `apps/backend/scripts/smoke-booking.ts` не запускався — `await
import('../src/app.module.js')` (та інші відносні `.js`-імпорти) падали з `Cannot find module
…app.module.js`. Причина: ts-node виконує файл у CommonJS-режимі; NodeNext-стиль (`.js` у
відносному імпорті, що вказує на `.ts`-джерело) резолвиться в `.js`→`.ts` лише під ESM-лоадером
ts-node (`--esm`), а динамічний `import()` навіть із CJS-файлу йде через нативний ESM-резолвер
Node — жодного мапування розширень нема, тому шукає буквально `app.module.js`, якого на диску
нема (лише `.ts`, компіляції не було). Фікс: замінено на `require(...)` без розширення
(`require('../src/app.module')`) — CJS `require` для екстеншн-less шляху перебирає розширення
з `Module._extensions`, куди ts-node зареєстрював `.ts`; виклик лишився всередині `main()`,
тож env-змінні (`JWT_SECRET`, `OUTBOX_RELAY_DISABLED`) виставляються до першого імпорту, як і
раніше.

Прогнано (з хоста, `apps/backend`, після `DB_PROVIDER=postgresql node scripts/check-db.js` +
`prisma generate` + `prisma db push` проти `localhost:5432`):
- `pnpm smoke:booking` — 5 конкурентних join на capacity=1: 1 CONFIRMED + 4 REJECTED
  (`Event is full`), `seatsTaken===1`, 1 рядок участі; ідемпотентний повторний enqueue з тим
  самим ключем → той самий `requestId`, одне місце; outbox-рядок записано.
  Цікавий побічний ефект: `sentAt` виявився проставленим ще до перевірки `SMOKE_KAFKA` —
  бо паралельно працював **живий** контейнер `backend` (той самий Postgres!), і його
  реальний outbox-relay (з робочим Kafka-конекшеном усередині compose-мережі) забрав і
  опублікував рядок сам. Непряме, але зайве підтвердження relay на живих даних.
- `SMOKE_KAFKA=1 KAFKA_BROKER=localhost:29092 pnpm smoke:booking` — самодостатній прогін:
  той самий результат + explicit "waiting for the relay… published, sentAt=…".
- `pnpm test:e2e` (`booking-concurrency.e2e-spec.ts`, той самий Postgres) — 1/1 passed:
  пряме підтвердження, що `EventsService.joinEvent` не овербукає під конкуренцією, в обхід черги.
- Наскрізний доказ Фази 2 через `docker compose logs`: `analytics-service` й
  `notifications-service` залогували той самий `[analytics] join: {...}` /
  `User … joined event …` для join'а зі смоук-тесту — enqueue → worker → Postgres → outbox →
  Kafka → обидва консюмери підтверджено на живих контейнерах.

**Висновок:** Фази 0–2 підтверджено наживо повністю, збігається з планом §3.1 без додаткових
compose/Dockerfile правок. Єдина знайдена жива проблема — сам смоук-скрипт (вище). Working tree
все ще не закомічено (наступний пункт §3 — review + commit).

### Місток у наступні фази (не в цій)

Явна модель `EventParticipant { @@id([eventId, userId]) }` (замість неявного M:N) —
коли знадобляться `OutboxEvent`, вейтліст або метадані участі (`joinedAt`, `role`, `status`).
Тоді: окрема міграція, `connect/disconnect` → `create/delete`, оновлення
`findAll`/`findOne`/`findMyCalendar`/`seed`. Неявна таблиця `_JoinedEvents` уже має
складений PK, тож захист «не двічі» на рівні БД працює вже зараз.
