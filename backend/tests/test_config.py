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
