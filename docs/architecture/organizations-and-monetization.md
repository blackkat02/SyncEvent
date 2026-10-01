# Організації, приватність, шахова специфіка і монетизація

> Статус: **проєкт рішення** (draft, для подальшого аналізу). Соло-проєкт, автор — Borys.
> Останнє оновлення: 2026-09-30 (аналіз практик платформ, доменна модель, ескіз Prisma,
> флоу реєстрації з оплатою; код не почато, рішення в §14 ще відкриті).
> Пов'язаний код: `apps/backend/prisma/schema.prisma` (`Event`, `EventParticipant`, `Visibility`,
> `ParticipantStatus`), `apps/backend/src/events/events.service.ts` (`findAll`, `joinEvent`,
> `leaveEvent`), `packages/shared/src/schemas/event.schema.ts` (`EventVisibility`),
> `packages/shared/src/events/event-topics.ts`, `apps/backend/src/outbox/`,
> `apps/backend/src/scheduled-tasks/`.
> Пов'язані документи: `booking-concurrency.md` (атомарне резервування місць, outbox),
> `chess-multiplayer.md` (Tournament/Round/Pairing/Game, рейтинг у Python),
> `scheduled-tasks-worker.md` (BullMQ — таймаути hold-ів).

---

## 0. TL;DR / рішення

1. **Доступ до івенту — три незалежні осі, а не один enum:** `visibility` (чи є в пошуку),
   `joinPolicy` (як потрапити: одразу / зі схваленням / за інвайтом), `audience` (кому взагалі
   дозволено: всім / членам організації). Поточний `Visibility.PRIVATE` зливає їх в одне і
   фактично означає лише «сховати від анонімів».
2. **Налаштування приватності — поля на `Event`, не окрема таблиця 1:1.** Окремі таблиці — лише
   для записів «на людину» (інвайти, заявки) і для правил, яких буває кілька (`EntryCondition`).
3. **`Organization` — нова базова сутність** (клуб / федерація / школа / спільнота) з
   `Membership` і ролями. Групи, клуби й команди стоять на ній; вона ж — майбутній отримувач грошей.
4. **Шахова специфіка — окремий шар поверх загального:** `PlayerProfile` (FIDE ID, титул),
   `Rating` (пули: внутрішні Glicko-2 + зовнішні FIDE/національний), `EntryCondition`
   (рейтинг, вік, членство — як у Lichess), `Team` для командних турнірів.
5. **Під монетизацію закладаємо форму даних зараз, платежі — пізніше:** `TicketType` з ціною
   (0 = безкоштовно), гроші як `Int` у мінімальних одиницях + `currency`, статуси реєстрації
   `PENDING_APPROVAL` / `PENDING_PAYMENT`, hold місця з `holdExpiresAt`.
6. **Гроші організаторів не проходять через платформу на старті:** організація підключає
   **власний** мерчант-акаунт (WayForPay / LiqPay / monobank), платформа заробляє на
   підписках. Маркетплейс з комісією і виплатами — окреме рішення пізніше (юридично важке).
7. **Коректність місць лишається за Postgres** (`booking-concurrency.md`): схвалення заявки й
   hold під оплату йдуть тим самим умовним `UPDATE seatsTaken`. Kafka лише транслює факти.
8. Поетапно: Фаза 0 (осі доступу) → 1 (організації) → 2 (заявки/approval) → 3 (шаховий профіль
   і умови) → 4 (типи квитків, hold) → 5 (платежі) → 6 (підписки/entitlements) → 7 (команди).

---

## 1. Поточний стан (що вже є)

| Що | Де | Значення для цього документа |
|---|---|---|
| `enum Visibility { PUBLIC PRIVATE }` | `schema.prisma`, дублюється як `EventVisibility` у `packages/shared` | ❗ Семантика нечітка — див. нижче |
| Фільтр у списку | `events.service.ts` `findAll`: `currentUserId ? {} : { visibility: PUBLIC }` | Залогінений бачить **усе**, включно з PRIVATE; анонім — лише PUBLIC. Приєднання до PRIVATE нічим не обмежене |
| `EventParticipant` з `@@id([eventId, userId])`, `status: CONFIRMED \| WAITLISTED` | `schema.prisma` | Основа для `Registration`; PK не підходить для командної реєстрації (§5.4) |
| Атомарне резервування | `joinEvent`: `SELECT … FOR UPDATE` + `createMany(skipDuplicates)` + `updateMany … seatsTaken < capacity` + outbox | Перевикористовуємо для approve і hold — нового механізму не треба |
| `_count: { participants }` у `findAll`/`joinEvent` | `events.service.ts` | ❗ Після появи PENDING-статусів рахуватиме й заявки → брати `seatsTaken` або фільтр за статусом |
| `isJoined` у відповіді `findAll` | `events.service.ts` | Замінити на `myStatus` (§6.3) |
| Власник івенту — лише `authorId` (User) | `schema.prisma` | Додається необов'язковий `organizerOrgId` |
| Outbox → Kafka, топіки `event.*` | `apps/backend/src/outbox/`, `event-topics.ts` | Нові факти (`registration.*`, `payment.*`) — той самий шлях |
| BullMQ scheduled tasks | `scheduled-tasks-worker.md` | Таймаут hold-у під оплату |

---

