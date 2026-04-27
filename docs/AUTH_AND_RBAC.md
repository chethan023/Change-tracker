# Authentication, First-Login Password Change & RBAC

**Release:** 2026-04-25
**Scope:** Backend (FastAPI) + Frontend (React/Vite) + SQLite/Postgres schema

## What changed in 2026-04-25

- **Case-insensitive email** at login + user creation (server normalises on
  read and write).
- **Server-side token revocation** via `users.tokens_invalidated_at`. JWTs
  carry `iat` and are rejected when `iat < tokens_invalidated_at`.
  Triggered by `/auth/logout`, `/auth/change-password`, and admin reset.
- **`POST /auth/logout`** — revokes all tokens for the calling user.
- **`POST /auth/refresh`** — re-issues a fresh access token.
- **Forgot-password flow** (`/auth/forgot-password` + `/auth/reset-password`)
  with single-use, 30-minute, sha256-hashed tokens.
- **Multi-tab session sync** — login/logout in one tab now propagates to
  other tabs via the `storage` event.
- **Login page redirects** to home (or `/change-password`) when the user
  is already authenticated.
- **Distinct 401 markers**: `token_expired`, `token_revoked`, `Invalid token`.
- **Admin-editable client config** at `PATCH /api/v1/config` (logo, brand
  colour, STEP base URL, client name).

This document describes the authentication model, the forced first-login
password-change flow, the new User Management console, and how role-based
access control (RBAC) is enforced end-to-end. It is the reference for QA,
deployment, and future maintenance.

---

## 1. Overview

The Change Tracker application authenticates users with email + password,
issues JWT access tokens, and restricts admin functionality with explicit
role guards. Newly provisioned or admin-reset users are forced to change
their password before they can reach any data.

Three changes were introduced in this release:

| # | Feature | Status |
|---|---------|--------|
| 1 | `must_change_password` flag on users + forced change flow | Implemented |
| 2 | User Management admin console (create / update / delete / reset) | Implemented |
| 3 | End-to-end RBAC with admin guards and role-gated UI | Implemented |

---

## 2. Roles

Defined in [`backend/app/schemas/schemas.py`](../backend/app/schemas/schemas.py)
as an `Enum`:

| Role   | Description                                                         |
|--------|---------------------------------------------------------------------|
| admin  | Full access. Can manage users, reset passwords, change roles.       |
| editor | Authenticated data access; intended for write-capable workflows.    |
| viewer | Authenticated read-only access to changes / products / snapshots.   |

Roles are stored as a string on `users.role` and embedded in the JWT as
`role` for stateless checks on the frontend and backend.

---

## 3. Authentication flow

### 3.1 Login

`POST /api/v1/auth/login`

**Request**
```json
{ "email": "viewer@uom.local", "password": "ViewerPass!2026" }
```

**Response — TokenResponse**
```json
{
  "access_token": "<JWT>",
  "token_type": "bearer",
  "user_id": 4,
  "email": "viewer@uom.local",
  "role": "viewer",
  "must_change_password": false
}
```

- Rate-limited per IP and per email (configurable via
  `LOGIN_RATE_LIMIT_PER_MIN`; defaults to on).
- `must_change_password: true` signals that the frontend must redirect
  the user to `/change-password` before any other screen renders.

### 3.2 Change password (self-service)

`POST /api/v1/auth/change-password` — requires bearer token.

**Request**
```json
{ "current_password": "…", "new_password": "…" }
```

Validation:

- `new_password` length: 12–128 characters (enforced by Pydantic).
- `new_password` must differ from `current_password` (400 otherwise).
- `current_password` must match the stored hash (400 otherwise).

On success (HTTP 204): the user's password is re-hashed with bcrypt and
`must_change_password` is cleared. The existing JWT remains valid.

### 3.3 Logout

`POST /api/v1/auth/logout` — bumps the user's `tokens_invalidated_at`,
which invalidates **every** access token issued before the logout. The
frontend also clears `localStorage` so the local UI state matches.

The frontend `logout()` helper fires the request asynchronously and clears
local state immediately, so the UI is responsive even if the network is
slow.

### 3.4 Refresh

`POST /api/v1/auth/refresh` — requires a currently-valid bearer token.
Returns a new `TokenResponse` with a fresh `iat`/`exp`. There is no
separate refresh-token; clients are expected to call this before
`JWT_EXPIRE_MINUTES` elapses if they want to keep the session open.

### 3.5 Forgot password

`POST /api/v1/auth/forgot-password` (email) → always returns 200 to avoid
enumeration. If the email matches an active user, a single-use,
sha256-hashed reset token is generated, stored in
`password_reset_tokens`, and emailed via SMTP. **When `SMTP_HOST` is
unset (dev/local)**, the response includes `reset_url` so an admin can
hand the link out manually. Token TTL: 30 minutes (one constant in
`routers/auth.py`).

