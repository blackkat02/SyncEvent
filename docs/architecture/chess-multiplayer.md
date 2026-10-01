# Шахи: мультиплеєр, турніри і Python-сервіси

> Статус: **проєкт рішення** (draft). Соло-проєкт, автор — Borys.
> Останнє оновлення: 2026-09-30 (рушій скопійовано в `packages/chess-engine` — далі розвивається там;
> каркас Python-сервісу `apps/chess-service` (назва замість `chess-analysis` — сервіс ширший за аналіз);
> роль Python підтверджено: поруч, не посередині). 2026-09-23: аналіз, цільова архітектура, деталі
> WebSocket, правила нічиїх затверджено, відкрите лише питання різних N/K для контролів часу.
> Пов'язаний код: сусідній репозиторій `D:\Projects\ChessB` (`src/engine/`, `src/redux/game/`,
> `docs/next-steps.md`, `docs/clock-and-game-record.md`), у SyncEvent — `apps/backend/src/events/`,
> `apps/backend/src/kafka/`, `apps/backend/src/outbox/`, `apps/backend/src/scheduled-tasks/`,
> `packages/shared/src/events/event-topics.ts`.
> Пов'язані документи: `booking-concurrency.md` (реєстрація з обмеженими місцями, outbox),
> `scheduled-tasks-worker.md` (BullMQ), `nextjs-migration.md` (фронтенд).

---

## 0. TL;DR / рішення

1. **Сервер — джерело істини для партії.** Клієнт надсилає лише *намір* ходу; сервер перевіряє чергу, легальність, годинник, записує хід і розсилає його обом гравцям. `localStorage` перестає бути джерелом стану.
2. **Один рушій на клієнті й сервері.** Рушій ChessB (`src/engine/`) — чистий JS без React; виносимо його в `packages/chess-engine` і використовуємо і в UI (підсвітка, оптимістичний хід), і в `game-service` (авторитетна валідація).
3. **ChessB переїжджає в монорепо SyncEvent**: `apps/chess-web` (фронт), `apps/game-service` (NestJS + WebSocket), `packages/chess-engine`.
4. **Турнір = різновид `Event`.** Реєстрація повторно використовує `EventParticipant` + захист від овербукінгу з `booking-concurrency.md`. Розклад турів — BullMQ, зв'язок «партія завершилась → таблиця → наступний тур» — Kafka через outbox.
5. **Python — так, але поруч, не посередині.** Python-сервіси (аналіз Stockfish через `python-chess`, рейтинг Glicko-2, швейцарське жеребкування, античит) слухають Kafka / відповідають на внутрішні HTTP-запити. На шлях кожного ходу Python **не** ставимо.
6. Впроваджуємо поетапно: Фаза 0 (рушій як пакет) → 1 (партія двох користувачів) → 2 (лобі) → 3 (турніри) → 4 (Python) → 5 (масштабування).

---

## 1. Поточний стан ChessB (що вже є)

| Що | Де | Значення для мультиплеєра |
|---|---|---|
| Рушій: pseudo-moves, king safety, рокіровка, en passant, промоція, мат/пат, SAN | `src/engine/*.js` (покрито тестами, ~184 тести на 2026-09-19) | Переноситься на сервер майже без змін |
| Застосування ходу (оновлення дошки, `castlingRights`, `enPassantTarget`, history) | **редюсер** `src/redux/game/gameSlice.js` (`moveExecuted`, `nextCastlingRights`, `nextEnPassantTarget`) | ❗ Треба винести в чисту `applyMove(state, move)` — інакше сервер не зможе перевикористати |
| Фасад `engine/index.js` | заглушка | Заповнити (`docs/next-steps.md`, крок 3) — це і є публічний API пакета |
| Годинник на `Date.now()`-мітках (`turnStartedAt`, `clockAfter`, `moveTimeMs` в history) | `docs/clock-and-game-record.md` | Модель без змін лягає на сервер: лише джерело часу — серверне |
| Resign / draw offer | UI + slice | Стануть WS-командами |
| Стан у `localStorage` зі `SCHEMA_VERSION` | `src/redux/persistGame.js` | Лишається лише для локальної (hot-seat) гри / офлайн-режиму |

Дрібні зв'язки рушія з рештою коду, які треба розірвати при винесенні:
- `engine/*` імпортує `COLORS` з `redux/game/gameConstants` → перенести константи в пакет рушія.
- `engine/*` імпортує `utils/boardUtils`, `utils/chessHelpers` → перенести в пакет (це частина домену, не UI).

---

## 2. Ментальна модель: ролі

