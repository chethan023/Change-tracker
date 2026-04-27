"""User management — admin-only CRUD, role enforcement, user limit."""
from app.config import settings


VALID_PW = "NewPasswd1234!"


def test_list_users_requires_admin(client, viewer_headers):
    res = client.get("/api/v1/users", headers=viewer_headers)
    assert res.status_code == 403


def test_admin_can_list_users(client, admin_headers):
    res = client.get("/api/v1/users", headers=admin_headers)
    assert res.status_code == 200
    assert len(res.json()) == 3  # admin + editor + viewer from seed


def test_admin_can_create_user(client, admin_headers):
    res = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "new@example.com", "password": VALID_PW, "role": "viewer",
    })
    assert res.status_code == 201, res.text
    assert res.json()["email"] == "new@example.com"
    # New users must change their (admin-set) password on first login.
    assert res.json()["must_change_password"] is True


def test_create_user_duplicate_email_rejected(client, admin_headers):
    client.post("/api/v1/users", headers=admin_headers, json={
        "email": "dup@example.com", "password": VALID_PW, "role": "viewer",
    })
    res = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "dup@example.com", "password": VALID_PW, "role": "viewer",
    })
    assert res.status_code == 409


def test_create_user_invalid_role_rejected(client, admin_headers):
    res = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "bad@example.com", "password": VALID_PW, "role": "superuser",
    })
    assert res.status_code == 422


def test_create_user_short_password_rejected(client, admin_headers):
    res = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "shortpw@example.com", "password": "short1!", "role": "viewer",
    })
    assert res.status_code == 422


def test_editor_cannot_create_user(client, editor_headers):
    res = client.post("/api/v1/users", headers=editor_headers, json={
        "email": "x@example.com", "password": VALID_PW, "role": "viewer",
    })
    assert res.status_code == 403


def test_admin_cannot_delete_self(client, admin_headers, seed_users):
    admin_id = seed_users["admin"].id
    res = client.delete(f"/api/v1/users/{admin_id}", headers=admin_headers)
    assert res.status_code == 400


def test_admin_can_delete_other_user(client, admin_headers, seed_users):
    viewer_id = seed_users["viewer"].id
    res = client.delete(f"/api/v1/users/{viewer_id}", headers=admin_headers)
    assert res.status_code == 204


def test_user_limit_enforced(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_USERS", 3)  # already seeded 3 users
    res = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "overflow@example.com", "password": VALID_PW, "role": "viewer",
    })
    assert res.status_code == 403
