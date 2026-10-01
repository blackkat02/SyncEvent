# Шахова партія у `frontend-next`: локальна гра (hot-seat) — теорія, розбір, ТЗ

> Статус: **аналіз + ТЗ готові, реалізація не починалась** (створено 2026-09-30; того ж дня
> додано диференційний тест з chess.js у крок 1 і опційний крок 5.5 «нічиї» — за результатами
> `chess-engine-vs-chessjs.md`).
> Формат: менторський — я аналізую й даю ТЗ, код пишеш ти. Після кожного кроку — стоп на рев'ю,
> потім оновлюємо §9 «Журнал виконання».
> Соло-проєкт, автор — Borys.
>
> Пов'язаний код:
> - `packages/chess-engine/src/` — рушій (скопійовано з ChessB `64dfcce`); `engine/index.js` — фасад-заглушки
> - `D:\Projects\ChessB\src\redux\game\` — `gameSlice.js` (`moveExecuted`), `gameOperations.js`
>   (`attemptMove`), `gameSelectors.js`, `gameConstants.js`; `src/redux/store.js`, `persistGame.js`
> - `D:\Projects\ChessB\src\components\` — дошка, годинник, модалки; `src/hooks/useGameState.js`;
>   `src/pages/HomePage/HomePage.jsx`; `src/styles/1-primitives.css`, `2-semantic.css`, `3-components.css`
> - `apps/frontend-next/store/store.ts`, `app/providers.tsx`, `app/globals.css`,
>   `components/layout/Header.tsx`, `tsconfig.json`
>
> Пов'язані доки: `chess-engine-vs-chessjs.md` (що рушій уміє й чого бракує порівняно з chess.js —
> звідки взялись крок 1.4 і крок 5.5), `chess-foundation.md` §8 (трек рушія — кроки 1–2 цього ТЗ збігаються з ним),
> `chess-multiplayer.md` §4.5 (як цей самий UI потім стане дзеркалом серверу),
> `frontend-auth-rtk-query.md` крок 0 (гідрація й `localStorage` — та сама проблема, інший стан),
> `nextjs-migration.md`.

---

## 0. TL;DR — головні висновки

1. **Мета:** на `localhost:3001/chess` зіграти партію за одним пристроєм до мату/пату/часу; reload
   не губить партію. Сервер, акаунти, Python — **не потрібні** (Python не запускається нічим, §1).
2. **Спершу рушій, потім UI.** Зараз UI ChessB ходить повз фасад у внутрішні модулі рушія, а
   логіка застосування ходу сидить у редюсері. Виносимо `isMoveLegal`/`getLegalMoves` і чисту
   `applyMove(state, move)` у пакет — це ті самі кроки 1–2 треку `chess-foundation.md` §8, тобто
   робота не пропаде: бекенд `games` використає їх же.
3. **Дошку видно рано.** Порядок кроків такий, що статична дошка з'являється на кроці 3, ходи —
   на кроці 5; годинник, модалки й збереження — далі.
4. **❗ Три джерела гідраційних розбіжностей** у коді ChessB, які в Vite були непомітні, а в Next
   зламаються: `localStorage` під час створення стору, `Date.now()` під час рендера годинника,
   `console.log` при імпорті модуля (це вже просто шум, але на сервері теж). Рішення — §2.2.
5. **TypeScript, не `allowJs`.** Слайс у JS зробить `RootState` брехливим (`selectedSquare: null`
   виведеться як тип `null`). Слайс, селектори, операції — TS з явним `GameState`; компоненти —
   TSX, `prop-types` прибираємо. Рушій лишається JS, але отримує `index.d.ts` (рішення D9).
6. **Стилі ChessB не можна просто імпортувати глобально:** вони перевизначають `body`, а токени
   `--color-border`, `--color-accent`, `--color-fg` конфліктують за простором імен з рештою
   застосунку. Змінні — під клас-обгортку `.chess-scope`, `@theme`-міст — з префіксом (§2.3).
7. **Генерації ходів можна довіряти** — ~105 тис. позицій без розбіжностей з chess.js
   (`chess-engine-vs-chessjs.md`). Щоб так лишилось, крок 1 додає порівняння з chess.js як
   постійний тест пакета.
8. Кроки: 1 фасад + тест проти chess.js → 2 `applyMove` → 3 пакет у Next + статична дошка →
   4 стан гри (TS) + vitest → 5 ходи кліком → 5.5 (опц.) нічиї в рушії → 6 годинник і модалки →
   7 збереження без розбіжностей → 8 прибирання.

---

## 1. Поточний стан (перевірено 2026-09-30)

| Що | Де | Значення |
|---|---|---|
| Фасад рушія `isMoveLegal`, `getMoveDetails`, `getLegalMoves` — `throw new Error('не реалізовано')` | `packages/chess-engine/src/engine/index.js` | Крок 1 |
| `src/index.js` пакета експортує лише фасад, `COLORS`, `STARTING_FEN` | `packages/chess-engine/src/index.js` | ❗ `fenToBoardObject`, `requiresPromotion` тощо назовні недоступні |
| `attemptMove` імпортує **внутрішні** модулі: `pseudoMoves`, `legalMoves`, `gameStatus`, `promotion` | ChessB `gameOperations.js:5-8` | ❗ Обхід фасаду — у пакеті так не вийде |
| Застосування ходу (взяття, en passant, промоція, рокіровка, права, SAN) — **у редюсері** `moveExecuted` разом із годинником (`Date.now()`) | ChessB `gameSlice.js:90-196` | ❗ Змішано правила й час; сервер не зможе перевикористати — крок 2 |
| Стан з `localStorage` читається **при створенні стору** (`preloadedState`) | ChessB `store.js:26-32` | ❗ У Next стор створюється і на сервері → розбіжність гідрації (§2.2) |
| `serializableCheck: false` «для спрощення MVP» | ChessB `store.js:42-44` | Стан гри повністю серіалізований — перевірку вмикаємо назад (у `frontend-next` вона вже увімкнена) |
| `Clock` рахує залишок через `Date.now()` **у тілі рендера** | ChessB `Clock.jsx:28-30` | ❗ Сервер і клієнт отримають різний текст |
| `console.log(initialBoardPiecesObject)` на рівні модуля | ChessB `data/positions.js:11` | Прибрати разом з рештою debug-логів у `gameOperations.js` (10), `gameSelectors.js` (4), `useGameState.js` (3) — ChessB `docs/next-steps.md` крок 2 |
| Три шари CSS-токенів, `body { … }` з кольорами/шрифтом, `@theme inline` з `--color-fg`, `--color-border`, `--color-accent`… | ChessB `index.css`, `styles/*.css` | ❗ Конфлікт з `frontend-next/app/globals.css` (§2.3) |
| Стор — модульний синглтон `store`, редюсери `auth` + `baseApi`, серіалізаційна перевірка увімкнена | `frontend-next/store/store.ts` | Додаємо `game` поруч |
| `allowJs: true`, `strict: true`, `moduleResolution: "bundler"` | `frontend-next/tsconfig.json` | JS можна, але типи з JS-слайсу будуть хибні (§2.4) |
| Тест-раннера немає | `frontend-next/package.json` | Тести ChessB (31 на слайс, 9 на операції, 10 на селектори, 5 persist, 9 годинник, 6 GameOver) переносити нікуди — крок 4 додає vitest |
| Зовнішні залежності UI ChessB: `clsx`, `framer-motion` (1 компонент), `prop-types`, `react-router-dom` | ChessB `components/`, `App.jsx` | Потрібні лише `clsx` і `framer-motion` |
| Python `apps/chess-service` не підключений ні до pnpm, ні до docker-compose, ні до CI | — | На цей шлях не впливає |

---

## 2. Теорія

### 2.1. Workspace-пакет у Next.js

`"@syncevent/chess-engine": "workspace:*"` у `package.json` → pnpm робить симлінк
`node_modules/@syncevent/chess-engine → packages/chess-engine`. Далі два незалежні питання:

| Питання | Хто відповідає | Що може піти не так |
|---|---|---|
| **Чи збандлиться код** | бандлер Next (Turbopack) | Пакет — чистий ESM без JSX/TS, тож зазвичай працює як є. Якщо ні — `transpilePackages: ['@syncevent/chess-engine']` у `next.config.ts` (перевірити на практиці) |
| **Чи є в TS типи** | `tsc` / IDE | JS-пакет без `.d.ts` під `strict` дає `TS7016: Could not find a declaration file` або тихий `any` залежно від того, як TS розв'яже симлінк (перевірити). Надійно — **власний `index.d.ts`** і поле `"types"` у `package.json` пакета |

`.d.ts` — це **контракт** пакета: описує лише публічний API з `src/index.js`. Внутрішні модулі
туди не потрапляють — це й змушує всіх ходити через фасад.

### 2.2. Server/Client компоненти і гідрація

`"use client"` **не** означає «рендериться лише в браузері». Клієнтський компонент теж
рендериться на сервері в HTML, потім React у браузері «гідрує» — проходить те саме дерево й
очікує **той самий** результат. Будь-що, що дає різне значення на сервері й у браузері, ламає це:

| Джерело | У ChessB | Чому розходиться |
|---|---|---|
| `localStorage` | `loadPersistedGame()` у `store.js` | На сервері `localStorage` немає → `try/catch` тихо повертає `undefined` → сервер рендерить **початкову позицію**, клієнт — **збережену** |
| `Date.now()` у рендері | `Clock.jsx` | Сервер відрендерив «02:59», клієнт через 300 мс — «02:58» |
| `Math.random()` у рендері | немає (є лише в обробнику `startNewGame` — це ок) | — |

Що з цим робити — два інструменти, і в кожного своя роль:

1. **Відновлення після монтування.** Стор стартує з початкового стану однаково на сервері й
   клієнті; після монтування ефект читає `localStorage` і диспатчить `gameRestored(saved)`.
   Щоб не блимала стартова позиція — у стані прапорець `restored: boolean`, і доки він `false`,
   замість дошки показується плейсхолдер.
2. **`next/dynamic(…, { ssr: false })`** — компонент узагалі не рендериться на сервері. Дошка не
   має SEO-цінності, тож це чесний варіант для всієї ігрової зони. Нюанс App Router: `ssr: false`
   дозволено лише **всередині клієнтського компонента** — сторінка (`page.tsx`, серверна)
   рендерить клієнтську обгортку, а та вже робить `dynamic`.

Чому не лише (2): модуль стору все одно виконується на сервері (його імпортує `providers.tsx`), і
читання `localStorage` при створенні стору лишається архітектурною міною для першого ж
компонента, що покаже стан гри поза `ssr:false`-зоною. Тому **(1) — обов'язково, (2) — для
годинника/дошки за бажанням**. Зв'язок із `frontend-auth-rtk-query.md` крок 0: там та сама
хвороба для `auth`.

### 2.3. Tailwind v4: `@theme` і конфлікт токенів

У v4 кольори — це CSS-змінні: `--color-fg` у `@theme` породжує класи `text-fg`, `bg-fg`,
`border-fg`. `@theme` **глобальний** — його не можна «покласти всередину класу». Тому розділяємо:

- **Значення** (`--sem-*`, `--c-*` з трьох файлів ChessB) — можна оголосити не на `:root`, а на
  `.chess-scope`; поза цим контейнером вони просто не визначені.
- **Міст** (`@theme inline { --color-…: var(--c-…) }`) — глобальний, тому імена мусять бути
  **унікальні**: `--color-chess-fg`, а не `--color-fg`. Токени, які вже мають шахову назву
  (`square-light`, `clock-white-bg`, `board-frame`), можна лишити як є.
- **`body { … }`** з `index.css` ChessB **не переносимо** — сторінка живе всередині
  `app/(main)/layout.tsx` зі своїм фоном і хедером.
- Темна тема ChessB — через `[data-theme='dark']` на `<html>`, а `frontend-next` — через
  `prefers-color-scheme`. Поки що лишаємо світлу (відкрите питання §10.3).

### 2.4. Чому слайс у TS, а не `allowJs`

TS виводить тип стану з `initialState`. У JS-слайсі `selectedSquare: null` → тип `null`,
`winner: null` → `null`, `history: []` → `never[]`. Імпортований у `store.ts`, такий редюсер дає
`RootState['game']`, у якому неможливо записати `'e2'` у `selectedSquare`. `checkJs` вимкнений,
тож усередині JS-файлу помилок ніхто не побачить. Висновок: `interface GameState` пишемо явно,
`createSlice` отримує `initialState: GameState`.

### 2.5. Чиста функція проти редюсера з Immer

Редюсер RTK отримує **draft** Immer: можна мутувати, а можна повернути нове значення, але **не
обидва** одночасно. `applyMove(state, move)` у рушії — чиста функція: не мутує вхід, не знає про
Redux, **не читає годинник**. Тоді:

- рушій: дошка, права рокіровки, en passant, SAN, шах/мат → детерміновано, тестується без Redux,
  годиться для perft і для бекенду;
- редюсер: викликає `applyMove`, а сам додає те, що належить **партії**, а не правилам: час
  (`Date.now()`, `moveTimeMs`, `clockAfter`), `history`, `plyCount`, скидання виділення.

Draft Immer — проксі. Передавати його в чужу функцію, яка тримає посилання чи порівнює
ідентичність, ризиковано; `current(state)` з RTK дає звичайний знімок.

---

## 3. Розбір коду ChessB: що змінюється при перенесенні

| Файл ChessB | Куди | Що міняється |
|---|---|---|
| `engine/*` (уже в пакеті) | `packages/chess-engine` | + фасад, + `applyMove`, + `index.d.ts` |
| `gameSlice.js` | `features/chess/gameSlice.ts` | `moveExecuted` стає тонким над `applyMove`; + `gameRestored`, `restored` |
| `gameOperations.js` | `features/chess/gameOperations.ts` | Лише фасад рушія; без `console.*` |
| `gameSelectors.js` | `features/chess/gameSelectors.ts` | Типізовані `RootState`; `createSelector` лишається |
| `gameConstants.js` | `features/chess/gameConstants.ts` | Лише UI-частина (`TIME_CONTROLS`, `DEFAULT_TIME`, `SIDE_OPTIONS`, `LOW_TIME_THRESHOLD_MS`); `COLORS` — з пакета |
| `persistGame.js` + `persistenceMiddleware` у `store.js` | `features/chess/persistGame.ts` + підключення в `store/store.ts` | Читання — лише в ефекті після монтування; ключ — питання §10.4 |
| `hooks/useGameState.js` | `features/chess/useGameState.ts` | Без `console.*` |
| `components/*` | `features/chess/components/*.tsx` | `"use client"`, пропси — TS-типи, без `prop-types`; `Button` — або свій, або спільний з `components/common` |
| `pages/HomePage/HomePage.jsx` | `app/(main)/chess/page.tsx` + `features/chess/ChessGame.tsx` | Розкладка сітки лишається |
| `utils/getPieceSymbol.js` | `features/chess/getPieceSymbol.ts` | Це UI (гліфи), не рушій |
| `data/positions.js` | — | Замість нього — `fenToBoardObject(STARTING_FEN…)` з пакета |
| `Navigation`, `RookIcon`, `SandBoxPage`, `NotFoundPage`, `MainLayout`, `App.jsx`, `main.jsx` | — | Не переносимо: є `Header`, роутинг Next |

---

## 4. Цільова структура

```
packages/chess-engine/src/
  index.js            # публічний API: фасад + applyMove + COLORS + STARTING_FEN + fenToBoardObject
  index.d.ts          # контракт для TS (крок 3)
  engine/index.js     # фасад (крок 1)
  engine/applyMove.js # (крок 2)

apps/frontend-next/
  app/(main)/chess/page.tsx        # серверна оболонка → <ChessGame/>
  features/chess/
    ChessGame.tsx                  # "use client": розкладка HomePage, dynamic(ssr:false) за потреби
    gameSlice.ts  gameSelectors.ts  gameOperations.ts  gameConstants.ts  persistGame.ts  useGameState.ts
    components/  ChessBoardView.tsx Square.tsx Piece.tsx Clock.tsx GameInfoPanel.tsx
                 MoveList*.tsx PromotionModal.tsx GameOverModal.tsx NewGameModal.tsx
    chess.css                      # токени ChessB під .chess-scope + @theme з префіксом
  store/store.ts                   # + game: gameReducer (+ persist middleware)
```

Потік одного ходу:

```
клік → useGameState.handleSquareClick → dispatch(attemptMove)
  attemptMove: черга/час/isMoveLegal (фасад) → dispatch(moveExecuted)
    moveExecuted: applyMove(стан, хід) [рушій, чисто] + годинник/history [редюсер]
  attemptMove: мат/пат? → dispatch(endGame)
persist middleware: moveExecuted | endGame | newGameStarted → localStorage
```

---

## 5. Режими відмови

| Що | Наслідок | Поведінка |
|---|---|---|
| `localStorage` недоступний (приватний режим, квота) | Партія не збережеться | `save` ковтає помилку (як у ChessB), гра триває |
| Збережений стан старої схеми | Не відновлюється | `SCHEMA_VERSION` не збігся → нова партія, без падіння |
| Вкладка у фоні / закрита | Годинник «іде» | Свідомо, як на Lichess (ChessB `docs/clock-and-game-record.md` §6.1) — таймаут на першому рендері після повернення |
| Бекенд лежить | Нічого | Сторінка від бекенду не залежить (лише `Header` з юзером) |

---

## 6. Як користуватись цим ТЗ

Один крок → прогін перевірок з «Готово, коли» → стоп, показуєш diff → рев'ю → запис у §9.
Підказки дають напрям і сигнатури, **не** реалізацію. Якщо застряг більше ніж на годину — питай
з конкретною помилкою/гіпотезою.

---

## 7. ТЗ покроково

### Крок 1 — Фасад рушія: `isMoveLegal`, `getLegalMoves`

**Мета:** один вхід до правил замість чотирьох внутрішніх модулів.

**Що зробити** (`packages/chess-engine/src/engine/index.js`):
- `getLegalMoves(gameState, from): string[]` — клітинки, куди може піти фігура з `from`, з
  урахуванням шаху й рокіровки. `gameState` — `{ board, castlingRights, enPassantTarget }`.
- `isMoveLegal(gameState, from, to): boolean` — через `getLegalMoves`.
- `getMoveDetails` поки не чіпай — його роль забере `applyMove` (крок 2); реши, чи видалити його
  з фасаду зовсім (і з ChessB-документа `move-validation.md` §4.2 в `packages/chess-engine/docs/`).

**Підказки:**
- Композиція вже є в `attemptMove` (ChessB `gameOperations.js:56-84`): pseudo-moves + рокіровка
  окремо + `filterByKingSafety` **не** для рокіровки. Там же пояснення, чому рокіровку не можна
  пропускати через `filterByKingSafety`.
- Чий хід — фасад виводить з кольору фігури на `from`, а не з окремого параметра. Порожня клітинка → `[]`.
- Є готовий `getAllLegalMoves` у `gameStatus.js` — подивись, чи не простіше відфільтрувати його.

**Тести** (`engine/index.test.js`): стартова позиція (`e2` → `e3,e4`; `g1` → `f3,h3`; сума по
всіх фігурах = 20), зв'язана фігура, рокіровка через бите поле, en passant.

**1.4. Диференційний тест проти chess.js** (`engine/reference.test.js`) — постійна версія
разової перевірки з `chess-engine-vs-chessjs.md` §2:
- `chess.js` — **лише devDependency** пакета, у рантайм не потрапляє.
- chess.js обходить дерево позицій (`moves()` → `move()` → рекурсія → `undo()`); у кожній позиції
  його FEN перетворюється на наш `gameState` і порівнюються: множина `from+to` (у chess.js
  промоція — 4 ходи з однаковим `from+to`, тож порівнюй **множини**, не довжини), `isCheck`,
  `isCheckmate`, `isStalemate`, SAN.
- Позиції — стандартні perft-FEN (стартова, Kiwipete, позиції 3–6 з chessprogramming.org),
  **глибина 1–2**: рушій ~у 8 разів повільніший за chess.js, глибина 3 для Позиції 4 — хвилини.
  Мета тесту — секунди.
- При розбіжності тест має показати FEN і відсутні/зайві ходи — без цього його неможливо дебажити.
- Перетворення FEN → `gameState` поки роби в тесті (повного `fenToState` у рушії ще немає —
  `chess-engine-vs-chessjs.md` §4, пункт «FEN»).

**Готово, коли:** `pnpm --filter @syncevent/chess-engine test` зелений і триває < 10 с; нові тести
фасаду й диференційний тест є; заглушок `isMoveLegal`/`getLegalMoves` немає; навмисно зламаний
рушій (наприклад, прибрати перевірку битого поля в рокіровці) ловиться диференційним тестом.

**Типові помилки:** забути, що король під шахом не може рокіруватись; повертати клітинки з
промоцією чотири рази (у фасаді це одна клітинка — фігуру обирає UI); у диференційному тесті
порівнювати кількість ходів замість множин (промоції дадуть хибну розбіжність).

### Крок 2 — Чиста `applyMove(gameState, move)`

**Мета:** правила застосування ходу — у рушії; редюсер лише веде партію.

**Контракт** (ескіз, не фінальний):
```ts
applyMove(
  state: { board; castlingRights; enPassantTarget },
  move: { from: string; to: string; promotion?: 'Q' | 'R' | 'B' | 'N' }
): {
  state: { board; castlingRights; enPassantTarget };      // НОВІ об'єкти, вхід не змінено
  move: { piece; captured; castling; enPassant; promotion; san; isCheck; isCheckmate };
}
```

**Що зробити:** перенести з `gameSlice.js:32-81` (`nextCastlingRights`, `nextEnPassantTarget`,
`getCastlingRookMove`) і з `moveExecuted` усе, **крім** часу, `history`, `plyCount`,
`selectedSquare`. `piece` виводиться з `board[from]`, а не приходить ззовні.

**Підказки:**
- Знімок «до ходу» для `buildSan` (`gameSlice.js:98-102`) у чистій функції виходить сам собою —
  вхід не мутується.
- Вирішити: `applyMove` перевіряє легальність (і що повертає на нелегальний хід) чи довіряє
  викликачу? Для бекенду (`ChessRules.applyMove` → `{ ok: false, reason: 'ILLEGAL' }`,
  `chess-foundation.md` §6) корисно, щоб перевіряв. Запиши рішення в коментар.

**Тести:** перенести кейси `moveExecuted` з ChessB `gameSlice.test.js` (31 тест; ті, що про
годинник/history, лишаються слайсу — крок 4). Окремий тест: вхідний `state` після виклику
глибоко дорівнює собі до виклику.

**Розширити диференційний тест з кроку 1:** тепер обхід може вести **наш** `applyMove`, а
chess.js іти паралельно — після кожного ходу FEN chess.js має давати ту саму розстановку, права
рокіровки й поле en passant, що й наш стан. Це перевіряє саме те, чого разова перевірка не
покрила (`chess-engine-vs-chessjs.md` §2.3). Нюанс: chess.js 1.x пише поле en passant у FEN, лише
якщо взяття справді можливе, а ChessB ставить його після **кожного** ходу пішака на 2 — порівнюй
з урахуванням цього або прийми рішення, яка поведінка правильна (§10.8).

**Готово, коли:** тести пакета зелені; `applyMove` не імпортує нічого поза пакетом і не викликає
`Date.now()`; експортована з `src/index.js`; диференційний тест іде через `applyMove`. Оновити
`chess-foundation.md` §8 (пункти 1–2).

### Крок 3 — Пакет у Next + статична дошка

**Мета:** побачити дошку зі стартовою позицією на `/chess`.

**Що зробити:**
1. `packages/chess-engine/src/index.d.ts` + `"types"` у `package.json` пакета. Описати лише
   публічний API (після кроків 1–2 + `fenToBoardObject`, який треба додати в `src/index.js`).
   Типи `Board = Record<string, string>`, `Color = 'w' | 'b'`, `CastlingRights`.
2. `frontend-next/package.json`: `@syncevent/chess-engine: workspace:*`, `clsx`; `pnpm install`.
3. Стилі (§2.3): `features/chess/chess.css` — три файли ChessB, `:root` → `.chess-scope`, міст з
   префіксом для конфліктних імен; імпорт — у `ChessGame.tsx` або `globals.css`.
4. `ChessBoardView`, `Square`, `Piece` → TSX (без Redux: дошка з пропсів). `getPieceSymbol` → TS.
5. `app/(main)/chess/page.tsx` → `ChessGame` зі стартовою позицією; посилання «Chess» у `Header.tsx`.

**Готово, коли:** `/chess` показує дошку з фігурами й координатами; `pnpm --filter frontend-next
build` проходить **без** `@ts-ignore` навколо імпорту рушія; решта сторінок (`/`, `/my-events`)
виглядає як до зміни (стилі не протекли); у консолі браузера немає hydration-попереджень.

**Типові помилки:** імпорт з `@syncevent/chess-engine/src/engine/...` (обхід контракту);
`.chess-scope` не на обгортці, а на дочірньому елементі — частина кольорів «зникає».

### Крок 4 — Стан гри в TS + тест-раннер

**Мета:** Redux-шар партії працює й покритий тестами.

**Що зробити:**
1. vitest у `frontend-next` (`vitest`, `@vitest/…`, `jsdom`, `@testing-library/react`,
   `@testing-library/jest-dom`) + конфіг з аліасом `@/*`; скрипт `test`.
2. `gameConstants.ts`, `gameSlice.ts` з `interface GameState` (§2.4), `moveExecuted` — через
   `applyMove` (§2.5); `newGameStarted`, `endGame`, `setSelection` — як у ChessB.
3. `gameSelectors.ts`, `gameOperations.ts` (`attemptMove` — лише фасад: `isMoveLegal`,
   `isCheckmate`/`isStalemate` — подумай, чи вони теж мають бути у фасаді; `timeExpired`,
   `resignGame`, `offerDraw`).
4. `store/store.ts`: `game: gameReducer`. `serializableCheck` **не** вимикати.
5. Перенести тести ChessB: `gameSlice` (решта після кроку 2), `gameSelectors`, `gameOperations`.

**Готово, коли:** `pnpm --filter frontend-next test` зелений; `tsc` без помилок; у жодному
файлі `features/chess` немає `any` у типі стану.

**Типові помилки:** `RootState` імпортується в слайс зі `store.ts`, а `store.ts` імпортує слайс —
циклічний імпорт типів ок (`import type`), значень — ні; забутий `payload`-тип у `PayloadAction<…>`.

### Крок 5 — Ходи кліком

**Мета:** hot-seat партія до мату/пату, без годинника.

**Що зробити:** `useGameState.ts`, `ChessBoardContainer` (дошка з Redux), `PromotionModal`;
підсвітка можливих ходів через `getLegalMoves` (нове порівняно з ChessB — дешево після кроку 1).

**Готово, коли:** у браузері зіграно дурний мат (`f3 e5 g4 Qh4#`) → партія завершена; пат;
рокіровка в обидва боки; en passant; промоція з вибором фігури; нелегальний хід нічого не міняє.

### Крок 5.5 (опційний) — Нічиї за правилами в рушії

**Мета:** партія, яку неможливо виграти, завершується сама. Зараз це не так: у 76 зі 100
випадкових партій chess.js зафіксував нічию за правилами, а наш рушій продовжував би гру
(`chess-engine-vs-chessjs.md` §2.2). Не блокер для «побачити партію» — у ChessB нічиїх теж не було.

Три незалежні частини, **у такому порядку** (від дешевої до дорожчої):

1. **Недостатній матеріал** — `isInsufficientMaterial(board)`: чиста статична перевірка дошки.
   Мінімум — як у chess.js: K–K, K+N–K, K+B–K, K+B–K+B з однопольними слонами (будь-яка кількість
   слонів одного кольору полів). Факт для перевірки: FIDE 5.2.2 / 6.9 — нічия, лише якщо **жодна**
   послідовність легальних ходів не веде до мату; K+N–K+N сюди **не** входить (мат можливий).
2. **Правило 50 ходів** — `halfmoveClock` у стані: 0 після ходу пішака або взяття, інакше +1;
   `>= 100` → нічия. Вирішити: автоматично (як chess.js `isDrawByFiftyMoves`) чи за заявою гравця
   (FIDE 9.3), а автоматично — з 75 ходів (FIDE 9.6.2). §10.9.
3. **Потрійне повторення** — ключ позиції: розстановка + черга + права рокіровки + поле en passant
   **лише якщо взяття можливе** (FIDE 9.2.3 — саме тому це важливо, див. нюанс кроку 2). Лічильник
   ключів — у стані партії; скидати можна після незворотного ходу (той самий момент, коли
   обнуляється `halfmoveClock`). Той самий вибір «автоматично / за заявою», автоматично — 5 разів
   (FIDE 9.6.1).

**Куди:** функції 1 — чисто в рушій; лічильник і ключ позиції — повертає `applyMove` (крок 2), а
історію ключів тримає слайс. `attemptMove` після ходу перевіряє нічию так само, як мат/пат →
`endGame({ winner: 'draw', reason: 'insufficient-material' | 'fifty-move' | 'repetition' })`.
`GameOverModal` має показати ці причини.

**Тести:** диференційний тест кроку 1 доповнити `isInsufficientMaterial`, `isDrawByFiftyMoves`,
`isThreefoldRepetition` (порівняння з chess.js); окремі юніт-кейси на однопольних/різнопольних
слонів і на повторення, перерване взяттям.

**Готово, коли:** партія K+B проти K завершується нічиєю одразу; три повторення позиції (конем
туди-назад) → нічия; 50 ходів без взять і ходів пішаком → нічия; диференційний тест зелений.

**Типові помилки:** включити `plyCount`/номер ходу в ключ повторення (тоді позиції ніколи не
збігаються); не врахувати права рокіровки в ключі; вважати K+B–K+B нічиєю незалежно від кольору полів.

### Крок 6 — Годинник, панель, модалки, список ходів

**Що зробити:** `Clock`, `GameInfoPanel`, `NewGameModal`, `GameOverModal`, `MoveList*`, `Button`;
`framer-motion` — лише якщо анімація потрібна (питання §10.5). Розв'язати `Date.now()` у рендері
(§2.2): `dynamic(ssr:false)` для ігрової зони **або** годинник показує збережене значення до
першого тіку. Перенести тести `Clock`, `GameOverModal`.

**Готово, коли:** програш за часом працює; нова партія з вибором контролю й кольору; дошка
перевертається за чорних; SAN у списку ходів; hydration-попереджень немає.

### Крок 7 — Збереження без розбіжностей

**Що зробити:** `persistGame.ts` (ключ, `SCHEMA_VERSION`), middleware запису на
`moveExecuted | endGame | newGameStarted`, дія `gameRestored` + прапорець `restored`, ефект
відновлення після монтування, плейсхолдер замість дошки до `restored` (§2.2, варіант 1). Жодного
`localStorage` на рівні модуля. Перенести тести `persistGame`.

**Готово, коли:** reload посеред партії відновлює дошку, історію й точний залишок часу; якщо час
вийшов, поки вкладка була закрита, — таймаут одразу; зміна `SCHEMA_VERSION` → нова партія без
помилок; стартова позиція **не** блимає перед відновленою.

**Типові помилки:** відновлення в `useEffect` компонента, що рендериться двічі в StrictMode, —
дія має бути ідемпотентною; писати в storage на кожен dispatch.

### Крок 8 — Прибирання

Жодного `console.log` у `features/chess` (лише `console.error` у `persistGame`); у
`packages/chess-engine/README.md` і `chess-foundation.md` §8 — оновлені статуси; вирішити долю
ChessB (§10.6).

**Готово, коли:** `pnpm lint` і всі тести зелені; `grep -r "console\.log" apps/frontend-next/features/chess` порожній.

---

## 8. Що свідомо поза цим ТЗ

- Онлайн-партія, WebSocket, серверний годинник — `chess-multiplayer.md` Фаза 1. Тут готуємо
  лише форму: стан гри в Redux, у який потім писатимуть події `game:move-applied` (§4.5 там).
- PGN, розбір SAN, перегляд історії/undo, повний FEN ↔ стан, черга ходу в стані рушія, перевірка
  коректності позиції — потрібні бекенду, не локальній грі; перелік і пріоритети —
  `chess-engine-vs-chessjs.md` §4. (Нічиї — тепер опційний крок 5.5.)
- `apps/frontend` (Vite) шахів не отримує.

---

## 9. Журнал виконання

| Дата | Крок | Що зроблено | Що виявило рев'ю |
|---|---|---|---|
| — | — | — | — |

---

## 10. Відкриті питання

1. **Рушій у TS?** Пропозиція — ні зараз (D9 у `chess-foundation.md`): JS + `index.d.ts`.
   Переписати, коли API стабілізується.
2. **`getMoveDetails` у фасаді** — видалити на користь `applyMove` чи лишити? Пропозиція — видалити.
3. **Тема:** світла лише, чи тягнути `[data-theme='dark']` і узгоджувати з `prefers-color-scheme`
   `frontend-next`? Пропозиція — світла, темна окремим кроком.
4. **Ключ `localStorage`:** `chessb:v1:game` → `syncevent:chess:game`? Інший origin (3001 проти
   5173), тож старих партій тут усе одно немає — перейменування безкоштовне. Пропозиція — так.
5. **`framer-motion`** (+~ десятки КБ) заради анімації в одному компоненті — лишити чи CSS-перехід?
6. **ChessB після перенесення** — архівувати (README «перенесено в SyncEvent») чи лишити живим?
   Пропозиція — архівувати, щоб рушій не роздвоївся.
7. **Доступ до `/chess`:** публічна сторінка (hot-seat не потребує акаунта) чи лише для
   залогінених? Пропозиція — публічна.
8. **Поле en passant після ходу пішака на 2:** ставити завжди (як ChessB) чи лише коли взяття
   легальне (як chess.js 1.x і як вимагає FIDE 9.2.3 для порівняння позицій)? На легальність ходів
   не впливає; впливає на FEN і на потрійне повторення (крок 5.5). Пропозиція — як chess.js.
9. **Нічиї 50 ходів / повторення — автоматично чи за заявою?** FIDE: за заявою гравця на 50 ходах і
   3 повтореннях, автоматично — на 75 ходах і 5 повтореннях. Онлайн-платформи зазвичай
   спрощують до автоматичних (перевірити, як саме роблять Lichess/Chess.com). Пропозиція для
   hot-seat — автоматично на 50/3, як chess.js; для турнірів — повернутись до питання в
   `chess-multiplayer.md`.

---

## 11. Як відновити контекст роботи

1. §0, §9 (останній зроблений крок), §7 — наступний крок.
2. Код: `packages/chess-engine/src/index.js` (що вже експортовано), `apps/frontend-next/features/chess/`.
3. Для кроків 2 і 4 — ChessB `src/redux/game/gameSlice.js` і його тести як еталон поведінки.
4. Контекст вище: `chess-foundation.md` §8, `chess-multiplayer.md` §4.5.
