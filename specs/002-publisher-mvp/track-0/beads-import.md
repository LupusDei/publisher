# Beads Import — Track 0 (maps to EXISTING beads, no duplication)

> These beads already exist under `publisher-dp0.1`. This table maps authoring T-IDs → existing bead IDs. Do **not** re-create.

| Bead ID | Title | Tasks (T-IDs) | Type | Pri |
|---|---|---|---|---|
| `publisher-dp0.1` | Track 0 — Contracts, Schema & Walking Skeleton (BARRIER) | — | epic | P0 |
| `publisher-dp0.1.1` | [TDD] Freeze cross-pillar contracts + voiceSample | T001–T007 | task | P0 |
| `publisher-dp0.1.2` | Domain interfaces module | T008 | task | P0 |
| `publisher-dp0.1.5` | Reconcile & freeze the Agent seam | T009 | task | P0 |
| `publisher-dp0.1.3` | [TDD] DB migrations 0002 (run_events authoritative) | T010 | task | P0 |
| `publisher-dp0.1.6` | createApp router-registry refactor | T011 | task | P0 |
| `publisher-dp0.1.4` | [TDD] Stores behind interfaces | T012–T014 | task | P0 |
| `publisher-dp0.1.7` | [TDD] Walking skeleton + CI smoke gate | T015–T018 | task | P0 |

**Dependencies (already wired):** `.1.2→.1.1`, `.1.5→.1.1`, `.1.4→{.1.3,.1.1}`, `.1.7→{.1.5,.1.2,.1.4,.1.6}`.
**Unblocks on close:** Tracks B,C,D,E,F,G,H epics (`publisher-dp0.3…dp0.9` depend on `publisher-dp0.1`).
