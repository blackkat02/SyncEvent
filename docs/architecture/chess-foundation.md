# Шаховий фундамент: мінімальна інфраструктура під рушій

> Статус: **проєкт рішення** (draft), код не почато. Соло-проєкт, автор — Borys.
> Останнє оновлення: 2026-09-30 (після рев'ю: гості прибрані, організатор турніру — не гравець,
> результат партії → турнір синхронним хуком замість Kafka, `minPlayers` + скасування турніру,
> обмеження редагування/видалення турнірних івентів, новий порядок кроків — **спочатку партія**;
> ухвалені D3, D7, D10–D14, решта чекає підтвердження).
> Пов'язаний код: `apps/backend/prisma/schema.prisma` (`Event`, `EventParticipant`, `Visibility`),
> `apps/backend/src/events/events.service.ts` (`create`, `findAll`, `findOne`, `joinEvent`, `leaveEvent`,
> `update`, `remove`), `apps/backend/src/booking/booking.processor.ts` (join через BullMQ + Redis-лок),
> `apps/backend/src/booking/booking-status.service.ts`,
> `packages/shared/src/schemas/event.schema.ts`, `packages/shared/src/events/event-topics.ts`,
> `apps/frontend-next/screens/CreateEditEventPage.tsx`, `apps/frontend/src/pages/CreateEventPage.tsx`,
> сусідній `D:\Projects\ChessB\src\engine\` (фасад `index.js` — заглушки).
> Пов'язані документи: `chess-multiplayer.md` (партія, WS, турніри, Python — повна картина),
> `organizations-and-monetization.md` (приватність, організації, платежі — повна картина),
> `booking-concurrency.md` (резервування місць), `scheduled-tasks-worker.md` (BullMQ).

---

## 0. TL;DR / рішення

1. **Мета зрізу:** якнайшвидше мати **окрему партію**, яку можна створити, прийняти, завершити
   (здача/скасування) і — щойно готовий рушій — зіграти через API. Турнір (гравці, тури, пари)
   будується поверх уже робочої партії. Підключення рушія = один адаптер + ендпоінт ходу.
2. **Приватність — мінімум, але правильна форма:** `Visibility { PUBLIC, UNLISTED }` +
   `joinPolicy { OPEN, APPROVAL }`. `audience`, організації, платежі — пізніше, **адитивно**.
3. **Гравці турніру — лише зареєстровані користувачі.** Гостей без акаунта немає (D3).
   `TournamentPlayer` — окрема від реєстрації сутність: знімок рейтингу, стартовий номер, вибуття.
4. **Організатор (автор івенту) не може бути гравцем свого турніру** (D12). Для турнірних івентів
   автор не додається в учасники й не займає місце.
5. **Турнір працює без рушія:** `Pairing.result` вводить суддя (OTB), `Pairing.gameId` —
   необов'язковий. Онлайн-партія — лише одне з джерел результату.
6. **Турнір не знає механіки шахів.** `Game` не знає про турнір, `tournaments` не знає про ходи,
   правила й годинник — лише про результат партії. Зв'язок один — `Pairing.gameId`.
7. **Рушій — за портом `ChessRules` у модулі `games`**; адаптер над `@syncevent/chess-engine`
   (ChessB). Усе про ходи (черга, нічиї, повторення) — зона `games` + рушія, `chess-multiplayer.md`.
8. **Модулі в `backend`, зв'язок — синхронні хуки в транзакції** (D7, D11): реєстрація → турнір,
   завершення партії → турнір. Kafka — лише назовні (analytics, notifications).
9. **`minPlayers` у турнірі:** старт неможливий, якщо гравців менше; якщо на час початку
   набрано менше — турнір автоматично `CANCELLED` (D13).
10. Кроки (кожен — стоп на рев'ю): 1 приватність → 2 партія → 3 хід через рушій (після треку ChessB)
    → 4 тип івенту → 5 турнір і гравці → 6 тури й пари (OTB) → 7 онлайн-турнір → 8 заявки APPROVAL.
    Кроки 4–6 можна робити, поки чекаємо рушій.

---

## 1. Поточний стан (що вже є)

| Що | Де | Значення |
|---|---|---|
| `Visibility { PUBLIC PRIVATE }`; анонім бачить лише PUBLIC, залогінений — усе | `events.service.ts` `findAll` | ❗ PRIVATE нічого не обмежує для залогінених |
| `findOne` віддає всіх учасників з **email** будь-кому, включно з анонімом | `events.service.ts` `findOne` | ❗ Витік персональних даних — закриваємо в кроці 1 |
| `create` додає автора учасником, `seatsTaken: 1` | `events.service.ts` `create` | Для турнірів — ні (D12) |
| Join асинхронний: `POST /events/:id/join` → BullMQ → Redis-лок per-event → `joinEvent` (умовний `UPDATE seatsTaken`) + outbox | `events.controller.ts`, `booking/booking.processor.ts` | Помилка в транзакції → `REJECTED` (без ретраїв) — на цьому працює закриття реєстрації |
| Статус join-запиту: лише `PENDING/CONFIRMED/REJECTED` | `booking-status.service.ts` | Для APPROVAL потрібен новий стан (крок 8) |
| `EventParticipant { eventId, userId, status: CONFIRMED \| WAITLISTED }`, PK `(eventId, userId)` | `schema.prisma` | Лишається; статуси заявки — крок 8 |
| `_count.participants`, `isJoined` у відповідях | `events.service.ts` | Перейти на `seatsTaken` і `myStatus` (крок 4) |
| `update` не перевіряє `capacity ≥ seatsTaken`; `remove` каскадно видаляє учасників | `events.service.ts` | ❗ Для турнірів — обмеження (§5.6) |
| Бекенд Kafka **лише пише** (outbox relay), консюмерів у бекенді немає | `apps/backend/src/outbox/`, `kafka/` | Тому зв'язок `games → tournaments` — хуком, а не консюмером (D11) |
| Рушій ChessB: pseudo/legal moves, атаки, мат/пат (`getAllLegalMoves`, `isCheckmate`, `isStalemate`), SAN (`buildSan`) — з тестами; фасад `index.js` — **заглушки** | `D:\Projects\ChessB\src\engine\` | Трек рушія (§8) — здебільшого склеювання наявного |
| FEN: `fenToBoardObject` розбирає **лише розстановку** (без черги, рокіровок, en passant, лічильників) | `ChessB/src/utils/fenConverter.js` | Повний `fenToState`/`boardToFen` — писати |
| Моделей `Tournament/Round/Pairing/Game/Move` немає | — | Ескіз у `chess-multiplayer.md` §5 — тут уточнений (§4) |

---

## 2. Що входить у зріз, а що — ні

| Входить | Не входить (і чому безпечно відкласти) |
|---|---|
| `PUBLIC/UNLISTED`, `joinPolicy OPEN/APPROVAL`, закриття витоку email | `audience`, `Organization`, ролі — нові колонки/таблиці, адитивно |
| `Game`, `Move`, виклик/прийняття/здача/скасування, хід через рушій | WebSocket, годинник-таймери BullMQ, нічиї — `chess-multiplayer.md` Фаза 1 |
| Порт `ChessRules` + адаптер | Сам рушій — окремий трек у ChessB (§8) |
| `Event.type` | `TicketType`, ціни, `Order` — адитивно; `seatsTaken` уже є |
| `Tournament` (+ `minPlayers`, скасування), `TournamentPlayer`, `Round`, `Pairing` | Швейцарка, арена (лише круговий), Python — `chess-multiplayer.md` Фаза 3–4 |
| Ручне введення результату суддею | Рейтинг Glicko-2, `PlayerProfile`, умови входу — адитивно |
| — | Гості без акаунта (D3: не робимо) |

---

## 3. Ментальна модель

| Роль | Хто | Відповідає за |
|---|---|---|
| Реєстрація, місця, приватність | `events` + `booking` | Хто допущений до івенту; `seatsTaken` |
| Турнір | `tournaments` | Склад гравців, тури, пари, таблиця, скасування. **Не знає про ходи** |
| Партія | `games` | Хто ходить, позиція, ходи, годинник, результат однієї партії |
| Правила шахів | `ChessRules` (порт) → `@syncevent/chess-engine` | Легальність ходу, нова позиція, кінець гри |

Правило: **результат партії вирішує `games`** (Postgres-транзакція з умовним `UPDATE`).
У **тій самій транзакції** `games` викликає зареєстровані `GameResultHooks.onFinished`; `tournaments`
пише результат у `Pairing`. Паралельно `games` пише outbox `chess.game.finished` — для зовнішніх
консюмерів. Для OTB-партій результат у `Pairing` пише суддя напряму.

---

## 4. Модель даних (ескіз Prisma)

### 4.1. Івент і приватність

```prisma
enum Visibility { PUBLIC UNLISTED }                 // PRIVATE → UNLISTED (міграція, D1)
enum JoinPolicy { OPEN APPROVAL }                   // INVITE_ONLY — пізніше, адитивно
enum EventType  { MEETUP TOURNAMENT CONFERENCE LESSON OTHER }