`POST /api/v1/auth/reset-password` (token, new_password) — validates the
token (unexpired, unused), sets the new password, marks the token used,
and bumps `tokens_invalidated_at`.

### 3.6 Token lifecycle (recap)

| State    | Cause                                                | Server response detail |
|----------|------------------------------------------------------|------------------------|
| created  | login / refresh / first set                          | `200 TokenResponse`    |
| valid    | `iat >= user.tokens_invalidated_at` and `exp > now`  | request proceeds       |
| expired  | `exp <= now`                                         | `401 token_expired`    |
| revoked  | `iat < user.tokens_invalidated_at`                   | `401 token_revoked`    |
| invalid  | bad signature / malformed                            | `401 Invalid token`    |

---

## 4. The `must_change_password` flag

### 4.1 Data model

`users.must_change_password` — `Boolean NOT NULL DEFAULT FALSE`.

- Added in migration
  [`002_user_must_change_password.py`](../backend/app/migrations/versions/002_user_must_change_password.py).
- Idempotent: the migration inspects the column set first, so re-running
  against a pre-migrated database is safe.
- Set to `TRUE` by two server-side operations:
  1. `POST /api/v1/users` (admin creates a user).
  2. `POST /api/v1/users/{id}/reset-password` (admin resets a user).
- Cleared by `POST /api/v1/auth/change-password` when the user sets a
  new password.

### 4.2 Backend enforcement

`backend/app/dependencies.py` defines two user-resolving dependencies:

| Dependency                  | Behavior when `must_change_password=True` |
|-----------------------------|-------------------------------------------|
| `get_current_user`          | Rejects with **403 `password_change_required`** |
| `get_current_user_flex`     | Same (used for download endpoints)        |
| `get_current_user_pending`  | Allows through — used **only** by `/auth/change-password` and `/users/me` |

All business endpoints use `get_current_user` (or `require_admin`, which
wraps it), so a pending user is locked out of every route except the two
endpoints needed to complete the change.

### 4.3 Frontend enforcement

Three complementary mechanisms:

1. **Login redirect** — [`pages/Login.tsx`](../frontend/src/pages/Login.tsx)
   reads `must_change_password` from the login response and navigates to
   `/change-password` when set.
2. **Route guard** — [`App.tsx`](../frontend/src/App.tsx) wraps the
   authenticated layout with `<Guard>`, which checks the persisted
   `mustChangePassword` flag and redirects if still pending.
3. **API interceptor** — [`lib/api.ts`](../frontend/src/lib/api.ts)
   catches any `403` with
   `detail === "password_change_required"` from any endpoint and
   force-navigates to `/change-password`. This handles edge cases
   (stale tab, admin reset mid-session) where the UI state is out of
   sync with the server.

The flag is persisted under `ct_must_change` in `localStorage` so a page
reload keeps the enforcement intact.

### 4.4 UI

`/change-password` page:

- Three fields: current password, new password, confirm.
- Frontend validation mirrors backend: ≥ 12 chars, confirmation match,
  must differ from current.
- Provides a "Sign out" escape hatch.
- Once accepted, clears the local flag and routes to `/`.

---

## 5. User Management console

**Route:** `/users` (admin only — see [`AdminGuard`](../frontend/src/App.tsx))
**Page:** [`frontend/src/pages/Users.tsx`](../frontend/src/pages/Users.tsx)
**Navigation:** the **Users** nav item is rendered only when `role === "admin"`.

### 5.1 Capabilities

| Action              | Endpoint                              | Notes |
|---------------------|---------------------------------------|-------|
| List users          | `GET /api/v1/users`                   | Shows email, role, active, must-change flag, last-login |
| Create user         | `POST /api/v1/users`                  | Admin supplies temp password (≥12 chars); new user gets `must_change_password=true` |
| Change role         | `PATCH /api/v1/users/{id}`            | Cannot demote self; dropdown disabled for own row |
| Toggle active       | `PATCH /api/v1/users/{id}`            | Cannot deactivate self |
| Reset password      | `POST /api/v1/users/{id}/reset-password` | Sets new temp password + `must_change_password=true` |
| Delete user         | `DELETE /api/v1/users/{id}`           | Cannot delete self |

### 5.2 Self-protection

All self-destructive actions are blocked in **two layers**:

- **Backend** — `PATCH`, `DELETE` return HTTP 400 if `user.id == admin.id`
  and the change would demote/deactivate/delete the caller.
- **Frontend** — the relevant controls are disabled for the caller's own row.

### 5.3 User creation hand-off

The admin is responsible for communicating the temp password to the user
over a secure channel. The banner that appears after creation reminds the
admin that the user will be forced to change on first login. There is
currently no email delivery of the temp password — this can be added via
the notifications subsystem in a future release.

### 5.4 Deployment cap