| Роль | Хто | Навіщо |
|---|---|---|
| **Правила шахів** | `packages/chess-engine` (TS/JS) | Одна реалізація правил для клієнта й сервера. |
| **Джерело істини про партію** | `game-service` + **Postgres** | Приймає рішення «хід прийнято / відхилено», веде годинник, фіксує результат. |
| **Доставка в реальному часі** | WebSocket (Socket.IO) + Redis pub/sub adapter | Розсилка ходів/годинника гравцям і глядачам, у т.ч. між кількома інстансами. |
| **Таймери** | BullMQ (Redis) | Падіння прапорця, старт туру за розкладом, abort партії без першого ходу. |
| **Турнірна логіка** | модуль `tournaments` у `backend` | Реєстрація, тури, пари, таблиця, тай-брейки. |
| **Розсилка фактів** | Kafka (через outbox) | `game.finished` → таблиця, рейтинг, аналіз, нотифікації. Не на критичному шляху ходу. |
| **Важкі обчислення** | Python-сервіси | Аналіз рушієм, рейтинг, жеребкування, античит. |

Правило (як у бронюванні): **коректність партії вирішує Postgres-транзакція в `game-service`. Kafka лише транслює те, що вже сталося.** Якщо Kafka лежить — грати можна, таблиця/рейтинг оновляться із затримкою.

---

## 3. Цільова архітектура

```
┌──────────────┐  WebSocket   ┌────────────────────────────┐
│  chess-web   │◄────────────►│  game-service (NestJS)      │
│ React (→Next)│ move / clock │  - WS gateway (Socket.IO)   │
│ + chess-     │              │  - валідація: chess-engine  │
│   engine     │              │  - серверний годинник       │
└──────┬───────┘              │  - BullMQ: flag / abort     │
       │ REST (auth, лобі,    └───┬──────────┬──────────────┘
       │ турніри)                 │ Redis    │ outbox → Kafka:
       ▼                          │ pub/sub  │ chess.game.started / .finished
┌────────────────────┐            │          ▼
│ backend (SyncEvent)│◄── Kafka ──┴──► ┌──────────────────────────┐
│ auth, events,      │                 │ Python-сервіси            │
│ реєстрація,        │◄── HTTP ───────►│ - аналіз (Stockfish)      │
│ tournaments module │  (жеребкування) │ - рейтинг Glicko-2        │
│ (тури, пари,       │                 │ - швейцарське жеребкування│
│  таблиця, BullMQ)  │                 │ - античит                 │
└─────────┬──────────┘                 └──────────────────────────┘
          ▼
   Postgres: User, Event, EventParticipant, Tournament, Round, Pairing, Game, Move
```

### 3.1. Розкладка монорепо

```
apps/
  backend/            # + модуль tournaments
  game-service/       # новий NestJS: WS gateway + ігрова логіка
  chess-web/          # перенесений ChessB (пізніше — фіча у frontend-next)
  chess-service/      # Python (не в pnpm workspace; свій Dockerfile / pyproject) — ✅ каркас 2026-09-30
packages/
  chess-engine/       # рушій з ChessB (+ applyMove, FEN in/out, PGN) — ✅ скопійовано 2026-09-30
  shared/             # + шахові топіки Kafka, DTO WS-подій (zod-схеми)
```

**Чому `game-service` окремо від `backend`:** довгоживучі WS-з'єднання й таймери масштабуються інакше, ніж REST; падіння/деплой REST не повинні рвати партії. На старті можна почати модулем усередині `backend` і винести пізніше — межу модуля тримаємо такою, ніби це вже окремий сервіс (спілкується з рештою лише через БД-таблиці `Game/Move` і Kafka).

---

## 4. Партія: протокол і коректність

### 4.1. WebSocket-контракт (zod-схеми в `packages/shared`)

Клієнт → сервер (усі з **ack**: відповідь отримує лише ініціатор, див. 4.6.4):

| Подія | Payload | Ack | Примітка |
|---|---|---|---|
| `game:join` | `{ gameId }` | `game:snapshot` | Гравець або глядач |
| `game:move` | `{ gameId, ply, from, to, promotion?, offerDraw? }` | `{ ok: true, drawOffer? }` / `{ ok: false, reason }` | `ply` — номер напівходу, який клієнт *очікує* зробити (оптимістична конкуренція); `offerDraw` — пропозиція нічиї разом із ходом (4.7, D12) |
| `game:resign` | `{ gameId }` | `{ ok }` | |
| `game:draw-offer` / `game:draw-accept` / `game:draw-decline` | `{ gameId }` | `{ ok }` / `{ ok: false, reason }` | Правила — 4.7 |
| `game:abort` | `{ gameId }` | `{ ok }` | Лише до першого ходу обох сторін |

Сервер → клієнт:

| Подія | Payload |
|---|---|
| `game:snapshot` | `{ fen, history, whiteTimeMs, blackTimeMs, turnStartedAt, serverNow, status, players }` |
| `game:move-applied` | `{ ply, san, uci, fenAfter, whiteTimeMs, blackTimeMs, turnStartedAt, serverNow }` |
| `game:draw-offered` | `{ by, ply }` |
| `game:draw-declined` | `{ by, ply, implicit }` (`implicit: true` — відхилено ходом, див. 4.7) |
| `opponent-presence` | `{ userId, online }` (опційно, 4.6.5) |
| `game:over` | `{ result, termination }` (`checkmate`, `stalemate`, `timeout`, `resignation`, `agreement`, `abort`) |

Окремої події `game:move-rejected` немає: відмова повертається ініціатору в ack, а в кімнату розсилаються лише прийняті факти.

