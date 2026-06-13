# Site Navigation — Beads

**Feature:** 006-site-navigation · **Generated:** 2026-06-13 · **Source:** specs/006-site-navigation/tasks.md
**Owner:** Tassadar · **Epic:** `publisher-nav`

> ✅ **Created in beads (bd 1.0.4, 2026-06-13).** IDs are exactly as listed — the
> root was created with `--id=publisher-nav` and children follow the dotted scheme.
> Parent-child containment is derived from the dotted ID; blocking order is wired
> via `bd dep add` (phase ordering + key task deps). Verify with `bd show publisher-nav`.

## Root Epic
- **Title:** Site Navigation (Global App Shell)
- **Type:** epic · **Priority:** P1
- **Description:** Mount one Atelier-styled global navigation in `RootLayout` connecting the ~10 isolated pages; auth-aware, role-gated, responsive, accessible.

## Sub-Epics (phases)
| Phase | Title | Type | Pri | Depends | Proposed |
|---|---|---|---|---|---|
| 1 | Foundational — nav primitives | epic | P1 | — | `nav.1` |
| 2 | US1 — global nav mounted (MVP) | epic | P1 | `nav.1` | `nav.2` |
| 3 | US2 — responsive + accessibility | epic | P1 | `nav.2` | `nav.3` |
| 4 | US3 — admin role gating | epic | P2 | `nav.2` | `nav.4` |
| 5 | Polish — header cleanup + docs | epic | P2 | `nav.2` | `nav.5` |

## Tasks
| T-ID | Title | Path | Proposed | Depends |
|---|---|---|---|---|
| T001 | [scaffold] nav-items IA config | `frontend/components/nav/nav-items.ts` | `nav.1.1` | — |
| T002 | [TDD] NavLink active-state | `frontend/components/nav/NavLink.tsx` | `nav.1.2` | — |
| T003 | [TDD] SkipLink (skip-to-content) | `frontend/components/nav/SkipLink.tsx` | `nav.1.3` | — |
| T004 | [TDD] SiteNav masthead + auth cluster | `frontend/components/nav/SiteNav.tsx` | `nav.2.1` | `nav.1.1`, `nav.1.2` |
| T005 | [scaffold] tokenized masthead css | `frontend/components/nav/site-nav.css` | `nav.2.2` | — |
| T006 | [TDD] AppShell + mount in RootLayout | `frontend/components/nav/AppShell.tsx`, `frontend/app/layout.tsx` | `nav.2.3` | `nav.2.1`, `nav.1.3` |
| T007 | [TDD] MobileMenu disclosure + a11y/motion | `frontend/components/nav/MobileMenu.tsx` | `nav.3.1` | `nav.2.1` |
| T008 | [TDD] admin role gating | `frontend/components/nav/SiteNav.tsx` | `nav.4.1` | `nav.2.1` |
| T009 | [TDD] reconcile page headers (Atelier-clean) | `frontend/app/personas/page.tsx`, `frontend/app/personas/[id]/persona-detail.tsx` | `nav.5.1` | `nav.2.3` |
| T010 | [docs] document nav IA | `specs/design/atelier.md`, `frontend/components/nav/README.md` | `nav.5.2` | `nav.2.3` |

## Summary
| Phase | Tasks | Priority |
|---|---|---|
| 1: Foundational | 3 | P1 |
| 2: US1 (MVP) | 3 | P1 |
| 3: US2 | 1 | P1 |
| 4: US3 | 1 | P2 |
| 5: Polish | 2 | P2 |
| **Total** | **10 tasks · 5 sub-epics · 1 root = 16 beads** | |

## Dependency Graph
```
nav.1 Foundational ──► nav.2 US1 (MVP) ──┬─► nav.3 US2
                                         ├─► nav.4 US3
                                         └─► nav.5 Polish
```

## Bead Map (actual IDs)
- `publisher-nav` — Site Navigation (Global App Shell) · P1 · epic
  - `publisher-nav.1` Foundational · P1 → `.1.1` nav-items · `.1.2` NavLink · `.1.3` SkipLink
  - `publisher-nav.2` US1 (MVP) · P1 → `.2.1` SiteNav · `.2.2` css · `.2.3` AppShell+mount
  - `publisher-nav.3` US2 · P1 → `.3.1` MobileMenu
  - `publisher-nav.4` US3 · P2 → `.4.1` admin gating
  - `publisher-nav.5` Polish · P2 → `.5.1` header cleanup · `.5.2` docs

**Deps wired:** root→{.1–.5}; .2→.1, .3→.2, .4→.2, .5→.2; .2.1→{.1.1,.1.2}; .2.3→{.2.1,.1.3}; .3.1→.2.1; .4.1→.2.1; .5.1→.2.3; .5.2→.2.3.
**Ready now:** `.1.1`, `.1.2`, `.1.3`, `.2.2` (Foundational lane).
