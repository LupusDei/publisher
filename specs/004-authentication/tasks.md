# Tasks — Authentication & User Sessions

> TDD-shaped (Rule 1). `[P]` = parallelizable (different files).

## Phase 1 — users + store + hashing (`85q.1`)
- [ ] **T001** [scaffold] Add `bcryptjs` (+ `@types/bcryptjs`) and `jsonwebtoken` (+ types) to backend deps.
- [ ] **T002a** Write failing tests in `shared/tests/unit/user.test.ts` for `User`, `Role`, `Credentials`, `AuthResult` schemas (valid/invalid/edge; `passwordHash` never in `User`). RED.
- [ ] **T002b** Implement `shared/src/contracts/user.ts` + export from index. GREEN.
- [ ] **T003a** Write failing tests in `backend/tests/unit/password.test.ts`: `hash` then `verify` round-trips; wrong password fails. RED.
- [ ] **T003b** Implement `backend/src/auth/password.ts` (bcryptjs wrapper). GREEN.
- [ ] **T004a** Write failing tests in `backend/tests/unit/user-store.test.ts`: create/getByEmail/getById/setPassword; duplicate email rejected; in-memory SQLite. RED.
- [ ] **T004b** Author `backend/migrations/0003_users.sql` + implement `backend/src/stores/user.store.ts`. GREEN.

## Phase 2 — auth service + JWT (`85q.2`)
- [ ] **T005a** Write failing tests in `backend/tests/unit/jwt.test.ts`: `sign` → `verify` round-trips `{userId, role}`; tampered/garbage token rejected; respects `AUTH_JWT_SECRET`. RED.
- [ ] **T005b** Implement `backend/src/auth/jwt.ts` + add `AUTH_JWT_SECRET` to `config/env.ts` (fail-fast). GREEN.
- [ ] **T006a** Write failing tests in `backend/tests/unit/auth-service.test.ts`: `register` (hashes, returns token+user, dup → error), `login` (valid → token, invalid → error), `me`. 3+/method. RED.
- [ ] **T006b** Implement `backend/src/services/auth.service.ts`. GREEN.

## Phase 3 — routes + middleware (`85q.3`)
- [ ] **T007a** Write failing tests in `backend/tests/unit/auth-middleware.test.ts`: `requireAuth` sets `req.user` from a valid Bearer, 401 on missing/invalid; `requireAdmin` 403 for non-admin. RED.
- [ ] **T007b** Implement `backend/src/auth/middleware.ts`. GREEN.
- [ ] **T008a** Write failing tests in `backend/tests/integration/auth-routes.test.ts` (compose a test app with the auth router): register → 201 {token,user}; login → 200/401; `GET /auth/me` with Bearer; logout → 200. 2+/route. RED.
- [ ] **T008b** Implement `backend/src/routes/auth.ts`; register via the router registry. GREEN.

## Phase 4 — per-user ownership (`85q.4`)
- [ ] **T009a** Write failing tests: persona/run create stamps `userId`; list/get filter by owner (404/403 on others'); admin sees all. (`backend/tests/unit/ownership.test.ts` + route integration). RED.
- [ ] **T009b** Migration adds `user_id` to `personas` + `runs`; update persona/run stores + Track A/G routes to require auth + scope by `req.user`. Keep existing tests green (seed/compose pass a userId). GREEN.

## Phase 5 — frontend (`85q.5`)
- [ ] **T010** Build `frontend/app/login/page.tsx` + an auth context (`frontend/app/auth/`): write failing RTL tests first → RED → implement login/register form, token storage, a fetch wrapper attaching `Authorization: Bearer`, logout, and an onboarding password field → GREEN. Intentional loading/error states.

## Phase 6 — admin seed (`85q.6`)
- [ ] **T011** [docs/scaffold] `backend/scripts/seed-admin.ts` — create an admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotent); note in README + `.env.example`.

## Exit
Register-with-password → login → scoped personas/runs → logout works; admin passes `requireAdmin`; full suite + coverage green; MVP flows work behind auth.
