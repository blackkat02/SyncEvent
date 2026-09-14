# Воркер запланованих задач (scheduled tasks)

> Статус: **Фаза 0 + Фаза 1 реалізовано й перевірено наживо в Docker** (оновлено
> 2026-09-14; Фаза 2 — опційно, за потреби). Задача 1 — очищення протухлих рядків
> `RefreshToken` — зроблена: міграція, `auth.service.ts`, cleanup-задача, BullMQ
> repeatable job (+ dev-only eager catch-up через чергу, §4.2.1), таблиця історії
> прогонів `ScheduledTaskRun` (§4.6 — додано під час виконання, не було в початковому
> плані), тести (89/89 по бекенду). Живий прогін підтвердив: `INSERT INTO
> "ScheduledTaskRun"` реально стається при старті, cleanup реально видаляє рядки за
> критерієм. Дві знахідки з живої перевірки, не з тестів, обидві виправлено структурно
> (§4.6/§4.6.1): `db push` (тодішній dev-шлях проєкту) під час контейнерного прогону
> непередбачувано видаляв нову таблицю, і той самий `db push` ніколи не виконував
> backfill-SQL з `migration.sql` (§5.1). Одне виправлення на обидві —
> `scripts/entrypoint.sh` переведено на `prisma migrate deploy`, перевірено на порожній
> БД і двома повторними прогонами `backend-init` наживо. Соло-проєкт, автор — Borys.
> Пов'язані документи: `docs/architecture/refresh-token-rotation.md` (§6 Фаза 3 — пункт
> "Cleanup job (cron)" відмічено зробленим), `docs/architecture/booking-concurrency.md`
> (звідки взято патерн черга+процесор), `docs/SESSION-HANDOFF.md` (пункт 6 — закритий).
> Код: `apps/backend/src/scheduled-tasks/` (новий модуль), `apps/backend/src/auth/auth.service.ts`
> (три call-сайти ревокації — правки), `apps/backend/prisma/schema.prisma` + міграції
> `20260914000000_add_refresh_token_revocation_metadata`,
> `20260914010000_add_scheduled_task_run`, `apps/backend/scripts/entrypoint.sh`
> (`db push` → `migrate deploy`).

---

## 0. TL;DR / рішення

1. Потрібна **не одна разова джоба**, а мала інфраструктура для довільної кількості
   запланованих задач — задача 1 (cleanup протухлих refresh-токенів) буде першою, але не
   останньою (див. §6 backlog).
2. Проєкт **вже має BullMQ + Redis** підключені (черга `event-booking` у `BookingModule`).
   Немає сенсу тягнути другий інструмент (`@nestjs/schedule`/`node-cron`) — використовуємо
   **repeatable jobs BullMQ** в тому ж backend-процесі.
3. Repeatable job у BullMQ обробляється рівно одним воркером навіть якщо backend колись
   масштабується на кілька реплік (на відміну від наївного `@nestjs/schedule`-крона, який
   стрельне на кожній репліці окремо) — це знімає потребу власноруч писати Redis-лок під
   кожну нову задачу.
4. Окремий мікросервіс-воркер (за зразком `analytics-service`/`notifications-service`) —
   **overkill** для цього масштабу: додає Dockerfile, compose-сервіс, окремий деплой-юніт
   заради періодичного `DELETE`. Відкладено, якщо колись задач стане багато й важких.
5. Задача 1: видаляти рядки `RefreshToken`, які фізично більше нікому не потрібні —
   `expiresAt < now()` (JWT все одно вже не пройде перевірку підпису/exp), або
   `revoked = true` і `revokedAt` старіший за retention-вікно, що залежить від причини
   ревокації (`revokedReason`): `ROTATED`/`LOGOUT` — короткий safety-margin (5 хв, поверх
   `GRACE_PERIOD_MS = 10s`), `REUSE_DETECTED` — довге forensics-вікно (7 днів). Деталі й
   чому знадобилось нове поле `revokedAt` (не `createdAt`) — §5.1.

---

## 1. Навіщо це і звідки задача

`docs/architecture/refresh-token-rotation.md` §6, Фаза 3, пункт 2 — **"Cleanup job (cron):
видаляти рядки з `expiresAt < now()` і давно `revoked`"** — свідомо відкладений пункт
("Фаза 3 — опційно, за потреби"). Зараз рядки `RefreshToken` тільки накопичуються:

- кожна ротація (`/auth/refresh`) залишає стару, вже `revoked: true` версію в таблиці;
- кожен logout, reuse-detection чи `logout-all` теж лише виставляє `revoked: true`, нічого
  не видаляє;
- рядки з `expiresAt` у минулому (сесія прожила свої 7 днів і протухла сама) так само не
  прибираються.

Таблиця росте необмежено й пропорційно активності юзерів (логіни × ротації), при цьому
"протухлі" рядки не несуть жодної цінності — reuse-detection і grace-period логіка
(`auth.service.ts:112-146`) дивляться тільки на **актуальний** ланцюжок `familyId` і на
`supersededAt` у межах 10-секундного вікна.

