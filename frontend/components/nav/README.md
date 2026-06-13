# Navigation (`components/nav/`)

The global application chrome: the editorial masthead, the accessibility skip
link, and the responsive mobile menu. Mounted once in `app/layout.tsx` via
`AppShell`, so every route inherits the same wayfinding. This is the only
persistent nav in the product — do not add a second one.

See `specs/design/atelier.md` → **Navigation** for the design intent. This README
is the implementation map.

## Components

| File | Role |
| --- | --- |
| `AppShell.tsx` | Global chrome wrapper. Composes `SkipLink` + `SiteNav` + a focusable `#main` landmark (`tabIndex={-1}`) around the routed page. Mounted in `app/layout.tsx`. |
| `SiteNav.tsx` | The editorial masthead: serif wordmark, the primary section row, and the auth cluster. Renders the section row from `NAV_ITEMS`. Exports `visibleNavItems(isAdmin)`. |
| `NavLink.tsx` | A wayfinding link that knows whether it is "here". Derives active state from `usePathname`, exposes it via `aria-current="page"` + `data-active`. Exports `isActivePath(pathname, href)`. |
| `MobileMenu.tsx` | Narrow-viewport disclosure menu. A toggle (`aria-expanded` / `aria-controls`) reveals a panel listing the same IA; closes on a second click or Escape. |
| `SkipLink.tsx` | The first focusable element on the page. Visually hidden at rest, snaps into view on focus, jumps to `#main`. |
| `nav-items.ts` | **Single source of truth for the IA.** `NAV_ITEMS` + the `NavItem` type. |
| `site-nav.css` | Token-only styling. Owns the desktop ↔ mobile breakpoint swap and the skip-link reveal. |

## Data flow

```
nav-items.ts (NAV_ITEMS)
        │
        ▼
SiteNav  ──visibleNavItems(isAdmin)──▶  filtered list
   │                                         │
   ├─ desktop row (NavLink × items)          │
   └─ MobileMenu(items) ─────────────────────┘  (same filtered list)
```

Both viewports render the **same** filtered list, so the IA never diverges.

## How to add a nav item

1. Add an entry to `NAV_ITEMS` in `nav-items.ts`, in display order:
   ```ts
   { label: "Reports", href: "/reports" },
   ```
2. Set flags if needed:
   - `adminOnly: true` — visible only when `user.role === "admin"`.
   - `secondary: true` — de-emphasised in the primary row (like Demo); rendered
     via `data-secondary` on the link.
3. That's it — both the desktop masthead and the mobile menu pick it up
   automatically. Active highlighting works out of the box: an exact match, or any
   nested route under the href (`/reports/42`), is treated as active.
4. Add/extend tests in `frontend/tests/unit/` for the new behavior (constitution
   §1 / testing rules).

## Active-state contract

- Home (`/`) is active only on an exact match.
- Any other href is active on an exact match OR a nested route
  (`/runs` stays active on `/runs/123`).
- A mere prefix sibling (`/runs-archive`) is **not** treated as nested.
