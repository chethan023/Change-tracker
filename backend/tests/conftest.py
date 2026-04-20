"""Shared pytest fixtures — in-memory SQLite DB, test client, seeded users."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("CLIENT_NAME", "TestClient")
os.environ.setdefault("CLIENT_PRIMARY_COLOUR", "#123456")
os.environ.setdefault("INGEST_API_KEY", "test-api-key")
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "true")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.models import User
from app.services.auth import hash_password


@pytest.fixture(scope="function")
def db_session():
    """Fresh in-memory SQLite for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(db_session):
    """FastAPI TestClient with DB dependency override."""
    def _override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    # Plain instantiation skips lifespan/startup (bootstrap_users would hit the wrong engine)
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def seed_users(db_session):
    """Create one admin / editor / viewer, return them by role."""
    users = {
        "admin":  User(email="admin@example.com",  role="admin",
                       hashed_password=hash_password("AdminPw1!"), active=True),
        "editor": User(email="editor@example.com", role="editor",
                       hashed_password=hash_password("EditorPw1!"), active=True),
        "viewer": User(email="viewer@example.com", role="viewer",
                       hashed_password=hash_password("ViewerPw1!"), active=True),
    }
    for u in users.values():
        db_session.add(u)
    db_session.commit()
    for u in users.values():
        db_session.refresh(u)
    return users


def _auth_headers(client, email: str, password: str) -> dict:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def admin_headers(client, seed_users):
    return _auth_headers(client, "admin@example.com", "AdminPw1!")


@pytest.fixture
def editor_headers(client, seed_users):
    return _auth_headers(client, "editor@example.com", "EditorPw1!")


@pytest.fixture
def viewer_headers(client, seed_users):
    return _auth_headers(client, "viewer@example.com", "ViewerPw1!")
