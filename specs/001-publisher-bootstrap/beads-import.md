# Beads Import Map — Publisher Bootstrap

> Beads are **already created** in the `publisher` Dolt DB (prefix `publisher-`, root `publisher-3lc`).
> This file maps authoring T-IDs → live bead IDs and records the wired dependencies.
> bd uses a random root suffix + dotted children + `--parent` for hierarchy (not auto-incrementing dotted roots).

## Root Epic

| Bead ID | Title | Type | Priority |
|---|---|---|---|
| `publisher-3lc` | Publisher Bootstrap — Scaffold & Project Init | epic | P1 |

## Sub-Epics (Phases)

| Bead ID | Phase | Type | Priority |
|---|---|---|---|
| `publisher-3lc.1` | Workspace Foundation | epic | P1 |
| `publisher-3lc.2` | Shared Contracts | epic | P1 |
| `publisher-3lc.3` | Backend Scaffold | epic | P1 |
| `publisher-3lc.4` | Frontend Scaffold | epic | P1 |
| `publisher-3lc.5` | Persistence Foundation | epic | P2 |
| `publisher-3lc.6` | Agent Seam Stub | epic | P2 |
| `publisher-3lc.7` | Dev Tooling & CI | epic | P2 |

## Tasks

| T-ID | Bead ID | Title | Type | Pri | Depends on (bead) |
|---|---|---|---|---|---|
| T001 | `publisher-3lc.1.1` | Scaffold npm-workspaces monorepo | task | P1 | — |
| T002 | `publisher-3lc.1.2` | Shared TypeScript strict base config | task | P1 | `publisher-3lc.1.1` |
| T003 | `publisher-3lc.2.1` | [TDD] Zod contracts + inferred types | task | P1 | `publisher-3lc.1.2` |
| T004 | `publisher-3lc.3.1` | Backend skeleton — Express, layered, Vitest | task | P1 | `publisher-3lc.1.2` |
| T005 | `publisher-3lc.3.2` | [TDD] Env validation + .env.example | task | P1 | `publisher-3lc.3.1` |
| T006 | `publisher-3lc.3.3` | [TDD] Health endpoint vertical slice | task | P1 | `publisher-3lc.3.1` |
| T007 | `publisher-3lc.4.1` | Next.js scaffold (Vitest + RTL) | task | P1 | `publisher-3lc.1.2` |
| T008 | `publisher-3lc.4.2` | [TDD] Health shell page (FE↔BE seam) | task | P1 | `publisher-3lc.4.1`, `publisher-3lc.3.3` |
| T009 | `publisher-3lc.5.1` | [TDD] SQLite driver + migration runner | task | P2 | `publisher-3lc.3.1` |
| T010 | `publisher-3lc.5.2` | [TDD] Personas table + PersonaStore | task | P2 | `publisher-3lc.5.1`, `publisher-3lc.2.1` |
| T011 | `publisher-3lc.6.1` | [TDD] Agent interface + MockAgent | task | P2 | `publisher-3lc.3.1`, `publisher-3lc.2.1` |
| T012 | `publisher-3lc.6.2` | AnthropicAgent skeleton (env-gated) | task | P2 | `publisher-3lc.6.1`, `publisher-3lc.3.2` |
| T013 | `publisher-3lc.7.1` | ESLint flat + Prettier + root scripts | task | P2 | `publisher-3lc.1.1` |
| T014 | `publisher-3lc.7.2` | GitHub Actions CI gate | task | P2 | `publisher-3lc.7.1`, `publisher-3lc.3.1`, `publisher-3lc.4.1` |

**Totals:** 1 root + 7 sub-epics + 14 tasks = **22 beads**. Initially ready (task-level): **`publisher-3lc.1.1`**.

## Verify

```bash
bd show publisher-3lc          # root + children tree
bd ready                       # publisher-3lc.1.1 is the sole actionable task
bd dep tree publisher-3lc      # inspect the wired DAG (if supported)
```