Накопичення `revoked`-рядків — це не лише питання місця на диску. `auth.service.ts:112-117`
на кожному виклику `/auth/refresh` робить `findMany({ revoked: true })` по всій родині
(`familyId`) і потім лінійно проганяє `bcrypt.compare` по кожному знайденому рядку, поки не
знайде збіг. `bcrypt.compare` навмисно повільний (десятки раундів хешування) — тобто чим
більше протухлих/revoked рядків накопичується в родині конкретного юзера, тим повільніший і
дорожчий по CPU стає **кожен** його виклик refresh. Це піднімає задачу 1 з "housekeeping"
до "запобігання деградації гарячого шляху автентифікації" — і є додатковим аргументом проти
"зробимо, коли стане проблемою з місцем".

---

## 2. Що вже є в проєкті (аналіз наявної інфраструктури)

| Компонент | Стан | Придатність для scheduled tasks |
|---|---|---|
| **BullMQ + `@nestjs/bullmq`** | Вже залежність (`bullmq ^6.3.4`, `@nestjs/bullmq ^12.0.0`), одне спільне з'єднання зареєстроване в `AppModule` (`BullModule.forRoot`, Redis) | Підтримує **repeatable jobs** з коробки — саме те, що треба для крона. Не треба нової залежності. |
| **Черга `event-booking`** (`apps/backend/src/booking/`) | `BookingQueueService` (enqueue) + `BookingProcessor` (`@Processor`/`WorkerHost`) — готовий приклад patтерну "черга + процесор" у цьому кодбейсі | Використовуємо як шаблон структури модуля/файлів для нової задачі. |
| **`RedisService`** (`apps/backend/src/redis/`) | `acquireLock`/`releaseLock`, `setIfAbsent` — власний розподілений лок поверх `SET NX` | Знадобився б, якби йшли шляхом `@nestjs/schedule` (немає вбудованого single-instance гаранту). З BullMQ repeatable jobs — **не потрібен**, лок вже "всередині" черги. |
| **`OutboxRelayService`** (`apps/backend/src/outbox/`) | Інший патерн — **не** черга, а `setTimeout`-цикл прямо в процесі, з explicit-коментарем `// Single-instance assumption` | Свідомо НЕ обраний як шаблон: сам автор позначив його як тимчасове рішення, що зламається при кількох репліках. Не тиражувати цей патерн для нової задачі. |
| **`@nestjs/schedule`** | **Не встановлено** (перевірено `grep` по `package.json`) | Найпростіший в теорії варіант (`@Cron()` декоратор), але додає другий механізм планування поруч з уже наявним BullMQ і не дає безкоштовної single-instance-безпечності при масштабуванні. |
| **Окремий воркер-сервіс** (за зразком `apps/analytics-service`, `apps/notifications-service`) | Патерн мікросервісів у проєкті вже є (Kafka-консюмери, свій `Dockerfile`, свій запис у `docker-compose.yml`) | Технічно можливо, але для періодичного `DELETE`-запиту — зайва інфраструктура (новий Dockerfile, compose-сервіс, health-check, деплой-юніт). Відкладено (§6 backlog). |
| **Деплой (`docker-compose.yml`)** | `backend` — один контейнер, `MODE=init\|serve`, без `replicas` | Зараз single-instance де-факто. BullMQ repeatable jobs обираємо не тому, що це критично **зараз**, а тому що не коштує нічого додаткового і знімає питання наперед (§0.3). |

**Висновок аналізу:** інфраструктура для repeatable jobs фактично вже є (Redis + BullMQ
підключені), бракує лише самого модуля-обгортки. Оптимальний шлях — **розширити backend
новим Nest-модулем** за патерном `BookingModule`, не новий деплой-юніт і не нова
залежність.

---

## 3. Варіанти й рішення

| Варіант | Плюси | Мінуси | Рішення |
|---|---|---|---|
| **A. BullMQ repeatable job** (в процесі backend) | Вже є інфраструктура; природний single-execution навіть при кількох репліках; retry/backoff/logging з коробки; той самий патерн, що й `event-booking` | Ще одна черга в тому ж процесі (мінімальний overhead) | ✅ **Обрано** |
| **B. `@nestjs/schedule` (`@Cron()`)** | Найпростіше на вигляд, декоратор "в лоб" | Нова залежність; сам по собі не single-instance-safe — довелось би вручну огортати `RedisService.acquireLock` під кожну задачу; два різні механізми планування в проєкті (BullMQ vs schedule) | ❌ Відхилено |
| **C. Окремий воркер-мікросервіс** (`apps/scheduled-tasks/` чи подібне) | Ізоляція, окреме масштабування/деплой, ближче до "справжнього" воркера | Новий `Dockerfile`, `docker-compose`-сервіс, `tsconfig`, ще один процес щоб просто раз на добу видалити рядки — непропорційно для поточного обсягу задач | ❌ Відкладено, переглянути коли задач стане багато/важких (§6) |
| **D. Патерн `OutboxRelayService`** (`setTimeout`-цикл) | Найпростіше технічно, нуль нових залежностей | Явно позначений в коді як single-instance-only (сам автор лишив коментар про це); немає repeat-schedule семантики (cron-вираз), тільки фіксований інтервал; немає retry/backoff з коробки | ❌ Відхилено — не тиражувати відомий тимчасовий компроміс |

