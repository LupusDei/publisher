# Publish to Shareable Preview URL — Beads

**Feature:** 008-publish-share-url · **Generated:** 2026-06-13 · **Source:** specs/008-publish-share-url/tasks.md
**Owner:** mengsk · **Epic:** `publisher-share`

## Root Epic
- **Title:** Publish to Shareable Preview URL · **Type:** epic · **Priority:** P1
- **Description:** From an approved gallery page, one action mints a public, unguessable,
  revocable Preview URL anyone can open. Serve via the existing Sink through
  PUBLIC_BASE_URL; no object storage / ngrok automation built (Sink seam keeps them future
  swaps). Spec: specs/008-publish-share-url/.

## Sub-Epics (phases)
| Phase | Title | Type | Pri | Depends | Bead |
|---|---|---|---|---|---|
| 1 | Foundational — slug + share store | epic | P1 | — | `share.1` |
| 2 | US1 — mint + public serve (MVP) | epic | P1 | `share.1` | `share.2` |
| 3 | US2 — gallery / run-detail UI | epic | P1 | `share.2` | `share.3` |
| 4 | US3 — revoke a share | epic | P2 | `share.2` | `share.4` |
| 5 | Polish — docs + e2e | epic | P2 | `share.3`,`share.4` | `share.5` |

## Tasks
| T-ID | Title | Path | Bead | Depends |
|---|---|---|---|---|
| T001 | [setup] migration 0005_shares.sql (shares table + active-run unique index) | `backend/migrations/0005_shares.sql` | `share.1.1` | — |
| T002 | [TDD] slug generator (url-safe, non-enumerable) | `backend/src/util/slug.ts` | `share.1.2` | — |
| T003 | [TDD] share contract (ShareSchema, ShareLinkSchema) | `shared/src/contracts/share.ts` | `share.1.3` | — |
| T004 | [TDD] share.store.ts (create/getBySlug/getActiveByRun/revoke) | `backend/src/stores/share.store.ts` | `share.1.4` | `share.1.1`,`share.1.3` |
| T005 | [TDD] share.service.ts (mint idempotent + ownership/published checks + resolveBySlug) | `backend/src/services/share.service.ts` | `share.2.1` | `share.1.2`,`share.1.4` |
| T006 | [TDD] POST /runs/:id/share route | `backend/src/routes/share.ts` | `share.2.2` | `share.2.1` |
| T007 | [TDD] public GET /p/:slug serve route | `backend/src/routes/share.ts` | `share.2.3` | `share.2.1` |
| T008 | [TDD] wire shareStore/shareService into composition + server | `backend/src/composition.ts`,`backend/src/server.ts` | `share.2.4` | `share.2.2`,`share.2.3` |
| T009 | [TDD] run-api createShare/fetchShare/revokeShare | `frontend/app/runs/run-api.ts` | `share.3.1` | `share.2.4` |
| T010 | [TDD] ShareLink component (URL + copy + open) | `frontend/components/ShareLink.tsx` | `share.3.2` | `share.3.1` |
| T011 | [TDD] wire ShareLink into gallery card + run detail | `frontend/app/runs/gallery/page.tsx` | `share.3.3` | `share.3.2` |
| T012 | [TDD] share.service.revoke | `backend/src/services/share.service.ts` | `share.4.1` | `share.2.1` |
| T013 | [TDD] DELETE /runs/:id/share route | `backend/src/routes/share.ts` | `share.4.2` | `share.4.1`,`share.2.4` |
| T014 | [TDD] ShareLink revoke toggle | `frontend/components/ShareLink.tsx` | `share.4.3` | `share.3.2`,`share.4.2` |
| T015 | [docs] PUBLIC_BASE_URL + ngrok dev recipe | `docs/`,`backend/README` | `share.5.1` | `share.2.4` |
| T016 | [TDD] e2e mint→serve→revoke→404 | `backend/tests/integration/share-e2e.test.ts` | `share.5.2` | `share.3.3`,`share.4.3` |

## Dependency summary
- Phase 1 internal: `share.1.4` ← (`share.1.1`, `share.1.3`).
- `share.2.1` ← (`share.1.2`, `share.1.4`); `share.2.2`/`share.2.3` ← `share.2.1`;
  `share.2.4` ← (`share.2.2`, `share.2.3`).
- Phase 3 chain: `share.3.1` ← `share.2.4` → `share.3.2` → `share.3.3`.
- Phase 4: `share.4.1` ← `share.2.1`; `share.4.2` ← (`share.4.1`, `share.2.4`);
  `share.4.3` ← (`share.3.2`, `share.4.2`).
- Phase 5: `share.5.1` ← `share.2.4`; `share.5.2` ← (`share.3.3`, `share.4.3`).
- Sub-epic deps mirror the phase table: `share.2`←`share.1`, `share.3`←`share.2`,
  `share.4`←`share.2`, `share.5`←(`share.3`,`share.4`).