## 2. Як це роблять інші платформи

### 2.1. Івент-платформи

| Платформа | Хто бачить | Як приєднатися | Що варто взяти |
|---|---|---|---|
| **Luma** | Public (каталог) / Private (за посиланням) | Перемикач *Require approval*, окремо від видимості | Дві незалежні осі; approval → потім оплата; приховати список гостей; питання при реєстрації |
| **Eventbrite** | Public / Private (посилання або пароль) | Вільно / invite-only | Типи квитків з квотами й вікнами продажу, промокоди, приховані квитки |
| **Facebook Events** | Public / Friends / Private (лише запрошені) | Для Private вирішує інвайт | «Гості можуть запрошувати» — окремий дозвіл |
| **Meetup** | Приватність на рівні **групи** | Вступ у групу з анкетою й схваленням | Членські внески групи; івенти приватної групи бачать лише члени |
| **Google Calendar** | Default / Public / Private | Інвайт | Права гостей: редагувати, запрошувати, бачити список гостей |

### 2.2. Шахові платформи

| Платформа | Що варто взяти |
|---|---|
| **Lichess** | Команди (open / зі схваленням заявки). Турнір можна обмежити членами команди або захистити паролем. **Умови входу**: мін./макс. рейтинг у пулі, мінімум рейтингових партій, членство в команді, акаунт не молодший за N днів. Team Battle — турнір між командами |
| **Chess.com** | Клуби: open / closed (approval) / invite-only; ролі admin, super-admin, member. Клубні турніри, командні матчі клуб проти клубу. Монетизація — підписка гравця (аналіз, уроки) |
| **Swiss-Manager / chess-results.com** | Офлайн-турніри: FIDE ID, національний рейтинг, федерація, категорії (U8…U18, жінки, ветерани), кілька турнірів-груп (A/B/C за рейтингом) під одним заходом. Стартові внески — поза системою |
| **FIDE / національні федерації** | Рейтинг-листи (FIDE публікує щомісяця для завантаження), обов'язковий FIDE ID для рейтингових турнірів |

### 2.3. Висновки

1. Усі розділяють **видимість**, **політику входу** й **права гостей**; базові налаштування — поля
   сутності. Таблиці — для «на людину» (інвайти, заявки) і для списків правил (умови входу).
2. У шахах вирішальна одиниця — **клуб/команда**, і **умови входу за рейтингом** важливіші за
   ручне схвалення.
3. Один захід часто має **кілька секцій** (турнір A/B, дитячий залік) — це типи квитків / секції
   з власними умовами й квотами.
4. Оплата йде **після** схвалення, щоб не повертати гроші відхиленим.

---

## 3. Ментальна модель

### 3.1. Три осі доступу

| Вісь | Поле | Значення | Питання, на яке відповідає |
|---|---|---|---|
| **Видимість** | `visibility` | `PUBLIC` (у пошуку), `UNLISTED` (лише за посиланням) | Чи знайде людина івент сама? |
| **Аудиторія** | `audience` + `organizerOrgId` | `ANYONE`, `ORG_MEMBERS` | Кому **дозволено** подавати заявку / бачити деталі? |
| **Політика входу** | `joinPolicy` | `OPEN`, `APPROVAL`, `INVITE_ONLY` | Що відбувається після натискання «Приєднатися»? |

Плюс права гостей (boolean-и на `Event`): `showGuestList`, `guestsCanInvite`,
`hideDetailsUntilConfirmed` (точна адреса, опис, посилання на трансляцію).

> Уточнення до попереднього обговорення: `audience = INVITED` не вводимо — це дублює
> `joinPolicy = INVITE_ONLY`. Одне поняття — одне поле.

Відповідність прикладам:

| Сценарій | visibility | audience | joinPolicy |
|---|---|---|---|
| Відкритий мітап | PUBLIC | ANYONE | OPEN |
| «Приватний» у розумінні Luma: видно, але зі схваленням | PUBLIC | ANYONE | APPROVAL |
| Клубний турнір, видно всім як анонс | PUBLIC | ORG_MEMBERS | OPEN |
| Закрита зустріч клубу | UNLISTED | ORG_MEMBERS | APPROVAL |
| Facebook Private | UNLISTED | ANYONE | INVITE_ONLY |

### 3.2. Ролі

| Роль | Хто | Що може |
|---|---|---|
| **Платформа** | адмін SyncEvent | Модерація, тарифи, верифікація організацій |
| **Організація** | `Organization` | Володіє івентами, командами, (пізніше) мерчант-акаунтом і підпискою |
| **Роль в організації** | `Membership.role`: `OWNER`, `ADMIN`, `ORGANIZER`, `ARBITER`, `COACH`, `MEMBER` | Див. матрицю §7.2 |
| **Автор івенту** | `Event.authorId` | Керує своїм івентом (як зараз), навіть без організації |
| **Учасник** | `Registration` | Статус у §6 |

### 3.3. Правило коректності (як у `booking-concurrency.md`)

**Рішення «місце є / немає» ухвалює Postgres-транзакція з умовним `UPDATE seatsTaken`.**
Схвалення заявки, hold під оплату, звільнення hold-у, повернення з вейтлиста — усі проходять
через неї. Kafka лише повідомляє про те, що вже сталося. Платіжний провайдер — зовнішнє
джерело фактів «гроші прийшли», але місце він не резервує.