---

## 4. Цільовий дизайн

### 4.1 Структура модуля

Новий модуль `apps/backend/src/scheduled-tasks/`, за зразком `BookingModule`:

```
scheduled-tasks/
  scheduled-tasks.module.ts      // реєстрація черги + процесора + bootstrap repeatable jobs
  scheduled-tasks.constants.ts   // назва черги, назви джоб, cron-вирази
  scheduled-tasks.processor.ts   // @Processor — диспетчер по job.name
  tasks/
    cleanup-refresh-tokens.task.ts   // задача 1 — власне видалення
```

Один спільний модуль і одна черга `scheduled-tasks` для **всіх** майбутніх запланованих
задач (а не окремий модуль+черга на кожну) — щоб додавання задачі 2 було "дописати файл у
`tasks/` + один рядок реєстрації", а не "склонувати ще один `BookingModule`".

### 4.2 Реєстрація repeatable job

> **Оновлено при виконанні (Фаза 1, 2026-09-14):** нижче — код, як він реально написаний.
> Початкова версія цього розділу показувала `queue.add(name, data, { repeat, jobId })` —
> це API старіших версій BullMQ. У встановленій `bullmq ^6.3.4` цей варіант `repeat` у
> `JobsOptions` **прибрано** (`tsc` ловить помилку типів), реєстрація repeatable job
> винесена в окремий метод `queue.upsertJobScheduler(schedulerId, repeatOpts, jobTemplate)`.
> Ідея та сама (стабільний id → рестарт не плодить дублікат), лише інший виклик — і
> семантика `upsertJobScheduler` навіть точніша: це буквально upsert, а не "add, який
> BullMQ хитро дедуплікує за jobId".

```ts
// scheduled-tasks.module.ts, onModuleInit
await this.queue.upsertJobScheduler(
  CLEANUP_REFRESH_TOKENS_JOB,             // schedulerId — стабільний, як був jobId
  { pattern: CLEANUP_REFRESH_TOKENS_CRON }, // '0 3 * * *' — щодня о 3:00, низьке навантаження
  { name: CLEANUP_REFRESH_TOKENS_JOB },   // job.name, який побачить ScheduledTasksProcessor
);
```

`upsertJobScheduler` з тим самим `schedulerId` оновлює (або лишає без змін, якщо нічого не
змінилось) той самий запис розкладу — рестарт backend (деплой, `docker compose restart`) не
плодить другий, паралельний крон-запис. На відміну від старого `queue.add(..., { repeat,
jobId })`, тут це справжній upsert (`{ override: true }` у реалізації BullMQ) — якщо колись
зміниться cron-вираз задачі в коді, наступний деплой сам перепише `pattern` для того самого
`schedulerId`, без ручного `removeRepeatable`. Це закриває питання, яке в попередній версії
цього розділу було відкритим (§7) — дивись позначку там.

#### 4.2.1 Dev-only catch-up при старті (додано під час виконання, 2026-09-14)

Job scheduler у BullMQ рахує лише **наступний** тик від поточного моменту (перевірено в
джерелах `bullmq`, `JobScheduler.upsertJobScheduler`) — так само, як звичайний cron без
`anacron`, він **не** надолужує тик, пропущений, поки нічого не працювало. Для production
це не проблема (хост не вимикається між тиками), але для соло-розробки на ноутбуці, який
вимикається на ніч — щоденний прохід о 3:00 реалістично може просто ніколи не спрацювати.

Замість того щоб будувати окрему систему "виявлення пропущеного тику" (трекати
`lastRunAt`, звіряти з очікуваним розкладом, враховувати дрейф годинника) — зайва
складність заради результату, якого можна досягти пряміше — `onModuleInit` одразу після
`upsertJobScheduler` ставить **одноразову job у ту саму чергу**, **лише поза production**
(`env.NODE_ENV !== 'production'`):

```ts
if (env.NODE_ENV !== 'production') {
  await this.queue.add(CLEANUP_REFRESH_TOKENS_JOB, {});
}
```

> **Виправлено під час виконання §4.6 (2026-09-14):** перша версія викликала
> `cleanupRefreshTokens.run()` напряму, минаючи чергу. Наживо в Docker це виявило реальну
> ваду: такий прогін не проходить через `ScheduledTasksProcessor`, тому жодного запису в
> `ScheduledTaskRun` (§4.6) від нього не лишалось — саме той прогін, який найчастіше
> спрацьовує в dev, був невидимим у власній таблиці аудиту. Заміна на `queue.add(...)`
> (без `jobId` — це одноразова ad-hoc job, не repeatable) веде той самий прогін через
> звичайний `process()`/`dispatch()`/`recordRun()`, тож він потрапляє в історію так само,
> як прогін за розкладом.

