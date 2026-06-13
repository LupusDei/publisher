# Beads Import — Observability Pages (maps to EXISTING beads)

> Created in beads; do not re-create.

| Bead ID | Title | T-IDs | Type | Pri |
|---|---|---|---|---|
| `publisher-2p3` | Observability Pages (User + Admin) | — | epic | P2 |
| `publisher-2p3.1` | [TDD] User observability aggregation endpoint (per-user + per-article) | T001–T002 | task | P2 |
| `publisher-2p3.2` | User observability page (frontend) | T003 | task | P2 |
| `publisher-2p3.3` | [TDD] Admin observability aggregation endpoint (aggregate + OTel) | T004 | task | P2 |
| `publisher-2p3.4` | Admin observability page (frontend, admin-gated) | T005 | task | P2 |

**Deps:** `2p3.2→2p3.1`, `2p3.4→2p3.3`, `2p3.1→85q.4`, `2p3.3→{gu0.4, 85q.3}`. Epic `2p3` depends on `85q` + `gu0`.
