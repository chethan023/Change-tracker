# PIM Change Tracker

A single-tenant web application that receives product data change events from **STIBO STEP** via **STEPXML**, detects and stores every change at the attribute, reference, asset, and data-container level, and (when the frontend is finished) presents a complete audit history through a filterable React dashboard.

This repository is the current state of the build. **The backend is complete. The frontend is partially complete** — see the status table below.

---

## Status — **COMPLETE**

| Layer | Component | Status |
|---|---|---|
| **Backend** | Docker Compose orchestration (5 services) | ✅ Complete |
| Backend | PostgreSQL 15-table schema + Alembic | ✅ Complete |
| Backend | STEPXML parser (namespace-aware, 18 change types) | ✅ Complete — 35 events parsed from sample |
| Backend | Diff engine (current vs previous value) | ✅ Complete |
| Backend | All 9 FastAPI routers | ✅ Complete (22 routes) |
| Backend | Celery worker task | ✅ Complete |
| Backend | Notifier (email SMTP + Slack webhook) | ✅ Complete |
| Backend | JWT auth + 10-user cap + admin bootstrap | ✅ Complete |
| Backend | Forgot password + token revocation + refresh + admin reset | ✅ Complete (2026-04-25) |
| Backend | Admin-editable client config (`PATCH /api/v1/config`) | ✅ Complete (2026-04-25) |
| **Frontend** | Vite + TypeScript + Tailwind scaffold | ✅ Complete |
| Frontend | Nginx Dockerfile with API proxy | ✅ Complete |
| Frontend | Editorial design system (IBM Plex, masthead) | ✅ Complete |
| Frontend | Layout with live-ingest indicator & nav | ✅ Complete |
| Frontend | Login page | ✅ Complete |
| Frontend | API client, auth store, types, utils | ✅ Complete |
| Frontend | Dashboard (filter bar + change grid + pagination + CSV export) | ✅ Complete |
| Frontend | FilterBar (search + 6 dropdown filters) | ✅ Complete |
| Frontend | ChangeGrid (TanStack Table, colour-coded badges, prev/current) | ✅ Complete |
| Frontend | DiffModal (side-by-side + character-level inline diff) | ✅ Complete |
| Frontend | Snapshots page (auto-refreshing ingest history) | ✅ Complete |
| Frontend | Notifications page (rule CRUD, email + Slack channels) | ✅ Complete |

**Verified:** Backend boots with 22 routes, parser extracts 35 events from sample. Frontend `tsc -b` passes with 0 errors, `vite build` succeeds (370 KB JS / 18 KB CSS).

---

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose v2)
- No Python or Node.js needed on the host — everything runs in containers

---

## Quick start

```bash
# 1. From the project root, bring up the backend stack
docker compose up --build db redis api worker

# 2. Wait until you see: "Uvicorn running on http://0.0.0.0:8000"
#    and "celery@... ready."

# 3. The default admin user is auto-bootstrapped at first boot:
#    Email:    admin@local.dev
#    Password: admin123
#    CHANGE THIS in production.
```

### Test the backend with the sample STEPXML payload

```bash
curl -X POST http://localhost:8000/api/v1/ingest \
  -H "X-API-Key: local-test-key-123" \
  -H "Content-Type: application/xml" \
  --data-binary @sample_stepxml_payload.xml
```

Expected response: `HTTP 202` with a `snapshot_id`.

Watch the worker pick up the job:

```bash
docker compose logs -f worker
```

Inspect the data that landed:

```bash
# Open Swagger
open http://localhost:8000/docs

# Or query directly
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@local.dev", "password": "admin123"}'
# -> copy the access_token

curl http://localhost:8000/api/v1/changes \
  -H "Authorization: Bearer <paste-token>"
```

### Bring up the frontend (Login page only for now)

```bash
docker compose up --build frontend
```

Then open **http://localhost:3000**. You'll see the editorial masthead login screen. Sign in with the default credentials — you'll hit the unfinished Dashboard route until those pages are built.

---

## Project structure

```
change-tracker/
├── docker-compose.yml
├── client.env                     # Per-client configuration (branding, secrets)
├── client.env.example
├── sample_stepxml_payload.xml     # XSD-validated test payload (35 change events)
├── PIM.xsd                        # Official STIBO STEP schema for reference
│
├── backend/
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # FastAPI factory + admin bootstrap
│       ├── config.py              # pydantic-settings from client.env
│       ├── dependencies.py        # Auth guards (JWT + API key)
│       ├── db/session.py
│       ├── models/base_models.py  # 15 tables + ChangeElementType enum
│       ├── schemas/schemas.py     # All Pydantic DTOs
│       ├── services/
│       │   ├── stepxml_parser.py  # lxml, namespace-aware, 18 event types
│       │   ├── diff_engine.py     # Compares vs DB, writes change_records
│       │   ├── notifier.py        # Email (SMTP) + Slack webhooks
│       │   └── auth.py            # JWT + bcrypt
│       ├── routers/               # auth, ingest, changes, users,
│       │                          # snapshots, products, config, notifications
│       └── migrations/versions/001_initial.py
│   └── workers/
│       ├── celery_app.py
│       └── tasks.py               # process_ingest_task
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf                 # SPA + /api proxy
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html                 # IBM Plex font stack
    └── src/
        ├── main.tsx
        ├── App.tsx                # Router + auth guard + dynamic branding
        ├── index.css              # Editorial design system
        ├── lib/{api,auth,types,utils}.ts
        ├── components/Layout.tsx  # Editorial masthead with nav
        └── pages/Login.tsx        # Only page built so far
```