Це безпечно саме тому, що `deleteMany` — ідемпотентна операція (§4.4): зайвий прохід
видаляє 0 рядків, якщо нічого не протухло, і жодного дублікату побічних ефектів. Свідомий
компроміс: кожен рестарт backend у dev-режимі (включно з hot-reload, `nest start --watch`)
зайвий раз звертається до Postgres — для соло-проєкту з невеликою таблицею не критично,
але якщо колись стане проблемою, найпростіше рішення — обмежити мінімальний інтервал між
прогонами (наприклад, in-memory прапорець "вже прогнали цього старту процесу").

### 4.3 Диспетчер (`ScheduledTasksProcessor`)

Один `@Processor(SCHEDULED_TASKS_QUEUE)` з `switch(job.name)`, за зразком
`BookingProcessor`, а не окремий процесор на кожну задачу — тримає диспетчеризацію в
одному місці й спрощує спільне логування/метрики (тривалість, кількість оброблених
рядків) для всіх задач однаково.

### 4.4 Чому це безпечно при (майбутньому) масштабуванні

BullMQ repeatable job на кожен тік розкладу кладе **один** job-запис у чергу; воркери
(скільки б реплік backend не піднялось) змагаються за цей один запис через Redis — забирає
його рівно один. Це відрізняється від `@nestjs/schedule`, де `@Cron()`-хендлер виконується
в кожному процесі, що підняв Nest-додаток, незалежно — без ручного розподіленого локу
кожна репліка видала б власний `DELETE`. Для `DELETE`-запиту це не катастрофа (операція
ідемпотентна — другий прохід просто нічого не знайде), але зайве навантаження на БД і
шум в логах масштабуються лінійно з кількістю реплік. BullMQ-варіант це знімає безкоштовно.

### 4.5 Обробка помилок / спостережуваність

- `attempts` + `backoff` на джобі (як у `BookingQueueService.enqueueJoin`) — тимчасовий
  збій БД не губить тік розкладу, BullMQ ретраїть.
- Лог: кількість видалених рядків за прохід (`this.logger.log(...)`, як в
  `OutboxRelayService.tick`).
- `removeOnComplete`/`removeOnFail` з обмеженням — щоб історія completed/failed job-записів
  сама не розросталась у Redis так само, як зараз розростається `RefreshToken` в Postgres.

### 4.6 Історія прогонів — таблиця `ScheduledTaskRun` (додано під час виконання, 2026-09-14)

Не було в початковому плані Фази 1 — додано за прямим запитом під час перевірки наживо в
Docker: user-facing лог (`docker compose logs`) вже дублюється Docker-ом і не query-able,
тож для "скільки рядків видалялось щодня" (backlог Фази 2) обрано generic-таблицю замість
файлу логів — рішення вписується в уже вибраний принцип "один диспетчер на всі задачі"
(§4.1): запис веде `ScheduledTasksProcessor.process()` для **кожної** job, успішної чи ні,
тож задача 2, 3… з бeклогу отримують історію прогонів безкоштовно, без окремого коду.

```prisma
model ScheduledTaskRun {
  id         String   @id @default(cuid())
  taskName   String
  startedAt  DateTime
  durationMs Int
  success    Boolean
  result     Json?
  error      String?

  @@index([taskName, startedAt])
}
```

Запис — best-effort: якщо сам `INSERT` у `ScheduledTaskRun` впаде (БД тимчасово
недоступна), це логується й ковтається, **не** перетворює вдалий прогін задачі на
невдалий і не ховає реальну помилку задачі під помилку запису аудиту (`recordRun`
обгорнутий в окремий `try/catch`, окремий від того, що визначає `success`).

**Знахідка при перевірці наживо, не пов'язана з дизайном самої таблиці:** `db push`
(тодішній dev-шлях цього проєкту, `scripts/entrypoint.sh` `MODE=init`) під час
контейнерного прогону (`docker compose run backend-init`, відтворено тричі поспіль)
**видаляв** щойно створену `ScheduledTaskRun` попри те, що той самий `db push` з хоста,
з тим самим `schema.prisma`, проти того самого Postgres — таблицю зберігав. Ізольований
повтор кожного окремого кроку entrypoint.sh (`check-db.js`, `prisma generate`, `db push`,
`seed.ts`) окремо — **не** відтворив проблему; відтворювалась лише повним прогоном через
реальний `docker compose run`/`up`. Точний корінь так і не встановлено — **вирішено не
дошукуючись його**, переходом на `migrate deploy` (§4.6.1), який цю поведінку прибрав
повністю (перевірено двома повторними прогонами `backend-init` — таблиця жива обидва
рази).

#### 4.6.1 Ширший висновок — чому взагалі виникла ця знахідка, і структурне виправлення

