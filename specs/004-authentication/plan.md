# Plan — Authentication & User Sessions

> Phases map to `publisher-85q.x` beads.

## Architecture (layered, Rule 4)
- **Contracts:** add `User` + `Role` to `shared/` (`shared/src/contracts/user.ts`): `User {id, email, role, createdAt}` (never expose `passwordHash`); `Credentials`, `AuthResult {token, user}`.
- **Store:** `backend/src/stores/user.store.ts` — `create({email,passwordHash,role})`, `getByEmail`, `getById`, `setPassword`. Migration `0003_users.sql`.
- **Hashing:** `backend/src/auth/password.ts` — `hash`/`verify` via `bcryptjs` (small wrapper, swappable).
- **JWT:** `backend/src/auth/jwt.ts` — `sign({userId,role})`/`verify` (HS256, `AUTH_JWT_SECRET`).
- **Service:** `backend/src/services/auth.service.ts` — `register`, `login`, `me` (composes store + password + jwt).
- **Routes + middleware:** `backend/src/routes/auth.ts` (`/auth/register|login|logout|me`); `backend/src/auth/middleware.ts` — `requireAuth` (Bearer → `req.user`), `requireAdmin`.
- **Ownership:** migration adds `user_id` to `personas` + `runs`; persona/run stores + routes take an owner and filter by it; routes gain `requireAuth`.
- **Frontend:** `frontend/app/login`, an auth context (`frontend/app/auth/*`) holding the token, a fetch wrapper attaching `Authorization: Bearer`, onboarding password field, logout control.

## Architecture notes
- JWT keeps the backend stateless → works across the Vercel↔ngrok origin split (D11). `AUTH_JWT_SECRET` is a new required env (fail-fast in `config/env.ts`).
- Ownership is additive columns + a filter; admins bypass the filter. Keeps Pillar separation intact (auth is a cross-cutting middleware, not a pillar).

## Phases & parallelism
| Phase | Bead | Depends | Parallel with |
|---|---|---|---|
| 1 — users + store + hashing | 85q.1 | — | gu0.* (different lane) |
| 2 — auth service (JWT) | 85q.2 | 85q.1 | — |
| 3 — routes + middleware (requireAuth/Admin) | 85q.3 | 85q.2 | — |
| 4 — ownership (userId on personas+runs) | 85q.4 | 85q.1 | 85q.2/85q.3 |
| 5 — frontend login/logout/onboarding-password | 85q.5 | 85q.3 | — |
| 6 — admin seed | 85q.6 | 85q.1 | — |

**Lane (vs. parallel OTel epic):** `backend/src/auth/`, `routes/auth.ts`, `services/auth.service.ts`, `stores/user.store.ts`, the `user_id` migration + persona/run store+route edits, `shared/src/contracts/user.ts`, `frontend/app/{login,auth}` + onboarding. Avoid `backend/src/telemetry/` + `routes/admin*` (Kerrigan's lane).

## Bead Map
- `publisher-85q` — Authentication & User Sessions
  - `85q.1` users+store+hashing · `85q.2` auth service (JWT) · `85q.3` routes+middleware · `85q.4` ownership scoping · `85q.5` frontend · `85q.6` admin seed
