# Фронтенд-авторизація та RTK Query: теорія, розбір, ТЗ

> Статус: **аналіз + ТЗ готові, реалізація не починалась** (створено 2026-09-27).
> Формат: менторський — я аналізую й даю ТЗ, код пишеш ти. Після кожного кроку —
> стоп на ревʼю, потім оновлюємо §8 «Журнал виконання».
> Соло-проєкт, автор — Borys.
>
> Пов'язаний код:
> - `apps/frontend-next/components/UserBar/UserBar.tsx` — головний «підозрюваний»
> - `apps/frontend-next/features/auth/authApi.ts` — RTK Query + reauth-інтерцептор
> - `apps/frontend-next/features/auth/authSlice.ts` — стан токена/юзера + localStorage
> - `apps/frontend-next/features/events/eventsApi.ts` — другий api-slice (без reauth!)
> - `apps/frontend-next/store/store.ts`, `store/hooks.ts`, `app/providers.tsx`
> - `apps/backend/src/auth/auth.controller.ts` — cookie, `/refresh`, `/logout`, `/logout-all`
>
> Пов'язані доки: [`refresh-token-rotation.md`](./refresh-token-rotation.md) (бекенд-шар,
> ротація, reuse-detection, grace-period), [`nextjs-migration.md`](./nextjs-migration.md).

---

## 0. TL;DR — головні висновки аналізу

1. **Бекенд-шар авторизації зроблений добре**: refresh-токен живе в `httpOnly` кукі,
   ротація + reuse-detection + blocklist по `jti` (див. `refresh-token-rotation.md`).
   Проблеми — майже всі на фронтенді.
2. **Три джерела правди на один і той самий факт «хто я»**: Redux (`auth.user`),
   `localStorage['user']` і RTK Query кеш (`getProfile`). `UserBar` вручну переливає дані
   між ними через `useEffect` — це і є корінь усіх дивних баг-репортів типу «показує старе
   імʼя» / «блимає Sign In при релоаді».
3. **`eventsApi` не має reauth-інтерцептора взагалі.** Протух access-токен → будь-який запит
   до `/events` віддає 401 і просто падає, без спроби refresh. Плюс там немає
   `credentials: 'include'`, тобто кукі навіть не долітає.
4. **Два окремих `createApi`** → два кеші, два middleware, два незалежних «світи».
   `resetApiState()` на логауті чистить лише `authApi`; кеш івентів попереднього юзера
   лишається в памʼяті.
5. **`logout` на фронтенді не викликає `POST /api/auth/logout`.** Кукі стирається тільки
   локально; на сервері сесія лишається валідною **7 днів**. Ендпоінт існує і не
   використовується.
6. **`accessToken` у `localStorage`** — доступний будь-якому XSS. Ціль: тримати його
   **в памʼяті**, а виживання сесії між релоадами забезпечувати silent-refresh по кукі.
7. **`isMounted` у `UserBar` — мертвий код**: `useState(false)` є, `setIsMounted(true)`
   немає, змінна ніде не читається. Тобто захист від hydration-mismatch **задумали, але
   не дописали**, а `authSlice` читає `localStorage` на етапі створення стора — сервер
   рендерить «Sign In», клієнт одразу рендерить юзера.
8. Тип `AuthResponse` у `@syncevent/shared` обіцяє `refreshToken` у тілі відповіді, якого
   в тілі **ніколи немає** (контролер віддає лише `{user, accessToken}`, refresh — у кукі).
   Тип бреше компілятору.

Пріоритети: §4 таблиця. ТЗ: §7.

---

## 1. Теорія RTK Query — що це насправді таке

### 1.1 Головна теза

RTK Query — це **не** «бібліотека для HTTP-запитів». Це **кеш серверних даних, що живе
в Redux-сторі**, з автоматичною синхронізацією підписок React-компонентів.
`fetch` там — деталь реалізації, яку можна замінити.

Практичний наслідок: у RTKQ ти описуєш **не «як зробити запит»**, а **«який ресурс мені
потрібен»**. Коли ти пишеш `useGetProfileQuery()`, ти кажеш: «цей компонент підписується на
ресурс *профіль*». Скільком компонентам він потрібен, чи вже є в кеші, чи треба
перезапитати — вирішує RTKQ.

Звідси ключовий критерій, **що має жити в RTKQ, а що — в звичайному slice**:

| Природа даних | Де живе | Приклад у SyncEvent |
|---|---|---|
| Належить серверу, ми лише кешуємо копію | RTK Query | `getProfile`, `getEvents` |
| Належить клієнту, сервер про нього не знає | `createSlice` | відкрите/закрите мобільне меню |
| Серверний **секрет**, потрібний для запитів | `createSlice` (не кеш!) | `accessToken` |

`accessToken` — окремий випадок: це не «дані для показу», а **креденшл**, який читає
`prepareHeaders`. Йому місце в slice. А `user` — це **серверні дані**, тобто йому місце
в RTKQ-кеші, а **не** в slice. Зараз у проєкті зроблено навпаки: токен у slice **і** в
localStorage, юзер — і в slice, і в localStorage, і в кеші.

### 1.2 Cache key: серце всієї моделі

Кожен запис кешу адресується ключем:

```
cacheKey = `${endpointName}(${serializeQueryArgs(args)})`
```

Тобто:

```ts
useGetEventsQuery({ page: 1 })  // ключ: getEvents({"page":1})
useGetEventsQuery({ page: 2 })  // ключ: getEvents({"page":2})  ← ІНШИЙ запис кешу
useGetProfileQuery()            // ключ: getProfile(undefined)
useGetProfileQuery(undefined)   // ключ: getProfile(undefined)  ← ТОЙ САМИЙ
```

Аргументи серіалізуються **стабільно** (ключі обʼєкта сортуються), тому
`{page: 1, limit: 10}` і `{limit: 10, page: 1}` — один ключ. Але
`useGetEventsQuery({})` і `useGetEventsQuery()` — **різні** ключі (`{}` vs `undefined`).
Це класичне джерело «чому в мене два однакових запити в Network».

**Наслідок, важливий для `UserBar`**: якщо десять компонентів викличуть
`useGetProfileQuery()`, запит на сервер піде **один**. Не треба вручну прокидувати юзера
через Redux, щоб «не робити зайвий запит» — RTKQ вже це робить. Саме тому `useEffect`
з `dispatch(setCredentials(...))` у `UserBar` не просто зайвий, а шкідливий.

### 1.3 Підписки і reference counting

Коли компонент монтується з хуком:

1. RTKQ інкрементує **лічильник підписників** для цього cacheKey.
2. Якщо запис кешу відсутній → стартує запит (`status: 'pending'`).
3. Якщо запис уже є → компонент **одразу** отримує дані з кешу (жодного `pending`),
   а RTKQ може зробити фонове `refetch` залежно від налаштувань.

Коли компонент розмонтовується — лічильник декрементується. Коли він падає до нуля,
запускається таймер `keepUnusedDataFor` (дефолт **60 секунд**), і лише після нього дані
викидаються з кешу. Тому швидкий перехід «сторінка → назад» не робить нового запиту.

### 1.4 Флаги стану: `isLoading` vs `isFetching` vs `isUninitialized`

Це місце, де майже всі спотикаються (і де в `UserBar` зараз реальна логічна дірка):

