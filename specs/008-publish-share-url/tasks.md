# Tasks — Publish to Shareable Preview URL (`publisher-share`)

> **Feature:** 008-publish-share-url · **Generated:** 2026-06-13
> Markers: `[P]` = parallelizable (different files, no dep) · `[US#]` = user story ·
> `[setup]`/`[docs]` = TDD-exempt. Every other task is TDD-shaped (Shape A split or
> Shape B explicit RED→GREEN). Run `npx tsx scripts/audit-tasks-md.ts` to verify.

## Phase 1 — Foundational: slug + share store (sub-epic `share.1`)

- [ ] T001 [P] [setup] Add migration `backend/migrations/0005_shares.sql`: create `shares`
      table (id, slug UNIQUE, run_id FK→runs, owner_id nullable, created_at, revoked_at)
      and partial unique index `idx_shares_active_run` on `run_id WHERE revoked_at IS NULL`.

- [ ] T002a [P] [US1] Write failing tests for the slug generator in
      `backend/tests/unit/slug.test.ts`. Cover: produces a ≥16-char url-safe token
      (`^[A-Za-z0-9_-]{16,}$`), two calls differ (uniqueness over N draws), never equals an
      input runId. Confirm RED.
- [ ] T002b [US1] Implement `createSlug()` in `backend/src/util/slug.ts` using crypto-strong
      randomness over the url-safe alphabet. Run tests until GREEN.

- [ ] T003a [P] [US1] Write failing tests for the share contract in
      `frontend`/`shared` test path `shared/tests/contracts/share.test.ts`: `ShareSchema`
      parses a real DB-shaped row (slug, runId, ownerId, createdAt, revokedAt) and
      `ShareLinkSchema` parses `{ slug, url }`; rejects empty slug. Confirm RED.
- [ ] T003b [US1] Implement `shared/src/contracts/share.ts` (zod `ShareSchema`,
      `ShareLinkSchema`, inferred types). Run tests until GREEN.

- [ ] T004a [US1] Write failing tests for the share store in
      `backend/tests/unit/share-store.test.ts` against an in-memory SQLite DB with
      migrations applied. Cover: `create` returns a stored share; `getBySlug` round-trips;
      `getActiveByRun` ignores revoked rows; `revoke` sets `revoked_at`; the active-run
      unique index rejects a 2nd active share. Confirm RED.
- [ ] T004b [US1] Implement `backend/src/stores/share.store.ts` (`ShareStore` interface +
      `createShareStore(db, clock, idGen)`), SQL-only, validating rows via `ShareSchema`.
      Run tests until GREEN.

## Phase 2 — US1: mint + public serve (sub-epic `share.2`, depends `share.1`)

- [ ] T005a [US1] Write failing tests for the share service in
      `backend/tests/unit/share-service.test.ts`. Cover: mint on an owned `published` run
      returns `{slug,url}` using injected base URL; mint is idempotent (2nd call → same
      slug); mint on a non-`published` run throws `ShareConflictError`; mint on a run owned
      by another user throws `ShareForbiddenError`; `resolveBySlug` returns the runId for an
      active slug and null for revoked/unknown. Confirm RED.
- [ ] T005b [US1] Implement `backend/src/services/share.service.ts` (`createShareService({
      shareStore, runStore, slug, baseUrl })`) — ownership + published checks, idempotent
      mint, `resolveBySlug`, structured error classes. Run tests until GREEN. No SQL here.

- [ ] T006a [US1] Write failing integration tests for the mint route in
      `backend/tests/integration/share-mint.test.ts` via `createApp()` with test deps:
      `POST /runs/:id/share` on an owned published run → 200 `{slug,url}`; non-owner → 403;
      non-published run → 409; unauthenticated → 401. Confirm RED.
- [ ] T006b [US1] Implement `POST /runs/:id/share` in `backend/src/routes/share.ts`
      (auth + ownership via `runStore.ownerOf`, delegate to `shareService.mint`). Run tests
      until GREEN — thin handler, no logic.

- [ ] T007a [US1] Write failing integration tests for the public serve route in
      `backend/tests/integration/share-serve.test.ts`: `GET /p/:slug` for an active share →
      200 `text/html` body equal to the run's published HTML, NO auth header required;
      unknown slug → 404; malformed slug (too short / bad chars) → 404; missing Sink file →
      404. Confirm RED.