`serverNow` потрібен клієнту, щоб порахувати зсув годинника (`offset = serverNow − Date.now()`) і малювати відлік без дрейфу — модель `useClockTicker` з ChessB лишається, змінюється лише джерело часу.

### 4.2. Обробка ходу на сервері

1. Автентифікація: JWT з наявної системи auth (handshake Socket.IO), `userId` має бути гравцем потрібного кольору.
2. Завантажити стан партії (Postgres; кеш у Redis — оптимізація Фази 5).
3. Перевірити `status = IN_PROGRESS`, черговість, `ply === game.ply`.
4. Порахувати годинник: `elapsed = now − turnStartedAt`; якщо `timeLeft − elapsed ≤ 0` → партія програна за часом (хід не приймається).
5. `chess-engine`: `isMoveLegal` → `applyMove` → `isCheckmate/isStalemate`.
6. **Одна транзакція**: `INSERT Move (gameId, ply, …)` + умовний `UPDATE Game SET ply = ply + 1, fen = …, whiteTimeMs/blackTimeMs = …, turnStartedAt = now WHERE id = ? AND ply = ?` + (якщо кінець) результат + `OutboxEvent`. У цій же транзакції — наслідки для нічиєї: хід гасить активну пропозицію суперника (D4), а `offerDraw: true` створює нову (D12).
7. Розіслати `game:move-applied` у кімнату `game:{id}`; переставити flag-таймер (4.3).

**Захист від гонок (defense in depth, як у бронюванні):**
- `@@id([gameId, ply])` у `Move` — фізично неможливо записати два ходи з одним номером (подвійний клік, два вкладки, дві інстанції сервісу).
- Умовний `UPDATE … WHERE ply = ?` — якщо рядок не оновився, хід застарів → ack `{ ok: false, reason: 'STALE_PLY' }`.
- Серверний час — єдиний, клієнтські мітки не приймаються.

### 4.3. Таймери

- **Прапорець:** після кожного ходу — BullMQ delayed job `flag` з `jobId = flag:{gameId}:{ply}` на момент, коли в активного гравця скінчиться час. Воркер: якщо `game.ply` досі той самий і час справді вийшов → `game:over (timeout)`. Старий job видаляється або просто стає no-op через перевірку `ply`.
- **Лінива перевірка** при кожному вхідному ході (крок 4 вище) — страховка на випадок затримки воркера.
- **Abort:** job `abort:{gameId}` — якщо перший хід не зроблено за N секунд.
- Нічия за недостатнім матеріалом при падінні прапорця (у суперника лише король) — правило FIDE; реалізувати разом із нічиїми в рушії (`next-steps.md`, крок 7).

### 4.4. Перепідключення

Клієнт після reconnect шле `game:join` і отримує повний `game:snapshot` — ніяких дельт/реплею подій. Годинник продовжує йти, поки гравця немає (як на Lichess/Chess.com — узгоджено з `clock-and-game-record.md`, розділ 6.1).

### 4.5. Клієнт

- Redux лишається, але `game`-slice стає **дзеркалом** серверного стану: `moveExecuted` викликається з `game:move-applied`, а не з кліку.
- Оптимістичний хід: при кліку одразу застосувати через `chess-engine`, позначити `pending`; при ack `{ ok: false }` або таймауті ack — відкотитись на останній `snapshot`.
- Локальний hot-seat режим (поточний ChessB) лишаємо як окремий режим — той самий рушій, без сервера.

### 4.6. WebSocket: деталі

#### 4.6.1. Чому WebSocket і чому Socket.IO
HTTP — «клієнт спитав, сервер відповів», а хід суперника народжується на сервері в невідомий момент. Polling (`GET /game/:id` щосекунди) — повільно й дорого. WebSocket — одне довге двостороннє з'єднання, сервер сам штовхає `move-applied`.

**Socket.IO** замість «голого» `ws`, бо з коробки дає: кімнати, ack-колбеки (request/response поверх сокета), автоперепідключення + heartbeat, Redis adapter для кількох інстансів, інтеграцію з NestJS (`@nestjs/websockets` + `@nestjs/platform-socket.io`).

#### 4.6.2. Життєвий цикл з'єднання

```
Клієнт                                   game-service
  │ connect(auth: { token: accessJWT })     │
  │────────────────────────────────────────►│ handleConnection: перевірити JWT
  │                                         │ socket.data.userId = sub; join(`user:{id}`)
  │ emit game:join {gameId}  (ack)          │
  │────────────────────────────────────────►│ чи має право? → socket.join(`game:{id}`)
  │◄──────── ack: game:snapshot ────────────│ повний стан з Postgres
  │                                         │
  │ emit game:move {gameId, ply, from, to}  │
  │────────────────────────────────────────►│ валідація → транзакція → COMMIT
  │◄──────── ack: {ok: true}  ──────────────│
  │◄═══ to(`game:{id}`).emit move-applied ══│ обом гравцям і глядачам
```

