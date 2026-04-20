# Deployment Guide — Free Tier (Render + Vercel)

Split deployment: **Backend/DB/Redis/Worker on Render**, **Frontend on Vercel**.

---

## 0. Prerequisites

- GitHub repo containing this project (push the `change-tracker/` tree to it).
- Render account: https://render.com
- Vercel account: https://vercel.com

---

## 1. Deploy backend to Render (via Blueprint)

The repo already contains [`render.yaml`](render.yaml), which defines four resources:
- `changetracker-db` — Postgres (free)
- `changetracker-redis` — Redis (free)
- `changetracker-api` — FastAPI web service (Docker, free)
- `changetracker-worker` — Celery worker (Docker, free)

Steps:

1. In Render dashboard → **New → Blueprint**.
2. Connect your GitHub repo. Render auto-detects [`render.yaml`](render.yaml).
3. Click **Apply**. Render creates all four resources.
4. When prompted for `sync: false` env vars, fill these on the **api** service:
   - `BOOTSTRAP_ADMIN_EMAIL` → e.g. `admin@yourco.com`
   - `BOOTSTRAP_ADMIN_PASSWORD` → strong password (≥12 chars)
   - `BOOTSTRAP_EDITOR_EMAIL` / `BOOTSTRAP_EDITOR_PASSWORD` (optional)
   - `BOOTSTRAP_VIEWER_EMAIL` / `BOOTSTRAP_VIEWER_PASSWORD` (optional)
   - `ALLOWED_ORIGINS` → leave blank for now; set in step 3.
   - SMTP / Slack vars → leave blank unless you have them.
5. Wait for first deploy. The api service URL will look like
   `https://changetracker-api-xxxx.onrender.com`. **Copy it.**
6. Hit `https://changetracker-api-xxxx.onrender.com/docs` — Swagger UI should load.

> Free Postgres on Render expires after 90 days. Free web services sleep after 15 min idle (first request after sleep takes ~30 s).

---

## 2. Deploy frontend to Vercel

1. Edit [`frontend/vercel.json`](frontend/vercel.json) — replace
   `REPLACE-ME-render-api.onrender.com` with the real Render api hostname from step 1.5.
   Commit and push.
2. Vercel dashboard → **Add New → Project** → import the repo.
3. In the import screen:
   - **Root Directory:** `change-tracker/frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
4. Click **Deploy**. You'll get a URL like `https://changetracker-xxxx.vercel.app`.

---

## 3. Wire CORS back to the frontend

1. Render → `changetracker-api` → Environment → edit `ALLOWED_ORIGINS`:
   ```
   https://changetracker-xxxx.vercel.app
   ```
   (comma-separate multiple origins if needed.)
2. Save — Render redeploys automatically.

---

## 4. Log in

1. Open the Vercel URL.
2. Log in with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
3. You'll be prompted to change the password on first login.

---

## 5. Smoke-test ingest

```bash
curl -X POST https://changetracker-api-xxxx.onrender.com/api/v1/ingest \
  -H "X-API-Key: <INGEST_API_KEY from Render dashboard>" \
  -H "Content-Type: application/xml" \
  --data-binary @sample_stepxml_payload.xml
```

Expected: `HTTP 202` + `snapshot_id`. Check the Render worker logs to see Celery pick it up, then refresh the dashboard.

---

## 6. Resetting the DB on Render

From Render → `changetracker-api` → **Shell**:
```bash
alembic downgrade base && alembic upgrade head
```
Then restart the api service (bootstrap re-seeds users from env vars).

Or, destructively: delete the `changetracker-db` database from the Render dashboard and re-apply the blueprint.

---

## 7. Adding another client (tenant)

This app is single-tenant per deployment. For a new client:
1. Fork/branch the repo (or reuse it with a new blueprint name).
2. In Render, create a second Blueprint instance with different resource names — or duplicate `render.yaml` under a different name.
3. Set a unique `INGEST_API_KEY`, `JWT_SECRET_KEY`, `CLIENT_NAME`, branding, and bootstrap admin email.
4. Deploy a matching Vercel project pointed at the new api hostname.

---

## 8. Migrating to Azure later

Same topology, Azure equivalents:
- **api + worker + frontend** → Azure Container Apps (or App Service for Containers).
- **Postgres** → Azure Database for PostgreSQL Flexible Server.
- **Redis** → Azure Cache for Redis.
- Env vars → Container App secrets.
- Frontend → still Vercel, or Azure Static Web Apps with the same rewrite.
