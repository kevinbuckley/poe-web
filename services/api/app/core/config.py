from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "POE API"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    database_url: str = "postgresql+psycopg://poe:poe@localhost:5432/poe"
    redis_url: str = "redis://localhost:6379/0"

    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    cors_origins: str = "http://localhost:3000"

    default_user_id: str = "demo-user"
    auto_create_tables: bool = True
    max_working_memory_messages: int = 8
    summary_every_n_messages: int = 6

    request_timeout_seconds: int = Field(default=120, ge=10, le=300)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