Той самий `db push` (а не `migrate deploy`) — задокументований компроміс проєкту
(`docs/SESSION-HANDOFF.md` пункт 6, коментар у `scripts/entrypoint.sh`) — і саме він
пояснював ще одну знахідку з Фази 1: backfill-SQL у `migration.sql` для
`revokedAt`/`revokedReason` (§5.1) **ніколи не виконувався** в dev-контурі проєкту —
`db push` синхронізує схему напряму з `schema.prisma`, не чіпаючи файли міграцій і не
запускаючи їх SQL. На момент перевірки в живій dev-БД знайшлось 9 рядків `revoked: true`
з `revokedReason: null` — саме той сценарій, від якого backfill мав захищати.

**Виправлено 2026-09-14** — `scripts/entrypoint.sh` (`MODE=init`) переведено з
`prisma db push --accept-data-loss` на `prisma migrate deploy`. Це закриває обидві
знахідки одним рішенням (а не двома окремими обходами), бо `migrate deploy`:
- застосовує лише **нові** міграції з `_prisma_migrations`, детерміновано — жодного
  "diff і зроби що завгодно, щоб зійшлось", звідки, ймовірно, й бралось несподіване
  видалення таблиці (§4.6) — хоч точний механізм так і не встановлено;
- реально виконує SQL кожної міграції, включно з backfill-`UPDATE`.

Кроки виконання (для протоколу, не для повторення — вже застосовано):
1. Дві вже-накатані через `db push` міграції позначено застосованими без повторного
   виконання SQL: `npx prisma migrate resolve --applied <назва>` для обох
   (`20260914000000_...`, `20260914010000_...`) — інакше `migrate deploy` спробував би
   виконати їхній `CREATE TYPE`/`CREATE TABLE` вдруге і впав би на "вже існує".
2. Перевірено на **порожній** БД (одноразовий `postgres:16-alpine` контейнер,
   викинутий одразу після) — усі 10 міграцій застосувались чисто з нуля, без утручання.
3. Образи `syncevent-backend` **і** `syncevent-backend-init` перезібрано окремо —
   вони з того самого `Dockerfile`, але compose будує їх як два різні образи;
   перезбирання лише одного мовчки лишило б `backend-init` на старому `entrypoint.sh`
   (саме так і сталось при першій спробі перевірки).
4. Два повторні прогони `backend-init` наживо — `ScheduledTaskRun` жива обидва рази;
   `docker compose logs backend-init` показує `10 migrations found... No pending
   migrations to apply` замість колишнього `db push`-повідомлення.

9 наявних рядків з `revokedReason: null` виправлено вручну (`UPDATE` напряму в
контейнер Postgres, до цього переходу) — на майбутнє нові backfill-міграції
виконуватимуться автоматично через `migrate deploy`.

---

## 5. Задача 1: очищення протухлих `RefreshToken`

### 5.1 Критерії видалення

`revoked: true` рядки виникають з трьох різних причин, і кожна заслуговує на свій
retention — тому в модель додається `revokedReason` (enum) і `revokedAt` (timestamp):

```prisma
enum RevokedReason {
  ROTATED         // /auth/refresh — замінено новою парою токенів
  LOGOUT          // logout() / logoutAllDevices()
  REUSE_DETECTED  // виявлено повторне використання — вся родина відкликана
}

model RefreshToken {
  // ...існуючі поля...
  revoked        Boolean        @default(false)
  revokedAt      DateTime?
  revokedReason  RevokedReason?
  supersededAt   DateTime?      // лишається — grace-period linkage (isWithinGracePeriod)
  supersededById String?

  @@index([revoked, expiresAt])
  @@index([revokedReason, revokedAt])
}
```

**Чому не досить `createdAt`** (це виправляє помилку в попередній версії цього розділу):
`createdAt` — час **видачі** токена, а не відкликання. Сесія, яка прожила 6 днів і потім
розлогінилась, вже мала б "старий" `createdAt` в момент logout — будь-яке вікно, відлічене
від `createdAt`, для такого рядка вже спливло б *до* того, як він взагалі став revoked, і
cleanup видалив би його на найближчому ж проході незалежно від заявленого forensics-вікна.
`revokedAt` фіксує момент, коли рядок фактично перестав бути дійсним, і виставляється явно
на кожному з трьох call-сайтів у `auth.service.ts`:

- ротація (рядок ~101, поруч з `supersededAt: new Date()`) — `revokedReason: 'ROTATED'`,
  `revokedAt` = те саме значення, що й `supersededAt`;
- `logout()`/`logoutAllDevices()` (`auth.service.ts:150-159`) — `revokedReason: 'LOGOUT'`,
  `revokedAt: new Date()`;
- reuse-detection, ревокація всієї родини (`auth.service.ts:136-139`) —
  `revokedReason: 'REUSE_DETECTED'`, `revokedAt: new Date()`. Саме ці рядки — фактичний слід
  скомпрометованого токена, і саме їм потрібне найдовше вікно (нижче).