---

## 4. Доменна модель

```
Organization (kind: CLUB | FEDERATION | SCHOOL | COMMUNITY | COMPANY)
 ├── Membership (user, role, status)                    ← вступ: visibility + joinPolicy організації
 ├── Team ─── TeamMember (user, boardOrder, isCaptain)
 ├── OrgPaymentAccount (провайдер, зашифровані ключі)   ← Фаза 5
 └── PlatformSubscription (план платформи)              ← Фаза 6

User
 └── PlayerProfile (fideId, federation, title, birthYear)
      └── Rating[] (pool, value, rd, volatility, gamesPlayed, source)

Event (type: MEETUP | TOURNAMENT | CONFERENCE | LESSON | OTHER; format: OFFLINE | ONLINE | HYBRID)
 ├── authorId, organizerOrgId?
 ├── visibility, audience, joinPolicy, showGuestList, guestsCanInvite, hideDetailsUntilConfirmed
 ├── TicketType[] (ціна, квота, вікно продажу; секція турніру)
 │    └── EntryCondition[] (умови на конкретний тип/секцію)
 ├── EntryCondition[] (умови на весь івент)
 ├── EventInvite[] (userId | email | token)
 ├── Registration[] (userId | teamId, ticketTypeId, status, holdExpiresAt, orderId?)
 └── Tournament 1:1 (лише type = TOURNAMENT; див. chess-multiplayer.md §5)

Order ── OrderItem[] ── Payment[] ── Refund[]          ← Фаза 5
PaymentWebhookEvent (inbox для ідемпотентності)          ← Фаза 5
```

---

## 5. Модель даних (ескіз Prisma)

> Ескіз для аналізу, не фінальна схема. Поля зв'язків (`@relation`) скорочено там, де вони очевидні.

### 5.1. Доступ до івенту

```prisma
enum Visibility { PUBLIC UNLISTED }                 // було: PUBLIC PRIVATE (міграція §12)
enum Audience   { ANYONE ORG_MEMBERS }
enum JoinPolicy { OPEN APPROVAL INVITE_ONLY }
enum EventType  { MEETUP TOURNAMENT CONFERENCE LESSON OTHER }
enum EventFormat { OFFLINE ONLINE HYBRID }

model Event {
  id             String      @id @default(cuid())
  title          String
  description    String?
  type           EventType   @default(MEETUP)
  format         EventFormat @default(OFFLINE)
  date           DateTime
  endsAt         DateTime?
  location       String?                         // було обов'язкове; для ONLINE — null
  capacity       Int?
  seatsTaken     Int         @default(0)         // CONFIRMED + PENDING_PAYMENT (hold)

  visibility     Visibility  @default(PUBLIC)
  audience       Audience    @default(ANYONE)
  joinPolicy     JoinPolicy  @default(OPEN)
  showGuestList             Boolean @default(true)
  guestsCanInvite           Boolean @default(false)
  hideDetailsUntilConfirmed Boolean @default(false)

  authorId       String
  organizerOrgId String?                         // null — особистий івент автора
  // ...relations: author, organizerOrg, ticketTypes, conditions, invites, registrations, tournament

  @@index([visibility, date])                    // публічний пошук «найближчі»
  @@index([organizerOrgId, date])
  @@index([authorId])
}

model EventInvite {
  id          String    @id @default(cuid())
  eventId     String
  invitedById String
  userId      String?                            // існуючий користувач
  email       String?                            // або запрошення на пошту
  token       String    @unique                  // для посилання-інвайту (зберігати хеш?)
  maxUses     Int       @default(1)
  usedCount   Int       @default(0)
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  @@index([eventId])
  @@index([userId])
}
```

### 5.2. Організації

```prisma
enum OrgKind          { CLUB FEDERATION SCHOOL COMMUNITY COMPANY }
enum OrgRole          { OWNER ADMIN ORGANIZER ARBITER COACH MEMBER }
enum MembershipStatus { PENDING ACTIVE SUSPENDED LEFT }

model Organization {
  id          String     @id @default(cuid())
  slug        String     @unique
  name        String
  kind        OrgKind
  description String?
  visibility  Visibility @default(PUBLIC)        // та сама семантика, що й для Event
  joinPolicy  JoinPolicy @default(OPEN)
  verifiedAt  DateTime?                          // верифікація федерацій/шкіл платформою
  createdAt   DateTime   @default(now())
}

model Membership {
  orgId     String
  userId    String
  role      OrgRole          @default(MEMBER)
  status    MembershipStatus @default(ACTIVE)
  joinedAt  DateTime         @default(now())
  @@id([orgId, userId])
  @@index([userId])
}
```

Кілька ролей в одного користувача (ARBITER і COACH одночасно) — відкрите питання §14.3.

### 5.3. Шаховий профіль, рейтинги, умови входу

