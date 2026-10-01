# chess-service (Python)

Шахові обчислення **поруч** із `backend`, не посередині (AGENTS.md, інваріант 6;
`docs/architecture/chess-multiplayer.md` §7). Хід партії сюди не йде: авторитет ходу —
`backend`/`games` + `@syncevent/chess-engine`.

Не входить у pnpm workspace (немає `package.json`), свій `pyproject.toml` і Dockerfile.

## Роль

| Функція | Як спілкується | Стан |
|---|---|---|
| Рейтинг Glicko-2 | Kafka: `chess.game.finished` → `chess.rating.updated` | ⬜ |
| Аналіз партій (`python-chess` + Stockfish) | Kafka `chess.game.finished`; результат — REST для фронту | ⬜ |
| Швейцарське жеребкування | синхронний HTTP `POST /pairings` від `tournaments` | ⬜ (D5: на старті лише круговий, у TS) |
| Античит | Kafka, прапорець для модерації | ⬜ |

Правила: не пише в таблиці `backend` (свої таблиці/схема), результати — подіями;
консюмери дедуплікують за `messageId`; контракти подій — у `packages/shared`.

## Запуск

```bash
cd apps/chess-service
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m pytest
.venv/Scripts/python -m uvicorn chess_service.main:app --reload --port 8000
```

`GET /health` → `{"status": "ok", "service": "chess-service"}`.