**Автентифікація:**
- JWT перевіряється **один раз на handshake** (`socket.handshake.auth.token`); невалідний → `socket.disconnect(true)`.
- Access-токен короткий, з'єднання — довге. Правило: токен валідний на момент підключення → з'єднання живе до розриву; при reconnect клієнт іде вже з оновленим токеном (ротація refresh-токенів — `refresh-token-rotation.md` — без змін).
- **Права — на кожну дію окремо.** Бути в кімнаті ≠ мати право ходити (глядачі теж у кімнаті): `game:move` приймається, лише якщо `socket.data.userId` — гравець кольору, чия черга.

#### 4.6.3. Кімнати

| Кімната | Хто | Що йде |
|---|---|---|
| `game:{gameId}` | обидва гравці + глядачі | `move-applied`, `game:over`, presence, `draw-offered/declined` (глядачі теж бачать пропозиції — 4.7) |
| `user:{userId}` | усі вкладки користувача (join одразу при connect) | виклик на гру, «ваша партія туру готова» |
| `tournament:{id}` | ті, хто дивиться турнір | оновлення таблиці, старт туру |

#### 4.6.4. Ack замість окремої події помилки

Відповідь ініціатору — через ack; розсилка фактів — у кімнату.

```ts
// game.gateway.ts (ескіз)
@WebSocketGateway({ namespace: '/game' })
export class GameGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly games: GameService, private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const { sub } = await this.jwt.verifyAsync(socket.handshake.auth.token);
      socket.data.userId = sub;
      socket.join(`user:${sub}`);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('game:join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() dto: JoinGameDto) {
    const snapshot = await this.games.getSnapshot(dto.gameId, socket.data.userId);
    socket.join(`game:${dto.gameId}`);
    return snapshot; // ← це і є ack
  }

  @SubscribeMessage('game:move')
  async move(@ConnectedSocket() socket: Socket, @MessageBody() dto: MoveDto) {
    const result = await this.games.makeMove(socket.data.userId, dto); // транзакція всередині
    if (!result.ok) return { ok: false, reason: result.reason };       // тільки ініціатору

    this.server.to(`game:${dto.gameId}`).emit('game:move-applied', result.moveEvent);
    if (result.gameOver) this.server.to(`game:${dto.gameId}`).emit('game:over', result.gameOver);
    return { ok: true };
  }
}
```

Клієнт:

```js
socket.timeout(5000).emit('game:move', { gameId, ply, from, to }, (err, res) => {
  if (err || !res.ok) rollbackToSnapshot(); // таймаут або відмова → відкат оптимістичного ходу
});
```

Правила:
1. **Розсилати лише після COMMIT.** Якщо транзакція відкотилась, а подія вже пішла — клієнти бачать хід, якого немає в БД.
2. **Ініціатор теж отримує `move-applied`** (він у кімнаті) — клієнт впізнає свій хід за `ply` і лише знімає `pending`, не застосовує вдруге.
3. **DTO — через zod** (`nestjs-zod`, як у решті проєкту), схеми в `packages/shared` → одні типи на клієнті й сервері.

#### 4.6.5. Порядок, пропуски, перепідключення, присутність

`ply` у кожній події — номер послідовності. Клієнт тримає `lastPly`:

| Прийшло | Дія |
|---|---|
| `ply === lastPly + 1` | застосувати |
| `ply <= lastPly` | дублікат → ігнор |
| `ply > lastPly + 1` | пропуск (був розрив) → `game:join` → свіжий snapshot |

Реплею подій свідомо немає: будь-яка неузгодженість лікується повним snapshot (FEN + history + годинники — це мало).

- Socket.IO перепідключається сам з backoff. На `connect` (і повторний теж) клієнт робить `game:join` — сервер **не пам'ятає** кімнати після розриву.
- **Розрив ≠ здача.** Годинник іде, сервер нічого не робить: гравець повернеться або впаде прапорець.
- Опційно — присутність: на `disconnect` розіслати `opponent-presence { online: false }`; у довгих контролях — дати супернику кнопку «забрати перемогу», якщо гравця немає N секунд. «Офлайн» = у `user:{id}` не лишилось жодного сокета (кілька вкладок!).
- Heartbeat (ping/pong) вбудований — мертве з'єднання помічається за ~`pingInterval + pingTimeout` (дефолт ≈ 45 с).

#### 4.6.6. Годинник по сокету
Сервер **не шле тіки**. Кожна подія з годинником несе `whiteTimeMs`, `blackTimeMs`, `turnStartedAt`, `serverNow`; клієнт:

```js
offset = serverNow - Date.now();
remaining = timeMs - (Date.now() + offset - turnStartedAt);
```

і малює відлік локально (як `useClockTicker` у ChessB). Компенсація лагу (½ RTT з ack) — пізніше; для першої версії досить `offset`.

