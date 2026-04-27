"""Client config endpoint — verifies dynamic branding from env, never hardcoded."""


def test_config_returns_env_values(client):
    res = client.get("/api/v1/config")
    assert res.status_code == 200
    body = res.json()
    # Values come from CLIENT_* env vars set in conftest — never hardcoded strings
    assert body["client_name"] == "TestClient"
    assert body["primary_colour"] == "#123456"


def test_config_is_public(client):
    """Config endpoint must not require auth (used on login page)."""
    res = client.get("/api/v1/config")
    assert res.status_code == 200


def test_health_is_public(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_no_hardcoded_client_name_in_response(client):
    """Guard against regressions — no leaked real-client name in config."""
    body = client.get("/api/v1/config").json()
    for bad in ("Kingspan", "kingspan", "KINGSPAN"):
        assert bad not in body["client_name"]


# ── Admin-editable config ────────────────────────────────────────────
def test_config_patch_requires_admin(client, viewer_headers):
    res = client.patch("/api/v1/config",
                       json={"client_name": "Hacked"},
                       headers=viewer_headers)
    assert res.status_code == 403


def test_admin_can_update_client_config(client, admin_headers):
    res = client.patch("/api/v1/config",
                       json={"client_name": "New Name",
                             "primary_colour": "#abcdef",
                             "step_base_url": "https://step.test"},
                       headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["client_name"] == "New Name"
    assert body["primary_colour"] == "#abcdef"
    assert body["step_base_url"] == "https://step.test"

    # Persists across requests.
    follow = client.get("/api/v1/config").json()
    assert follow["client_name"] == "New Name"


def test_invalid_brand_colour_rejected(client, admin_headers):
    res = client.patch("/api/v1/config",
                       json={"primary_colour": "not-a-colour"},
                       headers=admin_headers)
    assert res.status_code == 422


def test_branding_save_flow_accepts_typical_payload(client, admin_headers):
    """Mirrors what the Branding panel sends — both fields, valid colour."""
    res = client.patch("/api/v1/config",
                       json={"primary_colour": "#1B3A6B",
                             "logo_url": "https://example.com/logo.svg"},
                       headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json()["primary_colour"] == "#1B3A6B"


def test_empty_strings_clear_overrides(client, admin_headers):
    """Empty strings should be accepted (no min_length=1) so admins can
    revert overrides back to env defaults."""
    res = client.patch("/api/v1/config",
                       json={"client_name": ""},
                       headers=admin_headers)
    assert res.status_code == 200, res.text
    # GET resolver falls back to env default when the row value is blank.
    follow = client.get("/api/v1/config").json()
    assert follow["client_name"] == "TestClient"  # env default from conftest


# ── Security policies (admin-only read) ──────────────────────────────
def test_security_policies_require_admin(client, viewer_headers):
    res = client.get("/api/v1/admin/policies", headers=viewer_headers)
    assert res.status_code == 403


def test_security_policies_returns_runtime_values(client, admin_headers):
    res = client.get("/api/v1/admin/policies", headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    for k in ("jwt_expire_minutes", "login_rate_limit_per_min",
              "password_min_length", "max_users", "user_count",
              "smtp_configured", "env"):
        assert k in body
    assert body["password_min_length"] == 12
    assert body["user_count"] == 3  # admin/editor/viewer from seed_users