```prisma
enum ChessTitle { GM IM FM CM WGM WIM WFM WCM NM }
enum RatingPool {
  INTERNAL_BULLET INTERNAL_BLITZ INTERNAL_RAPID INTERNAL_CLASSICAL
  FIDE_STANDARD FIDE_RAPID FIDE_BLITZ
  NATIONAL                                      // з federation у PlayerProfile
}
enum RatingSource { COMPUTED IMPORTED SELF_REPORTED }

model PlayerProfile {
  userId      String      @id
  fideId      String?     @unique
  nationalId  String?
  federation  String?                          // ISO-код (UKR)
  title       ChessTitle?
  birthYear   Int?                             // для вікових категорій; не повна дата
  verifiedAt  DateTime?
}

model Rating {
  userId      String
  pool        RatingPool
  value       Int
  rd          Float?                           // Glicko-2 — лише для INTERNAL_*
  volatility  Float?
  gamesPlayed Int          @default(0)
  source      RatingSource
  updatedAt   DateTime     @updatedAt
  @@id([userId, pool])
}

enum ConditionType {
  MIN_RATING MAX_RATING MIN_RATED_GAMES
  MIN_AGE MAX_AGE
  ORG_MEMBER FIDE_ID_REQUIRED FEDERATION TITLE_REQUIRED
  ACCOUNT_AGE_DAYS
}

model EntryCondition {
  id           String        @id @default(cuid())
  eventId      String
  ticketTypeId String?                         // null — на весь івент; інакше — на секцію
  type         ConditionType
  value        Json                            // { "pool": "FIDE_STANDARD", "rating": 1800 } | { "orgId": "…" }
  @@index([eventId])
}
```

Перевірка умов — **чиста функція** `checkEligibility(ctx, conditions) → { ok, failed[] }`,
де `ctx` = профіль + рейтинги + членства + вік акаунта. Викликається на join **до** резервування
місця і повторно на approve (рейтинг міг змінитись). Помилки повертаються списком, щоб UI
показав «не проходите: рейтинг FIDE < 1800».

### 5.4. Реєстрація і типи квитків

```prisma
enum RegistrationStatus {
  PENDING_APPROVAL   // заявка; місце НЕ займає
  PENDING_PAYMENT    // схвалено/обрано платний квиток; місце ЗАЙНЯТЕ до holdExpiresAt
  CONFIRMED          // місце зайняте
  WAITLISTED         // місця немає; чекає (booking-concurrency.md, Фаза 3)
  REJECTED
  CANCELLED          // сам вийшов / hold протух / автор скасував
  REFUNDED
}

model TicketType {
  id          String    @id @default(cuid())
  eventId     String
  name        String                            // «Стандарт», «Студентський», «Турнір A (1800+)»
  priceMinor  Int       @default(0)             // копійки; 0 = безкоштовно
  currency    String    @default("UAH")         // ISO 4217
  quota       Int?                              // ліміт саме цього типу; null — лише Event.capacity
  sold        Int       @default(0)             // як seatsTaken, але на тип
  salesStart  DateTime?
  salesEnd    DateTime?
  isHidden    Boolean   @default(false)         // доступний лише за інвайтом/промокодом
  sortOrder   Int       @default(0)
  @@index([eventId])
}

model Registration {                            // перейменований EventParticipant (§12)
  id            String             @id @default(cuid())
  eventId       String
  userId        String?                         // індивідуальна реєстрація
  teamId        String?                         // командна (рівно одне з userId/teamId — CHECK)
  ticketTypeId  String?                         // null лише для старих рядків до міграції
  status        RegistrationStatus
  holdExpiresAt DateTime?                       // лише для PENDING_PAYMENT
  orderId       String?
  answers       Json?                           // відповіді на питання реєстрації
  registeredById String                         // хто подав (капітан за команду)
  decidedById   String?                         // хто схвалив/відхилив
  decidedAt     DateTime?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  @@unique([eventId, userId])                   // Postgres: NULL-и не конфліктують
  @@unique([eventId, teamId])
  @@index([eventId, status])
  @@index([status, holdExpiresAt])              // пошук протухлих hold-ів
}
```

`CHECK ((userId IS NULL) <> (teamId IS NULL))` — raw SQL у міграції (Prisma не описує CHECK).

**Одиниця місця:** в індивідуальному івенті `capacity` — люди, у командному — команди. Тип
івенту визначає, яке з `userId/teamId` дозволене.

### 5.5. Команди

```prisma
model Team {
  id        String   @id @default(cuid())
  orgId     String?                              // null — збірна команда без клубу
  name      String
  captainId String
  createdAt DateTime @default(now())
}

model TeamMember {
  teamId     String
  userId     String
  boardOrder Int?                                // порядок дощок за замовчуванням
  @@id([teamId, userId])
}
```

Склад на конкретний тур командного турніру (хто на якій дошці) — у турнірній моделі
(`chess-multiplayer.md`, розширення `Pairing` → `BoardPairing`), не тут.

### 5.6. Платежі (Фаза 5, форма даних)

