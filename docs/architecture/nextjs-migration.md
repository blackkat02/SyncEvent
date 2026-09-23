# Фронтенд: міграція з Vite+React на Next.js

> Статус: **проєкт рішення** (draft), реалізація не почата.
> Мотивація: **досвід** — потрібен досвід з Next.js у стеку
> проєкту (див. §1). Це впливає на вибір стратегії в §4.
> Соло-проєкт, автор — Borys. Створено: 2026-09-19.
> Пов'язаний код: `apps/frontend/` (весь застосунок), `apps/frontend/src/features/auth/`
> (auth-flow, залежність від `localStorage`), `apps/frontend/src/features/events/eventsApi.ts`
> (RTK Query), `packages/shared` (спільні zod-схеми/типи), `pnpm-workspace.yaml`.

---

## 0. TL;DR / рішення

1. Технічно перенести код **дешево** — застосунок маленький (~22 файли), 7 роутів, без
   SSR-небезпечних патернів (немає прямого `window`/`document` поза стандартним `main.tsx`).
2. Реальний бар'єр — **не роутинг, а auth-архітектура**: access-токен живе в `localStorage`,
   недоступному на сервері. "Механічна" міграція дасть Next.js лише як SPA-обгортку — без
   жодної реальної SSR/RSC-переваги, а саме вона й потрібна для портфоліо.
3. Тому обираємо **гібридну стратегію**: публічні сторінки (список/деталі подій) — справжній
   SSR/RSC з `fetch` на сервері; приватні сторінки (auth, "мої події", створення) — лишаються
   client-side, як зараз, через `"use client"` + Redux/RTK Query.
4. Auth-архітектуру (`localStorage` + `credentials: 'include'` для refresh-кукі, див.
   `docs/architecture/refresh-token-rotation.md`) **не чіпаємо** — вона коректна й уже пройшла
   свій цикл рішень. Не варто тягнути її переробку в цю задачу.
5. Виконуємо поетапно (§6), з зупинкою на рев'ю після кожної фази — як і решта фазованих задач
   у цьому репо (booking-concurrency, refresh-token-rotation).

---

## 1. Навіщо (і чому це важливо для вибору підходу)

Ціль — **не** покращити цей конкретний застосунок (Vite+React SPA вже повністю покриває його
потреби без накладних витрат Next.js: build/runtime сервера, App Router, vendor-орієнтовані
паттерни). Ціль — мати в портфоліо реальний, а не косметичний, досвід з Next.js: RSC, SSR,
`fetch`-кешування, metadata API, streaming.

Наслідок для плану: **міграція заради рядка в резюме "Next.js" без SSR — це антипатерн**, який
краще одразу відкинути. Якщо результат — Next.js-застосунок, де кожна сторінка `"use client"`,
це витрачений час без демонстрованої цінності. Тому нижче — стратегія, яка примусово включає
хоч одну ділянку зі справжнім SSR (публічні сторінки подій), навіть якщо для приватної частини
(яка й так за токеном) це не дає приросту.

---

## 2. Поточний стан фронтенду

| Аспект | Як зараз |
|---|---|
| Build/dev | Vite 7 (`vite` / `vite build` / `tsc -b`) |
| Роутинг | `react-router-dom` v7, `createBrowserRouter`, 7 роутів (`/`, `/events/:id`, `/events/create`, `/events/:id/edit`, `/my-events`, `/auth/login`, `/auth/register`) |
| Стан | Redux Toolkit + RTK Query (`eventsApi.ts`), `authSlice` |
| Форми | `react-hook-form` + `@hookform/resolvers` + `zod` |
| Стилі | Tailwind v4 (`@tailwindcss/vite`) |
| Спільний код | `@syncevent/shared` — pnpm workspace-пакет (zod-схеми, типи), теж використовується бекендом |
| Auth | access-токен у `localStorage` (`authSlice.ts`), refresh — httpOnly-кукі, запити з `credentials: 'include'` (`authApi.ts`) |
| Env | `import.meta.env.VITE_API_URL` (2 місця: `authApi.ts`, `eventsApi.ts`) |
| Розмір | ~22 файли в `src/` |

Ніяких SSR-небезпечних патернів, крім очікуваного `document.getElementById` у `main.tsx`.
Це добра новина: немає прихованих залежностей від window/DOM у бізнес-логіці.

---

## 3. Що переноситься майже без змін

- **Компоненти й форми** — RHF + zod працюють ідентично в client components (`"use client"`).
- **Redux Toolkit + RTK Query** — офіційно підтримується в Next.js App Router через
  `Provider` у клієнтському root-компоненті; сама бібліотека роботи не потребує змін.
- **Tailwind v4** — має нативну підтримку Next.js (PostCSS-конфіг замість Vite-плагіна).
- **`@syncevent/shared`** — монорепо (pnpm workspace), Next.js підтримує через
  `transpilePackages: ['@syncevent/shared']` в `next.config.ts`.
- **zod-схеми валідації** — без змін, це чистий TS-код без прив'язки до Vite чи Router.
- **Env-змінні** — механічна заміна `import.meta.env.VITE_API_URL` →
  `process.env.NEXT_PUBLIC_API_URL` в 2 файлах.

---

## 4. Реальний бар'єр: auth і SSR

Access-токен зберігається в `localStorage` — недоступний під час рендеру на сервері. Тобто:

