# @syncevent/chess-engine

Правила шахів — одна реалізація для клієнта (UI, оптимістичний хід) і сервера (авторитетна
валідація в `backend`/`games` через порт `ChessRules`). Чистий JS (ESM), без React/Redux.

Походження: скопійовано з `D:\Projects\ChessB` (`src/engine/`, коміт `64dfcce`, 2026-09-30).
**Відтепер рушій розвивається тут**, ChessB — лише історія/довідка.

## Що змінено при перенесенні

| Було в ChessB | Стало |
|---|---|
| `COLORS` з `src/redux/game/gameConstants.js` | `src/constants.js` (лише доменна частина) |
| `src/utils/boardUtils.js`, `chessHelpers.js`, `fenConverter.js` | `src/utils/` (частина домену) |
| `src/data/fenConstants.js` | `src/fenConstants.js` |
| Імпорти без розширень (`'./attacks'`) | З `.js` — пакет імпортується з Node ESM, не лише з Vite |

Логіку не змінено. `docs/` — дизайн-документи рушія з ChessB (`move-validation.md`,
`move-notation.md`) для контексту коментарів у коді.

## Стан

| Що | Стан |
|---|---|
| pseudo/legal moves, атаки, рокіровка, en passant, промоція, мат/пат, SAN | ✅ з тестами (107); звірено з chess.js на ~105 тис. позицій — 0 розбіжностей (`docs/architecture/chess-engine-vs-chessjs.md`) |
| Нічиї за правилами (матеріал, 50 ходів, повторення) | ⬜ |
| Фасад `src/engine/index.js` (`isMoveLegal`, `getMoveDetails`, `getLegalMoves`) | ⬜ заглушки |
| `applyMove(state, move)` (у ChessB — у редюсері `gameSlice.js`) | ⬜ |
| Повний FEN ↔ стан (`fenConverter.js` розбирає лише розстановку) | ⬜ |
| perft(1..4) | ⬜ |

План — `docs/architecture/chess-foundation.md` §8 (трек рушія).

## Команди

```bash
pnpm --filter @syncevent/chess-engine test
```

Публічний API — лише `src/index.js`; внутрішні модулі `engine/*` напряму не імпортувати.