```prisma
enum OrderStatus   { PENDING PAID EXPIRED CANCELLED REFUNDED PARTIALLY_REFUNDED }
enum PaymentStatus { CREATED PROCESSING SUCCEEDED FAILED }
enum RefundStatus  { REQUESTED SUCCEEDED FAILED }
enum PaymentProviderCode { WAYFORPAY LIQPAY MONOBANK STRIPE MANUAL }

model Order {
  id          String      @id @default(cuid())
  userId      String
  eventId     String?                            // null — оплата підписки
  status      OrderStatus @default(PENDING)
  totalMinor  Int
  currency    String
  expiresAt   DateTime                           // = holdExpiresAt реєстрацій
  createdAt   DateTime    @default(now())
}

model OrderItem {
  id             String @id @default(cuid())
  orderId        String
  ticketTypeId   String
  registrationId String @unique
  priceMinor     Int                              // знімок ціни на момент замовлення
}

model Payment {
  id                String              @id @default(cuid())
  orderId           String
  provider          PaymentProviderCode
  providerPaymentId String
  status            PaymentStatus
  amountMinor       Int
  currency          String
  createdAt         DateTime            @default(now())
  @@unique([provider, providerPaymentId])
}

model Refund {
  id               String       @id @default(cuid())
  paymentId        String
  amountMinor      Int
  reason           String
  status           RefundStatus
  providerRefundId String?
  createdAt        DateTime     @default(now())
}

model PaymentWebhookEvent {                       // inbox: ідемпотентність вебхуків
  id              String              @id @default(cuid())
  provider        PaymentProviderCode
  providerEventId String
  payload         Json
  receivedAt      DateTime            @default(now())
  processedAt     DateTime?
  @@unique([provider, providerEventId])
}

model OrgPaymentAccount {
  orgId            String              @id
  provider         PaymentProviderCode
  merchantId       String
  secretEncrypted  String                         // шифрування на рівні застосунку, ключ у env/KMS
  enabledAt        DateTime?
}
```

Безкоштовний квиток **не створює `Order`**: реєстрація одразу `CONFIRMED` (або
`PENDING_APPROVAL`). `Order` з'являється лише для `priceMinor > 0`.

### 5.7. Підписки й entitlements (Фаза 6)

```prisma
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELLED }

model PlatformSubscription {
  id               String             @id @default(cuid())
  orgId            String?                        // план для організації
  userId           String?                        // або для гравця
  planCode         String                         // ключ з конфігу планів
  status           SubscriptionStatus
  currentPeriodEnd DateTime
  provider         PaymentProviderCode
  providerSubId    String?
  @@index([orgId])
  @@index([userId])
}
```

Плани (що входить у `ORG_PRO`, ліміти) — **конфіг у коді** (`packages/shared`), не таблиця:
змінюються рідко, мають бути під версіонуванням і тестами. Код перевіряє **можливості**, а не
назву плану: `entitlements.can(org, 'SWISS_PAIRING')`,
`entitlements.limit(org, 'ACTIVE_TOURNAMENTS')`.

---

## 6. Реєстрація: стан-машина і коректність

### 6.1. Переходи

```
                 join
                  │
        checkEligibility ──✗──► 422 зі списком невиконаних умов
                  │✓
     ┌────────────┼──────────────────────────────┐
 joinPolicy=OPEN  │ APPROVAL                      │ INVITE_ONLY (без валідного інвайту → 403)
     │            ▼                               │ з інвайтом → як OPEN
     │     PENDING_APPROVAL ──reject──► REJECTED  │
     │            │approve (повторна перевірка умов)
     ▼            ▼
   [резервування місця: умовний UPDATE seatsTaken (+ TicketType.sold)]
     │ немає місця → WAITLISTED (або 409 — налаштування івенту)
     │ є місце
     ├── ціна = 0 ───────────────────────────────► CONFIRMED
     └── ціна > 0 ──► PENDING_PAYMENT (holdExpiresAt) ──payment.succeeded──► CONFIRMED
                            │ hold протух (BullMQ)
                            ▼
                        CANCELLED (+ seatsTaken − 1, → вейтлист)

 CONFIRMED ──leave / cancel──► CANCELLED (+ seatsTaken − 1) ──(платний)──► Refund → REFUNDED
```

### 6.2. Інваріанти

1. `seatsTaken` = кількість реєстрацій у статусах `CONFIRMED` + `PENDING_PAYMENT`. Кожен перехід,
   що змінює належність до цієї множини, змінює `seatsTaken` **у тій самій транзакції**.
2. Кожен перехід — **умовний `UPDATE … WHERE status = <очікуваний>`**; `count = 0` означає, що
   хтось встиг раніше (подвійний approve, hold протух одночасно з вебхуком) → нічого не робимо.
   Це робить обробники ідемпотентними без окремих локів.
3. `PENDING_APPROVAL` місця **не займає**: автор може отримати 50 заявок на 10 місць, і
   approve 11-ї поверне «місць немає» (або переведе у `WAITLISTED`).
4. Вікно оплати після approve довше, ніж після самостійного вибору квитка: налаштування
   `paymentWindowMinutes` на івенті (наприклад, 15 хв для OPEN, 48 год після approve).

### 6.3. Що бачить клієнт

`isJoined: boolean` → `myRegistration: { status, holdExpiresAt?, ticketTypeId? } | null`.
Кількість учасників — `seatsTaken` (або окремо `confirmedCount`), а не `_count.participants`.

### 6.4. Гонка «вебхук після протухлого hold-у»

Оплата пройшла, але hold уже скасовано й місце віддано іншому. Обробка:
1. У транзакції спробувати знову зарезервувати місце (умовний `UPDATE`).
2. Вийшло → `CONFIRMED`.
3. Ні → автоматичний `Refund` + нотифікація. Гроші не мають «зависнути».

Щоб це траплялось рідко: hold-job спрацьовує з запасом (провайдер може тримати сторінку оплати
довше за `holdExpiresAt`) — `Order.expiresAt` передаємо провайдеру як час життя інвойсу, якщо він
це підтримує.

