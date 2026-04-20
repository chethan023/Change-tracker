# Backend tests

MVP test coverage for the Change Tracker API.

## Run

```bash
cd backend
venv\Scripts\python.exe -m pytest tests/ -v
```

## Suites

| File | Covers |
|------|--------|
| `test_auth.py` | Login flow, JWT gate, inactive accounts |
| `test_auth_service.py` | Password hashing + JWT round-trip |
| `test_config.py` | `/config` returns env-driven branding, no hardcoded client names |
| `test_users.py` | Admin-only CRUD, role validation, user limit, steward→editor normalisation |
| `test_changes.py` | Listing, filtering, pagination, CSV export (header + `_t` query token) |
| `test_products.py` | Product list, detail with attribute audit counts, timeline |

Each test runs against a fresh in-memory SQLite DB — no external services required.
