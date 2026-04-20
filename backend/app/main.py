"""FastAPI application factory."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, ingest, changes, users, snapshots, products, config, notifications


logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


_INSECURE_SECRETS = {"change-me", "", "local-jwt-secret-change-me-in-production"}


def _resolve_cors_origins() -> list[str]:
    raw = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
    if settings.ENV == "development":
        return raw or ["http://localhost:3000", "http://localhost:5173"]
    if not raw or "*" in raw:
        raise RuntimeError(
            "ALLOWED_ORIGINS must list explicit frontend origins in non-development ENV "
            "(wildcard is rejected when credentials are allowed)."
        )
    return raw


def _assert_secrets_configured() -> None:
    if settings.ENV == "development":
        return
    if settings.JWT_SECRET_KEY in _INSECURE_SECRETS:
        raise RuntimeError("JWT_SECRET_KEY must be set to a strong, unique value.")
    if settings.INGEST_API_KEY in _INSECURE_SECRETS:
        raise RuntimeError("INGEST_API_KEY must be set to a strong, unique value.")


def create_app() -> FastAPI:
    _assert_secrets_configured()

    app = FastAPI(
        title=f"{settings.CLIENT_NAME} — PIM Change Tracker",
        version="1.0.0",
        description="Tracks STIBO STEP product data changes via STEPXML ingest.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_resolve_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

    app.include_router(config.router)
    app.include_router(auth.router)
    app.include_router(ingest.router)
    app.include_router(changes.router)
    app.include_router(users.router)
    app.include_router(snapshots.router)
    app.include_router(products.router)
    app.include_router(notifications.router)

    # Bootstrap: create seed users from env vars (client.env) on first run.
    # No hardcoded credentials — everything comes from the environment.
    @app.on_event("startup")
    def bootstrap_users():
        from app.db.session import SessionLocal
        from app.models import User
        from app.services.auth import hash_password

        seeds = [
            ("admin",  settings.BOOTSTRAP_ADMIN_EMAIL,  settings.BOOTSTRAP_ADMIN_PASSWORD),
            ("editor", settings.BOOTSTRAP_EDITOR_EMAIL, settings.BOOTSTRAP_EDITOR_PASSWORD),
            ("viewer", settings.BOOTSTRAP_VIEWER_EMAIL, settings.BOOTSTRAP_VIEWER_PASSWORD),
        ]

        db = SessionLocal()
        try:
            for role, email, password in seeds:
                if not email or not password:
                    continue
                if db.query(User).filter_by(email=email).first():
                    continue
                db.add(User(
                    email=email,
                    role=role,
                    hashed_password=hash_password(password),
                    active=True,
                ))
                logger.info("Seeded %s user: %s", role, email)
            db.commit()
        finally:
            db.close()

    return app


app = create_app()