- Захищені сторінки (`/my-events`, `/events/create`, `/events/:id/edit`) **не можуть** отримати
  реальний SSR "з коробки" без переробки auth на server-readable сесію (наприклад, повністю
  httpOnly-кукі й читання токена на сервері через `cookies()`).
- Така переробка виходить за межі цієї задачі, зачіпає бекенд-контракт
  (`refresh-token-rotation.md`, single-flight interceptor) і **свідомо не входить у скоуп**.
- Публічні сторінки (список подій `/`, деталі події `/events/:id`) **не залежать від токена**
  для базового перегляду (join/leave — окрема дія за токеном) → ідеальний кандидат для
  справжнього SSR/RSC без зачіпання auth.

Висновок: розділяємо застосунок на дві зони за різними стратегіями рендеру (§5).

---

## 5. Стратегія: гібрид

| Зона | Сторінки | Рендер | Чому |
|---|---|---|---|
| Публічна | `/`, `/events/:id` | Server Component + `fetch` на сервері (з ISR/кешем) | Дає реальний SSR/RSC-досвід, SEO, швидкий перший рендер — без дотику до auth |
| Приватна | `/my-events`, `/events/create`, `/events/:id/edit`, `/auth/login`, `/auth/register` | Client Component (`"use client"`), Redux + RTK Query як зараз | Auth лишається без змін, нуль ризику зламати робочий refresh-token flow |

Це дає демонстрований у портфоліо SSR/RSC (не косметичний), і водночас не вимагає ризикованої
переробки auth, яка вже стабілізована окремим рішенням.

---

## 6. План по фазах

Кожна фаза — окремий крок з зупинкою на рев'ю перед наступною (як і в інших фазованих задачах
цього репо). Чекбокси нижче — конкретні кроки виконання, усі поки що не зроблені.

### Фаза 0 — каркас

- [x] `mkdir apps/frontend-next` — новий пакет паралельно з `apps/frontend`, щоб не ламати робочий SPA під час міграції. ✅ (2026-09-19)
- [x] `pnpm create next-app@latest` (App Router, TypeScript, Tailwind, без `src/`-опції — узгодити зі стилем `apps/frontend`) у `apps/frontend-next`. ✅ (2026-09-19) Next 16.3.5, React 19.2.8 (Turbopack за замовчуванням).
- [x] Додати `apps/frontend-next` у `pnpm-workspace.yaml` (вже покривається патерном `apps/*`, лише перевірити). ✅ (2026-09-19) — покрито без змін кореневого файлу.
- [x] **Знайдено і виправлено побічний ефект, якого не було в первинному плані**: `create-next-app` згенерував власні `apps/frontend-next/pnpm-workspace.yaml` + `pnpm-lock.yaml`, що робить підпапку окремим pnpm-workspace root і ізолює її від кореневого монорепо (не бачить `@syncevent/shared`, кореневий `pnpm install` її не керує). Видалено обидва файли + `node_modules` підпакета, перевстановлено через кореневий `pnpm install` — тепер `pnpm -r list` показує `frontend-next` як 8-й workspace-проєкт монорепо.
- [x] Підключити `@syncevent/shared` як `workspace:*` залежність (`pnpm --filter frontend-next add @syncevent/shared@workspace:*`). ✅ (2026-09-19)
- [x] ~~`next.config.ts`: `transpilePackages: ['@syncevent/shared']`~~ — **перевірено емпірично й відкинуто.** Тимчасово додав `import { EventTopics } from '@syncevent/shared'` у `app/page.tsx`, прогнав `build` — резолвиться і на рівні типів, і в рантаймі без жодного `transpilePackages` (лог `event.user-joined` під час `Generating static pages`). Причина: `@syncevent/shared` — уже **збілджений** пакет (`packages/shared/package.json` має `exports`/`main`/`module`/`types` на `dist/`, білдиться через `tsup`), а не сирий TS-код. `transpilePackages` потрібен лише коли Next мусить сам транспілювати нетранспільований TS/ESM воркспейс-пакет — тут це не той випадок. Тестовий імпорт прибрано, `page.tsx` повернуто до заглушки.
- [x] Tailwind v4 — PostCSS-конфіг (`postcss.config.mjs`) замість `@tailwindcss/vite`. ✅ Уже згенеровано скаффолдом і робочий "з коробки". У `apps/frontend` немає окремого `tailwind.config.*` (v4 CSS-first підхід, `@import "tailwindcss"` + `@layer base` прямо в `src/index.css`) — перенесення кастомних CSS-змінних/токенів із `index.css` в `app/globals.css` лишаю на Фазу 1 (разом з рештою стилів компонентів), тут не на часі: заглушка Next ще не показує реальний UI.
- [x] ~~Перевірити сумісність `@syncevent/eslint-rules` з `eslint-config-next`~~ — **скасовано, план був помилковий.** Перевірив: `@syncevent/eslint-rules` — виключно backend-специфічні архітектурні правила (`no-prisma-in-controller`, `no-full-entity-args`, `packages/eslint-rules/src/rules/`), підключені лише в `apps/backend/eslint.config.mjs`. **`apps/frontend` сам його не використовує** (немає ні в `package.json`, ні в `eslint.config.js`) — я помилково скопіював пункт у чекліст, орієнтуючись на кореневий `package.json`, а не на те, що реально споживає фронтенд. Нічого підключати не треба; пункт 5 з блоку команд нижче — **не виконувати**.
- [x] Env: завести `.env.local` з `NEXT_PUBLIC_API_URL` (замінник `VITE_API_URL`). ✅ (2026-09-19) `apps/frontend-next/.env.local` (нетрекований, реальне dev-значення) + `apps/frontend-next/.env.example` (трекований, за конвенцією `apps/backend/.env.example`).
- [x] **Знайдено і виправлено ще одна проблема, якої не було в первинному плані**: Next.js dev/start за замовчуванням теж стартує на порту **3000** — тому самому, що й `apps/backend` (`main.ts`: `process.env.PORT ?? 3000`). `apps/frontend` цього конфлікту не має (Vite за замовчуванням — 5173). Виправлено: `dev`/`start` у `apps/frontend-next/package.json` → `next dev -p 3001` / `next start -p 3001`. Заразом додав `http://localhost:3001` у дозволені CORS-origin'и — і в `apps/backend/.env.example`, і в хардкод-фолбек `apps/backend/src/main.ts` (спрацьовує, коли `CORS_ORIGINS` не задано в `.env`, а в реальному `.env` цього проєкту його й нема — фолбек із коду й використовується). **⚠ Виправлено 2026-09-23: це твердження було хибним** — `CORS_ORIGINS` задано і в кореневому `.env` (`:14`), і дефолтом у `docker-compose.yml` (`:16`), обидва лише з `5173`. Фолбек із `main.ts` ніколи не спрацьовував, і `frontend-next` ловив CORS-блок. Деталі — у записі про CORS у Фазі 1.
- [x] Кореневий `package.json`: додати `dev:frontend-next` / `build:frontend-next` скрипти за аналогією з існуючими `dev:frontend`. ✅ (2026-09-19)
- [x] Порожня головна сторінка (`app/page.tsx` з заглушкою) — підтвердити, що `pnpm --filter frontend-next dev` і `build` проходять чисто в контексті монорепо. ✅ (2026-09-19) `build` — чистий; `dev -p 3001` піднявся за 492мс, `curl http://localhost:3001` → `200`, підхопив `.env.local` (лог `Environments: .env.local`). **Фаза 0 завершена.**