```ts
const operationalMarginMs = 5 * 60 * 1000;              // ROTATED / LOGOUT
const reuseDetectedRetentionMs = 7 * 24 * 60 * 60 * 1000; // REUSE_DETECTED — forensics/алерти
const now = new Date();

await prisma.refreshToken.deleteMany({
  where: {
    OR: [
      { expiresAt: { lt: now } },
      {
        revoked: true,
        revokedReason: { in: ['ROTATED', 'LOGOUT'] },
        revokedAt: { lt: new Date(now.getTime() - operationalMarginMs) },
      },
      {
        revoked: true,
        revokedReason: 'REUSE_DETECTED',
        revokedAt: { lt: new Date(now.getTime() - reuseDetectedRetentionMs) },
      },
    ],
  },
});
```

- **`expiresAt < now`** — безумовно безпечно: сам JWT (підписаний, з `exp`) вже не пройде
  верифікацію в `auth.controller.ts` до того, як дійде до пошуку рядка в БД, незалежно від
  стану `revoked`.
- **`ROTATED`/`LOGOUT`, `revokedAt` старіший за `operationalMarginMs` (5 хв)** — обидва не
  несуть жодної forensic-цінності понад `GRACE_PERIOD_MS` (10с) з `auth.service.ts`; 5 хв —
  запас з надлишком на повільний паралельний запит.
- **`REUSE_DETECTED`, `revokedAt` старіший за `reuseDetectedRetentionMs` (7 днів)** — довше
  вікно навмисно, бо зараз (backlog §6) немає жодного автоматичного сповіщення про інцидент:
  єдиний спосіб дізнатись про компрометацію — вручну перевірити дані, і 7 днів дають на це
  реальний шанс для соло-розробника, а не 24 год "навмання". Число довільне (не з
  комплаєнс-вимог) — переглянути в §6 Фазі 2 разом з метрикою "чи взагалі щось знаходиться в
  цій гілці на реальних обсягах"; коли з'явиться сповіщення, вікно можна буде скоротити.
- **Backfill для існуючих рядків** (міграція, до появи `revokedReason`/`revokedAt`): наявні
  `revoked: true` рядки мають `revokedReason: null` і жодна з гілок вище їх не підхопить —
  вони зависнуть назавжди без явного бекфілу. Один раз, в тій самій міграції: `revokedReason
  = 'ROTATED'` де `supersededAt IS NOT NULL`, інакше `'LOGOUT'` (консервативний дефолт —
  ці рядки вже історичні, а не свіжий інцидент, тож коротке вікно тут нічому не шкодить);
  `revokedAt = COALESCE(supersededAt, createdAt)` (найкраще наближення, яке є для старих
  рядків, де точного часу ревокації ніколи не записувалось).
- Рядки, які ще **не** `revoked` і не протухли (активні сесії), під жодну з умов не
  підпадають — cleanup їх ніколи не займає.

### 5.2 Продуктивність / великі таблиці

Перед тим як думати про батчування — переконатись, що є індекс під критерій видалення.
Зараз на `RefreshToken` є лише `@@index([familyId])` і `@@index([userId])` (перевірено в
`schema.prisma`) — жоден не покриває `expiresAt`/`revoked`/`revokedReason`, тобто
`deleteMany` з §5.1 це **full table scan** незалежно від розміру таблиці чи розміру батчу.
Два індекси, додані разом з `revokedReason`/`revokedAt` в §5.1 (`@@index([revoked,
expiresAt])` під першу гілку `WHERE`, `@@index([revokedReason, revokedAt])` під дві інші) —
дешево виправити одразу, у Фазі 1, а не відкладати.

`deleteMany` без ліміту на потенційно великій таблиці — довгий лок. Якщо таблиця виросте
настільки, що навіть з індексом це стане проблемою (не зараз, соло-проєкт): або batched
delete (цикл `deleteMany` з `LIMIT`/`take` через raw SQL, по 1000 рядків за раз, поки не 0),
або партиціонування за датою. **Не робимо зараз** — передчасна оптимізація без реальних
цифр навантаження; лишити коментар у коді, що за потреби батчити. Індекс — не оптимізація
"про запас", а базова гігієна під конкретний запит, який пишемо просто зараз.

### 5.3 Розклад

Раз на добу, `0 3 * * *` (03:00) — низьке навантаження, некритичний до секунд таймінг
(протухлі рядки можуть чекати добу без жодного ефекту на коректність системи).

### 5.4 Тести

Юніт-тест на саму функцію видалення (мокнутий `PrismaService`, як в наявних
`*.service.spec.ts`) — перевірити, що:
- протухлий (`expiresAt` у минулому) рядок видаляється незалежно від `revoked`;
- `revokedReason: 'ROTATED'` рядок з `revokedAt` **в межах** `operationalMarginMs` — НЕ
  видаляється;
