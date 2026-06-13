# Spec — Publish to Shareable Preview URL (Epic `publisher-share`)

> **Owner:** mengsk · **Created:** 2026-06-13 · **Design contract:** `../design/atelier.md`
> Builds on `publisher-rrt` (real runs that actually publish a page). Backend + frontend.

## Problem
When a concept passes research, the approval gate, and all guardrails and the user
approves it ("prove it"), the resulting page lands in the **gallery** where the owner
can view and download the HTML. But there is **no first-class way to share that page
with someone who is not logged in.**

The only public surface today is `GET /published/:id`, which:

1. **Keys on the raw internal `runId`** — enumerable and ownership-leaking. Anyone can
   probe `/published/<guessed-id>` to discover whether a run exists.
2. **Is implicitly always-open** — there is no explicit "publish/share" action, no
   record of what was shared, and **no way to revoke** access.
3. **Carries no share metadata** — no clean shareable link, no created/revoked
   timestamps, no owner binding for the share itself.

We want a deliberate capability: from a gallery item, **one action mints a public,
unguessable, revocable Preview URL** that anyone can open in a browser — so the owner
gets both the generated page *and* a link they can share.

## Locked decisions
- **Serve shared pages via the existing backend `Sink` through `PUBLIC_BASE_URL`.** The
  generated page is already a self-contained HTML file on disk; reuse it. Public
  reachability (an **ngrok** tunnel in dev, a real domain in prod) is an **operational**
  concern already handled by `PUBLIC_BASE_URL` — it is NOT application code.
- **No ngrok automation and no object storage (S3/R2) in this epic** (Constitution §8 —
  simplest first). The share-fetch path stays behind the `Sink` seam so a future
  object-storage `Sink` is a **drop-in swap**, not a rewrite.
- **Mint an unguessable, non-enumerable url-safe slug** (≥16 chars) per share — never the
  `runId`. Public route `GET /p/:slug` serves the self-contained HTML with **no auth**.
- **A share is a distinct concept from `run.status = "published"`.** A `shares` table maps
  `slug → runId` with `ownerId`, `createdAt`, `revokedAt`. Approving into the gallery
  (publish) ≠ sharing publicly (mint a URL). A run has at most one active share.
- **Shares are revocable.** Owner can revoke; `GET /p/:slug` then 404s. **No expiry/TTL**
  in the MVP — revoke covers the need.
- **Mint is idempotent.** Re-invoking share on a run with an active share returns the
  existing slug/URL, not a new one.

## Non-Goals
- No ngrok/tunnel automation, no S3/R2/object-storage backend, no managed static host in
  this epic (the `Sink` seam keeps them as future swaps).
- No time-based expiry / TTL on share links (revoke only).
- No password-protected or per-recipient shares; a shared link is public-to-anyone.
- No analytics/view-counting on shared pages (possible follow-up).
- No change to the approval/"prove it" flow or to the existing `/published/:id` route
  (it stays for the owner's authenticated gallery preview).

## User Stories

### US1 — Mint a shareable URL (Priority: P1, MVP) — beads `share.2`
**As** a user with an approved page in my gallery, **I want** one action that gives me a
public link, **so that** I can share the generated page with anyone, logged in or not.
**Acceptance:** `POST /runs/:id/share` on a run I own that is `published` returns
`{ slug, url }` where `url = ${PUBLIC_BASE_URL}/p/${slug}`. The public route
`GET /p/:slug` serves the run's self-contained HTML (`Content-Type: text/html`) with **no
auth**. Minting is **idempotent** — a second call returns the same active share. Minting a
run I do not own → 403; a run that is not `published` → 409; an unknown slug → 404.

### US2 — Copy and open the link in the gallery (Priority: P1) — beads `share.3`
**As** a user, **I want** the share link surfaced in the gallery and run-detail UI with a
one-tap copy, **so that** I can grab and send it without hunting.
**Acceptance:** the gallery card and run-detail view show a **"Get share link"** action;
on success the preview URL is displayed with **copy-to-clipboard** and an **Open** link
(new tab). Re-opening a run with an existing share shows that link (idempotent UI).

### US3 — Revoke a share (Priority: P2) — beads `share.4`
**As** a user, **I want** to revoke a link I previously shared, **so that** the page is no
longer publicly reachable.
**Acceptance:** `DELETE /runs/:id/share` (owner-only) revokes the active share;
`GET /p/:slug` then returns 404. The UI toggles between **"Get share link"** (no active
share) and **"Revoke link"** (active share). Revoking a run I do not own → 403.

## Edge Cases
- Mint on a non-`published` run (still researching/awaiting approval) → 409 Conflict, no
  share created.
- Mint on a run owned by someone else → 403, no leak of whether the run exists.
- `GET /p/:slug` for an unknown, malformed, or **revoked** slug → 404 (identical response —
  no oracle distinguishing revoked from never-existed).
- Underlying HTML file missing from the `Sink` (e.g. disk cleared) → 404, not a 500.
- Concurrent mint on the same run → exactly one active share (unique constraint), second
  call returns the first.
- Revoke when there is no active share → idempotent 204/no-op, not an error.

## Success Criteria
- A user can take an approved gallery page and, in one click, obtain a public URL that an
  anonymous browser (no JWT) loads successfully. (SC-001)
- The shared URL uses an unguessable slug, never the `runId`; probing `/published/:id` or
  `/p/:slug` reveals nothing about other users' runs. (SC-002)
- Revoking a share makes `GET /p/:slug` return 404 within the same request cycle. (SC-003)
- Object storage is NOT a dependency; swapping the `Sink` implementation would change the
  storage backend without touching the share store, service, or routes. (SC-004)
- Full suite + coverage green (80/70/60); public route + mint + revoke covered by
  integration tests; no live network calls in CI. (SC-005)