**Команди (виконувати з кореня репо):**

```bash
# 1. Скаффолд Next.js-пакета (App Router, TS, Tailwind, ESLint, без src/-обгортки — узгоджено зі стилем apps/frontend)
pnpm create next-app@latest apps/frontend-next \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-pnpm

# 2. Runtime-залежності, перенесені 1:1 з apps/frontend (axios і react-router-dom НЕ переносимо —
#    axios у поточному фронтенді не використовується (мертва залежність), react-router-dom заміняє App Router)
pnpm --filter frontend-next add \
  @reduxjs/toolkit react-redux \
  react-hook-form @hookform/resolvers \
  zod date-fns lucide-react

# 3. Спільний workspace-пакет монорепо
pnpm --filter frontend-next add @syncevent/shared@workspace:*

# 4. Вирівняти версії react/react-dom з apps/frontend (create-next-app міг поставити іншу мінорну)
pnpm --filter frontend-next add react@^19.2.0 react-dom@^19.2.0

# 5. СКАСОВАНО — @syncevent/eslint-rules містить лише backend-специфічні правила
#    (no-prisma-in-controller, no-full-entity-args), apps/frontend теж його не підключає. Не виконувати.

# 6. Перевірка, що workspace бачить новий пакет і білд не ламає нічого існуючого
pnpm install
pnpm --filter frontend-next build
```

> `next`, `react`, `react-dom`, `typescript`, `eslint`, `tailwindcss`, `@types/node`,
> `@types/react`, `@types/react-dom`, `postcss` — ставить сам `create-next-app` (крок 1),
> окремо додавати не треба.

**Виконано:**