#### 4.6.7. Кілька інстансів
- **`@socket.io/redis-adapter`** — `emit` у кімнату проходить через Redis pub/sub на всі інстанси (власний `IoAdapter` у NestJS).
- **Sticky sessions** потрібні лише для fallback на HTTP long-polling. Простіше: `transports: ['websocket']` на клієнті.
- Стан партії — **не в пам'яті інстансу**, лише в Postgres (пізніше кеш у Redis). Два ходи на різні інстанси розрулює `WHERE ply = ?` + `@@id([gameId, ply])`.
- Події не з gateway (flag-таймер у BullMQ-воркері, «тур почався» з backend) шлються через **`@socket.io/redis-emitter`** — без власного WS-сервера.

#### 4.6.8. Захист
- **Rate limit на сокет** (загальний): не більше ~10 подій/с на з'єднання, понад ліміт — ack `{ ok: false, reason: 'RATE_LIMITED' }`, при злісному перевищенні — disconnect. Це захист від флуду взагалі; **спам пропозиціями нічиї обмежується окремими доменними правилами — 4.7**, rate limit їх не замінює.
- `maxHttpBufferSize` — обмеження розміру payload.
- CORS / `origin` у конфігурації gateway — лише ваш фронт.
- Глядачам у турнірах — за потреби трансляція із затримкою в N ходів (проти підказок).

#### 4.6.9. Одна партія наскрізь
1. `POST /games` (REST) або жеребкування туру → `Game (WAITING)` у Postgres → `emit` у `user:{id}` обом: «гра готова».
2. Обидва підключаються, `game:join` → snapshot. Коли присутні обидва → `IN_PROGRESS`, abort-таймер.
3. Цикл ходів: ack ініціатору → `move-applied` у кімнату → перестановка flag-таймера.
4. Мат / здача / прапорець (прапорець — з BullMQ-воркера через redis-emitter) → `game:over` у кімнату, `chess.game.finished` в outbox → далі турнір, рейтинг, аналіз уже через Kafka, без сокетів.

### 4.7. Пропозиції нічиї: правила

> Статус: **D1–D9 і числа затверджено 2026-09-23** (N = 10, K = 3, M = 0). D10 (приглушення — на клієнті) і D11 (глядачі бачать) вирішено там же. D12 (коли можна пропонувати) вирішено 2026-09-23 — варіант (б). Відкритим лишається лише питання нижче (різні N/K для контролів часу) — не блокує Фазу 1. Мета — щоб пропозиція нічиї не ставала інструментом тиску/спаму на суперника, чий годинник іде.

Правила (перевіряються сервером у `game:draw-offer`, відмова → ack `{ ok: false, reason }`):

| # | Правило | Причина відмови | Навіщо |
|---|---|---|---|
| D1 | Лише гравець партії в статусі `IN_PROGRESS` | `NOT_A_PLAYER` / `GAME_NOT_ACTIVE` | базова авторизація |
| D2 | Одна активна пропозиція на партію; повторна від того ж гравця, поки попередня висить — no-op | `ALREADY_PENDING` | нема сенсу в дублікатах |
| D3 | Якщо суперник уже запропонував — `draw-offer` від другого = **прийняття** (нічия за згодою) | — | стандартна поведінка, не створює зустрічних «висячих» пропозицій |
| D4 | Пропозиція **згасає, коли одержувач робить хід** (неявне відхилення → `draw-declined { implicit: true }`) | — | як у FIDE: хід = відповідь «ні»; не треба окремо тиснути «відхилити» |
| D5 | **Кулдаун за ходами:** після відхилення (явного чи неявного) той самий гравець не може пропонувати ще **N = 10 напівходів** | `DRAW_OFFER_COOLDOWN` | головний захист від спаму; саме за ходами, не за секундами, — щоб не можна було «перечекати» кулдаун, не граючи |
| D6 | **Ліміт на партію:** не більше **K = 3** пропозицій від гравця | `DRAW_OFFER_LIMIT` | остаточна межа |
| D7 | Не раніше **ходу M** — налаштування турніру (`drawOffersFromMove`, «софійське правило»; за замовчуванням **M = 0** = без обмеження). До першого ходу обох — лише `abort`, не нічия | `DRAW_OFFER_TOO_EARLY` | турнірна політика |
| D8 | `draw-accept` / `draw-decline` — лише від **одержувача** активної пропозиції; прийняти власну не можна | `NO_PENDING_OFFER` / `NOT_RECIPIENT` | коректність |
| D9 | `draw-accept` — у тій самій транзакції з умовою `WHERE drawOfferBy = <суперник> AND status = IN_PROGRESS` (+ перевірка, що прапорець ще не впав) | `STALE` | гонка «прийняв нічию ↔ суперник у ту ж мить походив / впав прапорець» |
| D10 | Одержувач може **приглушити** пропозиції до кінця партії — **лише на клієнті** (сервер розсилає як завжди, клієнт просто не показує банер). Окремого стану «скасувати пропозицію» на клієнті не треба: активна пропозиція стирається сама, щойно приходить `move-applied` (D4) або `game:over` | — | UX проти роздратування |
| D11 | Пропозиції **бачать глядачі**: `draw-offered/declined` ідуть у кімнату `game:{id}` | — | прозорість трансляції |
| D12 | **Два способи запропонувати:** (1) **разом із ходом** — `game:move { …, offerDraw: true }` (онлайн-відповідник FIDE 9.1.2 «зробив хід і до натискання годинника»); (2) **окремою кнопкою будь-коли** — `game:draw-offer`, і на своєму ході, і на ході суперника (FIDE визнає таку пропозицію дійсною). Обидва способи проходять ті самі перевірки D1–D7 і рахуються в один ліміт K | ті самі, що D1–D7 | вирішено, варіант (б) |
| D13 | **Хід + `offerDraw` при активній пропозиції суперника:** хід спершу **відхиляє** пропозицію суперника (D4, FIDE «торкнувся фігури»), потім створює нову від гравця. Щоб погодитись на нічию — `game:draw-accept`, а не хід | — | однозначність: хід ніколи не означає згоду |
| D14 | **Хід валідний, пропозиція — ні** (кулдаун, ліміт, ранній хід): хід **приймається**, пропозиція відкидається; ack `{ ok: true, drawOffer: { ok: false, reason } }`. Хід, що завершує партію (мат, пат), пропозицію ігнорує | `DRAW_OFFER_*` у `drawOffer.reason` | порушення правил нічиєї не повинне коштувати ходу / часу |
| D15 | **Відкликати пропозицію не можна** — окремої команди немає (FIDE 9.1.2) | — | відповідність Кодексу |