- `revokedReason: 'ROTATED'` рядок з `revokedAt` **поза** `operationalMarginMs` —
  видаляється;
- `revokedReason: 'LOGOUT'` рядок з `revokedAt` **в межах** `operationalMarginMs` — НЕ
  видаляється;
- `revokedReason: 'LOGOUT'` рядок з `revokedAt` **поза** `operationalMarginMs` —
  видаляється;
- `revokedReason: 'REUSE_DETECTED'` рядок з `revokedAt` **в межах**
  `reuseDetectedRetentionMs` — НЕ видаляється (forensics-вікно, §5.1);
- `revokedReason: 'REUSE_DETECTED'` рядок з `revokedAt` **поза**
  `reuseDetectedRetentionMs` — видаляється;
- активний (`revoked: false`, не протухлий) рядок — ніколи не видаляється.

Не потрібен e2e-тест з реальним очікуванням cron-тіку — логіку видалення тестуємо як
чисту функцію, реєстрацію repeatable job можна перевірити окремим легким тестом
("модуль викликає `queue.add` з очікуваним `repeat.pattern` при `onModuleInit`").

---

## 6. Поетапний план

### Фаза 0 — генерична інфраструктура
- [x] Модуль `ScheduledTasksModule` (§4.1), черга `scheduled-tasks`, `ScheduledTasksProcessor`-диспетчер.
- [x] Реєстрація в `AppModule`.

### Фаза 1 — задача 1: cleanup refresh-токенів

1. **Міграція `schema.prisma`** (§5.1, §5.2) — без неї нема на чому будувати решту фази:
   - [x] `enum RevokedReason { ROTATED LOGOUT REUSE_DETECTED }`.
   - [x] `RefreshToken.revokedAt DateTime?`, `RefreshToken.revokedReason RevokedReason?`.
   - [x] `@@index([revoked, expiresAt])`, `@@index([revokedReason, revokedAt])` —
         без них §5.1-запит на видалення — full table scan (§5.2).
   - [x] SQL міграції (`prisma/migrations/20260914000000_add_refresh_token_revocation_metadata/`)
         написано вручну — локальний Postgres (docker) на момент виконання не був піднятий,
         тож `prisma migrate dev` не міг згенерувати й застосувати її наживо. SQL складено за
         форматом попередніх міграцій; `prisma validate` + `prisma generate` пройшли чисто,
         але **застосування до реальної БД (`prisma migrate deploy`) ще не перевірено** —
         зробити це першим ділом, коли БД буде піднята.
   - [x] У тій самій міграції — backfill наявних `revoked: true` рядків (§5.1, останній
         пункт): `revokedReason = 'ROTATED'` де `supersededAt IS NOT NULL`, інакше
         `'LOGOUT'`; `revokedAt = COALESCE(supersededAt, createdAt)`.

2. **`auth.service.ts` — три call-сайти ревокації** (§5.1) — виставити нові поля там,
   де зараз пишеться лише `revoked: true`:
   - [x] ротація (`~101`, поруч з `supersededAt: new Date()`) →
         `revokedReason: 'ROTATED'`, `revokedAt` = те саме значення, що й `supersededAt`
         (винесено в спільну змінну `rotatedAt`, щоб гарантовано був один і той самий
         `Date`-інстанс, а не два окремих виклики `new Date()` з мікросекундною різницею).
   - [x] `logout()` / `logoutAllDevices()` (`~150-159`) →
         `revokedReason: 'LOGOUT'`, `revokedAt: new Date()`.
   - [x] reuse-detection, ревокація всієї родини (`~136-139`) →
         `revokedReason: 'REUSE_DETECTED'`, `revokedAt: new Date()`.
   - [x] `tsc --noEmit` чисто; наявні `auth.service.spec.ts` (13/13) проходять без змін.

3. **`scheduled-tasks/tasks/cleanup-refresh-tokens.task.ts`** (§5.1):
   - [x] Константи `OPERATIONAL_MARGIN_MS` (5 хв), `REUSE_DETECTED_RETENTION_MS` (7 днів)
         — експортовані, щоб тест міг рахувати точні межі, а не дублювати числа.
   - [x] `prisma.refreshToken.deleteMany` з трьома `OR`-гілками критерію (expired /
         ROTATED-LOGOUT поза margin / REUSE_DETECTED поза retention); повертає кількість
         видалених рядків і логує її.
   - [x] Тести (`cleanup-refresh-tokens.task.spec.ts`, 5/5) — з фіксованим `Date` через
         `jest.useFakeTimers().setSystemTime`, звіряють точну форму `where`-гілок (§5.4:
         межі, а не реальна фільтрація — `PrismaService` мокнутий, `deleteMany` нічого не
         фільтрує насправді, тож перевіряти є сенс саме побудований запит).

