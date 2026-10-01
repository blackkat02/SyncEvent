from fastapi import FastAPI

from chess_service.api import health


def create_app() -> FastAPI:
    app = FastAPI(title="SyncEvent chess-service")
    app.include_router(health.router)
    return app


app = create_app()
