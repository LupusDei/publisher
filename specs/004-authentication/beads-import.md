# Beads Import — Authentication (maps to EXISTING beads)

> Created in beads; do not re-create. Owner: Tassadar.

| Bead ID | Title | T-IDs | Type | Pri |
|---|---|---|---|---|
| `publisher-85q` | Authentication & User Sessions | — | epic | P1 |
| `publisher-85q.1` | [TDD] users table + UserStore + password hashing (bcryptjs) | T001–T004 | task | P1 |
| `publisher-85q.2` | [TDD] Auth service: register/login + JWT issue/verify | T005–T006 | task | P1 |
| `publisher-85q.3` | [TDD] Auth routes + Bearer middleware + requireAdmin | T007–T008 | task | P1 |
| `publisher-85q.4` | [TDD] Per-user ownership: userId on personas + runs | T009 | task | P1 |
| `publisher-85q.5` | Frontend: login/logout + onboarding password + Bearer | T010 | task | P1 |
| `publisher-85q.6` | Admin role seeding + seeded admin user | T011 | task | P2 |

**Deps:** `85q.2→85q.1`, `85q.3→85q.2`, `85q.4→85q.1`, `85q.5→85q.3`, `85q.6→85q.1`.
**Downstream:** `publisher-2p3.1` (user obs) depends on `85q.4`; `publisher-2p3.3` (admin obs) depends on `85q.3`; epic `publisher-2p3` depends on `publisher-85q`.
