# Plan — Site Navigation (Global App Shell)

> **Branch:** `006-site-navigation` · **Epic:** `publisher-nav` · **Priority:** P1 · **Date:** 2026-06-13
> Phases map to `publisher-nav.x` sub-epics.

## Summary
Mount a single Atelier-styled navigation across the whole app via an `AppShell` client component rendered by `RootLayout`. The IA is driven by one `nav-items.ts` config; active state, auth-aware clusters, responsive disclosure, and role gating all read from that config plus `useAuth()`/`usePathname()`. Frontend-only, tokens-only, fully accessible.

## Technical Context
- **Stack:** Next.js App Router · React · TypeScript (strict) · CSS custom properties (Atelier tokens in `app/globals.css`).
- **Testing:** Vitest + `@testing-library/react` (mock `useAuth` and `next/navigation`'s `usePathname`).
- **Constraints:** Atelier hard rules — tokens/classes only (no inline color/space/type/motion), reuse the `Button` primitive, keyboard-navigable, visible focus ring, `prefers-reduced-motion` honored.
- **Auth:** `useAuth()` (`frontend/app/auth/AuthContext.tsx`) provides session + role; reuse existing `LogoutButton`.

## Architecture Decision (layered, Rule 4)
- **`AppShell` over editing every page.** `RootLayout` stays a thin server component; it renders `<Providers><AppShell>{children}</AppShell></Providers>`. `AppShell` (client) composes `SkipLink` + `SiteNav` + `<div id="main" tabIndex={-1}>{children}</div>`. This keeps the shell unit-testable (RTL can't easily mount `<html>`).
- **Single IA source (`nav-items.ts`).** Rendering, active-matching, and gating all derive from one config → no drift, trivial to extend.
- **Skip link targets a wrapper `#main`,** not a nested `<main>` — pages keep their own `<main>` landmark; the wrapper just needs to be focusable. Avoids touching every page.
- **Role gating is presentational defense-in-depth** — the admin route still enforces `requireAdmin` server-side (from `publisher-85q`).

## Files Changed
| File | Change |
|---|---|
| `frontend/components/nav/nav-items.ts` | **new** — IA config (`NAV_ITEMS`: label, href, `requiresAuth?`, `adminOnly?`) |
| `frontend/components/nav/NavLink.tsx` | **new** — link with active-state (`usePathname`, `aria-current`) |
| `frontend/components/nav/SkipLink.tsx` | **new** — skip-to-content (`#main`) |
| `frontend/components/nav/SiteNav.tsx` | **new** — editorial masthead; wordmark, links, auth cluster, role gating |
| `frontend/components/nav/MobileMenu.tsx` | **new** — responsive disclosure menu |
| `frontend/components/nav/AppShell.tsx` | **new** — composes SkipLink + SiteNav + `#main` wrapper |
| `frontend/components/nav/site-nav.css` | **new** — tokenized masthead/menu styles |
| `frontend/components/nav/README.md` | **new** — nav usage + IA notes |
| `frontend/app/layout.tsx` | mount `AppShell` inside `Providers` |
| `frontend/app/personas/page.tsx` | remove duplicated nav; replace inline-style header with tokenized classes |
| `frontend/app/personas/[id]/persona-detail.tsx` | same Atelier cleanup |
| `specs/design/atelier.md` | add a "Navigation" section (masthead rules + IA) |

## Phase 1 — Foundational (`nav.1`)
Build the primitives with no app-wide effect yet: `nav-items.ts` config, `NavLink` (active state), `SkipLink`. Independently testable.

## Phase 2 — US1: Get anywhere from anywhere (MVP) (`nav.2`)
`SiteNav` (wordmark + primary links + auth cluster via `useAuth`, reusing `Button`/`LogoutButton`), its tokenized `site-nav.css`, and `AppShell` mounted in `RootLayout`. After this phase every page has working navigation with active highlighting and the correct signed-in/out cluster — the epic's core value.

## Phase 3 — US2: Works on any device, for any input (`nav.3`)
`MobileMenu` disclosure (aria-expanded/controls, click + Escape, focus handling), responsive breakpoint rules, reduced-motion guard, focus rings — added to `SiteNav`/`site-nav.css`.

## Phase 4 — US3: Admin-gated entries (`nav.4`)
`adminOnly` filtering in `SiteNav` from `useAuth().user?.role` — Admin·Telemetry shows for admins only.

## Phase 5 — Polish & Cleanup (`nav.5`)
Reconcile page-local headers (drop duplicated nav, fix the personas/persona-detail inline-style violations, keep page titles); document the nav in `atelier.md` + a component README.

## Parallel Execution
- **Lane (frontend-only):** `frontend/components/nav/*`, `frontend/app/layout.tsx`, and the two page-header edits. No backend files — safe to run alongside any backend epic.
- Within the epic: after `nav.1`, the primitives feed `nav.2`; once `nav.2` lands, `nav.3` and `nav.4` are parallel (different concerns), and `nav.5` cleanup can proceed.
- `[P]` tasks touch distinct files (e.g. `NavLink` vs `SkipLink` vs `nav-items`).

## Verification Steps
- [ ] From `/personas/[id]`, reach `/runs`, `/runs/gallery`, and Home via the nav in one click each.
- [ ] Active route shows the vermillion accent + `aria-current="page"`, including on nested routes.
- [ ] Signed out → Log in + "Author your persona"; signed in → user + Log out; admin → Admin·Telemetry visible; user/anon → not.
- [ ] Tab from page load hits the skip link first; it jumps to content. Disclosure opens/closes by keyboard and Escape.
- [ ] `prefers-reduced-motion` neutralizes all nav animation.
- [ ] `npm run build` + `npm test` green; coverage gate holds; no new hard-coded token values.

## Bead Map
- `publisher-nav` — Site Navigation (Global App Shell)
  - `nav.1` Foundational (nav-items · NavLink · SkipLink)
  - `nav.2` US1 — global nav mounted (SiteNav · css · AppShell)
  - `nav.3` US2 — responsive + a11y (MobileMenu)
  - `nav.4` US3 — admin role gating
  - `nav.5` Polish — header cleanup + docs

> ✅ Created in beads (bd 1.0.4) with these exact IDs — `publisher-nav` + `.1`–`.5` + tasks. See beads-import.md for the wired dependency list.
