"""Application settings loaded from environment (client.env)."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # Client branding
    CLIENT_NAME: str = "Change Tracker"
    CLIENT_LOGO_URL: str = ""
    CLIENT_PRIMARY_COLOUR: str = "#1B3A6B"

    # Security
    INGEST_API_KEY: str = "change-me"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    # Comma-separated list of allowed CORS origins. "*" only honoured when ENV=development.
    ALLOWED_ORIGINS: str = ""
    ENV: str = "production"
    LOGIN_RATE_LIMIT_PER_MIN: int = 10

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://ct_user:localpassword@db:5432/changetracker"

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # STEP
    STEP_BASE_URL: str = ""

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@example.com"

    # Slack
    SLACK_DEFAULT_WEBHOOK_URL: str = ""

    # App
    MAX_USERS: int = 10
    LOG_LEVEL: str = "INFO"

    # Bootstrap seed users (read from client.env — never commit real creds)
    BOOTSTRAP_ADMIN_EMAIL: str = ""
    BOOTSTRAP_ADMIN_PASSWORD: str = ""
    BOOTSTRAP_EDITOR_EMAIL: str = ""
    BOOTSTRAP_EDITOR_PASSWORD: str = ""
    BOOTSTRAP_VIEWER_EMAIL: str = ""
    BOOTSTRAP_VIEWER_PASSWORD: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