| Флаг | Значення |
|---|---|
| `isUninitialized` | запит **ще не стартував** — напр. через `skip: true` |
| `isLoading` | **перше** завантаження цього cacheKey (даних ще не існує) |
| `isFetching` | **будь-який** запит у льоті, включно з фоновим refetch, коли дані вже є |
| `isSuccess` / `isError` | термінальні стани останнього запиту |
| `currentData` | дані **для поточних args**; `data` може ще тримати дані попередніх args |

Правило: `isLoading` → показуй скелетон. `isFetching` → показуй ненавʼязливий спінер
поверх існуючих даних. Ніколи не рендери скелетон на `isFetching`, якщо дані вже є —
UI буде блимати.

`isLoading` **ніколи не буває `true` при `skip: true`** — запиту ж немає. Тому
`if (isLoading) return <skeleton/>` у `UserBar` не покриває найважливіший кейс:
«токена в стані ще немає, але кукі валідна». Там треба третій стан:
`isUninitialized && cookieMightExist` → «ми ще не знаємо, хто ти».

### 1.5 Інвалідація: теги, а не ручні refetch

Мутації не «оновлюють кеш». Вони **позначають частини кешу застарілими**, а RTKQ
перезапитує ті записи, у яких є активні підписники.

```
tagTypes: ['Event', 'Profile']          // оголошуємо всесвіт тегів
query.providesTags:    'я — власник цих тегів'
mutation.invalidatesTags: 'я зіпсував ці теги'
```

Гранулярність через `{type, id}`:
- `{type: 'Event', id: '42'}` — конкретна сутність.
- `{type: 'Event', id: 'LIST'}` — синтетичний тег «список». `id: 'LIST'` не є магією
  фреймворку, це **конвенція**: рядок, який ніколи не збігається з реальним id.

У `eventsApi` це вже зроблено добре (`getEvents` віддає `LIST` + кожен `id`, мутації
інвалідують і `LIST`, і конкретний id). **В `authApi` тегів немає взагалі** — тому
після логіну `getProfile` не перезапитується, і саме це «лікує» `useEffect` у `UserBar`.
Правильне лікування — теги, не `useEffect`.

Дірка в поточних тегах `eventsApi`, яку варто тримати в голові: у `tagTypes` оголошено
`'MyEvents'`, і `joinEvent`/`leaveEvent` інвалідують `'MyEvents'`, але **жоден query його
не `providesTags`** → інвалідація нікуди не влучає. Календар реально провайдить
`{type:'Event', id:'MY_CALENDAR'}`, який `join`/`leave` не чіпають. Тобто після join
календар не оновлюється. (Не в скоупі цього ТЗ, але запиши.)

### 1.6 `baseQuery`: точка розширення, а не «конфіг fetch-а»

`baseQuery` — просто асинхронна функція:

```ts
type BaseQueryFn<Args, Result, Error> = (
  args: Args,
  api: BaseQueryApi,   // { signal, dispatch, getState, endpoint, type, extra }
  extraOptions: unknown,
) => Promise<{ data: Result } | { error: Error }>
```

Вона **не кидає винятків** — вертає або `{data}`, або `{error}`. `fetchBaseQuery` —
лише одна з реалізацій (тонка обгортка над `fetch`, яка вміє `baseUrl`, `prepareHeaders`,
серіалізацію body/params і парсинг помилок).

Оскільку це звичайна функція, її можна **обгортати** — на цьому стоїть весь reauth-патерн
(«wrapped baseQuery»), і саме він уже є в `authApi.ts`: викликати внутрішній `baseQuery`,
подивитись на `result.error.status === 401`, зробити refresh, повторити запит.
Це правильний патерн. Проблема не в патерні, а в тому, що він **прикручений до одного
api-slice з двох**.

### 1.7 Чому «один api slice» — це не стилістика, а вимога

`createApi` створює **ізольований** кеш + reducer + middleware. Два `createApi` = два
всесвіти, які нічого не знають один про одного. Наслідки саме для авторизації:

1. Reauth-логіку треба дублювати (або, як зараз, вона є лише в одному).
2. Single-flight мʼютекс на refresh — **модульна змінна** `refreshPromise` в `authApi.ts`.
   Інший api-slice її не бачить → два паралельних `/refresh` з одним і тим самим токеном →
   на бекенді це рівно той **reuse-detection false-positive**, описаний у
   `refresh-token-rotation.md` §5.2. Від нього врятує лише `GRACE_PERIOD_MS`, тобто ми
   свідомо покладаємось на страховку замість того, щоб не створювати проблему.
3. `invalidatesTags` не працює між слайсами: мутація в `authApi` не може інвалідувати
   `Event`.
4. `resetApiState()` треба викликати на кожному слайсі окремо (зараз — лише на `authApi`).

Канонічне рішення — **один `baseApi`** з `injectEndpoints`:

```ts
// features/api/baseApi.ts
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Profile', 'Event'],
  endpoints: () => ({}),          // порожньо!
})

// features/auth/authApi.ts
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({ /* login, getProfile, ... */ }),
})
export const { useLoginMutation, useGetProfileQuery } = authApi
```

Один кеш, один middleware, один мʼютекс, спільні теги. Публічний API хуків для
компонентів **не змінюється** — тому це безпечний рефактор.

### 1.8 `queryFn` — коли одного HTTP-запиту недостатньо

`query` описує **один** запит декларативно. `queryFn` дає повний контроль (кілька
запитів, поллінг, зовнішні SDK). У проєкті це вже використано правильно: `joinEvent`
робить POST → отримує `202 + requestId` → полить статус. Гарний приклад — саме для такого
`queryFn` і існує.

Важливо: `queryFn` **мусить** вертати `{data}` або `{error}` у форматі
`FetchBaseQueryError`, і всередині слід користатись переданим `baseQuery`, а не голим
`fetch` — інакше втратиш `prepareHeaders`, reauth і `baseUrl`. У `joinEvent` це зроблено
коректно; у `refreshAccessToken` — навпаки, голий `fetch` (там це частково виправдано,
щоб не зайти в рекурсію reauth, але є краще рішення — див. Крок 3).

### 1.9 Життєвий цикл: `onQueryStarted` і оптимістичні апдейти

```ts
login: builder.mutation({
  query: (creds) => ({ url: '/auth/login', method: 'POST', body: creds }),
  async onQueryStarted(arg, { dispatch, queryFulfilled }) {
    const { data } = await queryFulfilled      // чекаємо успіх
    dispatch(setAccessToken(data.accessToken)) // побічний ефект тут, а не в компоненті
  },
})
```

Це **правильне місце для побічних ефектів запиту**. Різниця з `useEffect` у компоненті:
- виконується **один раз на мутацію**, а не «кожен рендер, де змінились залежності»;
- не залежить від того, чи компонент ще змонтований;
- не дублюється, якщо хук використано в двох місцях.

Саме через це `useEffect(() => { if (user && !cachedUser) dispatch(setCredentials(...)) })`
у `UserBar` — архітектурна помилка, а не просто «не дуже красиво».

`util`-хелпери, які ще стануть потрібні:
`api.util.resetApiState()` (повне обнулення кешу — логаут),
`api.util.invalidateTags([...])` (ручна інвалідація поза мутацією),
`api.util.updateQueryData(endpoint, args, recipe)` (пряма правка кешу, immer-стиль),
`api.util.prefetch(...)`.