enum ParticipantStatus {
  PENDING       // заявка (APPROVAL); місце НЕ займає — крок 8
  CONFIRMED
  WAITLISTED
  REJECTED      // крок 8
}

model Event {
  // ... наявні поля
  type          EventType  @default(MEETUP)       // незмінний після створення
  visibility    Visibility @default(PUBLIC)
  joinPolicy    JoinPolicy @default(OPEN)
  showGuestList Boolean    @default(true)
  tournament    Tournament?
  @@index([visibility, date])
}
```

### 4.2. Турнір і гравці

```prisma
enum TournamentFormat { ROUND_ROBIN SWISS ARENA }        // реалізуємо лише ROUND_ROBIN
enum TournamentStatus { DRAFT REGISTRATION IN_PROGRESS FINISHED CANCELLED }
enum TournamentPlay   { ONLINE OTB }                     // OTB — за дошкою, результати вводить суддя
enum PlayerStatus     { ACTIVE WITHDRAWN }

model Tournament {
  id            String           @id @default(cuid())
  eventId       String           @unique                // 1:1 з Event(type = TOURNAMENT), onDelete: Cascade
  format        TournamentFormat @default(ROUND_ROBIN)
  play          TournamentPlay
  status        TournamentStatus @default(DRAFT)
  minPlayers    Int              @default(2)            // 2 ≤ minPlayers ≤ Event.capacity
  roundsPlanned Int?                                    // для кругового = N-1 (виводиться)
  baseTimeMs    Int?                                    // обов'язкове для ONLINE; для OTB — інформаційне
  incrementMs   Int              @default(0)
  rated         Boolean          @default(false)
  cancelReason  String?                                 // NOT_ENOUGH_PLAYERS | ORGANIZER
  players       TournamentPlayer[]
  rounds        Round[]
}

