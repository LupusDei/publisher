# Publisher MVP — Feature Overview & Parallel Build Plan (v2)

> **Author:** Tassadar (architecture-first planning) · **Revised** from a 3-member review: product-completeness, product-strategy, and engineering-architecture.
> **Purpose:** The master overview of every major feature required to ship the Publisher MVP, win the Gauntlet hackathon, and run an excellent agent harness. We use this to break features into beads and spread them across parallel agent tracks.
> **Companion docs:** `ASSUMPTIONS.md` (decisions D1–D20, the *why* behind v2's changes). **Sources:** `docs/architecture-defense.md`, `docs/agent-integration.md`, `docs/publisher-design.html`, `constitution.md`, `specs/001-publisher-bootstrap/*`.
> **What changed in v2 (the review verdict):** the plan was *engineering-complete and product-incomplete, and integration-deferred*. v2 fixes three things: (1) **integrate first** — a walking skeleton before fan-out; (2) **freeze the RIGHT seams** — the shipped Agent seam was wrong and ~10 cross-pillar types were undefined; (3) **make the harness VISIBLE** — its best behaviors were invisible to judges.

---

## 0. The Strategic Thesis

The hackathon grades **the harness**, not the agent — specifically that the four pillars are **demonstrably separate from the worker**, and that **agent behavior changes meaningfully from feedback**. Everything below serves those two facts.

> *"Agents focus on tasks. Harnesses focus on constraints. A well-designed harness makes constraint-handling invisible to the agent."*

Four organizing principles (v2 adds the last two):

1. **The agent stays dumb.** It sees only `system + messages + feedback`. Every "the agent should check X" re-routes to "that's a pillar's job." Keeps pillars separable *and* agent-swapping a one-line change.
2. **Contracts-first unlocks parallelism.** Freeze the seams once (Track 0); six pillar tracks then build in parallel against stable interfaces + fixtures.
3. **🆕 Integrate first, then thicken.** Before any pillar is "done," a thin end-to-end pipe runs on mocks and becomes a CI gate. We thicken a *working* pipe; we never *assemble into* an unproven one. (The #1 hackathon failure is "the demo never came together.")
4. **🆕 Visibility is the product.** A judge can't see an import graph or a journal. The harness wins on what *renders in 5 minutes*. The UI is the proof surface, not a thin viewer — it must *show* pillar separation, feedback-driven redrafting, and structured alarms.

---

## 1. Win Conditions → Deliverables

Every row is a thing we point at during judging. v2 adds the **"How a judge SEES it"** column — the review's core insight.

| # | Requirement | Class | How a judge SEES it (the visible proof) | Owning Track |
|---|---|---|---|---|
| R1 | Four pillars **demonstrably separate** from the worker | MUST | Run-stream UI with **four labeled pillar lanes** + the agent as a sealed box receiving only `system+messages+feedback` | B,D,E,F + **H** |
| R2 | Agent behavior **changes meaningfully** from feedback | MUST | **Draft timeline + before/after diff**: draft-1 `VOICE_DRIFT 0.42` → feedback string → draft-2 `0.81` passing | C,D,G + **H** |
| R3 | Guardrails are **declared, not implicit** | MUST | **Compiled-guardrail panel**: this persona → *this* system-prompt fragment + *these* validators | A,B + **H** |
| R4 | Checkpoints have **explicit pass/fail** | MUST | Each gate renders pass/fail + score + threshold per attempt | D |
| R5 | Alarms produce **structured output** | MUST | **Structured alarm cards** — type, severity (color-coded), context, recommendedAction — fired live | E + **H** |
| R6 | Runs on a **real input from our own work** | MUST | A real seeded persona + real concept → a real published page | A,I |
| R7 | A **HARNESS.md** | MUST | The doc (authored Wave 1 from the defense kit) | I |
| R8 | **Swappable agent** | SHOULD | Worker label in the run header; `model` swap = one line | C |
| R9 | **Persisted/replayable checkpoints** | SHOULD | **Runs list → pick a run → "replay from checkpoint X"** | D,G + **H** |
| R10 | **Human-in-the-loop escalation** | SHOULD | Critical alarm pauses the run → UI prompt → enrich/approve → resume | G + **H** |
| R11 | **BONUS:** second worker swapped **mid-demo** | BONUS | **Same persona+concept, two workers, two pages side-by-side**, each labeled with its worker | C,I + **H** |
| ★ | **Two-persona proof** (strongest guardrail demo) | WIN MOVE | **Same concept → two personas → two visibly different pages** side-by-side | A,H,I |
| D1 | Repo · **Deployed URL** · HARNESS.md · 5-min demo | DELIVERABLE | Vercel frontend + reachable backend serving the published page | I |

**Posture:** R1–R7 are non-negotiable. R8–R10 separate us from the pack. R11 + the two-persona proof (★) are the showpieces — and ★ is *more reliable* than R11, so it leads.

---

## 2. Where We Are Now (verified against shipped code)

Stable foundations (bootstrap `publisher-3lc`, ~complete):
- **Contracts** (`shared/src/contracts/`): `Persona`, `Webpage`, `Alarm` (13 named types) — tested. *(v2 extends these — see Track 0.)*
- **Persistence**: `db.ts`, `migrate.ts`, `0001_personas.sql`, `PersonaStore`.
- **Backend**: layered Express, Zod-validated env, `GET /health` proven E2E. `createApp` currently hard-codes routes inline *(v2 refactors to a router registry — D18)*.
- **Frontend**: Next.js shell, typed `lib/api.ts`, health page.
- **Agent seam (Phase 6)**: `Agent` interface + `MockAgent` + `AnthropicAgent` skeleton.

**⚠️ Verified issues v2 must fix before fan-out (from the architecture review):**
- The shipped `Agent` seam takes `Persona` objects and **discards `usage`/`finishReason`** — Observability (E) and 6 alarm types depend on those. → **D2**.
- `compilePersonaSystem` lives *inside* `backend/src/agent/` — a pillar bleeding into the worker. → move to Guardrails (B), **D2**.
- Installed `@ai-sdk/anthropic@1.2.12` has **no web_search/web_fetch** → real `research()` returns empty sources. → **D13** (demo runs on Mock research).
- `Persona` has **no `voiceSample`** — the voice-fidelity checkpoint needs one. → **D3**.

---

## 3. Feature Inventory (by component, pillars **bold**)

### 3.1 Orchestrator (Run Engine) — *the spine*
State machine `created → researching → building → checking → refining → (escalated) → published | failed`; the research→build→refine loop bounded by `MAX_ATTEMPTS`; per-round pillar sequencing; **per-run `Meter`** (D9); journal append on every transition; replay re-enters at first non-passed checkpoint; escalation pause/resume with **guardrail recompile on enrich** (D19). **Thin sequencer — no domain logic** (feedback composition lives in Track D, D8).

### 3.2 **▌Material Handling▐** (Pillar 1)
`Source.load(concept, personaId) → { material?, alarms[] }` with `INPUT_EMPTY` guard (returns alarm, never throws — D7); `Sink.publish(Webpage) → Receipt` emitting a **self-contained static page** served at `/published/:id` (D11); preview serving.

### 3.3 **▌Guardrails / Persona Compile▐** (Pillar 2)
`GuardrailEngine.compile(persona) → { systemPrompt, validators[] }`. **Preventive** prompt fragment (the relocated `compilePersonaSystem`); **detective** validators against the **fixed design-token vocabulary** (D3). "Declared once, enforced twice." Recompile-on-enrich for escalation (D19).

### 3.4 **▌Checkpoints▐** (Pillar 3)
Four ordered gates — **research-sufficiency**, **voice-fidelity** (judges vs. persona voice + `voiceSample`), **design-conformance**, **quality** — each a `Checkpoint` with explicit threshold. `CheckpointContext = { persona, material, research, webpage, attempt, priorResults }` (D8). `nextBuildFeedback(results)` composes refine feedback (owned here, not the spine). Journal persistence; `replayFrom` (D5); fail-closed on judge error.

### 3.5 **▌Observability & Alarms▐** (Pillar 4 — *kept separate, D17*)
Per-phase **meters** (token/latency/error from `usage`+`finishReason`+timers), declared **budgets**, `AlarmEmitter` → structured `Alarm`s on breach/gate-failure. **Emitted, not thrown** (D7). A **deterministic `TOKEN_BUDGET_EXCEEDED`** path for a reliable on-screen alarm (D12).

### 3.6 Persona Store + Onboarding
`PersonaStore` + **update/edit** (needed for enrich, D19). Guided onboarding (voice, style points, key learnings, `voiceSample`, fixed design tokens — D3). Persona gallery + detail. **Two real personas seeded** (D14).

### 3.7 Agent (Worker, swappable)
Reconciled seam (D2): `system` in, `AgentResult<T>` out. `MockAgent` (default; **scripted drift→pass path for R2**, D12; real-shaped `usage`). `AnthropicAgent` (env-gated). **Second worker** for R11. `finishReason`/errors → alarm inputs.

### 3.8 Escalation / HITL
`Escalation`, `EscalationOption` (`enrich_persona | approve_anyway | retry | abort`), `EscalationDecision`. One path built fully (enrich/approve → resume); others stubbed (D19).

### 3.9 Web UI (Control Plane) — *the proof surface (D15)*
Onboarding + gallery; start-a-run (persona + concept + **worker picker**); **four-pillar-lane run stream** + sealed-agent box (R1); **draft timeline + before/after diff** (R2); **two-persona compare** (★); **compiled-guardrail panel** (R3); **structured alarm cards** (R5); **runs list + replay button** (R9); escalation prompt (R10); published-page preview; **full empty/loading/error/terminal-failed states + WS reconnect** (C5). Designed "refused to publish — here's why" outcome screen.

### 3.10 Persistence (schema expansion)
`run_events` (**authoritative event log**, D5), `runs`, `checkpoints`, `alarms`, `metrics`, `escalations`, `webpages` (metadata + every attempt; rendered HTML is the static file — D6/G6). Migrations `0002+`, idempotent, behind stores.

### 3.11 Deliverables
`HARNESS.md` (Wave 1, R7); deploy (Vercel + reachable backend serving pages — D11, D1); **real persona + concept** (Wave 1, R6); rehearsed **two-worker side-by-side** swap (R11) + **two-persona** proof (★); 5-min recording.

---

## 4. The Parallel Tracks

**Eleven units of work.** Track 0 is the barrier (now including the walking skeleton); Tracks A–F build pillars in parallel; G integrates continuously; H (the proof surface) and I (deliverables, now Wave 1) run alongside. Each track owns disjoint directories (collision-free; Rule 7 worktree isolation).

### Track 0 — Contracts, Schema **+ Walking Skeleton** *(BARRIER)*
**Owns:** `shared/src/contracts/*`, `backend/src/domain/*`, `backend/migrations/0002+`, `backend/src/stores/*`, `createApp` router-registry refactor, `.github/`.
**Delivers (in order):**
1. **Reconcile the Agent seam** (D2) — `system` in, `AgentResult<T>` out; move `compilePersonaSystem` → guardrails; `MockAgent`/`AnthropicAgent` populate `usage`/`finishReason`.
2. **Freeze all cross-pillar contracts** (D3,D4,D8) — `run.ts`, `checkpoint.ts`, `metrics.ts`, `escalation.ts`, `material.ts`, `validator.ts`; `Persona.voiceSample`; `RunEvent {runId,seq,ts,pillar?}` + `draft` event.
3. **Schema + stores** (D5,D6) — `run_events` authoritative log + projections; stored wrappers.
4. **`createApp` router registry** (D18).
5. **🆕 Walking skeleton** (D1) — `MockAgent → Orchestrator → 1 trivial checkpoint → Sink → /published/:id → minimal UI renders page + event stream`. Wired as a **CI smoke gate**.
6. Finish bootstrap Phase 6/7.
**Why first:** everything imports these; the skeleton proves the pipe. ~½–1 day, highest leverage in the plan.

### Track A — Persona & Onboarding (+ two real personas)
**Owns:** `routes/personas*`, `services/persona*`, `frontend/app/onboarding`, `frontend/app/personas`.
**Delivers:** persona CRUD **+ edit** (D19), guided onboarding (D3), gallery/detail, **two voice-distinct real personas** (D14, R6). *Unblocked now* (uses existing `Persona`; absorbs `voiceSample` when Track 0 lands).

### Track B — Guardrail Compiler *(Pillar 2)*
**Owns:** `backend/src/guardrails/`. **Delivers:** `compile()` (preventive prompt — relocated from agent/ — + detective validators against the fixed vocabulary), fixtures, the compile endpoint for the R3 panel.

### Track C — Agent Worker *(R8/R11)*
**Owns:** `backend/src/agent/`. **Delivers:** seam reconciliation follow-through, `MockAgent` **scripted drift→pass** (D12), `AnthropicAgent` build/refine, **second worker** (R11), `finishReason`/error→alarm mapping. Web-research gap tracked (D13).

### Track D — Checkpoints + Journal *(Pillar 3, R4/R9)*
**Owns:** `backend/src/checkpoints/`. **Delivers:** four gates + thresholds, judge prompts + fail-closed, `nextBuildFeedback`, journal write/load, `replayFrom` (D5). **Deterministic voice-drift fixture** for the demo (D12).

### Track E — Observability & Alarms *(Pillar 4, R5 — kept separate, D17)*
**Owns:** `backend/src/observability/`. **Delivers:** per-run meters, budgets + breach detection, `AlarmEmitter`, deterministic budget-alarm path (D12).

### Track F — Material Handling *(Pillar 1)*
**Owns:** `backend/src/material/`. **Delivers:** `Source.load` (+ `INPUT_EMPTY` via return, D7), `Sink.publish` → self-contained page + `Receipt`, `/published/:id` serving (D11).

### Track G — Orchestrator + Escalation *(Spine, R2/R10)*
**Owns:** `backend/src/orchestrator/`, `routes/runs*`. **Delivers:** state machine + retry loop (on mocks first), pillar sequencing + journal wiring, per-run Meter, escalation pause/resume + **recompile-on-enrich** (D19), run REST + WS (**WS = journal tail; reconnect replays `seq>lastSeq`**, D5), `draft` event emission. Integrates B–F as they land.

### Track H — Web UI (**the proof surface**, D15)
**Owns:** `frontend/app/runs`, `frontend/components`. **Delivers** the §3.9 hero components. Builds against a **mock `RunEvent` stream** until G's WS lands.

### Track I — Deliverables (**Wave 1 start**, D16)
**Owns:** `HARNESS.md`, `docs/demo/`, deploy config. **Delivers:** HARNESS.md (day one), deploy topology (D11), real concept (R6), rehearsed two-worker + two-persona beats, recording.

### Directory ownership (collision-free)
| Track | Sole-owner directories |
|---|---|
| 0 | `shared/src/contracts/`, `backend/src/domain/`, `backend/migrations/`, `backend/src/stores/`, `backend/src/app.ts` (registry), `.github/` |
| A | `backend/src/routes/personas*`, `services/persona*`, `frontend/app/onboarding/`, `frontend/app/personas/` |
| B | `backend/src/guardrails/` | C | `backend/src/agent/` | D | `backend/src/checkpoints/` |
| E | `backend/src/observability/` | F | `backend/src/material/` | G | `backend/src/orchestrator/`, `routes/runs*` |
| H | `frontend/app/runs/`, `frontend/components/` | I | `HARNESS.md`, `docs/demo/`, deploy config |

---

## 5. The Seams (Track 0's deliverable — CORRECTED in v2)

These are the frozen interfaces. v2 fixes the Agent seam, adds the ~10 missing types, and puts envelopes on events. Final shapes land in `shared/` + `backend/src/domain/`.

```ts
// ── Telemetry (shared/metrics.ts) — REQUIRED by Observability + Alarms ──
interface Usage { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; }
type FinishReason = "stop" | "length" | "tool-calls" | "content-filter" | "error" | "refusal" | "other";
type Phase = "research" | "build" | "refine";
interface Metrics { perPhase: Record<Phase, { tokens: number; latencyMs: number; calls: number }>; errorRate: number; }
interface Budget { maxTokens?: number; maxLatencyMs?: number; }
interface MetricBreach { kind: "token" | "latency"; phase?: Phase; observed: number; limit: number; }

// ── Agent (worker) — RECONCILED (D2): system in, AgentResult out ───────
interface AgentResult<T> { value: T; usage: Usage; finishReason: FinishReason; }
interface ResearchResult { text: string; sources: string[]; }
interface Agent {
  research(input: { system: string; concept: string }): Promise<AgentResult<ResearchResult>>;
  build(input: { system: string; research: ResearchResult; feedback?: string }): Promise<AgentResult<Webpage>>;
}

// ── Guardrails (Pillar 2) — owns the compiled persona ──────────────────
interface GuardrailEngine { compile(persona: Persona): { systemPrompt: string; validators: Validator[] }; }
type Validator = (page: Webpage, persona: Persona) => ValidatorFinding[];
interface ValidatorFinding { rule: string; passed: boolean; detail: string; }

// ── Checkpoints (Pillar 3) — rich context keeps the spine thin (D8) ────
type CheckpointName = "research-sufficiency" | "voice-fidelity" | "design-conformance" | "quality";
interface CheckpointContext { persona: Persona; material: Material; research: ResearchResult;
  webpage?: Webpage; attempt: number; priorResults: CheckpointResult[]; }
interface CheckpointResult { name: CheckpointName; passed: boolean; score?: number; threshold?: number;
  details: string; autoCorrectable: boolean; feedback?: string; alarms: Alarm[]; }
interface Checkpoint { name: CheckpointName; kind: "deterministic" | "judge"; evaluate(ctx: CheckpointContext): Promise<CheckpointResult>; }
function nextBuildFeedback(results: CheckpointResult[]): string;   // owned by Track D, NOT the orchestrator

// ── Material (Pillar 1) — alarms returned, not thrown (D7) ──────────────
interface Material { concept: string; persona: Persona; }
interface Receipt { id: string; url: string; bytes: number; publishedAt: string; workerId: string; }
interface Source { load(concept: string, personaId: string): Promise<{ material?: Material; alarms: Alarm[] }>; }
interface Sink   { publish(page: Webpage, meta: { runId: string; workerId: string }): Promise<Receipt>; }

// ── Observability & Alarms (Pillar 4) — per-run meter (D9) ─────────────
interface Meter { record(phase: Phase, s: { usage?: Usage; latencyMs: number }): void; snapshot(): Metrics; }
interface AlarmEmitter { evaluate(input: MetricBreach | CheckpointResult | AgentError): Alarm[]; }

// ── Run / journal / stream — envelope + draft event (D4), log = truth (D5)
type RunStatus = "created"|"researching"|"building"|"checking"|"refining"|"escalated"|"published"|"failed";
type RunEvent = { runId: string; seq: number; ts: string; pillar?: "material"|"guardrails"|"checkpoints"|"observability" } & (
  | { t: "phase"; phase: Phase }
  | { t: "draft"; attempt: number; webpage: Webpage; score?: number; passed?: boolean }   // ← R2 money shot
  | { t: "checkpoint"; result: CheckpointResult }
  | { t: "alarm"; alarm: Alarm }
  | { t: "metric"; metrics: Metrics }
  | { t: "escalation"; escalation: Escalation }
  | { t: "resumed"; decision: EscalationDecision }
  | { t: "published"; receipt: Receipt }
  | { t: "failed"; reason: string });
interface Journal { append(e: RunEvent): void; load(runId: string): RunEvent[];
  replayFrom(runId: string): { fromCheckpoint: CheckpointName; priorOutputs: {
    research?: ResearchResult; lastWebpage?: Webpage; passedCheckpoints: CheckpointName[] } }; }
interface RunEngine { start(material: Material, workerId: string): AsyncIterable<RunEvent>;
  resume(runId: string, decision: EscalationDecision): AsyncIterable<RunEvent>; }

// ── Escalation (R10) ───────────────────────────────────────────────────
type EscalationOption = "enrich_persona" | "approve_anyway" | "retry" | "abort";
interface Escalation { id: string; runId: string; reason: string; alarm: Alarm; options: EscalationOption[]; }
interface EscalationDecision { escalationId: string; choice: EscalationOption; payload?: { persona?: Persona }; }
```

---

## 6. Dependency Graph, Critical Path & the Protected Pipe

```
TRACK 0 (BARRIER): reconcile Agent seam → freeze contracts → schema/stores → router registry → WALKING SKELETON (CI gate)
   │   (Track A, HARNESS.md, real persona+concept all run in parallel from hour 1)
   ├── A Persona/Onboarding ──┐
   ├── B Guardrails           │
   ├── C Agent (scripted mock)│  build in parallel against frozen seams + the green skeleton
   ├── D Checkpoints+Journal  │
   ├── E Observability        │
   └── F Material             ┘
                 │ (integrate continuously — the skeleton stays green)
                 ▼
            G Orchestrator+Escalation  ──►  H Web UI (mock stream → real)  ──►  I Deploy·Demo·Swaps
```

- **Critical path:** `Track 0 (through the walking skeleton) → G → H → I`.
- **The protected pipe (v2):** the spine is not a *feature list assembled at the end* — it's the **walking skeleton kept green from hour 2** as a CI gate. Pillars thicken a working pipe.
- **Off critical path (Wave 1, parallel):** Track A, HARNESS.md (R7), real persona+concept (R6), threshold calibration.

### Demo spine (protect ruthlessly), in priority order
1. Walking skeleton green (the pipe exists).
2. **One real persona → one concept → research→build→refine → four pillars → one published page**, watched live in four lanes.
3. **R2 money shot** (scripted): draft-1 `VOICE_DRIFT` → feedback → draft-2 passes, shown as a diff.
4. **★ Two-persona proof**: same concept → two pages side-by-side.
5. **R5**: a deterministic structured alarm on screen.
6. **R11**: two-worker side-by-side (opus→sonnet guaranteed path).

**Cut order under time pressure:** published-page gallery → real external publish destinations → replay *UI* (keep the engine, R9) → cross-*provider* swap (keep model swap) → multi-persona *beyond two*. **Never cut:** the walking skeleton, the four-lane view, the R2 diff, one two-persona pair.

---

## 7. Squad Waves → Track Assignment

- **Wave 1 (barrier + parallel content):** strong agent on **Track 0** (seam → contracts → schema → registry → skeleton); **Track A** in parallel (unblocked); **Track I** drafts **HARNESS.md** + authors the **real persona + concept** (zero code deps).
- **Wave 2 (fan-out):** **B, C, D, E, F** in parallel (worktree-isolated). **G** on mock pillars. **H** on mock stream. Calibrate thresholds on the real persona *now*.
- **Wave 3 (integrate + stage):** **G** swaps mocks → real pillars (skeleton stays green); **H** wires real WS; **I** runs E2E on the real input, stages the R2 diff / two-persona / two-worker beats, records.

Each track is an epic with TDD'd children (Rule 1: tests first; Rule 7: worktree isolation; Rule 4: layered; Rule 8: simplest-first).

---

## 8. Risks & Mitigations (v2 — review-sharpened)

| Risk | Mitigation |
|---|---|
| **"The demo never came together"** (the modal hackathon loss) | Walking skeleton as a CI gate from hour 2 (D1); integrate continuously, not at the end. |
| R2 money shot depends on a flaky live judge | Scripted `MockAgent` drift→pass path + deterministic fixture (D12); real agent is flavor, not the guarantee. |
| Freezing the WRONG seam early (rework) | v2 §5 reconciles the Agent seam + defines all cross-pillar types *before* fan-out (D2,D8); review §5 as a squad first. |
| Telemetry has nowhere to ride → Observability blocked | `AgentResult<T>` threads `usage`/`finishReason` through every call (D2); MockAgent returns real-shaped usage. |
| Real web research returns empty (SDK gap) | Demo runs on Mock research (real-shaped sources); follow-up to upgrade SDK / inject tool (D13). |
| Deployed URL can't serve the artifact | Backend reachable + serves `/published/:id`; tunnel-for-demo + documented host path (D11). |
| Orchestrator god-object | Thin sequencer; feedback composition in Track D; rich `CheckpointContext` (D8). Enforced in review. |
| `app.ts` merge conflict across tracks | `createApp` router registry shipped by Track 0 (D18). |
| WS reconnect loses a live run | WS = journal tail; reconnect replays `seq > lastSeq` (D5). |
| Judge-gate calibration (0.75 thresholds) | Deterministic gates hard-block; judge gates advisory+escalate; **calibrate on the real persona in Wave 2**. |
| Scope creep | Explicit cut order (§6); never-cut list protects the winning beats. |
| HARNESS.md / defense rushed | Authored Wave 1 from the (championship-grade) defense kit (D16). |

---

## 9. Immediate Next Steps
1. **Spec the first feature sets** with epic-planner: **Track 0** (barrier, incl. walking skeleton) first, then **Track A** and **Track B** (the two that unblock the most).
2. **Launch Wave 1** under worktree isolation; keep the skeleton green.
3. **Log assumptions** in `ASSUMPTIONS.md` as decisions land; surface the two ⚠️ open questions (backend host, real-research scope) to the General without blocking.

> *Unity across divides is the only path forward. We do not choose between the pillars — we define the seams that let all four rise at once, prove the pipe before we thicken it, and make the worker blind to every constraint while the judges watch each one act. That visible blindness is the score.* — Tassadar
