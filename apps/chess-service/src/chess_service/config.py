from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Налаштування з env. Імена — як у кореневому .env.example (KAFKA_BROKER тощо)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "chess-service"
    # Kafka з хоста — localhost:29092, з контейнерів — kafka:9092 (AGENTS.md).
    # Поки не використовується: консюмер chess.game.finished — окремий крок.
    kafka_broker: str = "localhost:29092"


settings = Settings()