- [ ] T007b [US1] Implement the public `GET /p/:slug` router in
      `backend/src/routes/share.ts` (validate slug shape, `shareService.resolveBySlug` →
      `sink.read(runId)` → `res.type('html').send`, uniform 404). Run tests until GREEN.

- [ ] T008a [US1] Write failing test in `backend/tests/unit/composition.test.ts` (extend)
      asserting `composeRunDeps` exposes a constructed `shareStore` + `shareService`.
      Confirm RED.
- [ ] T008b [US1] Wire `shareStore`/`shareService` into `backend/src/composition.ts` and
      mount the `/runs` share routes + public `/p` router in `backend/src/server.ts`
      (passing `PUBLIC_BASE_URL`). Run tests until GREEN.

## Phase 3 — US2: gallery / run-detail UI (sub-epic `share.3`, depends `share.2`)

- [ ] T009a [P] [US2] Write failing tests for the share API client in
      `frontend/tests/unit/run-api-share.test.ts` (mock fetch): `createShare(runId)` POSTs
      and returns `{slug,url}`; `fetchShare(runId)` GETs the active share or null;
      `revokeShare(runId)` DELETEs. Confirm RED.
- [ ] T009b [US2] Implement `createShare` / `fetchShare` / `revokeShare` in
      `frontend/app/runs/run-api.ts` (authFetch, tolerant parsing). Run tests until GREEN.

- [ ] T010a [US2] Write failing tests for `ShareLink` in
      `frontend/tests/unit/ShareLink.test.tsx` (@testing-library/react): initial state shows
      "Get share link"; clicking calls `createShare` and renders the URL with a copy button;
      error state surfaces a message. Confirm RED.
- [ ] T010b [US2] Implement `frontend/components/ShareLink.tsx` (button → URL display +
      copy-to-clipboard + Open-in-new-tab). Run tests until GREEN.

- [ ] T011 [US2] Wire `ShareLink` into the gallery card and run-detail view. Phases: write a
      failing render test first in `frontend/tests/unit/gallery-sharelink.test.tsx` asserting
      each published card renders a `ShareLink` for its run → confirm RED → edit
      `frontend/app/runs/gallery/page.tsx` (and the run-detail view) → confirm GREEN.

## Phase 4 — US3: revoke (sub-epic `share.4`, depends `share.2`)

- [ ] T012a [US3] Write failing tests in `backend/tests/unit/share-service.test.ts` (extend)
      for `shareService.revoke`: revokes the active share for an owned run (idempotent
      no-op when none active); throws `ShareForbiddenError` for a non-owner. Confirm RED.
- [ ] T012b [US3] Implement `shareService.revoke` in
      `backend/src/services/share.service.ts`. Run tests until GREEN.

- [ ] T013a [US3] Write failing integration tests in
      `backend/tests/integration/share-revoke.test.ts`: `DELETE /runs/:id/share` (owner) →
      204 then `GET /p/:slug` → 404; non-owner DELETE → 403; DELETE with no active share →
      204 no-op. Confirm RED.
- [ ] T013b [US3] Implement `DELETE /runs/:id/share` in `backend/src/routes/share.ts`. Run
      tests until GREEN.

- [ ] T014 [US3] Add revoke toggle to `ShareLink`. Phases: write failing test first in
      `frontend/tests/unit/ShareLink-revoke.test.tsx` (active share → "Revoke link" calls
      `revokeShare`, reverts to "Get share link") → confirm RED → implement the toggle in
      `frontend/components/ShareLink.tsx` → confirm GREEN.

## Phase 5 — Polish: docs + e2e (sub-epic `share.5`, depends `share.3`, `share.4`)

- [ ] T015 [docs] Document the share flow + `PUBLIC_BASE_URL` ngrok dev recipe in
      `docs/` (and `backend/README` env section): how a dev exposes `/p/:slug` via ngrok,
      how prod points `PUBLIC_BASE_URL` at the real domain.

- [ ] T016 [US1] Write an e2e integration test in
      `backend/tests/integration/share-e2e.test.ts` that walks the full lifecycle on a
      real (mock-agent) published run: mint → `GET /p/:slug` 200 → revoke → `GET /p/:slug`
      404. Phases: write the failing e2e first → confirm RED → confirm GREEN once Phases
      2 & 4 are in. (Regression guard for the whole capability.)
