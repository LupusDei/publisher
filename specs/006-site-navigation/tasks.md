# Tasks — Site Navigation (Global App Shell)

**Input:** design docs in `/specs/006-site-navigation/` · **Epic:** `publisher-nav`
**Design contract:** `../design/atelier.md`

> TDD-shaped (Rule 1). `[P]` = parallelizable (different files). `[US]` = user story.
> Exemptions (`[scaffold]`/`[docs]`) carry no behavior and need no test.

## Phase 1 — Foundational (`nav.1`)

- [ ] **T001** [scaffold] Create `frontend/components/nav/` and `frontend/components/nav/nav-items.ts` exporting `NAV_ITEMS` and a `NavItem` type (`label`, `href`, `requiresAuth?`, `adminOnly?`) — the single IA source. No behavior.
- [ ] **T002a** [P] Write failing tests in `frontend/tests/unit/nav-link.test.tsx`: active on exact path match; active on nested route (`/runs` active when pathname is `/runs/123`); inactive otherwise; sets `aria-current="page"` only when active. Mock `usePathname`. Confirm RED.
- [ ] **T002b** Implement `frontend/components/nav/NavLink.tsx` (wraps `next/link`, reads `usePathname` from `next/navigation`) until T002a is GREEN. No paths beyond what tests require.
- [ ] **T003** [P] Build `frontend/components/nav/SkipLink.tsx`. Phases: write failing tests first in `frontend/tests/unit/skip-link.test.tsx` (renders an anchor to `#main`; carries the visually-hidden class at rest; gains the visible class on focus) → confirm RED → implement → confirm GREEN.

**Checkpoint:** primitives exist and are independently tested.

---

## Phase 2 — US1: Get anywhere from anywhere (Priority: P1, MVP) (`nav.2`)

**Goal:** every page has working navigation with active highlighting and the correct auth cluster.
**Independent Test:** render `SiteNav`/`AppShell` with mocked `useAuth`+`usePathname`; assert links, active state, and signed-in/out clusters.

- [ ] **T004a** [US1] Write failing tests in `frontend/tests/unit/site-nav.test.tsx` (mock `useAuth` + `usePathname`): wordmark links `/`; primary links route to `/personas`, `/runs`, `/runs/gallery`; anon → "Log in" + "Author your persona"; authed → user label + Log out; active link has `aria-current="page"`. Confirm RED.
- [ ] **T004b** [US1] Implement `frontend/components/nav/SiteNav.tsx` consuming `NAV_ITEMS` + `NavLink` + `useAuth`, reusing the `Button` primitive and existing `LogoutButton`, until T004a is GREEN.
- [ ] **T005** [scaffold] [US1] Create `frontend/components/nav/site-nav.css` — editorial masthead styles consuming Atelier tokens only (no hard-coded color/space/type/motion); imported by `SiteNav`.
- [ ] **T006a** [US1] Write failing tests in `frontend/tests/unit/app-shell.test.tsx`: `AppShell` renders the `SkipLink`, the `SiteNav`, and a `<div id="main" tabIndex={-1}>` wrapping its children. Confirm RED.
- [ ] **T006b** [US1] Implement `frontend/components/nav/AppShell.tsx` and mount it in `frontend/app/layout.tsx` (`<Providers><AppShell>{children}</AppShell></Providers>`) until T006a is GREEN.

**Checkpoint:** navigation works app-wide — the epic's core value is delivered.

---

## Phase 3 — US2: Works on any device, for any input (Priority: P1) (`nav.3`)

**Goal:** keyboard, screen-reader, and mobile operability.

- [ ] **T007a** [US2] Write failing tests in `frontend/tests/unit/mobile-menu.test.tsx`: disclosure button exposes `aria-expanded` + `aria-controls`; click toggles open/closed; **Escape** closes; menu lists the nav links. Confirm RED.
- [ ] **T007b** [US2] Implement `frontend/components/nav/MobileMenu.tsx`, integrate it into `SiteNav` (rendered responsively via `site-nav.css`), and add breakpoint rules, focus rings, and the `prefers-reduced-motion` guard to `site-nav.css`. Until T007a is GREEN.

**Checkpoint:** nav is fully operable by keyboard and on narrow viewports; motion respects reduced-motion.

---

## Phase 4 — US3: Admin-gated entries (Priority: P2) (`nav.4`)

**Goal:** admin-only links hidden from non-admins.

- [ ] **T008a** [US3] Extend `frontend/tests/unit/site-nav.test.tsx` with failing cases: admin session → "Admin · Telemetry" link present; `user` and anonymous → absent. Confirm RED.
- [ ] **T008b** [US3] Implement `adminOnly` filtering in `frontend/components/nav/SiteNav.tsx` (+ the `adminOnly` flag in `nav-items.ts`) using `useAuth().user?.role`, until T008a is GREEN.

**Checkpoint:** role gating verified for admin / user / anon.

---

## Phase 5 — Polish & Cleanup (`nav.5`)

- [ ] **T009a** [P] Write failing/updated tests asserting page-local headers no longer duplicate global nav (no second Home/nav links) while the page heading still renders, in `frontend/tests/unit/personas-gallery-page.test.tsx` and `frontend/tests/unit/persona-detail-page.test.tsx`. Confirm RED.
- [ ] **T009b** Reconcile page-local headers: remove nav/home affordances now provided globally and replace the inline `style={styles.header}` in `frontend/app/personas/page.tsx` and `frontend/app/personas/[id]/persona-detail.tsx` with tokenized Atelier classes (keep the page titles). Until T009a is GREEN.
- [ ] **T010** [docs] Add a "Navigation" section to `specs/design/atelier.md` (masthead rules + IA) and a short `frontend/components/nav/README.md`.

**Checkpoint:** no duplicated nav, no inline-style violations, nav documented.

---

## Dependencies
- Phase 1 (`nav.1`) → blocks Phase 2 (`nav.2`).
- Phase 2 → blocks Phases 3, 4, 5.
- Phases 3 (`nav.3`) and 4 (`nav.4`) run in parallel after Phase 2.
- Within tasks: every `Tb` depends on its `Ta`; T004 (SiteNav) depends on T001 (config) + T002 (NavLink); T006 (AppShell) depends on T004 + T003 (SkipLink); T009 depends on T006 (shell mounted).

## Parallel Opportunities
- `[P]`: T002 (NavLink) ∥ T003 (SkipLink) ∥ T001 (config) within Phase 1.
- After Phase 2: `nav.3` ∥ `nav.4`; T009 cleanup ∥ T010 docs.
