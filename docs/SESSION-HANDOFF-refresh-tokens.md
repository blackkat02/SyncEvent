# Промпт для нової сесії — SyncEvent: refresh-token rotation / мульти-сесії

> Скопіюй цей файл у нову сесію Claude Code як стартовий контекст.
> Дата створення: **2026-09-12**, оновлено **2026-09-13**. Гілка: `feat/booking-concurrency` (окрема
> задача, не пов'язана з booking). Автор: Borys (solo).
> Статус: **Фази 0, 1, 2 повністю реалізовані й закомічені в код; Фаза 3 — частково** (access-token
> blocklist зроблено, три інші пункти свідомо пропущені, див. нижче).

---

## 0. Перше, що зробити в новій сесії

1. Прочитати **`docs/architecture/refresh-token-rotation.md`** §6 — там актуальний чекліст із
   позначками, що зроблено, і опис реального race-бага, знайденого й виправленого в Фазі 2.
2. Пам'ять Claude (підвантажується автоматично): `memory/refresh-token-rotation-design.md`.
3. Поточний код (уже змінений із версії, описаної в попередній редакції цього файлу):
   - `apps/backend/src/auth/auth.service.ts` — таблиця `RefreshToken`, ротація з `familyId`,
     reuse-detection, grace-period, `logoutAllDevices`.
   - `apps/backend/src/auth/auth.controller.ts` — `/auth/register`, `/auth/login`, `/auth/refresh`,
     `/auth/logout`, `/auth/logout-all` (новий).
   - `apps/backend/src/auth/access-token-blocklist.service.ts` — Redis-блоклист за `jti` (новий).
   - `apps/backend/src/auth/strategies/jwt.strategy.ts` — перевіряє блоклист перед БД.
   - `apps/backend/prisma/schema.prisma` — модель `RefreshToken` (`User.refreshToken` видалено).
   - `apps/frontend/src/features/auth/authApi.ts` — single-flight interceptor на `/auth/refresh`.
   - Тести: `apps/backend/src/auth/auth.service.spec.ts` (21 тест), `access-token-blocklist.service.spec.ts`,
     `strategies/jwt.strategy.spec.ts`.

---

## 1. Що вже зроблено (Фази 0-2, повністю)

- **Фаза 0**: `RefreshToken` таблиця замість `User.refreshToken`, одна сесія = один рядок, `familyId`
  на весь ланцюжок ротацій.
- **Фаза 1**: `POST /auth/logout` (`clearCookie` + `revoked:true`), reuse-detection (пред'явлення
  вже-відкликаного токена → відкликання всієї family).
- **Фаза 2**: анти-race —
  - фронтенд: module-level single-flight lock навколо `/auth/refresh` (`authApi.ts`);
  - бекенд: grace-period (`supersededAt`/`supersededById`, `GRACE_PERIOD_MS = 10s`, не підбирали
    емпірично — просто взяли верхню межу з озвученого діапазону);
  - **важливо**: інтеграційний тест на справжню паралельність (`Promise.allSettled`, не симуляція)
    виявив окремий race, не описаний явно в §5 доку — без атомарного compare-and-swap кілька
    одночасних запитів з тим самим **ще не проротованим** токеном усі проходили перевірку одночасно й
    кожен створював свій дочірній рядок, форкаючи family на кілька "живих" сесій. Виправлено
    атомарним `updateMany({id, revoked:false}, {...})` + видаленням "програшного" дочірнього рядка.
    Деталі — `auth.service.ts`, коментарі біля `refreshTokens`.

## 2. Фаза 3 — що зроблено, що ні

Зроблено:
- Access-token blocklist у Redis за `jti` (`AccessTokenBlocklistService`) + `RefreshToken.accessJti` +
  `POST /auth/logout-all` (захищений, бере userId з access-токена) — "вийти зі всіх пристроїв просто
  зараз": відкликає всі сесії в БД і миттєво блоклистить усі їхні access-токени.

Свідомо не зроблено (користувач вирішив не чіпати — велика додаткова робота під кожен пункт):
- UI "активні сесії" (потрібен новий фронтенд-екран/компонент).
- Cleanup cron-job (у проєкті ще нема `@nestjs/schedule` чи іншого джерела cron).
- Email-сповіщення при reuse-detection (у проєкті ще нема email-інфраструктури, напр. nodemailer).

## 3. Відкриті питання (досі не вирішено)

- Формат refresh-токена: лишили JWT (як і було), питання "JWT vs opaque" не переглядали під час
  реалізації.
- Grace-вікно: `10s` узяте як стартове значення, не підбирали емпірично.

## 4. Якщо продовжувати цю роботу далі

Природні наступні кроки, якщо колись знадобляться:
- Будь-який із трьох пропущених пунктів Фази 3 — почни з UI активних сесій, якщо треба (найменше нової
  інфраструктури: просто новий `GET /auth/sessions` + фронтенд-список, дані вже в таблиці
  `RefreshToken`).
- Емпірично підібрати `GRACE_PERIOD_MS`, якщо в проді помітите або хибні розлогіни (замалий grace),
  або довге вікно вразливості для reuse (завеликий).
- Прогнати повний флоу вживу (Docker/Postgres у цій машині зараз не піднятий — міграції написані
  вручну за зразком попередніх, `prisma migrate dev` жодного разу не виконувався живим шляхом; варто
  це зробити перед продом).

## 5. Зв'язок з іншою активною роботою

Ця задача не пов'язана з паралельною роботою над `docs/architecture/booking-concurrency.md` (Redis-черга
бронювання + Kafka outbox, та сама гілка `feat/booking-concurrency`) — не плутати два доки/дві задачі в
одній сесії.