---

## 7. Приватність і права

### 7.1. Хто що бачить

| Хто дивиться | У пошуку | Картка (назва, дата, місто) | Деталі (адреса, опис, трансляція) | Список гостей | Може подати заявку |
|---|---|---|---|---|---|
| Анонім | лише `PUBLIC` | `PUBLIC` або за посиланням | якщо `!hideDetailsUntilConfirmed` | якщо `showGuestList` | ні (логін) |
| Залогінений, не член орг. | `PUBLIC` | так | як вище | як вище | якщо `audience = ANYONE` |
| Член організації | `PUBLIC` + `UNLISTED` своїх орг.* | так | як вище | як вище | так |
| `CONFIRMED` учасник | — | так | **завжди** | якщо `showGuestList` | — |
| Автор / ORGANIZER+ орг. | — | так | так | **завжди** + заявки | — |

\* відкрите питання §14.4: чи показувати членам UNLISTED-івенти свого клубу у стрічці клубу.

Реалізація: одна функція `buildEventAccessWhere(viewer)` для `findMany` і одна
`projectEventForViewer(event, viewer)`, яка вирізає приховані поля. Не розкидати перевірки по
контролерах.

### 7.2. Ролі в організації

| Дія | OWNER | ADMIN | ORGANIZER | ARBITER | COACH | MEMBER |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Змінити налаштування / видалити організацію | ✓ | | | | | |
| Керувати членами й ролями | ✓ | ✓ | | | | |
| Підключити мерчант-акаунт, керувати підпискою | ✓ | | | | | |
| Створювати / редагувати івенти організації | ✓ | ✓ | ✓ | | | |
| Схвалювати заявки на івенти | ✓ | ✓ | ✓ | | | |
| Вести турнір (результати, форфейти, жеребкування) | ✓ | ✓ | ✓ | ✓ | | |
| Проводити уроки (`LESSON`) | ✓ | ✓ | ✓ | | ✓ | |
| Бачити UNLISTED-івенти й команди клубу | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Реалізація: guard `@OrgRole('ORGANIZER')` + `can(user, action, resource)` у сервісі; матриця — одне
місце в коді (константа), таблиця вище — її документація.

---

## 8. Шахова специфіка

1. **Турнір = `Event(type=TOURNAMENT)` + `Tournament` 1:1** — як у `chess-multiplayer.md` §5–6.
   Реєстрація — загальна (§6), жодного окремого механізму.
2. **Секції** (Турнір A 1800+, Турнір B до 1800, дитячий U12) — це `TicketType` з власними
   `EntryCondition` і `quota`. Якщо секції грають окремі турніри з окремим жеребкуванням —
   `Tournament.ticketTypeId` (кілька `Tournament` на один `Event`) — відкрите питання §14.5.
3. **Рейтинги:** внутрішні пули рахує Python (Glicko-2, `chess-multiplayer.md` §7.2) і пише
   через Kafka `chess.rating.updated` → `Rating(source=COMPUTED)`. Зовнішні (FIDE) — імпорт
   місячного рейтинг-листа BullMQ-job-ом → `source=IMPORTED`, зв'язок через `PlayerProfile.fideId`.
   `SELF_REPORTED` — для національних, поки немає імпорту; організатор бачить позначку.
4. **Верифікація FIDE ID** — хто завгодно може ввести чужий ID. Варіанти: підтвердження
   організатором, збіг імені з рейтинг-листом, згодом — підтвердження федерацією (§14.6).
5. **Командні турніри:** реєстрація з `teamId` (подає капітан), `capacity` — у командах, склад
   на тур — у турнірній моделі.
6. **Уроки (`LESSON`)** — івент з малою `capacity`, часто платний, `COACH` як автор. Підписка на
   серію уроків — пізніше (абонемент = `TicketType` на кілька івентів або окрема сутність, §14.8).

---

## 9. Монетизація

### 9.1. Що може бути платним (за спаданням імовірності)

| Що | Хто платить → кому | Модель у даних |
|---|---|---|
| Стартові внески, квитки на конференції | учасник → організатор | `TicketType.priceMinor`, `Order`, `Payment` |
| Членські внески клубу | член → організація | `PlatformSubscription`-подібна `MemberDues` (пізніше, §14.9) |
| Платні уроки / коучинг | учень → тренер/школа | `Event(type=LESSON)` + квиток |
| Преміум для організацій (Swiss, тай-брейки, експорт FIDE, античит, брендинг, ліміти) | організація → платформа | `PlatformSubscription` + entitlements |
| Преміум для гравців (аналіз партій, статистика) | гравець → платформа | `PlatformSubscription(userId)` + entitlements |

### 9.2. Хто тримає гроші — ключове рішення

| Модель | Як | Плюси | Мінуси |
|---|---|---|---|
| **A. Власний мерчант організатора** (рекомендовано на старт) | Організація підключає свій WayForPay/LiqPay/monobank; платформа створює інвойс від його імені | Платформа не тримає чужих грошей → мінімум юридичних вимог; повернення — між організатором і учасником | Кожна організація має мати ФОП/юрособу й мерчант; немає комісії платформи |
| **B. Маркетплейс** (платформа збирає, потім виплачує) | Гроші на рахунок платформи, payout організаторам мінус комісія | Комісія з кожного квитка; простіше для дрібних клубів | Фактично платіжний посередник: договори, податки, фінмоніторинг, відповідальність за повернення |
| **C. Split-платежі провайдера** | Провайдер сам ділить платіж (Stripe Connect-подібні механізми) | Комісія без утримання грошей | Залежить від підтримки провайдером в Україні — перевірити |