4. **Repeatable job** (§4.2):
   - [x] `case CLEANUP_REFRESH_TOKENS_JOB` в `ScheduledTasksProcessor.dispatch`.
   - [x] Реєстрація в `onModuleInit`: **не** `queue.add(..., { repeat, jobId })`, як
         спершу планувалось — встановлена `bullmq ^6.3.4` цей варіант API прибрала
         (`tsc` спіймав помилку типів). Замінено на `queue.upsertJobScheduler(
         CLEANUP_REFRESH_TOKENS_JOB, { pattern: CLEANUP_REFRESH_TOKENS_CRON },
         { name: CLEANUP_REFRESH_TOKENS_JOB })` — §4.2 переписано з поясненням; заразом
         закрито відкрите питання §7 про зміну cron-виразу (`upsertJobScheduler` — це
         `{ override: true }` всередині, тобто оновлює розклад на місці).
   - [x] **Додано під час виконання, не було в початковому плані** (§4.2.1) — dev-only
         eager catch-up: `onModuleInit` одразу викликає `cleanupRefreshTokens.run()` один
         раз, якщо `env.NODE_ENV !== 'production'`. Причина: job scheduler не надолужує
         тик, пропущений, поки ноутбук був вимкнений (перевірено в джерелах `bullmq`) —
         без цього щоденний прохід о 3:00 у соло-dev-середовищі міг би просто ніколи не
         спрацювати. Безпечно, бо `deleteMany` ідемпотентний (§4.4).

5. **Юніт-тести** (повний перелік сценаріїв — §5.4):
   - [x] `cleanup-refresh-tokens.task.spec.ts` — див. крок 3 вище (5 тестів, форма
         `where`-клаузи замість реальної фільтрації — Prisma мокнута).
   - [x] `scheduled-tasks.module.spec.ts` — модуль викликає `queue.upsertJobScheduler` з
         очікуваним `pattern`/`schedulerId`/`name` при `onModuleInit` (API змінився,
         суть перевірки — та сама: стабільний ключ реєстрації, див. крок 4); плюс два
         тести на dev-only catch-up (`NODE_ENV=development` → `run()` викликається,
         `NODE_ENV=production` → ні).
   - [x] `scheduled-tasks.processor.spec.ts` — розширено: `case
         CLEANUP_REFRESH_TOKENS_JOB` маршрутизує на `CleanupRefreshTokensTask.run`,
         невідома `job.name` — так само падає, як у Фазі 0, і не викликає `run`.
   - [x] Повний прогін (`npx jest`, весь backend) — 86/86 зелені, нічого не зламано.

6. [x] Оновити `docs/architecture/refresh-token-rotation.md` §6 Фаза 3 — відмітити
      cleanup-пункт як зроблений, з посиланням на цей документ. Заразом підтягнуто
      статус-банер того файлу (рядок 3-4) і сусідній коментар про "три пункти вище
      свідомо не робили" — обидва посилались на застарілий стан.

### Фаза 2 — опційно, за потреби
- [ ] Ручний тригер (адмінський ендпоінт або CLI-скрипт) — прогнати cleanup поза розкладом, корисно для дебагу/одноразового прибирання накопиченого зараз.
- [ ] Метрика/лог-агрегація кількості видалених рядків у часі (чи задача взагалі щось знаходить на реальних обсягах).
- [ ] Batched delete (§5.2), якщо обсяг таблиці це виправдає.

### Backlog — майбутні кандидати на «задача 2, 3, …» в тому ж воркері
(не в скоупі цього документа, лише щоб зафіксувати навіщо інфраструктура генерична, а не одноразова)
- Прибирання старих `sentAt`-помічених рядків `OutboxEvent` (аналогічна проблема необмеженого накопичення, `apps/backend/src/outbox/`).
- Прибирання давно завершених/минулих `Event` (якщо колись знадобиться архівація).
- Email/сповіщення при reuse-detection інциденті (`refresh-token-rotation.md` §6 Фаза 3, ще один відкладений пункт — теж природно лягає в цей воркер як задача "надіслати email", а не cron per se, але може перевикористати той самий модуль для retry/backoff).

---

## 7. Відкриті питання

- ~~**Зміна cron-виразу repeatable job у майбутньому**~~ — **вирішено при виконанні (Фаза 1, 2026-09-14), не задумом:** встановлена `bullmq ^6.3.4` не має того API (`queue.add(..., { repeat, jobId })`), яким цей пункт оперував спершу — довелось перейти на `queue.upsertJobScheduler(schedulerId, repeatOpts, jobTemplate)` (§4.2), а він викликається з `{ override: true }`, тобто зміна `pattern` в коді сама перепише розклад на наступному деплої. Побічний ефект вибору, зробленого з іншої причини (сумісність з версією бібліотеки), а не окреме архітектурне рішення.
- **Чи достатньо однієї спільної черги `scheduled-tasks` на всі майбутні задачі**, чи колись знадобиться розділяти за пріоритетом/навантаженням (окрема черга для важких задач) — відкладено до появи задачі 2.
- **Ручний тригер (Фаза 2)** — чи потрібен взагалі, чи досить почекати до наступного нічного тіку під час розробки/дебагу.