model TournamentPlayer {
  id               String       @id @default(cuid())
  tournamentId     String
  userId           String                               // лише зареєстровані (D3)
  displayName      String                               // знімок імені на момент реєстрації
  ratingSnapshot   Int?                                 // рейтинг на старті — для жеребкування/тай-брейків
  seed             Int?                                 // стартовий номер; присвоюється на старті
  status           PlayerStatus @default(ACTIVE)
  withdrawnAtRound Int?
  addedById        String                               // хто додав (сам гравець / організатор)
  createdAt        DateTime     @default(now())
  @@unique([tournamentId, userId])
  @@unique([tournamentId, seed])
  @@index([userId])
}
```

### 4.3. Тури й пари

```prisma
enum RoundStatus    { PENDING PLAYING COMPLETE }
enum PairingResult  { WHITE_WIN BLACK_WIN DRAW WHITE_FORFEIT_WIN BLACK_FORFEIT_WIN DOUBLE_FORFEIT BYE }
enum ResultSource   { GAME ARBITER }

model Round {
  id           String      @id @default(cuid())
  tournamentId String
  number       Int
  status       RoundStatus @default(PENDING)
  startsAt     DateTime?
  pairings     Pairing[]
  @@unique([tournamentId, number])
}

model Pairing {
  id            String         @id @default(cuid())
  roundId       String
  board         Int                                     // номер дошки
  whitePlayerId String                                  // TournamentPlayer.id
  blackPlayerId String?                                 // null ⇔ result = BYE
  gameId        String?        @unique                  // лише для ONLINE
  result        PairingResult?
  resultSource  ResultSource?
  resultSetById String?
  resultSetAt   DateTime?
  @@unique([roundId, board])
  @@index([whitePlayerId])
  @@index([blackPlayerId])
}
```

Форфейти й bye — окремі значення результату: для тай-брейків (Бухгольц, Зоннеборн-Бергер) вони
рахуються інакше, ніж зіграна партія. Інваріант: `blackPlayerId IS NULL` ⇔ `result = BYE`
(bye-пара створюється одразу з результатом).

### 4.4. Партія

```prisma
enum GameStatus  { CREATED IN_PROGRESS FINISHED ABORTED }
enum GameResult  { WHITE_WIN BLACK_WIN DRAW }
enum GameVariant { STANDARD }                            // CHESS960 — пізніше, без міграції форми
enum GameSource  { CHALLENGE TOURNAMENT }