Рекомендація: **A для квитків, платформа заробляє на підписках (9.1, два останні рядки)**. B/C —
лише після юридичної консультації (§14.10). Схема з §5.6 підходить для обох: у моделі A
`OrgPaymentAccount` обов'язковий, у B — його немає й використовується акаунт платформи.

### 9.3. Провайдери

| Провайдер | Нотатки |
|---|---|
| WayForPay, LiqPay, monobank-еквайринг | Реалістичні для українських ФОП/юросіб; мають вебхуки й підписи |
| Stripe | На момент написання не приймає українських мерчантів напряму — **перевірити актуальність**; актуальний, якщо з'явиться іноземна юрособа |
| `MANUAL` | Готівка / переказ на картку: організатор вручну позначає «оплачено». Потрібно для офлайн-турнірів з першого дня |

Інтерфейс (backend, модуль `payments`):
```ts
interface PaymentProvider {
  createCheckout(order: Order, account: OrgPaymentAccount | null): Promise<{ redirectUrl: string; providerPaymentId: string }>;
  verifyAndParseWebhook(req: RawRequest): Promise<NormalizedPaymentEvent>; // перевірка підпису тут
  refund(payment: Payment, amountMinor: number): Promise<{ providerRefundId: string }>;
}
```

### 9.4. Обробка вебхука

1. Контролер: перевірити підпис → `INSERT PaymentWebhookEvent` (дубль за `@@unique` → 200 і вихід)
   → 200 провайдеру. Жодної бізнес-логіки синхронно.
2. Обробник (BullMQ або той самий процес одразу після коміту): у транзакції оновити `Payment`,
   `Order`, реєстрації (§6, умовні `UPDATE`), записати outbox `payment.succeeded` /
   `registration.confirmed`, виставити `processedAt`.
3. Провайдерам не довіряємо суму на слово: порівняти `amountMinor/currency` з `Order`.

---

## 10. Kafka-топіки (розширення `event-topics.ts`)

| Топік | Ключ | Продюсер | Консюмери |
|---|---|---|---|
| `registration.requested` | `eventId` | backend (outbox) | notifications (автору: нова заявка) |
| `registration.decided` | `eventId` | backend | notifications (заявнику), analytics |
| `registration.confirmed` | `eventId` | backend | notifications, analytics, tournaments |
| `registration.cancelled` | `eventId` | backend | вейтлист, notifications, analytics |
| `payment.succeeded` / `payment.refunded` | `orderId` | backend | notifications, analytics |
| `org.member.changed` | `orgId` | backend | notifications, кеш прав |

Наявні `event.user-joined` / `event.user-left` — або лишити як псевдоніми `registration.confirmed`
/ `registration.cancelled` на перехідний період, або замінити (§14.11).

---

## 11. Режими відмови

| Що впало | Наслідок | Поведінка |
|---|---|---|
| Платіжний провайдер | Не можна оплатити | Реєстрація в `PENDING_PAYMENT` до hold-у; після — `CANCELLED`, місце звільнено. Безкоштовні івенти не зачеплено |
| Вебхук загубився | Оплата є, реєстрація не підтверджена | Reconcile-job: для `PENDING` замовлень, старших за N хв, опитати статус у провайдера |
| Redis/BullMQ | Hold-и не протухають вчасно | Лінива перевірка: `holdExpiresAt < now()` трактується як протухлий при будь-якому читанні/спробі оплати; job підчистить пізніше |
| Kafka | Немає нотифікацій | Коректність не зачеплена; outbox дошле |
| Python (рейтинг) | Рейтинги застарілі | Умови за рейтингом перевіряються за останнім відомим значенням |

---

## 12. Міграція з поточної схеми

1. `Visibility.PRIVATE` → `visibility = PUBLIC, joinPolicy = APPROVAL`? Чи `UNLISTED + OPEN`?
   Поточна поведінка — «приховано від анонімів, відкрито для залогінених» — не має точного
   відповідника. Пропозиція: `PRIVATE → UNLISTED + OPEN` (найближче: не видно публічно), автори
   перевірять вручну (§14.1).
2. `EventParticipant` → `Registration`: нова PK `id`, `@@unique([eventId, userId])`, статуси
   `CONFIRMED→CONFIRMED`, `WAITLISTED→WAITLISTED`. Одна міграція з перейменуванням таблиці
   (`ALTER TABLE … RENAME`) + backfill `ticketTypeId` (по одному «Стандарт, 0 ₴» на кожен івент).
3. `EventVisibility` у `packages/shared` оновлюється разом зі схемою; фронт — фільтри й форма.
4. `location` → nullable (для ONLINE). Наявні рядки не змінюються.
5. `findAll`: фільтр → `buildEventAccessWhere`, `_count.participants` → `seatsTaken`,
   `isJoined` → `myRegistration`.

---

## 13. Поетапний план