`settings.MAX_USERS` (default 10) caps the total number of users per
deployment. Attempting to exceed the cap returns **HTTP 403**.

---

## 6. RBAC matrix

Guards are declared per endpoint in `backend/app/routers/*.py`.

| Endpoint                                       | Guard                         | Roles allowed     |
|------------------------------------------------|-------------------------------|-------------------|
| `POST /api/v1/auth/login`                      | public (rate-limited)         | any               |
| `POST /api/v1/auth/forgot-password`            | public (rate-limited)         | any               |
| `POST /api/v1/auth/reset-password`             | public (token-gated)          | any               |
| `POST /api/v1/auth/logout`                     | `get_current_user_pending`    | any authenticated |
| `POST /api/v1/auth/refresh`                    | `get_current_user`            | any authenticated |
| `POST /api/v1/auth/change-password`            | `get_current_user_pending`    | any authenticated |
| `PATCH /api/v1/config`                         | `require_admin`               | admin             |
| `GET /api/v1/users/me`                         | `get_current_user_pending`    | any authenticated |
| `GET /api/v1/users`                            | `require_admin`               | admin             |
| `POST /api/v1/users`                           | `require_admin`               | admin             |
| `PATCH /api/v1/users/{id}`                     | `require_admin`               | admin             |
| `POST /api/v1/users/{id}/reset-password`       | `require_admin`               | admin             |
| `DELETE /api/v1/users/{id}`                    | `require_admin`               | admin             |
| `GET /api/v1/changes`                          | `get_current_user`            | any authenticated |
| `GET /api/v1/changes/{id}`                     | `get_current_user`            | any authenticated |
| `GET /api/v1/filters/options`                  | `get_current_user`            | any authenticated |
| `GET /api/v1/export/csv`                       | `get_current_user_flex`       | any authenticated |
| `GET /api/v1/products`                         | `get_current_user`            | any authenticated |
| `GET /api/v1/products/{id}`                    | `get_current_user`            | any authenticated |
| `GET /api/v1/products/{id}/timeline`           | `get_current_user`            | any authenticated |
| `GET /api/v1/snapshots`                        | `get_current_user`            | any authenticated |
| `GET/POST/DELETE /api/v1/notifications`        | `get_current_user`            | any authenticated (user-scoped) |
| `POST /api/v1/ingest`                          | `require_api_key`             | server-to-server only |
| `GET /api/v1/config`                           | public                        | any               |
| `GET /api/v1/health`                           | public                        | any               |

Notifications are scoped by `user_id` in every query, so a user cannot
see or modify another user's rules.

### 6.1 Why editor and viewer are not distinct in read endpoints

The current data endpoints are read-only (ingest is the only write path,
and it is server-to-server). `editor` and `viewer` therefore have the
same practical privileges today. Should a future feature require
`editor`-only writes, the existing `require_editor` dependency in
`dependencies.py` can be attached per-endpoint without any new scaffolding.

---

## 7. Frontend architecture

### 7.1 Auth store

[`frontend/src/lib/auth.ts`](../frontend/src/lib/auth.ts) — a Zustand
store persisted to `localStorage`:

```ts
{
  token, userId, email, role,
  mustChangePassword,
  setAuth, clearMustChangePassword, logout,
  isAuthed(), isAdmin(), isEditor()
}
```

### 7.2 Route structure

```
/login                    — public
/change-password          — requires auth only (bypasses mustChangePassword guard)
/                         — requires auth + password current
  /products
  /products/:id
  /snapshots
  /notifications
  /users                  — requires admin (AdminGuard)
```

### 7.3 401/403 handling

`axios` interceptor in [`lib/api.ts`](../frontend/src/lib/api.ts):

- `401` → clear token, redirect to `/login` (unless already on a public
  route: `/login`, `/forgot-password`, `/reset-password`).
- `403 password_change_required` → redirect to `/change-password`.
- all other errors → propagate to caller.

### 7.4 Multi-tab consistency

The auth store ([`lib/auth.ts`](../frontend/src/lib/auth.ts)) attaches a
`storage` listener at module load. When any auth-related localStorage key
changes in another tab, the store re-syncs. Result: logging out (or
logging in) in one tab is reflected in every other open tab on the next
render — no manual refresh.

### 7.5 Routes added in this release

```
/forgot-password    — public
/reset-password     — public (consumes ?token=…)
```

Both routes are listed in `PUBLIC_PATHS` inside the axios interceptor so
a 401 from the API doesn't bounce the user back to /login mid-flow.

---

## 8. Database migration

### 8.1 Running the migration

```bash
cd backend
venv/Scripts/python.exe -m alembic upgrade head
```

This applies:

1. `001_initial` — original schema (no-op if already applied).
2. `002_user_must_change_password` — adds the column.
3. `003_notification_rule_multi` — multi-value notification filters.
4. `004_change_records_perf_indexes` — composite indexes that back the
   default `change_date desc` ordering across hot filters.