### 1.10 Чого RTK Query **не** робить

- Не зберігає нічого між релоадами (кеш у памʼяті; persist — окремо і зазвичай не треба).
- Не є стейт-менеджером для клієнтського стану.
- Не знає нічого про авторизацію — 401 для нього звичайна помилка, поки ти не напишеш
  reauth-обгортку.
- Не дедуплікує запити **між** api-слайсами (див. §1.7).

---

## 2. Як авторизація працює зараз: end-to-end трейс

### 2.1 Логін

```
LoginForm.onSubmit
  └─ useLoginMutation → POST /api/auth/login
       backend: AuthService.login → familyId=uuid, getTokens()
                ├─ Set-Cookie: refreshToken=<jwt 7d>; HttpOnly; SameSite=Lax; Path=/
                └─ body (через TransformInterceptor): {success, data:{user, accessToken}, message}
  └─ transformResponse → response.data  → {user, accessToken}
  └─ dispatch(setCredentials(result))
       ├─ state.auth.user = user
       ├─ state.auth.accessToken = accessToken
       ├─ localStorage['user'] = JSON.stringify(user)      ← дубль #1
       └─ localStorage['accessToken'] = accessToken        ← дубль #2
  └─ router.push('/')
```

### 2.2 Авторизований запит і протухлий токен (15 хв)

```
useGetProfileQuery
  └─ prepareHeaders: Authorization: Bearer <state.auth.accessToken>
  └─ 401
       └─ baseQueryWithReauth:
            refreshAccessToken()  ── голий fetch POST /api/auth/refresh, credentials:'include'
              backend: verify(refreshToken) → refreshTokens(sub, token, familyId)
                       ├─ новий рядок RefreshToken (та сама familyId)
                       ├─ старий рядок → revoked: ROTATED
                       └─ Set-Cookie: новий refreshToken
            ← accessToken
            dispatch(updateAccessToken({accessToken}))  → state + localStorage
            повтор оригінального запиту з новим Bearer
```

Працює. **Але тільки для запитів через `authApi`.** Той самий 401 на `GET /api/events`
йде через `eventsApi`, у якого `baseQuery: fetchBaseQuery(...)` без обгортки → запит
просто провалюється.

### 2.3 Перезавантаження сторінки

```
Сервер (SSR of "use client" tree):
  authSlice initialState → typeof window === 'undefined' → {user: null, accessToken: null}
  UserBar: isAuthenticated=false → skip → displayUser=undefined → рендерить <button>Sign In</button>
  ↓ HTML з кнопкою "Sign In" їде в браузер
Клієнт (hydration):
  authSlice-модуль виконується знову → читає localStorage → {user: {...}, accessToken: '...'}
  UserBar: перший клієнтський рендер = аватарка
  ⚠️ server HTML ≠ client render → hydration mismatch
```

`isMounted` мав це прикрити (стандартний трюк «рендери те саме, що й сервер, до
`useEffect`»), але його **не дописали**. Тому в консолі — hydration warning, а на екрані
може бути «блимання» Sign In → аватарка.

І гірший кейс: `localStorage` порожній, а **кукі валідна** (напр. очистили localStorage,
або юзер прийшов через 20 хв і токен протух, або зайшов у новій вкладці). Тоді
`isAuthenticated === false` → `skip: true` → запиту не буде **ніколи** → юзеру показано
«Sign In», хоча сервер вважає його залогіненим. Єдиний спосіб відновитись — повторний логін.

### 2.4 Логаут

```
UserBar onClick:
  dispatch(logout())                    → state + localStorage clear
  dispatch(authApi.util.resetApiState())→ кеш authApi
  router.push('/auth/login')
```

Чого немає:
- `POST /api/auth/logout` — сесія на сервері жива ще 7 днів, кукі теж (її стирає лише
  бекенд через `clearCookie`, бо вона `httpOnly` — з JS її не видалити!);
- `eventsApi.util.resetApiState()` — кеш івентів попереднього юзера лишається;
- синхронізації з іншими вкладками.

**Це найсерйозніша дірка**: після «логауту» кукі фізично лежить у браузері й валідна.
Досить одного `POST /api/auth/refresh` (або переходу в іншу вкладку, де стан ще живий) —
і сесія відновлюється.

---

## 3. Розбір `UserBar.tsx`

```tsx
const [isMounted, setIsMounted] = useState(false);
```
**Мертвий код.** Ні `setIsMounted`, ні `isMounted` більше не зустрічаються у файлі.
Це слід від незавершеної спроби полікувати hydration mismatch.

```tsx
const isAuthenticated = useAppSelector(selectIsAuthenticated); // !!accessToken
const cachedUser = useAppSelector(selectCurrentUser);
const { data: user, isLoading } = useGetProfileQuery(undefined, { skip: !isAuthenticated });
```
`isAuthenticated` = «в мене є рядок, який колись був токеном». Він **нічого не каже про
валідність**: протухлий 15-хвилинний токен теж дає `true`. І навпаки — відсутність токена
в localStorage при живій кукі дає `false` і назавжди блокує запит через `skip`.
Правильна семантика: `selectIsAuthenticated` має означати «сервер підтвердив, хто я»,
а це знає лише `getProfile`.

```tsx
useEffect(() => {
  if (user && !cachedUser) {
    dispatch(setCredentials({ user, accessToken: localStorage.getItem('accessToken') ?? '' }));
  }
}, [user, cachedUser, dispatch]);
```
Три окремі проблеми в чотирьох рядках:
1. **Копіює дані з RTKQ-кешу в Redux-slice.** Дублювання джерела правди. Кеш уже
   є єдиним джерелом — достатньо читати `data`.
2. **Читає `accessToken` з `localStorage`, а не з Redux.** Stale-ризик: якщо reauth щойно
   оновив токен у стані, а в localStorage запис ще не дійшов (або, навпаки, інша вкладка
   перезаписала localStorage) — у стан запишеться не той токен. `?? ''` тихо затирає
   валідний токен **порожнім рядком** → `selectIsAuthenticated` стає `false` →
   `skip: true` → миттєвий «логаут» без причини. Це реальний, хоч і вузький, race.
3. `!cachedUser` як умова = «синхронізуємо лише один раз». Тому **оновлення профілю з
   сервера ніколи не доїжджає до UI**: нижче `displayUser = cachedUser ?? user` назавжди
   віддає перевагу першому, можливо тижневої давнини, снепшоту з localStorage.

```tsx
if (isLoading) return <skeleton/>;
if (!displayUser) return <SignInButton/>;
```
`isLoading` не покриває `isUninitialized` (§1.4), тому при `skip: true` ми одразу падаємо
в «Sign In» — не відрізняючи «точно анонім» від «ще не знаю».