model Game {
  id            String      @id @default(cuid())
  source        GameSource
  variant       GameVariant @default(STANDARD)
  rated         Boolean     @default(false)
  whiteUserId   String
  blackUserId   String
  createdById   String                                 // хто кинув виклик; другий гравець приймає
  status        GameStatus  @default(CREATED)
  result        GameResult?
  termination   String?                                // checkmate | resignation | abort | timeout | ...
  initialFen    String
  fen           String                                 // поточна
  ply           Int         @default(0)                // умовний UPDATE ... WHERE ply = ? (як seatsTaken)
  baseTimeMs    Int
  incrementMs   Int         @default(0)
  whiteTimeMs   Int
  blackTimeMs   Int
  turnStartedAt DateTime?
  createdAt     DateTime    @default(now())
  startedAt     DateTime?
  finishedAt    DateTime?
  moves         Move[]
  @@index([whiteUserId, createdAt])
  @@index([blackUserId, createdAt])
  @@index([status])
}

model Move {
  gameId       String
  ply          Int
  uci          String                                  // e2e4, e7e8q
  san          String
  fenAfter     String
  clockAfterMs Int
  moveTimeMs   Int
  createdAt    DateTime @default(now())
  @@id([gameId, ply])                                  // два ходи з одним номером фізично неможливі
}
```

Поля нічиїх (`drawOfferBy`, лічильники з `chess-multiplayer.md` §4.7) додаються разом із
нічиїми — адитивно, з дефолтами.

---

## 5. Ключові флоу

### 5.1. Окрема партія (крок 2–3)
| Дія | Хто | Перехід |
|---|---|---|
| `POST /games { opponentUserId, baseTimeMs, incrementMs, color? }` | будь-хто залогінений | → `CREATED`, `initialFen` з порту |
| `POST /games/:id/accept` | суперник | `CREATED → IN_PROGRESS`, `startedAt` |
| `POST /games/:id/abort` | будь-який гравець, до першого ходу | `CREATED/IN_PROGRESS(ply=0) → ABORTED` |
| `POST /games/:id/resign` | будь-який гравець | `IN_PROGRESS → FINISHED`, результат на користь суперника |
| `POST /games/:id/moves { uci, ply }` | гравець, чия черга (крок 3) | умовний `UPDATE … WHERE ply = ? AND status = IN_PROGRESS` |
| `GET /games/:id` | гравці + будь-хто (публічний перегляд) | стан + ходи |

Кожен перехід — умовний `UPDATE … WHERE status = …` (подвійний resign/accept — no-op). Завершення
(`FINISHED`/`ABORTED`) у тій самій транзакції: `GameResultHooks.onFinished` + outbox
`chess.game.finished`. Здача дає змогу перевірити весь ланцюг завершення **до рушія**.

### 5.2. Створення турніру
`POST /tournaments` → **одна транзакція** через `EventsService.createInTx(tx, dto)`:
`Event(type=TOURNAMENT, seatsTaken=0, без участі автора)` + outbox `event.created` +
`Tournament(status=REGISTRATION, minPlayers)` + відкладена BullMQ-задача перевірки на `Event.date` (§5.5).
Автор — організатор, **не гравець** (D12).

### 5.3. Гравці
| Шлях | Як | Місце (`seatsTaken`) |
|---|---|---|
| Гравець сам | наявний `POST /events/:id/join` → черга → `joinEvent` → хук `onConfirmed` створює `TournamentPlayer` **у тій самій транзакції** | так, наявний механізм |
| Організатор додає користувача | `POST /tournaments/:id/players { userId }` → `EventsService` у транзакції: `EventParticipant(CONFIRMED)` + той самий умовний `UPDATE` + хук | так |
| Заявка (APPROVAL, крок 8) | `PENDING` → approve → той самий умовний `UPDATE seatsTaken` → хук | на approve |
| Вихід до старту | `leaveEvent` → хук `onCancelled` видаляє `TournamentPlayer` | −1 |
| Вихід після старту | `POST /tournaments/:id/withdraw` → `WITHDRAWN`, `withdrawnAtRound`; наслідки для пар залежать від формату (див. нижче) | не змінюється |

**Хуки можуть відхилити дію** (кидають помилку → транзакція відкочується → `BookingProcessor`
ставить `REJECTED`):
- `onConfirmed`: турнір не в `REGISTRATION` (реєстрація закрита після старту/скасування) або
  `userId = Event.authorId` (організатор не грає);
- `onCancelled`: турнір `IN_PROGRESS` — вийти можна лише через `withdraw`.

Інваріант турніру: `seatsTaken` = кількість `CONFIRMED`-учасників = кількість `TournamentPlayer`.
Список гравців турніру завжди читається з `TournamentPlayer`.

Вибуття залежить від формату — логіка належить генератору пар конкретного формату, а не
`TournamentPlayer`:

| Формат | Уже зіграні партії | Майбутні тури | У MVP |
|---|---|---|---|
| Круговий | за FIDE: зіграв < 50% партій → його результати анулюються, інакше лишаються | пари вже згенеровані на старті → форфейт на користь суперника | **спрощення:** зіграні лишаються завжди, решта — форфейти; правило 50% — пізніше |
| Швейцарка (пізніше, D5) | лишаються завжди | гравця просто **не спарюють** — нових `Pairing` немає, форфейтів немає | — |

Для тай-брейків швейцарки незіграні тури вибулого гравця рахуються за правилами FIDE для
тай-брейків (незіграні партії) — це питання калькулятора таблиці, схема не змінюється:
`withdrawnAtRound` і відсутність `Pairing` уже дають потрібні дані.

### 5.4. Старт і тури (круговий)
`POST /tournaments/:id/start` (організатор) → умовний `UPDATE … WHERE status = REGISTRATION`;
**відмова, якщо гравців < `minPlayers`**. Далі `IN_PROGRESS`, `seed` (за `ratingSnapshot`, далі за
часом реєстрації), усі тури таблицями Бергера (чиста функція, юніт-тести). Для `ONLINE` на старті
туру `tournaments` викликає `GamesService.createTournamentGame` → `Game(source=TOURNAMENT, IN_PROGRESS)`
+ `Pairing.gameId`. Для `OTB` суддя вводить результати (`PUT /pairings/:id/result`).

### 5.5. Скасування турніру (D13)
- **Організатором:** `POST /tournaments/:id/cancel` з `DRAFT/REGISTRATION` → `CANCELLED`,
  `cancelReason = ORGANIZER`.
- **Автоматично:** на `Event.date` відкладена BullMQ-задача (`scheduled-tasks-worker.md`): якщо турнір
  ще `REGISTRATION` і гравців < `minPlayers` → `CANCELLED`, `cancelReason = NOT_ENOUGH_PLAYERS`.
  Якщо гравців досить — нічого (старт ручний). Задача перевизначається при зміні `Event.date`.
- **Лінива перевірка** при читанні турніру — та сама умова (якщо BullMQ пропустив задачу).
- Перехід — умовний `UPDATE … WHERE status = REGISTRATION` (ідемпотентно) + outbox
  `tournament.cancelled` (notifications сповіщає гравців). Учасники лишаються для історії.

### 5.6. Обмеження для турнірних івентів (`events.update` / `remove`)
| Дія | Правило |
|---|---|
| Зміна `type` | заборонено для всіх івентів (`type` незмінний) |
| Зміна `capacity` | не менше `seatsTaken` (для всіх івентів) і не менше `minPlayers` |
| Зміна `date`, `capacity`, `joinPolicy` | лише в `DRAFT/REGISTRATION` |
| Видалення | лише в `DRAFT/REGISTRATION/CANCELLED`; `IN_PROGRESS/FINISHED` → 409 |

### 5.7. Завершення партії → турнір
`games` у транзакції завершення викликає `GameResultHooks.onFinished(tx, { gameId, result, termination })`.
Реалізація в `tournaments` знаходить `Pairing` за `gameId` і пише `result` (`resultSource=GAME`,
умовно `WHERE result IS NULL` — ідемпотентно); коли всі пари туру мають результат → `Round.COMPLETE`.
Для окремих партій (`source=CHALLENGE`) `Pairing` немає — хук no-op. `ABORTED` турнірної партії —
результат не пишеться, рішення за суддею.

---

## 6. Межі модулів і порт рушія

```
tournaments ──(import EventsModule: createInTx, addParticipantInTx)──► events
tournaments ──(реєструє ParticipantHooks в onModuleInit)──► events (реєстр хуків)
tournaments ──(GamesService.createTournamentGame)──► games
tournaments ──(реєструє GameResultHooks в onModuleInit)──► games (реєстр хуків)
games ──► ChessRules (порт) ◄── ChessEngineAdapter (@syncevent/chess-engine)
games, events, tournaments ──(outbox)──► Kafka ──► analytics / notifications
```

Залежність одна — `tournaments → events` і `tournaments → games`. `events` і `games` про турніри не
знають: вони володіють **реєстрами хуків** (`ParticipantHooksRegistry`, `GameResultHooksRegistry`) і
викликають усі зареєстровані в своїй транзакції. Для івентів інших типів і окремих партій хуки — no-op.
Циклу модулів немає, логіка створення `Event` не дублюється.

Порт — внутрішня деталь `games`; `tournaments` його не бачить:

```ts
// apps/backend/src/games/chess-rules.port.ts
export interface ChessRules {
  initialFen(variant: 'STANDARD'): string;
  applyMove(fen: string, uci: string):
    | { ok: true; fenAfter: string; san: string; outcome: null | { result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW'; termination: string } }
    | { ok: false; reason: 'ILLEGAL' | 'BAD_FORMAT' };
  legalMoves(fen: string): string[];                   // uci
}
export const CHESS_RULES = Symbol('CHESS_RULES');
```

Порт працює з **FEN + UCI**, а не з внутрішнім `gameState` ChessB: бекенд не залежить від форми
стану рушія. Хто має право ходити (користувач ↔ колір), нічиї, повторення, годинник — зона
`GamesService`, деталі — `chess-multiplayer.md` §4.

---

## 7. Приватність у зрізі (крок 1)

| Хто | Список (`findAll`) | Картка (`findOne`) | Учасники |
|---|---|---|---|
| Анонім | `PUBLIC` | `PUBLIC` і `UNLISTED` (за посиланням) | якщо `showGuestList` — **лише** `id`, `displayName` |
| Залогінений | `PUBLIC` + свої (автор/учасник) | як вище | як вище |
| Автор | + свої `UNLISTED` | так | повний список + заявки; email — лише автору |

Міграція: `PRIVATE → UNLISTED` (найближче до «не видно публічно»). Email учасників більше не
віддається нікому, крім автора.

---

## 8. Трек рушія (паралельно, у `packages/chess-engine`)

> 2026-09-30: рушій скопійовано з ChessB (`64dfcce`) у `packages/chess-engine` як є (JS, без зміни
> логіки; залежності `COLORS`/`utils` перенесено в пакет, імпорти з `.js`). Пункт 5 — ✅; пункти 1–4
> робляться вже в пакеті, ChessB більше не джерело.

Відповідає `chess-multiplayer.md` Фаза 0; тут — лише що потрібно порту §6:
1. Заповнити фасад `src/engine/index.js` (`isMoveLegal`, `getMoveDetails`, `getLegalMoves`) — з
   наявних `legalMoves.js`, `gameStatus.js`, `notation.js`.
2. Винести `applyMove(state, move)` з `gameSlice.js` у рушій.
3. Повний `fenToState` / `boardToFen` (черга ходу, рокіровки, en passant, лічильники) —
   `fenConverter.js` зараз розбирає лише розстановку.
4. perft(1..4) збігається з еталоном.
5. ✅ Перевірити, що `src/engine/` не імпортує з `redux/`, `utils/`, React; перенести в
   `packages/chess-engine` (питання JS→TS — D9; поки як є, JS).

---

## 9. Режими відмови

| Що впало | Наслідок | Поведінка |
|---|---|---|
| Kafka | Зовнішні консюмери (analytics, notifications) отримують події із затримкою | Турнір не зачеплений — результат іде хуком у транзакції; outbox дошле |
| Redis/BullMQ (join) | Самостійний join не обробляється | Як зараз (`booking-concurrency.md`); додавання гравців організатором іде напряму в транзакцію й працює |
| BullMQ (автоскасування) | Задача на `Event.date` не спрацювала | Лінива перевірка при читанні турніру (§5.5) |
| Рушій не підключений | Ходів немає | Партію можна створити, прийняти, скасувати, здати; OTB-турніри повністю працюють |

---

## 10. Поетапний план (кожен крок — стоп на рев'ю)

### Крок 1 — приватність
Enum `PUBLIC/UNLISTED` + міграція `PRIVATE→UNLISTED`, `joinPolicy` (поки лише колонка, дефолт
`OPEN`), `showGuestList`, `findAll`/`findOne` за §7, прибрати email, оновити `packages/shared` і
обидві форми фронтенду.
**Готово, коли:** юніт-тести на кожен рядок §7; анонім не бачить email; `UNLISTED` відкривається за
id і відсутній у списку; обидва фронтенди збираються.

### Крок 2 — партія (без ходів)
Модуль `games`: `Game`, `Move`, порт `ChessRules` (+ тестовий дублер), `GameResultHooksRegistry`,
флоу §5.1 без ходів (create / accept / abort / resign / get), топік `chess.game.finished` у
`packages/shared`.
**Готово, коли:** create → accept → resign дає `FINISHED` з правильним результатом, хук викликано,
outbox записано; подвійний resign/accept — no-op; сторонній користувач не може accept/resign;
`initialFen` і годинники коректні.

### Крок 3 — хід через рушій
Після треку §8: `ChessEngineAdapter`, `POST /games/:id/moves` (умовний `UPDATE … WHERE ply = ?`),
завершення матом/патом → `FINISHED` через той самий шлях, що й resign. Далі — `chess-multiplayer.md`
Фаза 1 (WS, таймери, reconnect).
**Готово, коли:** партію від першого ходу до мату зіграно через API; два паралельні ходи з одним `ply`
→ пройшов рівно один; хід не в свою чергу / нелегальний — 4xx без змін стану.

### Крок 4 — тип івенту
`Event.type`, `seatsTaken` замість `_count.participants`, `myStatus` замість `isJoined`, правила
`update`/`remove` з §5.6, що стосуються всіх івентів (`type` незмінний, `capacity ≥ seatsTaken`).
**Готово, коли:** зміна `type` і зменшення `capacity` нижче `seatsTaken` відхиляються; обидва
фронтенди працюють з `myStatus`.

### Крок 5 — турнір і гравці
Модуль `tournaments`: `Tournament` (+ `minPlayers`), `TournamentPlayer`, `POST /tournaments` через
`createInTx`, `ParticipantHooksRegistry` у `events` + реалізація в `tournaments` (з відмовами §5.3),
додавання користувача організатором, `GET /tournaments/:id`, скасування §5.5, обмеження §5.6.
**Готово, коли:** самостійний join і додавання організатором дають по `TournamentPlayer`; ліміт
`capacity` тримається для обох шляхів; автор не може стати гравцем; вихід до старту видаляє гравця;
турнір з < `minPlayers` на `Event.date` скасовано (і задачею, і лінивою перевіркою); видалити
`IN_PROGRESS` не можна.

### Крок 6 — тури й пари (OTB)
`Round`, `Pairing`, генератор Бергера (чиста функція + тести на 3–10 гравців, bye для непарних),
`start` (перевірка `minPlayers`, закриття реєстрації), введення результату суддею, `withdraw`,
таблиця (очки, потім тай-брейки).
**Готово, коли:** OTB-турнір на 5 гравців проходить від реєстрації до фінальної таблиці; join після
старту → `REJECTED`.

### Крок 7 — онлайн-турнір
`GamesService.createTournamentGame`, `Pairing.gameId`, реалізація `GameResultHooks` у `tournaments`.
**Готово, коли:** онлайн-турнір на 3 гравців: партії зіграно (або здано), результати самі потрапили в
таблицю; повторний виклик хука не змінює результат.

### Крок 8 — заявки (APPROVAL)
`ParticipantStatus` + `PENDING/REJECTED`, `joinPolicy=APPROVAL` у `joinEvent` (PENDING без місця),
approve/reject через умовний `UPDATE seatsTaken`, стан `PENDING_APPROVAL` у `BookingStatusService`
і фронтенді.
**Готово, коли:** approve паралельно з join-ами через чергу на останнє місце → рівно `capacity`
`CONFIRMED`; подвійний approve — no-op.

---

## 11. Рішення

| # | Рішення | Статус | Вибір / пропозиція | Альтернатива |
|---|---|---|---|---|
| D1 | Міграція `PRIVATE` | чекає | `→ UNLISTED` | `→ PUBLIC + APPROVAL` |
| D2 | `EventParticipant` → `Registration` | чекає | не зараз | перейменувати в кроці 4 |
| D3 | Гості без акаунта в турнірі | **ухвалено 2026-09-30** | ні, лише зареєстровані | `TournamentPlayer.userId?` |
| D4 | `Game.tournamentId` | чекає | немає, зв'язок лише `Pairing.gameId` | денормалізоване поле |
| D5 | Формат на старті | чекає | лише круговий | + швейцарка одразу (Python/bbpPairings) |
| D6 | Порт рушія на FEN + UCI | чекає | так | передавати внутрішній стан ChessB |
| D7 | Створення `TournamentPlayer` | **ухвалено 2026-09-30** | синхронний хук у транзакції join (з правом відмови) | Kafka-консюмер |
| D8 | `games` і `tournaments` — модулі в `backend` | чекає | так | окремий `game-service` одразу |
| D9 | Рушій при перенесенні — JS→TS | чекає | як є (JS + `.d.ts`), TS окремим кроком | одразу TS |
| D10 | Порядок кроків | **ухвалено 2026-09-30** | спочатку партія (2–3), APPROVAL — останнім (8) | турнір раніше за партію |
| D11 | Результат партії → турнір | **ухвалено 2026-09-30** | синхронний `GameResultHooks` у транзакції; Kafka лише назовні | консюмер `chess.game.finished` у бекенді |
| D12 | Організатор — гравець свого турніру | **ухвалено 2026-09-30** | ні; турнірний івент без участі автора | дозволити |
| D13 | Недобір гравців | **ухвалено 2026-09-30** | `minPlayers`; автоскасування на `Event.date` (BullMQ + лінива перевірка); старт ручний | автостарт, якщо гравців досить |
| D14 | Модулі й реєстри хуків | **ухвалено 2026-09-30** | `tournaments` імпортує `events`/`games`; ті володіють реєстрами хуків | DI-токен, реалізований у `tournaments` (цикл/дублювання) |

---

## 12. Як відновити контекст роботи

1. Цей документ: §0, §10 (який крок наступний), §11 (які рішення ухвалено).
2. Код: `events.service.ts` (`create`, `findAll`, `findOne`, `joinEvent`, `update`, `remove`),
   `booking/booking.processor.ts`, `booking/booking-status.service.ts`, `schema.prisma`.
3. Повна картина: `chess-multiplayer.md` (партія, WS), `organizations-and-monetization.md` (приватність,
   платежі), `booking-concurrency.md` (місця), `scheduled-tasks-worker.md` (BullMQ).
4. Трек рушія: `D:\Projects\ChessB\src\engine\index.js`, `src/utils/fenConverter.js`,
   `docs/next-steps.md` у ChessB.