Відкриті питання:
- Чи потрібні інші N/K для bullet/blitz/classical (зараз — однакові для всіх контролів).

Довідка — що каже Кодекс FIDE (Laws of Chess), на чому базуються D4, D7, D12, D15:
- **ст. 9.1.2** — пропонувати нічию треба *після того, як зробив хід на дошці, і до натискання годинника*. Пропозиція в будь-який інший момент **теж дійсна**, але з оглядом на ст. 11.5. Умов до пропозиції додавати не можна. Пропозицію **не можна відкликати**; вона діє, доки суперник її не прийме, не відхилить усно, не торкнеться фігури з наміром походити чи не завершиться партія іншим способом.
- **ст. 11.5** — заборонено відволікати чи дратувати суперника, зокрема *необґрунтованими пропозиціями нічиї*.
- **ст. 9.1.1** — регламент змагання може заборонити нічию за згодою раніше певного ходу або взагалі без згоди арбітра (у нас — D7, `drawOffersFromMove`).
- Онлайн-відповідник «зробив хід і до натискання годинника» — **пропозиція разом із ходом** (прапорець у `game:move`). «Торкнувся фігури» онлайн = зробив хід (D4 вже так і працює). Наші D5/D6 — автоматична заміна ст. 11.5, бо арбітра немає.
- Розглядались варіанти: (а) лише разом зі своїм ходом; (б) разом з ходом **і** окремо будь-коли. Обрано **(б)**: повністю в межах Кодексу, а зловживання обмежують D4–D6.

Поля в `Game` під ці правила — див. розділ 5 (`drawOfferBy`, `drawOfferPly`, лічильники й `…DrawCooldownUntilPly`). Тести (коли дійде до реалізації): кожне правило D1–D9 і D12–D14 — окремий кейс у `game.service.spec.ts`, D9 — конкурентний тест на кшталт `smoke:booking`.

---

## 5. Модель даних (ескіз Prisma)

```prisma
enum GameStatus { WAITING IN_PROGRESS FINISHED ABORTED }
enum GameResult { WHITE_WINS BLACK_WINS DRAW }
enum TournamentFormat { ROUND_ROBIN SWISS ARENA }
enum TournamentStatus { DRAFT REGISTRATION CLOSED IN_PROGRESS FINISHED }

model Tournament {
  id            String           @id @default(cuid())
  eventId       String           @unique           // 1:1 з Event: реєстрація, capacity, видимість
  event         Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  format        TournamentFormat
  status        TournamentStatus @default(DRAFT)
  roundsPlanned Int
  baseTimeMs    Int
  incrementMs   Int              @default(0)
  drawOffersFromMove Int         @default(0)      // 4.7, D7 ("софійське правило")
  rounds        Round[]
  games         Game[]
}

model Round {
  id           String    @id @default(cuid())
  tournamentId String
  number       Int
  startsAt     DateTime
  status       String                            // PAIRING | PLAYING | COMPLETE
  pairings     Pairing[]
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  @@unique([tournamentId, number])
}

model Pairing {
  id       String  @id @default(cuid())
  roundId  String
  whiteId  String
  blackId  String?                               // null = bye
  gameId   String? @unique
  round    Round   @relation(fields: [roundId], references: [id], onDelete: Cascade)
}

model Game {
  id            String      @id @default(cuid())
  whiteId       String
  blackId       String
  tournamentId  String?
  status        GameStatus  @default(WAITING)
  result        GameResult?
  termination   String?                          // checkmate | timeout | resignation | ...
  baseTimeMs    Int
  incrementMs   Int         @default(0)
  fen           String                           // поточна позиція
  ply           Int         @default(0)
  whiteTimeMs   Int
  blackTimeMs   Int
  turnStartedAt DateTime?
  drawOfferBy   String?                          // активна пропозиція нічиї (4.7, D2–D4, D8–D9)
  drawOfferPly  Int?                             // на якому ply зроблено — для D4/D5
  whiteDrawOffers Int       @default(0)          // D6
  blackDrawOffers Int       @default(0)          // D6
  whiteDrawCooldownUntilPly Int @default(0)      // D5
  blackDrawCooldownUntilPly Int @default(0)      // D5
  startedAt     DateTime?
  finishedAt    DateTime?
  moves         Move[]
  tournament    Tournament? @relation(fields: [tournamentId], references: [id])
  @@index([whiteId])
  @@index([blackId])
  @@index([tournamentId])
}

model Move {
  gameId       String
  ply          Int
  uci          String                            // e2e4, e7e8q
  san          String
  fenAfter     String                            // одразу закриває "undo/перегляд" з next-steps, крок 6
  clockAfterMs Int
  moveTimeMs   Int
  createdAt    DateTime @default(now())
  game         Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  @@id([gameId, ply])
}
```