5. `005_user_tokens_invalidated_at` — server-side token revocation column.
6. `006_password_reset_tokens` — table backing the forgot-password flow.

### 8.2 Rollback

```bash
venv/Scripts/python.exe -m alembic downgrade 001_initial
```

The downgrade drops the column via `batch_alter_table` (safe on SQLite).

### 8.3 Existing data

For users created before this release, the migration sets
`must_change_password = FALSE`. **These users will not be forced to change
their password automatically.** If you want to force password rotation
across all existing users, either:

- Run a one-off SQL: `UPDATE users SET must_change_password = 1;`, or
- Use the admin console to reset each user individually.

Seeded (bootstrap) users from `client.env` also default to
`FALSE` — their credentials come from the deployment environment and are
assumed to already be trusted.

---

## 9. Security notes

- Passwords are hashed with bcrypt (`app/services/auth.py`).
- JWTs are signed with `JWT_SECRET_KEY`; non-development deployments
  refuse to boot with a weak or default secret.
- No endpoint ever returns a password hash. `UserOut` intentionally
  omits the hash.
- CSV export uses a short-lived JWT query param (`_t=`) so `<a href>`
  downloads work while remaining authenticated — the same dependency
  chain (`get_current_user_flex`) still rejects pending users.
- Rate-limiting on login prevents credential-stuffing at the
  per-IP / per-email level.

---

## 10. Testing checklist

Manual checks QA should run per role (smoke):

### Admin
- [ ] Log in → lands on `/` (Changes dashboard).
- [ ] Nav shows **Users** item.
- [ ] `/users` page loads and lists all users.
- [ ] Create a new user; banner confirms; user appears in list with
      "must change PW = yes".
- [ ] Change another user's role; the select reflects the new value.
- [ ] Toggle another user's active flag; chip updates.
- [ ] Try to demote / deactivate / delete yourself → blocked (button
      disabled or backend 400).
- [ ] Reset another user's password; banner confirms; flag becomes "yes".
- [ ] Delete another user (with confirmation); row disappears.

### Editor
- [ ] Log in → lands on `/`.
- [ ] **Users** nav item is hidden.
- [ ] Typing `/users` into the URL bar redirects to `/`.
- [ ] All data pages (Changes / Products / Snapshots / Alerts) load.

### Viewer
- [ ] Same as Editor today (read-only distinction is a future feature).

### First-login flow
- [ ] Admin creates `qa-test@…` with temp password.
- [ ] Sign out, sign in as `qa-test@…` → lands on `/change-password`.
- [ ] Try to navigate to `/` → bounced back to `/change-password`.
- [ ] Submit mismatched confirmation → form error.
- [ ] Submit same as current → backend error surfaced.
- [ ] Submit valid new password → lands on `/` and can navigate freely.
- [ ] Sign out, sign back in with the new password → lands on `/`
      directly (no forced change).

### Dark mode (from prior release)
- [ ] Toggle to dark mode; filter labels, placeholders, and dropdown
      values are all legible.
- [ ] Hard-reload the page; theme persists without a flash of light
      content.

---

## 11. Known limitations / follow-ups

1. **Password policy** is enforced only as length (≥ 12). Complexity
   rules (mixed case, digits, symbols) are not checked.
2. **Password history** is not retained; users may re-use the previous
   password after a second change.
3. **Lockout** — failed logins are rate-limited but do not lock the
   account.
4. **Email delivery** of temp passwords is not automated; admin must
   communicate the password out-of-band.
5. **MFA** is not implemented.
6. **Audit log** of admin actions (role changes, resets, deletions) is
   not captured to `change_records` or a dedicated log.

These are candidates for subsequent hardening work.

---

## 12. File reference

| Concern                      | Path                                                  |
|------------------------------|-------------------------------------------------------|
| User model                   | `backend/app/models/base_models.py`                   |
| Migration                    | `backend/app/migrations/versions/002_user_must_change_password.py` |
| Pydantic schemas             | `backend/app/schemas/schemas.py`                      |
| Auth router                  | `backend/app/routers/auth.py`                         |
| Users router                 | `backend/app/routers/users.py`                        |
| Shared dependencies          | `backend/app/dependencies.py`                         |
| Auth store (FE)              | `frontend/src/lib/auth.ts`                            |
| API client (FE)              | `frontend/src/lib/api.ts`                             |
| Login page                   | `frontend/src/pages/Login.tsx`                        |
| Change-password page         | `frontend/src/pages/ChangePassword.tsx`               |
| Users admin page             | `frontend/src/pages/Users.tsx`                        |
| Route guards                 | `frontend/src/App.tsx`                                |
| Navigation (role gating)     | `frontend/src/components/Layout.tsx`                  |