```tsx
<img src={displayUser.avatarUrl ?? `https://ui-avatars.com/api/?name=...`} />
```
Дрібниця, але: `next/image` тут не використано, а домен `ui-avatars.com` не в
`next.config.ts` → зробиш `Image` — не забудь `remotePatterns`. Також `alt` дублює
видимий текст поруч — для скрінрідера це подвійне читання (краще `alt=""`, бо імʼя вже
є текстом у сусідньому `<span>`).

```tsx
onClick={() => { dispatch(logout()); dispatch(authApi.util.resetApiState()); router.push(...) }}
```
Див. §2.4 — немає серверного логауту.

---

## 4. Зведена таблиця проблем

| # | Проблема | Де | Вплив | Пріоритет |
|---|---|---|---|---|
| 1 | Логаут не викликає `POST /auth/logout` → кукі й сесія живі 7 днів | `UserBar.tsx` | **Безпека** | 🔴 |
| 2 | `eventsApi` без reauth → 401 на будь-якому запиті івентів після 15 хв | `eventsApi.ts` | Ламає UX | 🔴 |
| 3 | `eventsApi` без `credentials: 'include'` | `eventsApi.ts` | Кукі не летить | 🔴 |
| 4 | Немає bootstrap silent-refresh → жива кукі + порожній localStorage = «Sign In» | `UserBar`/`providers` | Ламає UX | 🔴 |
| 5 | `accessToken` у localStorage | `authSlice.ts` | XSS-експозиція | 🟠 |
| 6 | Три джерела правди про юзера; `useEffect`-переливання | `UserBar.tsx` | Stale UI, баги | 🟠 |
| 7 | `?? ''` затирає токен порожнім рядком | `UserBar.tsx:31` | Випадковий логаут | 🟠 |
| 8 | Два api-slice → дубльований мʼютекс → false-positive reuse-detection | `store.ts` | Розлогінює живих | 🟠 |
| 9 | Мертвий `isMounted` + hydration mismatch | `UserBar.tsx:16` | Warning, блимання | 🟠 |
| 10 | `resetApiState` лише для `authApi`; кеш івентів переживає логаут | `UserBar.tsx` | Втрата приватності | 🟠 |
| 11 | Немає тегів у `authApi`; профіль не інвалідується після логіну | `authApi.ts` | Костиль у `useEffect` | 🟡 |
| 12 | `isLoading` не покриває `isUninitialized` | `UserBar.tsx` | Хибний «Sign In» | 🟡 |
| 13 | `AuthResponse.refreshToken` існує в типі, але не в тілі відповіді | `packages/shared` | Тип бреше | 🟡 |
| 14 | Немає мультитаб-синхронізації логауту | — | Зомбі-сесія у вкладці | 🟡 |
| 15 | `'MyEvents'` інвалідується, але ніким не провайдиться | `eventsApi.ts` | Календар не оновлюється | 🟡 |
| 16 | `logout-all` на бекенді є, у UI немає | — | Невикористана фіча | ⚪ |

---

## 5. Цільова архітектура

```
┌─ Пам'ять (Redux, НЕ localStorage) ─────────────┐
│  accessToken (15 хв)                            │  ← читає prepareHeaders
└─────────────────────────────────────────────────┘
┌─ httpOnly cookie (недосяжна для JS) ───────────┐
│  refreshToken (7 д, ротація, reuse-detection)   │  ← єдине, що переживає релоад
└─────────────────────────────────────────────────┘
┌─ RTK Query cache (єдиний baseApi) ─────────────┐
│  getProfile → ЄДИНЕ джерело правди про user     │
│  getEvents, getEventById, ...                   │
└─────────────────────────────────────────────────┘
┌─ localStorage ─────────────────────────────────┐
│  (порожньо щодо авторизації)                    │
└─────────────────────────────────────────────────┘
```

Рішення й чому саме так:

1. **`accessToken` — у памʼяті.** Релоад його губить, і це нормально: на старті програми
   робимо один silent `POST /auth/refresh` по кукі. Вартість — один запит на завантаження
   сторінки; виграш — токен недосяжний для XSS через `localStorage`.
   *Альтернатива, яку відкидаємо*: тримати в `localStorage` «щоб не робити зайвий запит».
   Запит все одно потрібен (токен живе 15 хв, а вкладку відкривають і через годину), тобто
   економія уявна, а ризик реальний.
2. **`user` — тільки в RTKQ-кеші.** Ніякого `auth.user` у slice, ніякого `localStorage['user']`.
   Один `useGetProfileQuery()` у будь-якій кількості компонентів = один запит (§1.2).
3. **`authSlice` худне до одного поля** `accessToken: string | null` (+ похідний
   `bootstrapStatus`). Це креденшл, не дані.
4. **Один `baseApi`** з reauth і спільним мʼютексом (§1.7).
5. **Логаут = серверний виклик + повний reset + broadcast в інші вкладки.**
6. **Не робимо** (свідомо, поза скоупом): SSR-авторизацію через Next.js middleware і
   читання кукі в серверних компонентах. Це велика окрема тема; зараз усе дерево під
   `providers.tsx` — клієнтське, і ми лишаємо його таким.

---

## 6. Як користуватись цим ТЗ

- Кроки **строго послідовні**: кожен наступний спирається на попередній.
- Один крок = один комміт = одна пауза на ревʼю. Не роби два кроки поспіль.
- Код пишеш ти. У ТЗ є **сигнатури й скелети з TODO**, теорія й критерії приймання —
  але не готова реалізація.
- Після кожного кроку кажи мені — я перевіряю по критеріях і оновлюю §8.

---

## 7. ТЗ покроково

### Крок 0 — Прибрати мертвий `isMounted` і закрити hydration mismatch

**Мета**: перестати рендерити на клієнті інше, ніж на сервері.

#### Теорія (абстрактно)

Забудь на хвилину про React. Є **два середовища виконання того самого коду**:

```
S = що знає сервер   (немає window, localStorage, cookies-в-JS, таймзони юзера, matchMedia)
C = що знає браузер
S ⊂ C                 ← строге включення, завжди
```

SSR — це виконання `render()` у середовищі з меншим знанням. Гідратація — це коли React
бере HTML, згенерований у `S`, і намагається «прийняти» його вже в `C` (не перемалювати, а
**звірити й підключити обробники**). Звідси єдиний інваріант:

> Перший клієнтський рендер має бути функцією **лише** від інформації з `S`.

Будь-яке читання з `C \ S` під час рендеру ламає інваріант. `localStorage` — це `C \ S`.
Так само `new Date()`, `Math.random()`, `toLocaleDateString()` (таймзона сервера ≠ таймзона
юзера), `window.matchMedia('(prefers-color-scheme)')`, `navigator.*`. Це **один і той самий
баг** у різних костюмах; наш випадок — найпопулярніший костюм.

**Що насправді робить mount-gate.** Природний рефлекс: «треба дочекатись, поки клієнт
дізнається». Пáтерн робить протилежне:

> Сервер розумнішим зробити неможливо. Тому ми **тимчасово робимо клієнта дурнішим** —
> рівно до кінця гідратації.

Механіка спирається на два факти:
1. `useState(false)` — початкове значення це **літерал**, не читання середовища. Отже воно
   однакове в `S` і `C`: рендер №1 на сервері й рендер №1 на клієнті ідентичні → гідратація
   проходить.
2. `useEffect` **не існує на сервері** і запускається лише *після* коміту клієнтського
   рендеру. Тобто перемикач планує рендер №2, який відбувається **після** гідратації — а
   там React уже нічого ні з чим не звіряє.

Пáтерн **конвертує розбіжність-під-час-гідратації у звичайний перехід стану після
гідратації**. Офіційна назва в React-доках — *two-pass rendering*.

**Три вимоги до того, що рендериш у гейті** (це і сховано за словами «той самий плейсхолдер»):

| Вимога | Чому | Що ламається, якщо порушити |
|---|---|---|
| Детермінованість | вихід залежить тільки від `S` | знову mismatch, гейт не допоміг |
| Стабільність лейауту | та сама «коробка», що й фінальний контент | контент «вистрибує», CLS |
| Семантична честь | плейсхолдер означає «**не знаю**», а не «анонім» | див. нижче |

**Найважливіше: гейт лікує *помилку*, а не *блимання*.** Розбіжність зникає завжди.
Блимання зникає **лише якщо в гейті ти малюєш третій стан**:

```
if (!isHydrated) return null;             // ✅ немає error  ❌ layout shift
if (!isHydrated) return <SignInButton/>;  // ✅ немає error  ❌ блимання ЛИШИЛОСЬ (стало "легальним")
if (!isHydrated) return <Skeleton/>;      // ✅ немає error  ✅ немає блимання
```

Другий рядок — пастка: прибрав червоне в консолі й не полікував нічого.

**Головний висновок:**

> Hydration mismatch — майже завжди симптом **відсутнього стану в доменній моделі**,
> а не квірк React.

Код моделює авторизацію як `boolean`, а реальність має три стани:
`Unknown → Authenticated | Anonymous`. На сервері ти **завжди** в `Unknown`. Читання
`localStorage` в `initialState` — спроба перескочити `Unknown` і одразу видати вердикт;
сервер перескочити не може, клієнт може → вони розходяться.
`isHydrated` — **локальна, компонентна проєкція** стану `Unknown`. `bootstrapStatus`
з Кроку 4 — **та сама ідея на архітектурному рівні**. Тому цей крок явно тимчасовий: він
вирішує в одному компоненті те, що належить системі.

**Таксономія рішень** — корисно бачити, що лікує причину, а що симптом:

| Підхід | Що робить | Лікує |
|---|---|---|
| 1. Two-pass / mount-gate | відкладає знання на рендер №2 | **симптом** |
| 2. Не читати середовище в рендері (Крок 4) | зводить `C \ S` до нуля | **причину** |
| 3. Навчити сервер (cookie в server component / middleware) | розширює `S` | **причину** |
| 4. `suppressHydrationWarning` | вимикає звірку | **нічого** — глушить лог |
| 4б. `next/dynamic` з `ssr: false` | той самий (1), але на рівні модуля | симптом |

№4 легітимне лише для справді неминучих косметичних однотекстових кейсів (таймстемп) —
тут воно сховало б реальний баг. Ми свідомо робимо **1 зараз → 2 у Кроці 4**, і не робимо
3 (§5.6).

#### Що зробити

⚠️ **Правка ТЗ від 2026-09-27**: канонічна форма `useEffect(() => setIsMounted(true), [])`
у цьому проєкті **не проходить лінт**. `eslint-plugin-react-hooks@7.1.1` (правила від
React Compiler) дає **error** `react-hooks/set-state-in-effect`. Правило по суті право
(`setState` в ефекті = каскадний рендер), а наш кейс — рідкісний легітимний виняток. Але
сперечатися через `eslint-disable` не треба: є примітив, що виражає ту саму абстракцію
чесніше.

1. Створити хук `features/hooks/useIsHydrated.ts` на `useSyncExternalStore`:
   ```ts
   const subscribe = () => () => {};   // модульний рівень: стабільне посилання!

   export const useIsHydrated = () =>
     useSyncExternalStore(
       subscribe,
       () => true,    // getSnapshot       — середовище C
       () => false,   // getServerSnapshot — середовище S І перший рендер гідратації
     );
   ```
   Чому концептуально краще за `useState` + `useEffect`: той імітує асиметрію `S`/`C`
   через побічний ефект, а `useSyncExternalStore` має її **прямо в сигнатурі** — два різні
   снапшоти для двох середовищ. Ти не «чекаєш маунта», ти оголошуєш: «у `S` це `false`,
   у `C` це `true`». React сам перемикається після гідратації: ні стану, ні ефекту, ні
   каскаду, ні скарг лінтера. Бонус — хук перевикористовний для теми, `matchMedia`,
   локалізованих дат.
2. У `UserBar.tsx` прибрати `isMounted`/`setIsMounted`/`useState` і ефект; узяти
   `const isHydrated = useIsHydrated()`.
3. Гейт — **з запереченням** і злитий з `isLoading` (обидві гілки рендерять те саме):
   ```tsx
   if (!isHydrated || isLoading) return <Skeleton/>;
   ```
   Найчастіша помилка тут — написати `if (isHydrated)`: тоді компонент назавжди
   залишається скелетоном (значення ніколи не вертається в `false`), а mismatch лишається.

#### Як працює `useSyncExternalStore` (розбір)

Призначення хука — підписати компонент на **зовнішнє** (поза React) джерело даних:
Redux-стор, `matchMedia`, `navigator.onLine`. Три аргументи:

| Функція | Коли React її викликає | Навіщо |
|---|---|---|
| `subscribe(onChange)` | після маунта | джерело кличе `onChange` при зміні → React перечитує `getSnapshot` і, якщо значення інше (`Object.is`), перерендерює. Повертає unsubscribe |
| `getSnapshot()` | кожен рендер **у браузері** | «яке значення зараз?» |
| `getServerSnapshot()` | на **сервері** і на **рендері гідратації** | «яке значення бачив сервер?» |

Ключове — третій рядок: React **сам** знає, в якій він фазі, і вибирає функцію.
Наше «джерело» ніколи не змінюється (`subscribe` — no-op), нам потрібна лише різниця фаз.

Таймлайн релоаду:

```
СЕРВЕР       getServerSnapshot() → false → <Skeleton/> → HTML
ГІДРАТАЦІЯ   getServerSnapshot() → false → <Skeleton/> == HTML ✅
ПІСЛЯ НЕЇ    getSnapshot() → true ≠ false → React сам планує ре-рендер → аватарка / Sign In
```

Маунт **без** гідратації (клієнтська навігація, `router.push`): React одразу бере
`getSnapshot()` → `true` → скелетон навіть не мигає. `useState(false)` + `useEffect` тут
програє: він завжди стартує з `false` і завжди робить зайвий рендер.

Пастки:
- `subscribe` — на рівні модуля. Інлайн-функція = нове посилання щорендеру → React
  щоразу відписується/підписується.
- `getSnapshot` має повертати **стабільне** значення. Примітиви — ок; новий обʼєкт
  (`() => ({ ok: true })`) → React бачить «зміну» щоразу → нескінченний цикл рендерів.

**Критерії приймання**
- [ ] У консолі браузера немає `Hydration failed` / `hydration mismatch`.
- [ ] При релоаді залогіненим: скелетон → аватарка, **без** проблиску «Sign In».
- [ ] Залогіненим **і** анонімом фінальний UI коректний (тобто гейт не «залипає»).
- [x] `npx eslint components/UserBar/UserBar.tsx` — без `error`
      (warning `@next/next/no-img-element` лишається, він із Кроку 5).
- [x] У `UserBar.tsx` не лишилось `useState`.

**Як перевірити**: залогінься, `F5`, дивись консоль і перші 300 мс екрана
(DevTools → Network → Slow 3G зробить блимання помітнішим). Потім вийди й перевір
анонімний сценарій — він ловить інвертований гейт.

---

### Крок 1 — Полікувати тип `AuthResponse`

**Мета**: типи мусять описувати те, що реально приходить по HTTP.

**Теорія.** `AuthResponse` зараз обслуговує дві різні речі: (1) внутрішній результат
`AuthService.login()` — там `refreshToken` **є**; (2) тіло HTTP-відповіді — там його
**немає** (контролер віддає `{user, accessToken}`, а refresh ставить у кукі). Один тип на
два різні контракти → фронт «бачить» поле, якого не існує. Класична порада: типи описують
**межу системи**, а не внутрішню зручність.

**Що зробити** в `packages/shared/src/types/auth.ts`:
1. Додати тип HTTP-відповіді, напр. `LoginResponse = { user: UserProfile; accessToken: string }`
   (назва на твій розсуд, головне — щоб було видно, що це саме тіло відповіді).
2. `AuthResponse` лишити для бекенду (він реально повертає три поля) — або перейменувати
   на щось на кшталт `AuthTokensResult`, щоб не плутати.
3. У `authApi.ts` перевести `login`/`register` на новий тип.
4. Перевірити, що бекенд-контролер компілюється.

**Критерії приймання**
- [x] `pnpm -r build` (або `tsc --noEmit` у backend і frontend-next) — без помилок.
- [x] У `authApi.ts` жоден дженерик не згадує тип, що містить `refreshToken`.
- [x] Зникла можливість написати `result.refreshToken` у фронтенді без помилки TS.

---

### Крок 2 — Один `baseApi` + `injectEndpoints`

**Мета**: один кеш, один middleware, одна точка розширення для reauth.

**Теорія**: §1.7. Ключове — публічні хуки **не змінюються**, тому рефактор безпечний:
компоненти не чіпаємо взагалі.

**Що зробити**
1. Створити `features/api/baseApi.ts`:
   ```ts
   export const baseApi = createApi({
     reducerPath: 'api',
     baseQuery: /* поки що — існуючий baseQueryWithReauth, перенесений сюди */,
     tagTypes: ['Profile', 'Event'],
     endpoints: () => ({}),
   })
   ```
2. `authApi.ts` → `export const authApi = baseApi.injectEndpoints({ endpoints: (builder) => ({...}) })`.
   Реекспорт хуків лишити як є.
3. `eventsApi.ts` → так само через `injectEndpoints`. **Видалити** його власний
   `fetchBaseQuery` і `tagTypes` (переїхали в `baseApi`).
4. `store.ts`: один `[baseApi.reducerPath]: baseApi.reducer`, один
   `.concat(baseApi.middleware)`.
5. `UserBar`: `authApi.util.resetApiState()` → `baseApi.util.resetApiState()`.
6. Теги: `'MyEvents'` або провайдити, або прибрати (проблема №15). Рішення обґрунтуй
   у комміт-месседжі.

**Підказка щодо порядку імпортів.** `injectEndpoints` виконується як побічний ефект
імпорту модуля. Якщо на якийсь модуль з ендпоінтами ніхто не імпортує до першого
використання — ендпоінтів у сторі не буде. Оскільки компоненти імпортують хуки
безпосередньо з `authApi`/`eventsApi`, усе гаразд; але якщо колись зробиш «ліниві» фічі —
тримай це в голові.

**Критерії приймання**
- [ ] У Redux DevTools **один** стейт-ключ `api` замість `authApi` + `eventsApi`.
- [ ] Логін, список івентів, `join`, `leave`, створення/редагування івенту — працюють.
- [ ] 401 на `GET /api/events` тепер призводить до `/auth/refresh` і **успішного ретраю**.
- [ ] Жоден компонент не змінено (крім рядка з `resetApiState`).

**Як перевірити пункт 3**: залогінься, у DevTools → Application → видали значення
`accessToken` з localStorage і встав туди будь-яке сміття (напр. `abc`), перезавантаж,
відкрий список івентів. Очікувано: `GET /events` → 401 → `POST /auth/refresh` → `GET /events` → 200.

---

### Крок 3 — Надійний single-flight refresh

**Мета**: скільки б запитів не впало в 401 одночасно — `/auth/refresh` викликається **один раз**.

**Теорія.** Це те саме, що описано в `refresh-token-rotation.md` §5.2 з боку бекенду.
Якщо два запити зроблять два паралельних refresh з тим самим (уже ротованим) токеном —
бекенд побачить `revoked: true` і спрацює reuse-detection, відкликавши **всю family**:
живого юзера викине з усіх сесій. `GRACE_PERIOD_MS = 10s` це прикриває, але покладатись
на страховку замість того, щоб не створювати гонку, — погана інженерія.

Поточна реалізація в `authApi.ts` уже має `refreshPromise`, і вона майже правильна.
Дві діри:
1. `refreshPromise = null` у `finally` спрацьовує в момент резолву, тобто вікно
   «перший вже завершився, другий ще не встиг прочитати» дуже мале, але не нульове.
2. Немає **бар'єра на вході**: запит, що стартує *під час* refresh, іде з **старим**
   токеном, гарантовано отримає 401 і піде робити другий refresh.

Правильний патерн — мʼютекс (`async-mutex` або свій на промісах):
```
if (mutex.isLocked()) { await mutex.waitForUnlock(); retry з новим токеном }
else { release = await mutex.acquire(); try { refresh; retry } finally { release() } }
```

**Що зробити**
1. Додати мʼютекс у `baseApi.ts` (модульна змінна поряд з `baseQueryWithReauth`).
   Можна `pnpm add async-mutex`, можна власні ~15 рядків — на твій вибір,
   обґрунтуй у комміті.
2. Перед основним викликом `baseQuery`: якщо мʼютекс залочений — дочекатись розлочення
   (тоді в стані вже буде свіжий токен, і `prepareHeaders` візьме його сам).
3. Логіку 401 переписати під `acquire`/`release`.
4. `refreshAccessToken` лишається голим `fetch` (це свідомо: інакше зайдеш у рекурсію
   через власний reauth). **Але** прибери `console.warn/console.error` з продакшн-шляху
   або сховай за `process.env.NODE_ENV !== 'production'`.
5. Якщо refresh не вдався — `dispatch(logout())` (на цьому кроці ще стара семантика;
   повний логаут буде в Кроці 6).

**Критерії приймання**
- [ ] Тест руками: зламай токен у localStorage, відкрий сторінку, де паралельно летять
      ≥2 запити (напр. головна: `getEvents` + `getProfile`). У Network **рівно один**
      `POST /auth/refresh`, обидва запити успішні після ретраю.
- [ ] У логах бекенду **немає** `Refresh token reuse detected`.
- [ ] Якщо refresh віддав 401 (зіпсуй кукі) — юзера розлогінює один раз, без циклу
      запитів (перевір, що в Network немає нескінченного `refresh → 401 → refresh`).

---

### Крок 4 — `accessToken` тільки в памʼяті + bootstrap silent-refresh

**Мета**: прибрати токен і юзера з `localStorage`; сесія виживає релоад **через кукі**.

**Теорія.** Це закриває водночас проблеми №4, №5 і причину hydration mismatch (№9).
Ланцюжок такий: `initialState` стає `{accessToken: null}` без жодного звертання до
`localStorage` → сервер і клієнт рендерять однаково → mismatch фізично неможливий.
Але тепер після `F5` токена немає, а кукі є — значить на старті потрібен **bootstrap**:
один `POST /auth/refresh`; успіх → у стан летить свіжий access-токен; провал → юзер анонім.

Ключове поняття — **третій стан**. Раніше було «є токен / немає токена». Тепер:
```
bootstrapStatus: 'idle' | 'pending' | 'done'
```
`pending` означає «ще не знаю, хто ти» — і саме його UI мусить показувати як скелетон,
а не як «Sign In». Це те, про що §1.4.

**Що зробити**
1. `authSlice.ts`:
   - `initialState = { accessToken: null, bootstrapStatus: 'idle' }`. **Ніяких
     `typeof window`, ніякого `localStorage`** — і коментар про SSR-guard теж прибрати,
     він більше не описує реальність.
   - Прибрати `user` зі стейту й `selectCurrentUser`.
   - `setCredentials` → `setAccessToken` (лишається лише токен). Жодних `localStorage.setItem`.
   - `logout` → чистить токен; `bootstrapStatus` лишається `'done'`.
   - Додати `selectAccessToken`, `selectBootstrapStatus`.
2. Bootstrap. Створи клієнтський компонент (напр. `features/auth/AuthBootstrap.tsx` або
   хук `useAuthBootstrap`), який **один раз** на маунт застосунку робить silent refresh:
   ```tsx
   // скелет
   useEffect(() => {
     let cancelled = false
     // TODO: dispatch(bootstrapStarted())
     // TODO: спробувати refresh (перевикористай ту саму функцію, що в baseApi —
     //       винеси її в features/auth/refreshClient.ts, щоб не дублювати мʼютекс)
     // TODO: успіх → dispatch(setAccessToken(...)); провал → нічого
     // TODO: у будь-якому разі → dispatch(bootstrapFinished())
     return () => { cancelled = true }
   }, [])
   ```
   Вмонтуй його в `app/providers.tsx` **всередині** `<Provider>`.
3. **React 19 / StrictMode**: у дев-режимі `useEffect` виконається двічі. Мʼютекс із
   Кроку 3 має це зʼїсти — **перевір у Network, що `POST /auth/refresh` рівно один**.
   Якщо два — мʼютекс не спільний; винеси його правильно.
4. Приберіть `localStorage` з усього auth-коду: `grep -rn "localStorage" apps/frontend-next`
   має не давати попадань у `features/auth` і `components/UserBar`.

**Критерії приймання**
- [ ] `grep -rn "localStorage" apps/frontend-next/features apps/frontend-next/components` — порожньо.
- [ ] Application → Local Storage після логіну **порожній**; кукі `refreshToken` на місці.
- [ ] `F5` залогіненим: скелетон → аватарка. Один `POST /auth/refresh` у Network.
- [ ] Application → Cookies → видали `refreshToken` → `F5` → показано «Sign In»
      (і **не** нескінченні спроби refresh).
- [ ] Консоль без hydration-warning.
- [ ] Відкрий вкладку через 20+ хв простою → сесія жива (bootstrap відпрацював).

---

### Крок 5 — `getProfile` як єдине джерело правди; рефактор `UserBar`

**Мета**: прибрати `useEffect`-переливання й ручний кеш юзера.

**Теорія**: §1.2, §1.5, §1.9. Після Кроку 4 `user` уже ніде не зберігається, крім
RTKQ-кешу, тож `UserBar` має просто читати `useGetProfileQuery`. `skip` тепер залежить не
від «чи є рядок у localStorage», а від bootstrap-стану й наявності токена.

**Що зробити**
1. `authApi.ts`: `getProfile` → `providesTags: ['Profile']`; `login`/`register` →
   `invalidatesTags: ['Profile']`. Тепер після логіну профіль перезапитається сам —
   без жодного `useEffect`.
2. `UserBar.tsx` переписати на три чесні стани:
   ```tsx
   const bootstrapStatus = useAppSelector(selectBootstrapStatus)
   const hasToken = useAppSelector(selectAccessToken) !== null
   const { data: user, isLoading } = useGetProfileQuery(undefined, {
     skip: bootstrapStatus !== 'done' || !hasToken,
   })

   // 1) bootstrapStatus !== 'done' || isLoading → скелетон
   // 2) !user                                   → Sign In
   // 3) user                                    → аватарка
   ```
3. **Видалити**: `isMounted` (більше не потрібен — mismatch неможливий після Кроку 4),
   `useEffect` зі `setCredentials`, `cachedUser`, `displayUser`.
4. `LoginForm`: `dispatch(setCredentials(result))` → `dispatch(setAccessToken(result.accessToken))`.
   Юзер прилетить сам через інвалідацію `Profile`.
   *Бонусне завдання*: перенеси цей `dispatch` із компонента в `onQueryStarted` мутації
   `login` (§1.9) і поясни мені в ревʼю, чому так краще.
5. Дрібниці UI: `alt=""` на аватарці (імʼя вже є текстом поруч), розглянь `next/image`
   + `remotePatterns` для `ui-avatars.com`.

**Критерії приймання**
- [ ] У `UserBar.tsx` немає ні `useEffect`, ні `dispatch` чогось, крім логауту.
- [ ] Логін → аватарка й імʼя зʼявляються без ручного refetch.
- [ ] Зміни `displayName` у БД напряму → `baseApi.util.invalidateTags(['Profile'])`
      з консолі Redux DevTools → UI оновився (тобто stale-кеш більше не «залипає»).
- [ ] Ніякого «блимання» Sign In у жодному зі сценаріїв Кроку 4.

---

### Крок 6 — Справжній логаут

**Мета**: логаут має відкликати сесію **на сервері**.

**Теорія.** `refreshToken` — `httpOnly`. **З JavaScript його видалити неможливо** —
це не обмеження, а сенс `httpOnly`. Стерти кукі може лише сервер, відповівши
`Set-Cookie` з простроченою датою — рівно це робить `clearRefreshTokenCookie` у
`POST /api/auth/logout`. Тому клієнтський «логаут» без серверного виклику — це косметика:
кукі лежить на місці й валідна ще 7 днів.

Порядок дій має значення: спочатку серверний виклик (поки токен ще в стані й кукі ще
летить), потім локальне чищення.

**Що зробити**
1. `authApi.ts`: ендпоінт `logout: builder.mutation<void, void>` на `POST /auth/logout`.
2. `UserBar`: `await logoutMutation().unwrap()` → `dispatch(logout())` →
   `dispatch(baseApi.util.resetApiState())` → `router.push('/auth/login')`.
3. Обробка помилки: якщо серверний logout упав (офлайн, 500) — **все одно** роби локальний
   логаут. Юзер натиснув «вийти», UI мусить його послухатись. `try/finally`.
4. Кнопку задизейбли на час запиту (`isLoading` мутації), щоб не було подвійних кліків.

**Критерії приймання**
- [ ] Логаут → у Network є `POST /api/auth/logout` → 200/201.
- [ ] Після логауту Application → Cookies: `refreshToken` **відсутня**.
- [ ] Після логауту `POST /api/auth/refresh` з DevTools (`fetch('/api/auth/refresh',
      {method:'POST',credentials:'include'})`) віддає **401**, а не новий токен.
- [ ] У БД: рядок `RefreshToken` цієї сесії має `revoked: true`.
- [ ] Redux DevTools: після логауту стейт `api` порожній (кеш івентів теж очищено).
- [ ] Вимкни бекенд → натисни логаут → UI все одно перейшов на `/auth/login`.

---

### Крок 7 — Мультитаб-синхронізація

**Мета**: логаут в одній вкладці не лишає «зомбі-сесію» в іншій.

**Теорія.** Після Кроку 4 токен живе в памʼяті кожної вкладки окремо, і `storage`-подій
більше немає (ми ж не пишемо в `localStorage`). Тому потрібен явний канал:
`BroadcastChannel` — саме для цього й існує, і працює між вкладками одного origin.
Зверни увагу: кукі **спільна** для всіх вкладок, тому logout у вкладці A фізично вбиває
можливість refresh у вкладці B — просто B про це ще не знає й покаже 401 на першій дії.
Broadcast робить це негайним і чистим.

**Що зробити**
1. Канал `new BroadcastChannel('syncevent-auth')`, повідомлення хоча б `{type: 'logout'}`.
2. На логауті — `postMessage`. У `AuthBootstrap` (або окремому хуку) — підписка
   `onmessage` → той самий локальний логаут + `resetApiState`.
3. Закривай канал у cleanup `useEffect`.
4. SSR: `BroadcastChannel` не існує на сервері — гейт через `typeof window !== 'undefined'`
   або створюй його лише в `useEffect` (краще).
5. Опційно: `{type: 'login'}` — щоб вкладка B підхопила сесію без релоаду (їй треба
   зробити свій refresh, бо токен у памʼяті не передається — і **не має** передаватись
   через канал).

**Критерії приймання**
- [ ] Дві вкладки залогінені → логаут у першій → друга протягом секунди показує «Sign In».
- [ ] Токен **не** передається через `BroadcastChannel` (перевір payload).
- [ ] Немає помилок у консолі при навігації/закритті вкладки.

---

### Крок 8 (опційно) — `AuthGate` і `logout-all`

Робимо, лише якщо Кроки 0–7 зайшли й лишилось бажання.

1. **`AuthGate`**: компонент-обгортка для `app/(main)/layout.tsx`, який при
   `bootstrapStatus === 'done' && !hasToken` робить `router.replace('/auth/login')`.
   Прибирає дублювання «перевірки логіну» по сторінках.
   *Важливо*: це **не** захист, а UX. Справжній захист — `AuthGuard('jwt')` на бекенді.
2. **`POST /auth/logout-all`** у UI: кнопка «Вийти на всіх пристроях». Бекенд уже вміє
   (`AccessTokenBlocklistService`, `refresh-token-rotation.md` §3). Це частково закриває
   пункт «UI активних сесій» з Фази 3 того документа.

---

## 8. Журнал виконання

| Крок | Статус | Дата | Нотатки / що змінилось проти ТЗ |
|---|---|---|---|
| 0. isMounted + hydration | 🟨 в роботі | 2026-09-27 | Перша спроба: гейт інвертований (`if (isMounted)` → скелетон назавжди). ТЗ переписано: `useEffect`+`setState` не проходить лінт (`react-hooks/set-state-in-effect`, plugin v7.1.1) → перейшли на `useIsHydrated` через `useSyncExternalStore`. **Ревʼю 2026-09-28**: хук ✅, гейт `!isHydrated \|\| isLoading` ✅, `isMounted`+ефект прибрані ✅, `tsc` чистий, eslint 0 errors. Імпорт `useState` прибрано, eslint — лише `no-img-element` (Крок 5). Лишилось: ручна перевірка в браузері (консоль, релоад залогіненим/анонімом) |
| 1. Тип AuthResponse | ✅ зроблено | 2026-09-28 | Обрано варіант з перейменуванням: `AuthTokensResult` (бекенд, 3 поля) + `LoginResponse` (тіло HTTP, без `refreshToken`). Переведено обидва фронти (`frontend-next` і старий `frontend`). `pnpm build` (усі пакети) — зелений. Кореневий `build` виправлено: був копією скрипта `shared` (`tsup` у корені без конфіга) → `pnpm -r build`, додано `build:shared`. Хвости: невикористаний імпорт `AuthTokensResult` у `auth.controller.ts:24` (успадковано від `AuthResponse`, eslint error); мертвий `apps/backend/src/common/interfaces/auth.interface.ts` (ніхто не імпортує) |
| 2. Єдиний baseApi | 🟨 код готовий, чекає ручної перевірки | 2026-09-28 | ✅ `baseApi` (reauth + `credentials: 'include'`), ✅ `authApi`/`eventsApi` → `injectEndpoints`, ✅ `store.ts` лише на `baseApi`, ✅ `UserBar` → `baseApi.util.resetApiState()`, ✅ `'MyEvents'` → `{Event, 'MY_CALENDAR'}` у join/leave (тег ніхто не провайдив → календар не оновлювався після join). Поза ТЗ: `getEvents` — аргумент обовʼязковий (прибрано `\| void` і `params \|\| {}`) → один канонічний cache key. `tsc` чистий, `next build` зелений. Лишилось: DevTools (один ключ `api`), 401 на `/events` → refresh → retry, смоук логін/join/leave/create/edit **`apps/frontend` (Vite, 2026-09-28)**: Крок 0 не застосовний (SPA, `createRoot`, без SSR); Крок 1 уже був; Крок 2 перенесено 1:1 (`src/features/api/baseApi.ts`, `injectEndpoints`, `store.ts`, `UserBar`), календар-тег `'MyEvents'` → `{Event,'MY_CALENDAR'}`, create/update/delete вирівняні з Next; видалено мертвий дубль `src/store/index.ts`. `tsc -b` + `vite build` зелені |
| 3. Single-flight mutex | ⬜ не почато | — | |
| 4. Токен у памʼяті + bootstrap | ⬜ не почато | — | |
| 5. getProfile як джерело правди | ⬜ не почато | — | |
| 6. Справжній логаут | ⬜ не почато | — | |
| 7. Мультитаб | ⬜ не почато | — | |
| 8. AuthGate / logout-all (опц.) | ⬜ не почато | — | |

Легенда: ⬜ не почато · 🟨 в роботі · ✅ зроблено · ⏭️ свідомо пропущено

---

## 9. Відкриті питання

- **Чи потрібен `persist` для чогось у цій схемі?** Наразі вважаю, що ні: `user`
  перезапитується, токен свідомо в памʼяті. Якщо мигання скелетона на релоаді почне
  дратувати — розглянути Next.js middleware + серверний рендер шапки, а не localStorage.
- **Формат refresh-токена** — успадковане питання з `refresh-token-rotation.md` §7
  (JWT vs opaque). На фронтенді ні на що не впливає (токен `httpOnly`), тож не блокує.
- **Хто інвалідує `Profile` при зміні профілю?** Ендпоінта редагування профілю ще немає.
  Коли з'явиться — `invalidatesTags: ['Profile']` на ньому, і ручна інвалідація з Кроку 5
  стане непотрібною.
- **Проблема №15 (`MyEvents` vs `MY_CALENDAR`)** — виявлена в цьому аналізі, але це баг
  кешу івентів, не авторизації. Полікувати в Кроці 2 «по дорозі» чи окремим коммітом?
  Схиляюсь до окремого комміту, щоб Крок 2 лишався чистим рефактором.
- **Скільком вкладкам реально потрібен bootstrap?** Якщо колись стане проблемою
  N вкладок × 1 refresh при відкритті браузера з відновленням сесії — розглянути
  координацію через `BroadcastChannel` (лідер робить refresh). Наразі передчасно.
