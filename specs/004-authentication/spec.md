# Spec — Authentication & User Sessions (Epic `publisher-85q`)

> **Owner:** Tassadar · **Master plan:** `../002-publisher-mvp/OVERVIEW.md` · **Decisions:** `../002-publisher-mvp/ASSUMPTIONS.md`
> Gates Epic 5 (observability pages) — both per-user scoping and the admin role come from here.

## Problem
Publisher has no notion of a user. Personas and runs are global, there's no login, and the observability pages (Epic 5) need **per-user data** and an **admin role**. We need general authentication: register + set a password during onboarding, log in, log out, and a session that scopes a user's personas/runs and gates admin-only views.

## Non-Goals
- OAuth / social login / email verification flows (out of scope for the MVP; username/email + password only).
- Password reset emails (a later epic; `setPassword` exists at the store level).
- Fine-grained RBAC beyond `user` | `admin`.

## Locked decisions (rationale in notes)
- **JWT bearer tokens**, not cookies. The deployed topology is a Vercel frontend → ngrok backend (cross-origin); cross-site cookies need `SameSite=None; Secure` + credentialed CORS and are fragile through a tunnel. A signed JWT (HS256, `AUTH_JWT_SECRET`) returned on login and sent as `Authorization: Bearer` is clean across origins and stateless. *(Trade-off: no server-side revocation list for the MVP; short-lived tokens + re-login.)*
- **bcryptjs** for hashing (pure-JS, no native build step — avoids CI/deploy friction).
- **Roles:** `user` (default) and `admin` (seeded). `requireAuth` + `requireAdmin` middleware.
- **Ownership:** `personas` and `runs` get a `userId`; create stamps the authed user; list/get filter by it (admin sees all).

## User Stories

### US1 — Register & set a password during onboarding (Priority: P1) — beads `85q.1`, `85q.2`, `85q.3`, `85q.5`
**As** a new user, **I want** to create an account with an email + password during onboarding, **so that** my work is mine.
**Acceptance:** `POST /auth/register {email, password}` → creates a user (bcrypt-hashed), returns `{token, user}`; duplicate email → structured 409; weak/empty input → 400. The onboarding UI captures a password and registers before persona creation.

### US2 — Log in / log out (Priority: P1) — beads `85q.3`, `85q.5`
**As** a returning user, **I want** to log in and log out.
**Acceptance:** `POST /auth/login {email, password}` → `{token, user}` on valid creds, 401 on invalid; `GET /auth/me` (Bearer) → the current user; `POST /auth/logout` → client clears the token (stateless). The frontend stores the token and attaches `Authorization: Bearer` to every API call; logout clears it and returns to the login view.

### US3 — My work is scoped to me (Priority: P1) — bead `85q.4`
**As** a user, **I want** to only see my own personas and runs.
**Acceptance:** persona/run create stamps `req.user.id`; list/get/PATCH filter by it and 404/403 on others' resources; an `admin` sees all. All persona/run routes require auth.

### US4 — Admin role exists (Priority: P2) — beads `85q.3`, `85q.6`
**As** the system, **I want** an `admin` role + a seeded admin user, **so that** the admin observability page (Epic 5) has an admin to authenticate as.
**Acceptance:** `requireAdmin` rejects non-admins with 403; a seed script creates an admin from env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), idempotent.

## Success Criteria
- A user registers (with password) → logs in → only sees their personas/runs → logs out. An admin can authenticate and pass `requireAdmin`. Full suite green; coverage gate holds; the existing MVP flows work behind auth.