Рейтинг — окремо (`Rating { userId, variant, rating, rd, volatility }`), пише його лише Python-сервіс рейтингу (або backend за подією `rating.updated` — див. 7.3).

---

## 6. Турніри

### 6.1. Реєстрація
Турнір створюється як `Event` (дата, місце/«онлайн», `capacity`) + рядок `Tournament`. Реєстрація — наявний `joinEvent` з умовним `UPDATE seatsTaken` (`booking-concurrency.md`) — нічого нового писати не треба, овербукінг уже закритий.

### 6.2. Стан-машина
`DRAFT → REGISTRATION → CLOSED → IN_PROGRESS (тур n: PAIRING → PLAYING → COMPLETE) → FINISHED`

1. BullMQ job `tournament:start` на `event.date` → `CLOSED`, зафіксувати учасників.
2. `PAIRING`: згенерувати пари туру (6.3), створити `Game` для кожної, розіслати гравцям нотифікацію/WS-подію.
3. `PLAYING`: чекати `chess.game.finished` для всіх партій туру (consumer у `tournaments`).
4. `COMPLETE` → оновити таблицю → наступний тур або `FINISHED`.

Неявка: партія без першого ходу → `abort` job фіксує технічну поразку (не нічию), щоб тур не зависав.

### 6.3. Жеребкування
| Формат | Де | Як |
|---|---|---|
| Круговий | TS у `tournaments` | Таблиці Бергера — тривіально, без зовнішніх залежностей. Робимо першим. |
| Швейцарка | Python-сервіс (HTTP `POST /pairings`) | FIDE Dutch — складний алгоритм; використати готову реалізацію (напр. обгортку над `bbpPairings`) замість писати свою. |
| Арена | TS | Жадібне парування вільних гравців за очками/рейтингом, без турів. Найпізніше. |

Тай-брейки (Бухгольц, Зоннеборн-Бергер) рахуються з `Pairing` + `Game.result` — чиста функція, в TS.

---

## 7. Kafka і Python

### 7.1. Топіки (розширення `packages/shared/src/events/event-topics.ts`)

| Топік | Ключ | Продюсер | Консюмери |
|---|---|---|---|
| `chess.game.started` | `gameId` | game-service (outbox) | notifications |
| `chess.game.finished` | `gameId` | game-service (outbox) | tournaments, rating (py), analysis (py), analytics |
| `chess.tournament.round-started` | `tournamentId` | backend (outbox) | notifications |
| `chess.rating.updated` | `userId` | rating (py) | backend (оновлює кеш рейтингу / профіль) |

`chess.move.played` свідомо **не** вводимо на старті: аналіз робиться по завершеній партії (PGN у payload `game.finished`), а живі ходи йдуть через WS/Redis. Додати, якщо з'явиться live-античит.

### 7.2. Роль Python

Python-сервіс (`apps/chess-service`, FastAPI + `aiokafka`, `python-chess`, Stockfish у Docker-образі):

- **Аналіз партій** — оцінка кожної позиції, blunders/mistakes, accuracy → зберігає у своїй схемі/таблиці, фронт читає через REST.
- **Рейтинг Glicko-2** — на `game.finished` (лише рейтингові партії) → `chess.rating.updated`.
- **Швейцарське жеребкування** — синхронний `POST /pairings` від `tournaments` (це один з небагатьох синхронних викликів — жеребкування потрібне, щоб почати тур).
- **Античит** — збіг ходів з першою лінією рушія, розподіл часу на хід; результат — прапорець для модерації, не автобан.

### 7.3. Чому не Python посередині (відкинутий варіант)

Варіант «Python як головний game-server» (FastAPI + WebSocket + `python-chess` як авторитет) технічно робочий, але:
- правила в двох реалізаціях (JS-рушій на клієнті для UX + `python-chess` на сервері) — ризик розбіжностей у крайових випадках;
- втрачається вже готова NestJS-інфраструктура: auth/JWT, outbox, BullMQ, zod-DTO;
- додатковий мережевий хоп на кожен хід (затримка = час на годиннику гравця).

Висновок: Python — для обчислень, які **не** блокують хід і де екосистема Python реально сильніша.