- [x] Крок 2 (runtime-залежності) ✅ (2026-09-19) — `@reduxjs/toolkit`, `react-redux`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`, `lucide-react` встановлено в `apps/frontend-next/package.json`.
- [x] Крок 4 (вирівняти React) ✅ (2026-09-19) — `react`/`react-dom` зафіксовано на `^19.2.0`, як у `apps/frontend`.
- [x] **Ще один знайдений і виправлений побічний ефект**: попередження `Ignored build scripts: @scarf/scarf, msgpackr-extract, unrs-resolver` виникало при кожному `pnpm install`, хоча `pnpm-workspace.yaml` нібито вже дозволяв `@scarf/scarf` і `unrs-resolver` через `onlyBuiltDependencies`. Причина — **ця секція в `pnpm-workspace.yaml` мертва**: реальне джерело істини для цього пнпм — поле `"pnpm".onlyBuiltDependencies` у кореневому `package.json`, а там цих двох пакетів не було (лише `prisma`/`bcrypt`/`esbuild`). Тобто хтось раніше висловив намір довіряти цим пакетам, але він ніколи не діяв. Виправлено **тільки** для `unrs-resolver` (потрібен `eslint-config-next`, з'явився саме через роботу над `frontend-next`; типовий, широковживаний нативний резолвер для ESLint, попередньо вже "схвалений" наміром у workspace.yaml) — додано в `package.json`. `@scarf/scarf` (анонімний телеметрійний пінг з `swagger-ui-dist`, транзитивна залежність `backend`) і `msgpackr-extract` (нативний прискорювач `msgpackr`, транзитивна залежність `backend`'s `bullmq`) **свідомо залишено заблокованими** — це backend-залежності поза скоупом цієї задачі, і `@scarf/scarf` зокрема краще залишати заблокованим за замовчуванням (приватність). Обидва функціонально не критичні — падають на чистий JS-фолбек без білду нативного аддону.

### Фаза 1 — приватна зона (client-side, 1:1 перенесення)

- [x] Створити root client-провайдер (`app/providers.tsx`, `"use client"`) з Redux `Provider` (стор з `apps/frontend/src/store/store.ts`, перенесено без змін логіки) ✅ (2026-09-19), підключено в `app/layout.tsx`.
- [x] Перенести `src/features/auth/` (`authSlice.ts`, `authApi.ts`) 1:1; замінити лише `import.meta.env.VITE_API_URL` → `process.env.NEXT_PUBLIC_API_URL`. ✅ (2026-09-19)
- [x] Перенести `src/features/events/eventsApi.ts` 1:1 (RTK Query, включно з join-polling логікою — без змін). ✅ (2026-09-19)
- [x] **Знайдено і виправлено критичний SSR-баг, точно передбачений у §4 документа**: `pnpm --filter frontend-next build` падав з `ReferenceError: localStorage is not defined` у `features/auth/authSlice.ts:11` під час серверного prerender-проходу `/`. Причина: `"use client"`-компонент (`Providers`) усе одно **рендериться один раз на сервері** для генерації початкового HTML (не лише в браузері після гідратації) — а `authSlice.ts` читає `localStorage` прямо на рівні модуля, при імпорті. Виправлено мінімальним стандартним для Next.js способом — `typeof window !== 'undefined'`-guard навколо обох викликів `localStorage.getItem`; на клієнті поведінка ідентична оригіналу (guard завжди `true` в браузері), на сервері повертає `null` замість падіння. Це єдине **свідоме** відхилення від "перенести без змін логіки" в цій фазі — без нього код не зібрався б узагалі. Перевірено і `build`, і `dev` (реальний `curl` → `200`).
- [x] **Знайдено при вході в цей крок**: папки під App Router (`app/auth/login`, `app/auth/register`, `app/(main)/my-events`, `app/(main)/events/create`, `app/(main)/events/[id]/edit`) уже існували з попередньої сесії, але в неробочому проміжному стані — `login/page.tsx` і `auth/components/LoginForm.tsx`/`RegisterForm.tsx` виявились файлами, буквально скопійованими зі старого `apps/frontend` (імпорти `react-router-dom`, шляхи типу `../../../store/hooks`, яких у новій структурі не існує — хуки `useAppDispatch`/`useAppSelector` лежать прямо в `store/store.ts`), а `register`/`my-events`/`events/create`/`events/[id]/edit` — порожні файли-заглушки. Висновок: мапити всі 7 роутів одним пунктом — занадто великий крок, який і призвів до цього напівзробленого стану. Розбито нижче на під-пункти, по одному роуту за раз, з підтвердженням білдом після кожного.
- [x] `/auth/login` → `app/auth/login/page.tsx` + `app/auth/components/LoginForm.tsx`. ✅ (2026-09-21) Виправлено: `useNavigate` (react-router-dom) → `useRouter` (`next/navigation`), `<Link to>` → `<Link href>` (`next/link`), відносні шляхи → `@/*`-аліас (`@/store/store`, `@/features/auth/authApi`, `@/features/auth/authSlice`) — надійніше за `../../../`, бо не залежить від глибини файлу. Додано `"use client"` на `LoginForm.tsx` (є hooks/state) — `page.tsx` лишився Server Component, рендерить клієнтський `LoginForm` як дочірній, без власних хуків. Підтверджено: `pnpm --filter frontend-next build` — цей роут компілюється чисто (`✓ Compiled successfully`); решта помилок білду — від ще не зроблених `register`/`my-events`/`events/create`/`events/[id]/edit`, очікувано.
- [x] `/auth/register` → `app/auth/register/page.tsx` + `app/auth/components/RegisterForm.tsx`. ✅ (2026-09-21) Той самий патерн, що й login: `useNavigate` → `useRouter`, `<Link to>` → `<Link href>`, шляхи → `@/*`-аліас, `"use client"` на `RegisterForm.tsx`. Підтверджено: `pnpm --filter frontend-next build` — роут компілюється чисто; решта помилок — від `my-events`/`events/create`/`events/[id]/edit`, очікувано.
- [x] `/my-events` → `app/(main)/my-events/page.tsx`. ✅ (2026-09-22) Портовано `CalendarHeader.tsx` (без змін — presentational, без хуків/роутингу) і `screens/MyEventsCalendar.tsx` (`"use client"`, `useNavigate`→`useRouter`+`router.push`, шляхи → `@/*`). **Знайдений і виправлений runtime-баг, якого не ловить `build`**: у `CalendarHeader.tsx` лишились виклики хуків (`useNavigate()`/`useRouter()`) на рівні модуля (поза тілом компонента) — валідний TS, невалідний React ("Invalid hook call"), проявився лише при реальному запиті до dev-сервера (`curl` → 500), не на `build`. Видалено. Підтверджено: `curl http://localhost:3001/my-events` → 200, консоль браузера чиста, ручна перевірка (prev/next місяць, week/month toggle) працює. Дані з бекенду не перевірені — бекенд (порт 3000) не піднятий у цій сесії.
- [x] `/events/create` → `app/(main)/events/create/page.tsx`. ✅ (2026-09-22)
- [x] `/events/[id]/edit` → `app/(main)/events/[id]/edit/page.tsx`. ✅ (2026-09-22) Одна спільна клієнтська форма (`screens/CreateEventPage.tsx`), яку рендерять обидва тонкі `page.tsx`-обгортки (`create` і `[id]/edit`) без різниці в коді сторінки — жодна з обгорток навіть не оголошує `params`-проп, бо `id` компонент читає сам через `useParams()` з `next/navigation`. **Уточнення (перевірено по типах у встановленому Next 16.3.5, `node_modules/next/dist/client/components/navigation.d.ts`)**: попередній запис тут стверджував, що `useParams()` "без generic" — це неточно. Реальна сигнатура `useParams<T extends Params = Params>(): T`, тобто generic **підтримується**, той самий синтаксис, що й у react-router (`useParams<{ id: string }>()`), лише інше джерело імпорту. Це дійсно **не те саме**, що `params`-проп сервер-компонента (`Promise<{ id }>`, треба `await`) — той механізм для Server Components і тут узагалі не використовується, обидва `page.tsx` лишаються найтоншими можливими обгортками. `pnpm --filter frontend-next dev` + `curl` на обидва роути → 200, без `data-next-error-message` (маркер краху, знайдений раніше на `/my-events`).
- [x] Layout з `MainLayout`/`UserBar`/`Header` → `app/(main)/layout.tsx`. ✅ (2026-09-22) `app/(main)/layout.tsx` лишився Server Component (без директиви) і просто рендерить `<Header />` — Server Component, що рендерить Client Component, це нормальний, очікуваний напрям композиції в App Router (заборонений лише зворотний). Підтверджено `curl`: `/my-events`, `/events/create` тепер містять "SyncEvent" в розмітці; `/` — ні, і це **очікувано на цьому етапі**: `app/page.tsx` лежить поза групою `(main)`, тому лейауту не отримує (у Vite `/` був під `MainLayout`) — цей розрив свідомо закриється в Фазі 2, коли `/` стане справжнім SSR-компонентом (§5). **Оновлено 2026-09-23**: розрив закрито раніше — `/` перенесено в `(main)`, див. наступні пункти.
- [x] **Відкрите архітектурне питання — вирішено (2026-09-22)**: обрано дзеркало Vite-структури — `features/*` на корені `frontend-next` (поза `app/`), за аналогією з уже перенесеними `authSlice.ts`/`authApi.ts`/`eventsApi.ts`. `LoginForm`/`RegisterForm` у `app/auth/components/` лишаються як є (не варто рефакторити заради консистентності те, що вже пройшло рев'ю й працює) — але всі нові компоненти (`CalendarHeader`, `Header`, `UserBar`, `CreateEventPage`, `MyEventsCalendar`) йдуть у `features/*`/`screens/*` (не `pages/*` — ця назва зарезервована Pages Router, див. §9.4), дзеркалячи шлях, який вони мали в `apps/frontend/src/`.
- [x] Перенести решту компонентів приватної зони: `components/layout/Header.tsx`, `components/UserBar/UserBar.tsx`, `features/calendar/components/CalendarHeader.tsx`, `screens/CreateEventPage.tsx`, `screens/MyEventsCalendar.tsx`. ✅ (2026-09-22) Усі — `"use client"` на самому компоненті, не на обгортці `page.tsx`; логіка й JSX не змінені, лише імпорти/роутинг (нижче).
- [x] Замінити react-router хуки на Next-еквіваленти. ✅ (2026-09-22) Застосовано на `LoginForm`/`RegisterForm`/`MyEventsCalendar`/`CreateEventPage`/`Header`/`UserBar`:

  | react-router-dom | Next.js |
  |---|---|
  | `useNavigate()` → `navigate('/x')` | `useRouter()` з `next/navigation` → `router.push('/x')` |
  | `useParams<{id:string}>()` | `useParams<{id:string}>()` з `next/navigation` — **виправлено**: generic таки підтримується (`useParams<T extends Params = Params>(): T`, перевірено по типах Next 16.3.5), синхронний, лише в client component |
  | `useLocation().pathname` | `usePathname()` з `next/navigation` |
  | `<Link to="/x">` | `<Link href="/x">` з `next/link` (інший пакет, проп `href`) |
  | `navigate('/x', { replace: true })` | `router.replace('/x')` |
  | `navigate(-1)` | `router.back()` |
  | — | ⚠ імпорт саме з `next/navigation`; `next/router` — це старий Pages Router, в App Router не працює (IDE часто підставляє його автоімпортом) |

- [x] `/` (список подій) → `app/(main)/page.tsx`, **тимчасово client-side** (1:1 з Vite `EventsPage`, RTK Query). ✅ (2026-09-23) Дві помилки при перенесенні:
  1. `export const EventsPage` → `tsc`: `Property 'default' is missing in type ... AppPageConfig<"/">` (з `.next/types/validator.ts`). Next сам завантажує `page.tsx` і бере лише `default`-експорт — на відміну від react-router, де компонент імпортуєш явно й форма експорту байдужа. Виправлено на `export default function EventsPage()`.
  2. Файл лежав у `app/page.tsx` — поза `(main)`, тому без `<Header />`. Перенесено в `app/(main)/page.tsx`; URL лишився `/`, бо route group `(…)` у шлях не входить (аналог layout-route без `path` у react-router). Старий `app/page.tsx` видалено — інакше конфлікт двох файлів на один маршрут. Відносні імпорти → `@/*`.
  Перевірено: `tsc --noEmit` чистий. Фаза 2 (SSR для `/`) лишається в силі — це проміжний стан, не фінальний.
- [x] `features/events/components/EventCard.tsx`: `useNavigate` → `useRouter` (`next/navigation`), додано явний `"use client"`. ✅ (2026-09-23) Директива явна, хоча зараз картку імпортує лише клієнтська сторінка (і вона "успадковує" клієнтськість по дереву імпортів) — у Фазі 2 `/` стане Server Component, і без власної директиви картка зламалась би. `react-router-dom` у `frontend-next` не встановлено взагалі (pnpm не хойстить з `apps/frontend`), тож старий імпорт падав би з `Module not found`.
  - [ ] **Відкрито**: кнопка Edit веде на `/events/create/${id}` — такого маршруту немає; має бути `/events/${id}/edit` (`app/(main)/events/[id]/edit/page.tsx`). Баг успадковано з Vite-версії.
  - [ ] **Відкрито**: клік по картці веде на `/events/${id}` → 404, бо `app/(main)/events/[id]/page.tsx` ще не існує (закривається у Фазі 2, пункт "деталі події").
  - [ ] **Покращення (Фаза 2)**: `<div onClick={router.push}>` → "stretched link" (див. §9). Пряма обгортка картки в `<Link>` **не підходить** — всередині є `<button>`, а інтерактивні елементи всередині `<a>` — невалідний HTML.
- [x] **CORS для `localhost:3001` — знайдено і виправлено (2026-09-23).** Симптом у браузері: `blocked by CORS policy: No 'Access-Control-Allow-Origin' header` при `GET .../api/events` зі статусом `200 (OK)` + `net::ERR_FAILED` (сервер відповів, браузер сховав відповідь від JS). Корінь — запис у Фазі 0 помилково вважав, що працює фолбек з `main.ts`; насправді `process.env.CORS_ORIGINS?.split(',') || [...]` фолбек не бере, бо змінна задана (кореневий `.env:14` і дефолт `docker-compose.yml:16`, обидва тільки `5173`). Виправлено:
  - `.env:14` → `CORS_ORIGINS=http://localhost:5173,http://localhost:3001`;
  - `docker-compose.yml:16` → `${CORS_ORIGINS:-http://localhost:5173,http://localhost:3001}` (дефолт **доповнено**, а не замінено — інакше без `.env` ламається Vite-фронтенд). Проміжна спроба з `${CORS_ORIGINS=...}` дала `invalid interpolation format` — compose підтримує `:-`, `-`, `:?`, `?`, `:+`, `+`, але не bash-овий `=`;
  - контейнер перестворено через `docker compose up` (не `restart` — env фіксується при створенні контейнера).
  Перевірено: `docker exec sync-event-backend printenv CORS_ORIGINS` → обидві адреси; `curl -H "Origin: http://localhost:3001"` → `Access-Control-Allow-Origin: http://localhost:3001`.
  Урок: коли поведінка не збігається з кодом — спершу дивитись, що бачить **запущений процес**, а не файли.

- [ ] Ручна перевірка сценаріїв: реєстрація → логін → створення події → join/leave → редагування → logout → refresh-token ротація (кілька вкладок) — усі мають поводитись ідентично поточному Vite SPA.

**Позапланова робота (2026-09-22), потрібна Borys'у для ручної перевірки вище**: контейнеризація `frontend-next` для локального тестування — свідомо витягнуто наперед із Фази 3 (§6, там — про production-деплой на Node-сервер; тут — лише dev-контейнер для паритету з тим, як уже працює `apps/frontend`/Vite в `docker-compose.yml`), не блокує послідовність Фаз 0-2.

- Додано `apps/frontend-next/Dockerfile` (той самий патерн, що й `apps/frontend/Dockerfile`: dev-режим у контейнері, `next dev -p 3001 -H 0.0.0.0` — прапорець `-H 0.0.0.0` є Next-еквівалентом Vite-шного `--host`, без нього порт з хоста нікуди не мапиться) і сервіс `frontend-next` у `docker-compose.yml` (без `profiles` — як і `frontend`, завжди піднімається).
- **Важливий нюанс, задокументований прямо в коментарі compose-файлу**: `NEXT_PUBLIC_*`-змінні вшиваються в клієнтський JS **на етапі білду/компіляції**, а виконує цей JS браузер на хості, а не контейнер. Тому `NEXT_PUBLIC_API_URL` має лишатись хостовою адресою (`http://localhost:3000/api`), а не іменем сервісу з внутрішньої docker-мережі (`http://backend:3000/api`) — той просто не резолвиться з браузера. Той самий принцип, що вже застосований у `frontend`-сервісі (`VITE_API_URL=http://localhost:3000/api`, не `http://backend:3000`).
- **Знайдено і виправлено серйозний, наскрізний (не лише `frontend-next`) баг у кореневому `.dockerignore`**, виявлений під час перевірки, що `.env.local` не потрапляє в образ:
  1. Файл мав CRLF-закінчення рядків (той самий клас проблеми, що вже задокументований для `entrypoint.sh` в `apps/backend/Dockerfile`) — виправлено (`sed -i 's/\r$//'`), хоча це виявилось не корінною причиною.
  2. **Корінна причина**: на відміну від `.gitignore`, гола назва файлу в `.dockerignore` (напр. `.env`) прив'язана лише до **кореня контексту білду**, а НЕ матчиться на будь-якій глибині — `**/`-префікс обов'язковий для рекурсивного матчу. Патерн `.env` у корені репо ніколи не виключав `apps/backend/.env`.
  3. **Наслідок, що існував ще до цієї сесії**: `apps/backend/.env` (реальні локальні секрети — `JWT_SECRET`/`JWT_REFRESH_SECRET`/креденшели БД) уже давно вшивався у `apps/backend`-образ при кожному білді, без жодної функціональної потреби (бекенд-контейнер отримує конфіг через `environment:` у compose, не через цей файл). Виявлено емпірично (`docker exec ... ls .env`), не з коду.
  4. Виправлено додаванням `**/.env`, `**/.env.local` (і заразом `**/.next`, щоб не тягнути в образ локальний Next-кеш) у `.dockerignore`. Перевірено ізольовано через голий `docker build` (в обхід compose/bake) до і після фіксу. Перебілджено `backend` і `frontend-next`, перестворено контейнери, `docker image prune` — старі шари з витоком не лишились тегованими на диску.
  5. Проєкт — соло, образи ніколи нікуди не пушились, тож ризик витоку локальний до цієї машини; ротація секретів не потрібна, але варто пам'ятати про цей клас багу при додаванні нових Dockerfile'ів у монорепо.
- **Ще один знайдений і виправлений побічний ефект**: перший запуск бекенд-стеку (`pnpm dev:postgres`) через `run_in_background` Bash-інструмент у foreground-режимі (`docker compose up` без `-d`) несподівано "завершився" (exit 0) і забрав із собою **всі** контейнери й мережу (graceful shutdown на перервання прив'язаного до нього процесу) — `pgdata`-volume вцілів (down без `-v` не чіпає volume), даних не втрачено, але весь стек довелось піднімати заново через `COMPOSE_PROFILES=postgres docker compose up -d` (явно detached, не залежить від життєвого циклу обгортки).

> Формат сесії: менторський — код пише і копіює сам Borys, Claude пояснює теорію App Router і дає точкові задачі, не пише файли компонентів за нього.

### Фаза 2 — публічна зона (справжній SSR)

- [ ] `app/page.tsx` (список подій, `/`) — Server Component, `fetch(`${API_URL}/events`, { next: { revalidate: N } })` напряму, без RTK Query для початкового SSR-рендеру.
- [ ] `app/events/[id]/page.tsx` (деталі події) — Server Component, `fetch` за `id` з `generateMetadata()` для title/description (реальна демонстрація RSC/SEO, не косметика).
- [ ] `EventCard`: перехід на деталі — stretched link (`<Link>` на заголовку + `after:absolute after:inset-0`, кнопки з `relative z-10`) замість `div onClick` + `router.push` (див. §9.2).
- [ ] Виокремити інтерактивні шматки (кнопка "приєднатись", пагінація, фільтри) в окремі `"use client"` дочірні компоненти, що отримують початкові дані як props від server-компонента.
- [ ] Кнопка join на публічній сторінці деталей — client-компонент, що робить authenticated-запит через існуючу `eventsApi` (Redux) лише в момент кліку, без SSR-залежності від токена (§7, ризик 3).
- [ ] Перевірити поведінку кешу/revalidate: створення нової події в приватній зоні має з'явитись у публічному списку (ручна перевірка `revalidate`/`revalidatePath` після мутацій).

### Фаза 3 — заміна й прибирання

- [ ] Переключити кореневі скрипти монорепо (`dev`, `dev:frontend`, `build`) на `apps/frontend-next`.
- [ ] Оновити `docker-compose.yml`/deploy-конфіг під Node-сервер Next.js (не статичний `dist/`, див. §7 ризик 4) — окрема підзадача, не блокує Фази 0-2.
- [ ] Ручна повторна перевірка всіх сценаріїв (той самий список, що у Фазі 1, плюс публічні сторінки з Фази 2) на `apps/frontend-next` у зборі.
- [ ] Видалити `apps/frontend` (Vite-версію) лише після успішної перевірки — не раніше.
- [ ] Оновити `README`/CI (якщо є) на новий build-таргет і назву пакета (`frontend-next` → можна перейменувати назад у `frontend` після видалення старого).

---

## 7. Ризики й нюанси

| # | Ризик | Мітигація |
|---|---|---|
| 1 | RTK Query hydration mismatch між Server і Client Component межею | Тримати RTK Query виключно в приватній (client) зоні; публічна зона не використовує Redux-стан узагалі |
| 2 | Дублювання паралельного застосунку (`apps/frontend` + `apps/frontend-next`) під час міграції — тимчасове збільшення обсягу репо | Видаляємо старий після Фази 3, не раніше |
| 3 | `credentials: 'include'` + SSR fetch на публічних сторінках — кукі сервера й браузера не тотожні | Публічна зона свідомо не робить authenticated-запитів; join/leave лишається client-side дією |
| 4 | Next.js App Router вимагає Node-сервер (не статичний build) — інша модель деплою, ніж Vite `dist/` | Врахувати окремо в deploy-конфігурації (поза скоупом цього документа) |
| 5 | Кастомний `@syncevent/eslint-rules` пакет — конфіг для Next.js може відрізнятись від Vite-проєкту | Перевірити сумісність `eslint-config-next` з існуючими кастомними правилами у Фазі 0 |

---

## 8. Орієнтовна трудомісткість

- Фаза 0 (каркас): ~0.5 дня.
- Фаза 1 (приватна зона, 1:1): ~1-1.5 дня (7 роутів, перенесення компонентів).
- Фаза 2 (публічна зона, справжній SSR): ~1 день (найцінніша частина для портфоліо, тому не скорочувати).
- Фаза 3 (cleanup/deploy): ~0.5 дня.

**Разом: ~3-3.5 дні** для гібридної міграції з реальним SSR-компонентом, проти ~1-2 днів
для суто косметичної (усе `"use client"`) — яку свідомо відкидаємо як таку, що не дає
портфоліо-цінності (див. §1).

---

## 9. React (Vite + react-router) vs Next.js (App Router) — конспект

> Підсумок практичних відмінностей, на які натрапили під час міграції (2026-09-23).
> Next — не "замість React", а **поверх** нього: компоненти, хуки, JSX, Redux, RHF, zod
> працюють так само. Змінюються три речі: **хто задає маршрути, де виконується код, звідки
> береться конфіг**.

### 9.1. Маршрутизація: код → файлова система

| | React + react-router | Next.js App Router |
|---|---|---|
| Як задається маршрут | `<Route path="/x" element={...}>` у коді | файл `app/x/page.tsx` |
| Експорт сторінки | будь-який — імпортуєш сам | **тільки `export default`** — Next завантажує модуль сам |
| Динамічний сегмент | `path="events/:id"` | папка `app/events/[id]/` |
| Layout | вкладений `<Route element={<Layout/>}>` + `<Outlet/>` | `layout.tsx` у папці, `children` замість `Outlet` |
| Layout без зміни URL | `<Route>` без `path` | route group `(main)/` — дужки в URL не потрапляють |

Спецфайли з обов'язковим `export default`: `page`, `layout`, `loading`, `error`, `not-found`.

### 9.2. Навігація

Таблиця відповідностей хуків — у Фазі 1 (п. "Замінити react-router хуки"). Правило вибору:

| Ситуація | Інструмент | Приклад у проєкті |
|---|---|---|
| Користувач клікає, щоб **перейти** | `<Link href>` | меню в `Header.tsx`, "Edit" у картці |
| Користувач клікає, щоб **щось зробити** | `<button>` | Join/Leave, Delete |
| Перехід як **наслідок** дії/логіки | `router.push` | редирект після логіну (`LoginForm.tsx`) |

Тест: "чи міг би користувач захотіти відкрити це в новій вкладці?" → так → `<Link>`.

Чому `<Link>` кращий за `div onClick={router.push}` для навігації: Ctrl/середній клік → нова
вкладка, "копіювати посилання", URL при наведенні, фокус з клавіатури + Enter, скринрідер
чує "посилання", SEO бачить зв'язки між сторінками, і — специфічно для Next — **prefetch**:
у production-збірці маршрут підвантажується, щойно `<Link>` з'являється у viewport.

**Картка з кнопками всередині — stretched link**, не обгортка: `<button>` всередині `<a>` —
невалідний HTML (hydration-попередження, a11y, треба `preventDefault` на кожній кнопці).

```tsx
<div className="relative ...">
  <h3>
    <Link href={`/events/${event.id}`} className="after:absolute after:inset-0">
      {event.title}
    </Link>
  </h3>
  {/* ... */}
  <button className="relative z-10" onClick={onJoin}>Join</button>