### Фаза 0 — осі доступу
`visibility/audience/joinPolicy` + boolean-и на `Event`, міграція `PRIVATE`,
`buildEventAccessWhere`/`projectEventForViewer`, оновлення `shared`-схем і форми створення.

**Готово, коли:** анонім бачить лише `PUBLIC`; `UNLISTED` відкривається за посиланням і не
з'являється в пошуку; `hideDetailsUntilConfirmed` ховає адресу для неучасника; тести на кожен
рядок таблиці §7.1.

### Фаза 1 — організації
`Organization`, `Membership`, ролі, guard, `Event.organizerOrgId`, `audience = ORG_MEMBERS`.

**Готово, коли:** клуб з OPEN/APPROVAL-вступом; ORGANIZER створює івент від імені клубу;
не-член не може приєднатися до `ORG_MEMBERS`-івенту; матриця §7.2 покрита тестами.

### Фаза 2 — заявки
`EventParticipant → Registration`, `PENDING_APPROVAL`/`REJECTED`, approve через умовний
`UPDATE seatsTaken`, ендпоінти заявок, `myRegistration`, топіки `registration.*`.

**Готово, коли:** 20 паралельних approve на 10 місць дають рівно 10 `CONFIRMED` (тест як у
booking-concurrency); подвійний approve однієї заявки — no-op.

### Фаза 3 — шаховий профіль і умови входу
`PlayerProfile`, `Rating`, `EntryCondition`, `checkEligibility` (чиста функція з юніт-тестами),
імпорт FIDE-листа (можна пізніше; спершу `SELF_REPORTED`).

**Готово, коли:** турнір «1800+ FIDE» відхиляє 1750 з зрозумілою причиною; перевірка
повторюється при approve.

### Фаза 4 — типи квитків і hold
`TicketType` (ціна поки лише 0 або `MANUAL`), квоти, `PENDING_PAYMENT` + `holdExpiresAt` +
BullMQ-скасування, ручне «позначити оплаченим».

**Готово, коли:** hold протухає й місце повертається; квота типу й `capacity` не
перевищуються разом під паралельним навантаженням.

### Фаза 5 — платежі
`Order/Payment/Refund/PaymentWebhookEvent`, `OrgPaymentAccount`, один провайдер, вебхук-inbox,
reconcile-job, §6.4.

**Готово, коли:** повторний вебхук — no-op; вебхук після протухлого hold-у → місце або
автоматичне повернення; невідповідна сума → відмова й алерт.

### Фаза 6 — підписки й entitlements
`PlatformSubscription`, конфіг планів, `entitlements.can/limit`, перша платна фіча (Swiss або
аналіз партій).

### Фаза 7 — команди
`Team`, `TeamMember`, командна реєстрація (`teamId`), інтеграція з турнірною моделлю.

---

## 14. Відкриті питання (для подальшого аналізу)

1. **Міграція `PRIVATE`:** `UNLISTED + OPEN` чи `PUBLIC + APPROVAL`? Від цього залежить, що
   побачать наявні користувачі.
2. **Перейменування `EventParticipant → Registration`:** робити у Фазі 2 одним кроком чи лишити
   стару назву моделі (менше змін у коді, але назва бреше про зміст)?
3. **Кілька ролей у `Membership`:** одна роль (ієрархія) чи масив/окрема таблиця (ARBITER + COACH)?
4. **UNLISTED-івенти клубу у стрічці членів** — показувати чи ні?
5. **Секції турніру:** секція = `TicketType` (одна реєстрація, один турнір) чи окремий
   `Tournament` на секцію під одним `Event`?
6. **Верифікація FIDE ID і рейтингів** — ручна організатором, автоматична за рейтинг-листом, обидві?
7. **Вейтлист і approval:** що робить approve, коли місць немає — `WAITLISTED` чи помилка з
   вибором для автора?
8. **Абонементи на серію уроків/івентів** — `TicketType` на кілька івентів чи окрема сутність `Pass`?
9. **Членські внески клубу** — через ту саму підписочну модель чи окремо (`MemberDues`)?
10. **Модель грошей A / B / C (§9.2)** — потрібна юридична консультація до реалізації B/C.
11. **Топіки `event.user-joined/left`** — псевдоніми на перехідний період чи заміна одразу?
12. **Дані неповнолітніх** (дитячі турніри): `birthYear` достатньо? Згода батьків? Що з GDPR-подібними
    вимогами для профілів дітей.
13. **Промокоди / знижки** — потрібні на старті монетизації чи пізніше?
14. **Валюта:** лише UAH на старті? Мультивалютність впливає на звіти й повернення.

---

## 15. Як відновити контекст роботи

1. Прочитати цей документ: розділи 0, 3, 6, 13.
2. Код: `apps/backend/prisma/schema.prisma` (`Event`, `EventParticipant`),
   `apps/backend/src/events/events.service.ts` (`findAll`, `joinEvent`, `leaveEvent`).
3. Пов'язане: `booking-concurrency.md` (умовний `UPDATE`, outbox), `chess-multiplayer.md` §5–6
   (турнір як `Event`), `scheduled-tasks-worker.md` (BullMQ).
4. Перевірити статус фаз у §13 і рішення в §14; продовжити з першої незакритої фази — по одному
   кроку зі стопом на рев'ю.
