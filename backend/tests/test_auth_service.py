"""JWT helpers — unit tests for hashing and token round-trip."""
from app.services.auth import (
    hash_password, verify_password, create_access_token, decode_access_token,
)


def test_hash_password_is_not_plaintext():
    h = hash_password("secret")
    assert h != "secret"
    assert h.startswith("$2")  # bcrypt prefix


def test_verify_password_roundtrip():
    h = hash_password("correct-horse-battery-staple")
    assert verify_password("correct-horse-battery-staple", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip_preserves_claims():
    token = create_access_token({"sub": "42", "role": "admin"})
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "admin"
    assert "exp" in payload


def test_decode_invalid_token_returns_none():
    assert decode_access_token("not.a.jwt") is None
    assert decode_access_token("") is None
