# Publisher

**Turn a research concept into a unique, elegantly-designed single-page webpage — written in the authentic voice of *your* persona.** Publisher is a **harness**: a research-and-build agent wrapped in four separable constraint pillars that guarantee the output captures the persona's voice and design, is backed by sufficient research, and meets a quality bar — or it refuses to publish and tells you exactly why.

> The harness is the graded artifact. See **[HARNESS.md](./HARNESS.md)** for the architecture, **[DEMO.md](./DEMO.md)** for the demo + deploy runbook, and `specs/002-publisher-mvp/` for the plan (`OVERVIEW.md`) and decisions (`ASSUMPTIONS.md`).

## The four pillars (separate from the worker)
- **Material Handling** — concept + persona in; a self-contained, hostable single-page webpage out.
- **Guardrails (the Persona)** — declared voice/style/design, compiled into a system prompt *and* detective validators. Declared once, enforced twice.
- **Checkpoints** — ordered pass/fail gates (research-sufficiency · voice-fidelity · design-conformance · quality), persisted to a journal → replay.
- **Observability & Alarms** — meters token cost/phase, latency, error rate; emits structured `Alarm{type,severity,context,recommendedAction}`.

The agent stays dumb — it only ever sees `system + messages + feedback`. The orchestrator drives the loop; a failed checkpoint feeds structured feedback back into the next draft.

## Quickstart
```bash
npm install
npm run build
npm run seed --workspace backend   # seed two voice-distinct demo personas
npm run dev                        # backend :4000 + frontend :3000
```
- App: http://localhost:3000 · Health: http://localhost:4000/health
- **Guaranteed-live demo (no backend): http://localhost:3000/runs/demo** — four pillar lanes + the draft before/after diff.
- Default worker is a deterministic, token-free **MockAgent**. For real web research set `USE_REAL_AGENT=true` + `ANTHROPIC_API_KEY` and pick the `anthropic-research` worker.

## Layout (npm workspaces)
```
shared/     cross-tier Zod contracts (the frozen seams)
backend/    orchestrator + the four pillars + agent seam + SQLite stores
  src/{domain, agent, guardrails, checkpoints, observability, material, orchestrator, stores, routes}
frontend/   Next.js control plane — onboarding, run stream, escalation, preview
docs/       architecture-defense, agent-integration, design brief
specs/      the MVP plan, decisions, and per-track specs
```

## Scripts
| Command | What |
|---|---|
| `npm run dev` | Backend + frontend together |
| `npm run build` | Build all workspaces |
| `npm test` | All test suites (Vitest) |
| `npm run test:coverage` | Coverage gate (80/70/60) |
| `npm run lint` | ESLint, zero warnings |
| `npm run seed --workspace backend` | Seed demo personas |
| `npm run smoke --workspace backend` | End-to-end run smoke (the R2 proof) |

## Swappable worker (R8/R11)
Three workers behind one `Agent` seam: **MockAgent** (deterministic, default), **Vercel AI SDK** (`@ai-sdk/anthropic`), and **native Anthropic + real `web_search`** (`@anthropic-ai/sdk`). Swapping is selecting a `workerId` — the harness is untouched.