---

## Configuration — `client.env`

All client-specific values live in a single env file. Copy `client.env.example` and edit. The defaults work for local dev out of the box.

Key fields:

- **`CLIENT_NAME`** — shown in masthead
- **`CLIENT_PRIMARY_COLOUR`** — optional CSS brand colour
- **`INGEST_API_KEY`** — the `X-API-Key` that STEP OIE must send
- **`JWT_SECRET_KEY`** — change for any deployment beyond local dev
- **`SMTP_*`** — optional, for email notifications
- **`SLACK_DEFAULT_WEBHOOK_URL`** — optional, for Slack notifications
- **`MAX_USERS`** — hard cap on user count (default 10)

---

## STEP integration

Configure an **Event-Based OIEP** in STIBO STEP workbench:

- Delivery Transport: **Web Service (HTTP)**
- URL: `https://<your-host>/api/v1/ingest`
- Method: `POST`
- Content-Type: `application/xml`
- Custom header: `X-API-Key: <matching-INGEST_API_KEY>`
- Delta mode: **enabled**

Official docs: <https://doc.stibosystems.com/doc/version/latest/web/content/dataexc/oiep/oieps.html>

---

## Frontend pages

| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | JWT auth. Pre-filled with bootstrap credentials for local dev. |
| Dashboard | `/` | Main screen. Filter bar + change grid with colour-coded change-type badges + pagination. Click any row for side-by-side diff. |
| Ingests | `/snapshots` | History of every STEPXML payload received, with status, parse counts, error logs. Auto-refreshes every 5 s. |
| Alerts | `/notifications` | Create and manage notification rules (email or Slack). Rules can target a specific change type, attribute, qualifier — or match everything. |

The aesthetic is **editorial / newspaper masthead**: IBM Plex Serif headlines, Plex Mono labels, off-white paper background with subtle noise overlay, sharp 4-px offset shadows that collapse on hover, navy/amber/sage/rose accents that map to add/modify/remove/move change variants. Distinctive, intentional, not AI-generic.

---

## Local testing without STEP

You don't need a live STEP instance. The included `sample_stepxml_payload.xml` is validated against the real STIBO STEP XSD and exercises 12 of the 18 change-element types (35 events total).

To see change-records populate:

1. POST the sample (creates baseline — all rows inserted as `PRODUCT_CREATED`, `ASSET_LINKED`, etc.)
2. Edit the sample (change a value, add a reference, rename the product)
3. POST again — the diff engine will emit `ATTRIBUTE_VALUE`, `REFERENCE_ADDED`, `PRODUCT_NAME_CHANGED` records with both `current_value` and `previous_value` populated

---

## Local development (no Docker)

If you'd rather run the API and tests directly on the host:

```bash
# Backend
cd backend
python -m venv venv
source venv/Scripts/activate         # Windows-bash; on POSIX use venv/bin/activate
pip install -r requirements.txt
cp ../client.env.example ../client.env  # then fill in BOOTSTRAP_* + secrets
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend
cd frontend
npm install
npm run dev      # Vite on http://localhost:5173
```

### Running the test suite

```bash
cd backend
source venv/Scripts/activate
python -m pytest                     # 53 tests, ~1 min
python -m pytest tests/test_auth.py  # auth-only — login, tokens, forgot-pw, refresh
```

The test conftest spins up a fresh in-memory SQLite per test and resets
the in-process login rate-limit bucket so tests can log in repeatedly
without hitting the 10/min cap.

---

## Useful SQL

```sql
-- Breakdown of event types from the last snapshot
SELECT change_element_type, COUNT(*)
FROM change_records
WHERE snapshot_id = (SELECT id FROM snapshots ORDER BY received_at DESC LIMIT 1)
GROUP BY change_element_type
ORDER BY 2 DESC;

-- Full timeline for one product
SELECT change_date, change_element_type, attribute_id,
       previous_value, current_value
FROM change_records
WHERE step_product_id = 'KS-FR-KROC-100-MLA-1000'
ORDER BY change_date DESC;
```

---

## License

Internal / confidential. Not for distribution.