</div>
```

### 9.3. Де виконується код — головна концептуальна різниця

| | React (Vite) | Next.js |
|---|---|---|
| За замовчуванням | усе в браузері | **Server Component** — на сервері |
| Хуки, `useState`, події, Redux | всюди | лише під `"use client"` |
| Як діє директива | не існує | межа: усе, що імпортується з цього файлу, теж клієнтське |
| Модульний код у `"use client"` | лише браузер | **теж виконується на сервері** при prerender (звідси `localStorage is not defined`, Фаза 1) |

Server Component може рендерити Client Component (так працює `(main)/layout.tsx` → `Header`),
навпаки — ні (лише через `children`/props).

### 9.4. Структура проєкту

- Особливе значення має лише `app/` (і `public/`). `features/`, `components/`, `store/` —
  звичайні модулі.
- **Не називати папку `pages/`** — Next трактує її як Pages Router. Тому екрани лежать у `screens/`.
- Усередині `app/` маршрутом стають лише спецфайли; решту можна колокувати поруч,
  `_folder` явно виключає папку з роутингу.
- `@/*`-аліас замість `../../../` — не ламається при перенесенні файлу на іншу глибину.

### 9.5. Оточення та інфраструктура

| | Vite | Next.js |
|---|---|---|
| Env у браузері | `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` (вшивається на етапі збірки) |
| Dev-порт | 5173 | 3000 за замовчуванням → у нас `-p 3001` (3000 — бекенд) |
| Host у контейнері | `--host` | `-H 0.0.0.0` |
| Деплой | статичний `dist/` | Node-сервер |

**CORS**: новий порт = новий origin (протокол + хост + порт) → треба дозволити на бекенді.
CORS — захист **браузера**: сервер відповідає (`200`), але без `Access-Control-Allow-Origin`
браузер ховає відповідь від JS (`ERR_FAILED`); `curl`/Postman його не помічають.

Пастки з конфігом, на які натрапили:
- `env || [fallback]` у коді і `${VAR:-default}` у compose — **лише fallback**; якщо змінна
  задана в `.env`, правка дефолту нічого не змінює;
- compose розуміє `:-`, `-`, `:?`, `?`, `:+`, `+` — але не `=` (`invalid interpolation format`);
- зміна env → `docker compose up -d <service>` (перестворення), `restart` не підхоплює;
- перевіряти, що бачить **запущений процес** (`docker exec ... printenv`), а не лише файли.
