# Spec — Site Navigation (Global App Shell) (Epic `publisher-nav`)

> **Owner:** Tassadar · **Design contract:** `../design/atelier.md` · **Created:** 2026-06-13
> Frontend-only epic. Depends on auth (`publisher-85q`) for `useAuth()`; soft-links the admin telemetry page from Epic 5 (`005-observability-pages`).

## Problem
The app is a set of ~10 **isolated pages** with no way to move between them. Each page hand-rolls its own local `<header>` (some with inline `style={...}`, in violation of Atelier), there is no persistent wayfinding, no active-page indication, and no consistent place for the auth controls. A visitor who lands on `/personas/[id]` cannot get to `/runs` without editing the URL.

We need a **single global navigation** mounted once in `RootLayout`, built on the Atelier design system, that connects the pages, reflects auth state, and is fully keyboard- and screen-reader-accessible.

## Routes to connect (information architecture)
| Destination | Route | In primary nav | Visibility |
|---|---|---|---|
| Home (wordmark) | `/` | wordmark → home | always |
| Personas | `/personas` (detail `/personas/[id]`) | yes | always |
| Runs | `/runs` (detail `/runs/[id]`) | yes | always |
| Gallery | `/runs/gallery` | yes | always |
| Demo | `/runs/demo` | secondary | always |
| Author your persona | `/onboarding` | CTA (primary Button) | anon emphasis |
| Log in | `/login` | auth cluster | anon only |
| Log out | action | auth cluster | authed only |
| Admin · Telemetry | `/admin/telemetry` | yes | **admin only** |
| Skeleton (dev) | `/skeleton` | no | excluded from nav |

## Non-Goals
- No new pages or routes — this epic only *connects* existing ones (the admin telemetry page itself is delivered by Epic 5).
- No breadcrumbs, no footer nav, no command palette, no search (later epics if wanted).
- No changes to page *content* beyond removing duplicated nav affordances and fixing inline-style violations in existing local headers.

## Locked decisions (rationale in plan.md)
- **Editorial masthead, not a dashboard bar.** Serif wordmark, hairline rule, paper surfaces — per Atelier ("editorial, not dashboard").
- **One source of truth for the IA:** a `nav-items.ts` config (label, href, `requiresAuth?`, `adminOnly?`) drives rendering and gating.
- **Mounted via an `AppShell` client component** rendered by `RootLayout` (keeps the layout server component thin and makes the shell unit-testable).
- **Auth state from `useAuth()`**; role gating hides admin entries from non-admins (defense-in-depth — the route still enforces `requireAdmin` server-side).
- **Tokens only, `Button` primitive reused, no inline styles** (Atelier hard rules). New styles live in `components/nav/site-nav.css`.

## User Stories

### US1 — Get anywhere from anywhere (Priority: P1, MVP) — beads `nav.2`
**As** any visitor, **I want** a persistent nav bar on every page, **so that** I can reach Personas, Runs, the Gallery, and Home from wherever I am, and see where I currently am.
**Acceptance:** A global nav renders on every route; the wordmark links Home; primary links route to `/personas`, `/runs`, `/runs/gallery`; the active route is marked with `aria-current="page"` and the vermillion accent (active on nested routes too — `/runs` active on `/runs/123`). The auth cluster shows **Log in + "Author your persona"** when signed out, and **the user + Log out** when signed in.

### US2 — Works on any device, for any input (Priority: P1) — beads `nav.3`
**As** a keyboard, screen-reader, or mobile user, **I want** the nav to be fully operable, **so that** navigation never depends on a mouse or a wide screen.
**Acceptance:** On narrow viewports the links collapse into a disclosure menu (button with `aria-expanded`/`aria-controls`); the menu opens/closes by click and **Escape**, with sensible focus handling. A **skip-to-content** link is the first focusable element and jumps to `#main`. Everything is tab-reachable with a visible token focus ring, and all motion collapses under `prefers-reduced-motion`.

### US3 — Admins reach admin tools; others never see them (Priority: P2) — beads `nav.4`
**As** the system, **I want** admin-only entries gated by role, **so that** non-admins don't see (or reach) admin views.
**Acceptance:** The **Admin · Telemetry** link renders only when `useAuth()` reports an `admin`; it is absent for `user` and anonymous sessions. (The route remains protected server-side regardless.)

## Edge Cases
- **Auth still loading:** render the neutral/anon cluster (no flash of authed controls); never show Log out before auth resolves.
- **Unknown/!matched route:** no nav item is marked active; nav still renders.
- **Admin route absent (pre-Epic 5):** the gated link is harmless for non-admins (hidden); for an admin it points at the Epic-5-owned route. Treated as a soft dependency, not a blocker.
- **Reduced motion:** disclosure + active-underline transitions are neutralized by the global guard; no animation re-enabled past it.

## Success Criteria
- From any page, a user can reach every primary destination in one click (or one disclosure + click on mobile); the current page is visibly indicated.
- Signed-out vs signed-in vs admin all show the correct nav; non-admins never see admin links.
- Keyboard-only and screen-reader navigation works end to end (skip link, landmarks, `aria-current`, disclosure semantics); reduced-motion respected.
- Page-local headers no longer duplicate global nav, and the personas/persona-detail inline-style header violations are removed (Atelier-clean).
- Full suite + coverage gate green; no Atelier token violations (no new hard-coded color/space/type/motion values).
