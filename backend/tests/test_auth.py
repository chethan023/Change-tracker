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