**Межа даних:** Python-сервіси не пишуть напряму в таблиці `backend`/`game-service`; вони мають свої таблиці (або схему) і повідомляють результат подіями Kafka.

---

## 8. Режими відмови

| Що впало | Наслідок | Поведінка |
|---|---|---|
| Kafka | Таблиця/рейтинг/аналіз не оновлюються | Партії йдуть; outbox дошле події після відновлення |
| Python-сервіси | Немає аналізу/рейтингу; швейцарський тур не жеребкується | Партії йдуть; тур чекає (retry job), круговий турнір не зачеплено |
| Redis | Немає flag-таймерів і міжінстансної розсилки | Лінива перевірка часу при ході рятує коректність; одноінстансна розсилка працює |
| Інстанс game-service | Рвуться WS-з'єднання на ньому | Клієнт перепідключається до іншого → `game:snapshot`; стан у Postgres |
| Клієнт офлайн | Годинник іде | Як на Lichess; прапорець впаде за таймером |

---

## 9. Поетапний план

### Фаза 0 — рушій як пакет (у ChessB, потім перенесення)
1. `docs/next-steps.md` кроки 2–4 ChessB: прибрати debug-логи, заповнити фасад `engine/index.js`, perft-тест.
2. Винести `applyMove(state, move)` з `gameSlice.js` у рушій; редюсер стає тонкою обгорткою. Тести мають лишитись зеленими без зміни очікувань.
3. Додати `boardToFen` / `fenToState` (сервер зберігає `fen`).
4. Перенести ChessB у `apps/chess-web`, рушій — у `packages/chess-engine` (за бажанням — у TS).
   **Рушій — ✅ 2026-09-30** (скопійовано як є, JS, 107 тестів зелені; пункти 1–3 тепер робляться
   в пакеті, а не в ChessB). `apps/chess-web` — ще ні.

**Готово, коли:** `apps/chess-web` працює як зараз (hot-seat), рушій імпортується з `@syncevent/chess-engine`, perft(1..4) збігається з еталоном.

### Фаза 1 — партія двох користувачів
`game-service` (або модуль у backend), моделі `Game`/`Move`, WS-контракт (4.1), обробка ходу (4.2), flag/abort-таймери (4.3), reconnect (4.4, 4.6.5), rate limit на сокет (4.6.8), resign/abort і нічия за згодою з правилами D1–D9 (4.7: N = 10, K = 3, M = 0). Клієнт — режим «онлайн-партія» за посиланням/ID.

**Готово, коли:** два браузери з різними акаунтами грають партію до мату/часу; подвійний клік і дві вкладки не створюють двох ходів; reload посеред партії відновлює стан.

### Фаза 2 — лобі
Виклики (`challenge`), список відкритих партій, глядачі, історія партій профілю, PGN-експорт (`next-steps.md`, крок 5).

### Фаза 3 — турніри
Модуль `tournaments`, `Tournament/Round/Pairing`, круговий формат, BullMQ-розклад, consumer `chess.game.finished`, таблиця з тай-брейками.

### Фаза 4 — Python
`apps/chess-service` (каркас FastAPI — ✅ 2026-09-30): рейтинг Glicko-2 → аналіз → швейцарське жеребкування → античит.

### Фаза 5 — масштабування
Socket.IO Redis adapter для кількох інстансів, кеш живих партій у Redis, sticky sessions / WS-балансування, арена-формат.

---

## 10. Відкриті питання

1. **Фронтенд:** лишити `chess-web` окремим Vite-застосунком чи одразу робити фічею в `frontend-next` (див. `nextjs-migration.md`)? Пропозиція: спершу перенести як є, злиття — після Фази 1.
2. **JS → TS для рушія:** робити при винесенні в пакет чи окремо? (Решта монорепо — TS.)
3. **`game-service` окремо чи модулем у `backend` на Фазі 1?** Пропозиція: модуль з чіткою межею, винести при потребі.
4. **Рейтинг лише для турнірних партій чи для всіх?**
5. **Правила пропозицій нічиї** — числа затверджено (4.7); D10 (приглушення на клієнті) і D11 (глядачі бачать) вирішено; D12–D15 (пропозиція разом із ходом і окремо будь-коли, без відкликання) вирішено; відкрите лише — різні N/K для bullet/blitz/classical (не блокує).
6. **Інкремент (Фішер) у контролі часу** — чи підтримує вже `NewGameModal`/годинник ChessB; якщо ні — додати в Фазі 0.

---

## 11. Як відновити контекст роботи

1. Прочитати цей документ (розділи 0, 3, 9).
2. У ChessB: `docs/next-steps.md` (що лишилось у рушії), `docs/clock-and-game-record.md` (модель годинника), `src/redux/game/gameSlice.js` (що треба винести в `applyMove`).
3. У SyncEvent: `booking-concurrency.md` (реєстрація + outbox — перевикористовується для турнірів), `scheduled-tasks-worker.md` (BullMQ).
4. Перевірити статус фаз у розділі 9 і продовжити з першої незакритої.
