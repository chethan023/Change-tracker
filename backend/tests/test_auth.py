"""Auth flow: login, JWT, role-based access."""


def test_login_success_returns_token(client, seed_users):
    res = client.post("/api/v1/auth/login",
                      json={"email": "admin@example.com", "password": "AdminPw1!"})
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["role"] == "admin"
    assert body["email"] == "admin@example.com"


def test_login_wrong_password_rejected(client, seed_users):
    res = client.post("/api/v1/auth/login",
                      json={"email": "admin@example.com", "password": "wrong"})
    assert res.status_code == 401


def test_login_unknown_email_rejected(client):
    res = client.post("/api/v1/auth/login",
                      json={"email": "nobody@example.com", "password": "x"})
    assert res.status_code == 401


def test_login_inactive_account_rejected(client, db_session, seed_users):
    u = seed_users["viewer"]
    u.active = False
    db_session.commit()
    res = client.post("/api/v1/auth/login",
                      json={"email": u.email, "password": "ViewerPw1!"})
    assert res.status_code == 403


def test_me_returns_current_user(client, admin_headers):
    res = client.get("/api/v1/users/me", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


def test_protected_endpoint_requires_token(client):
    res = client.get("/api/v1/changes")
    assert res.status_code == 401


def test_protected_endpoint_rejects_garbage_token(client):
    res = client.get("/api/v1/changes",
                     headers={"Authorization": "Bearer not-a-real-jwt"})
    assert res.status_code == 401


# ── Case-insensitive email ───────────────────────────────────────────
def test_login_email_is_case_insensitive(client, seed_users):
    res = client.post("/api/v1/auth/login",
                      json={"email": "ADMIN@Example.com", "password": "AdminPw1!"})
    assert res.status_code == 200
    assert res.json()["email"] == "admin@example.com"


def test_create_user_lowercases_email(client, admin_headers, db_session):
    res = client.post("/api/v1/users",
                      json={"email": "Mixed.Case@Example.COM",
                            "password": "TempPasswd123!", "role": "viewer"},
                      headers=admin_headers)
    assert res.status_code == 201, res.text
    assert res.json()["email"] == "mixed.case@example.com"
    # And duplicates with different casing are rejected.
    dup = client.post("/api/v1/users",
                      json={"email": "MIXED.case@example.com",
                            "password": "TempPasswd123!", "role": "viewer"},
                      headers=admin_headers)
    assert dup.status_code == 409


# ── Token lifecycle ──────────────────────────────────────────────────
def test_token_expired_returns_401_with_marker(client, seed_users):
    from app.services.auth import create_access_token
    token = create_access_token({"sub": str(seed_users["admin"].id),
                                 "email": "admin@example.com", "role": "admin"},
                                expires_minutes=-1)
    res = client.get("/api/v1/changes",
                     headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["detail"] == "token_expired"


def test_logout_revokes_existing_tokens(client, seed_users):
    login = client.post("/api/v1/auth/login",
                        json={"email": "admin@example.com", "password": "AdminPw1!"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Token works.
    assert client.get("/api/v1/users/me", headers=headers).status_code == 200

    # After logout, the same token is revoked.
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    revoked = client.get("/api/v1/users/me", headers=headers)
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "token_revoked"


def test_refresh_issues_new_token(client, seed_users):
    login = client.post("/api/v1/auth/login",
                        json={"email": "admin@example.com", "password": "AdminPw1!"})
    old = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {old}"}
    res = client.post("/api/v1/auth/refresh", headers=headers)
    assert res.status_code == 200
    new = res.json()["access_token"]
    assert new
    # The new token should also work.
    assert client.get("/api/v1/users/me",
                      headers={"Authorization": f"Bearer {new}"}).status_code == 200


def test_password_change_revokes_old_tokens(client, seed_users):
    login = client.post("/api/v1/auth/login",
                        json={"email": "viewer@example.com", "password": "ViewerPw1!"})
    old = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {old}"}

    chg = client.post("/api/v1/auth/change-password",
                      json={"current_password": "ViewerPw1!",
                            "new_password": "BrandNewPw9!"},
                      headers=headers)
    assert chg.status_code == 204
    revoked = client.get("/api/v1/users/me", headers=headers)
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "token_revoked"


# ── Forgot-password flow ─────────────────────────────────────────────
def test_forgot_password_returns_200_for_unknown_email(client):
    res = client.post("/api/v1/auth/forgot-password",
                      json={"email": "nobody@example.com"})
    assert res.status_code == 200
    # Doesn't leak existence — and emits no reset_url for unknown emails.
    assert res.json().get("reset_url") is None


def test_forgot_password_issues_token_and_reset_works(client, seed_users):
    res = client.post("/api/v1/auth/forgot-password",
                      json={"email": "ADMIN@example.com"})
    assert res.status_code == 200
    body = res.json()
    # SMTP isn't configured in tests, so reset_url is surfaced inline.
    url = body["reset_url"]
    assert url and "token=" in url
    token = url.split("token=", 1)[1]

    new_pw = "FreshPasswd99!"
    chg = client.post("/api/v1/auth/reset-password",
                      json={"token": token, "new_password": new_pw})
    assert chg.status_code == 204

    # New password works.
    login = client.post("/api/v1/auth/login",
                        json={"email": "admin@example.com", "password": new_pw})
    assert login.status_code == 200

    # Token cannot be reused.
    again = client.post("/api/v1/auth/reset-password",
                        json={"token": token, "new_password": "AnotherPasswd99!"})
    assert again.status_code == 400


def test_reset_password_rejects_invalid_token(client, seed_users):
    res = client.post("/api/v1/auth/reset-password",
                      json={"token": "not-a-real-token", "new_password": "Whatever12345!"})
    assert res.status_code == 400


def test_reset_password_rejects_expired_token(client, seed_users, db_session):
    from datetime import datetime, timedelta
    from app.models import PasswordResetToken
    from app.routers.auth import _hash_reset_token
    raw = "tokA-expired-123"
    db_session.add(PasswordResetToken(
        user_id=seed_users["viewer"].id,
        token_hash=_hash_reset_token(raw),
        expires_at=datetime.utcnow() - timedelta(minutes=1),
    ))
    db_session.commit()
    res = client.post("/api/v1/auth/reset-password",
                      json={"token": raw, "new_password": "FreshPasswd99!"})
    assert res.status_code == 400


def test_admin_password_reset_revokes_old_tokens(client, seed_users, admin_headers):
    login = client.post("/api/v1/auth/login",
                        json={"email": "viewer@example.com", "password": "ViewerPw1!"})
    viewer_token = login.json()["access_token"]
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    res = client.post(f"/api/v1/users/{seed_users['viewer'].id}/reset-password",
                      json={"new_password": "TempPasswd999!"},
                      headers=admin_headers)
    assert res.status_code == 204
    revoked = client.get("/api/v1/users/me", headers=viewer_headers)
    assert revoked.status_code == 401
