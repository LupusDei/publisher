# Publisher MVP — Decisions & Assumptions Log

> **For the General to review.** These are the calls I made to keep momentum without blocking on questions. Each has a rationale and a "reverse if" trigger. Flag any you want changed.
> **Author:** Tassadar · **Date:** 2026-06-13 · **Driven by:** the 3-member plan review (product completeness, product strategy, engineering architecture).

---

## How to read this
Each decision: **D# — title** → the call · *why* · *reverse if*. Decisions marked 🔴 are load-bearing (downstream tracks depend on them); 🟡 are meaningful but cheap to change.

---

### 🔴 D1 — Integration-first: a walking skeleton is the real barrier, not just contract freeze
**Call:** Track 0 delivers a thin end-to-end pipe — `MockAgent → Orchestrator → one trivial checkpoint → Sink writes static HTML → minimal UI renders it + the run-event stream` — **before** any pillar fan-out. It becomes a CI smoke gate ("the spine is always green").
**Why:** All three reviewers (esp. strategy) flagged the #1 hackathon failure mode: five beautiful pillars that never integrated into a demo. Integrate on hour 2, thicken from there.
**Reverse if:** you'd rather risk a late big-bang integration to save the skeleton's setup cost. (Not recommended.)

### 🔴 D2 — Agent seam reconciled: `system: string` in, `{value, usage, finishReason}` out
**Call:** Freeze the seam as:
```ts
interface Usage { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; }
type FinishReason = "stop" | "length" | "tool-calls" | "content-filter" | "error" | "refusal" | "other";
interface AgentResult<T> { value: T; usage: Usage; finishReason: FinishReason; }
interface Agent {
  research(input: { system: string; concept: string }): Promise<AgentResult<ResearchResult>>;
  build(input: { system: string; research: ResearchResult; feedback?: string }): Promise<AgentResult<Webpage>>;
}
```
The agent receives a **compiled `system` string**, never a `Persona`. `compilePersonaSystem` **moves out of `backend/src/agent/` into `backend/src/guardrails/` (Track B)** — a pillar must not live inside the worker.
**Why:** The shipped seam (a) takes `Persona` (couples worker to a pillar), and (b) discards `usage`/`finishReason`, which Observability (Track E) and 6 alarm types REQUIRE. Freezing the shipped shape would force reopening Tracks C/E later. `MockAgent` returns synthetic-but-real-shaped `usage` so Observability is testable offline.
**Reverse if:** never — this is the correct separation and unblocks E.

### 🔴 D3 — `Persona` gains `voiceSample`; design tokens get a known vocabulary
**Call:** Add `voiceSample: string` (a short writing sample) to the `Persona` contract + migration. Onboarding (Track A) captures design elements from a **fixed vocabulary** (`palette`, `typography`, `layout`, `tone`) instead of arbitrary keys.
**Why:** The voice-fidelity checkpoint judges "vs. persona voice profile **+ sample**" — but `persona.ts` has no sample field (blocks Track D). Free-form `designElements` keys can't be validated by detective validators (Track B) without a known vocabulary.
**Reverse if:** you have a richer persona-capture model in mind — tell me the fields.

### 🔴 D4 — `RunEvent` carries `{runId, seq, ts, pillar?}`; a `draft` event makes every attempt first-class
**Call:** Every `RunEvent` has envelope fields `{ runId, seq (monotonic), ts }` and an optional `pillar` tag. Add a `{ t:"draft"; attempt; webpage; score?; passed? }` event, and persist **every** build attempt (not just the published one).
**Why:** (1) `seq` is required for WS reconnect + replay-vs-live consistency. (2) The R2 money-shot — "rejected draft → feedback → materially better draft" — is invisible without retaining rejected drafts. `pillar` tag powers the four-lane UI (R1 made visible).
**Reverse if:** never — these unblock H and the highest-value demo beat.

### 🔴 D5 — `run_events` is the authoritative event log; WS = live tail; replay = re-fold the log
**Call:** `run_events` is the single source of truth (event-sourced journal). The WebSocket is a live tail; on reconnect the client sends `lastSeq` and the server replays `run_events WHERE seq > lastSeq` then tails live. `replayFrom(runId)` returns `priorOutputs = { research?, lastWebpage?, passedCheckpoints[] }` re-folded from the log. `checkpoints`/`alarms`/`webpages` tables are queryable projections.
**Why:** Unifies replay (R9) and WS-reconnect into one mechanism; resolves the undefined `replayFrom(...)` return; "replay from build reuses research without re-researching" (a defense promise) becomes a log fold.
**Reverse if:** never for the MVP.

### 🟡 D6 — Pure emission shapes vs. stored wrappers
**Call:** Keep `Alarm` and `CheckpointResult` as pure **emission** shapes. Persistence/stream wrap them: `StoredAlarm = Alarm & { id, runId, phase, createdAt }`, `StoredCheckpointResult = CheckpointResult & { id, runId, attempt, createdAt }`.
**Why:** The pure contracts have no identity/runId/timestamp, so they can't be stored or streamed as-is; wrapping keeps the pillar output clean.

### 🔴 D7 — Pillars RETURN alarms; the Orchestrator forwards them (never throw for an alarm)
**Call:** Every pillar surfaces alarms by returning them in its result (e.g. `Source.load → { material?, alarms[] }`). The Orchestrator collects and forwards to the journal + stream. Exceptions are reserved for true faults, mapped to `PROVIDER_ERROR`/`CHECKPOINT_ERROR`.
**Why:** "Alarms are emitted, never thrown" (architecture doc). One convention across Source/Checkpoints/Agent-error/Observability prevents four tracks inventing four conventions.

### 🔴 D8 — All cross-pillar types frozen in `shared/` in Track 0
**Call:** New contract files: `run.ts` (`RunStatus`, `Phase`, `Run`, `RunEvent`), `checkpoint.ts` (`CheckpointName`, `CheckpointResult`, `CheckpointContext`), `metrics.ts` (`Usage`, `FinishReason`, `Metrics`, `MetricBreach`, `Budget`), `escalation.ts` (`Escalation`, `EscalationOption`, `EscalationDecision`), `material.ts` (`Material`, `Receipt`), `validator.ts` (`Validator`, `ValidatorFinding`). `CheckpointContext = { persona, material, research, webpage, attempt, priorResults }`. `nextBuildFeedback(results)` (feedback composition) owned by Track D, not the Orchestrator.
**Why:** ~10 types are referenced across §5 but defined nowhere; if each track defines its own, Track G integration is a type-mismatch swamp. A rich `CheckpointContext` (with `attempt`/`priorResults`) keeps loop-control logic in the checkpoints, not the spine.

### 🟡 D9 — `Meter` is per-run, not a singleton
**Call:** The Orchestrator instantiates a `Meter` per run, keyed by `runId`.
**Why:** A shared mutable meter cross-contaminates metrics if runs overlap. Cheap now, painful later.

### 🟡 D10 — Liveness = `RunEvent`s, not LLM token streaming
**Call:** Build uses `generateObject` (whole-object). UI liveness comes from phase/checkpoint/draft/metric/alarm events — not token-level streaming.
**Why:** Simpler, matches what the seam actually emits; avoids Track H building a token-stream UI with no backing event.

### 🔴 D11 — Deploy topology: Vercel frontend + LOCAL backend via ngrok tunnel ✅ CONFIRMED BY GENERAL (2026-06-13)
**Call (locked):** Frontend → **Vercel**. Backend → runs **locally**, exposed to the internet via an **ngrok tunnel**; SQLite file persists locally. The Vercel frontend reaches the backend at the ngrok URL via `NEXT_PUBLIC_API_BASE`. Published webpages are served by the local backend at `/published/:id` and previewed in the frontend through the tunnel.
**Why:** The General confirmed this is the demo setup — judges hit the Vercel URL; the harness runs on the local backend behind ngrok.
**Build implications (handle at integration / Track I — dp0.10.2):**
- `NEXT_PUBLIC_API_BASE` (frontend env on Vercel) = the ngrok https URL.
- Backend `CORS_ORIGIN` must allow the Vercel origin (env-configurable; already in `config/env.ts`).
- `Sink` Receipt URLs must be **absolute** using a configurable `PUBLIC_BASE_URL` (= ngrok URL) so the frontend can iframe published pages through the tunnel. (`createFileSink` already takes a `baseUrl` — set it from env at deploy; Track 0 defaulted it to `""` for local.)
- Document the one-command demo bring-up: `npm run dev` (backend) + `ngrok http <port>` + set Vercel env → deploy.

### 🔴 D12 — The demo's money shots run on a SCRIPTED MockAgent (deterministic), not a live judge
**Call:** `MockAgent` gets a scripted path where draft-1 deterministically triggers `VOICE_DRIFT` (off-voice text) and draft-2 (post-feedback) passes — guaranteeing R2 live. A deterministic `TOKEN_BUDGET_EXCEEDED` gives a reliable structured alarm on screen (R5). The real agent is shown for the bonus swap where feasible; the **guaranteed** demo path is Mock.
**Why:** The highest-value beat (R2) must not depend on a non-deterministic LLM judge passing/failing on cue.
**Reverse if:** you want to demo exclusively on the real agent and accept the live-flakiness risk.

### 🔴 D13 — Real web research is a known gap; the demo runs on Mock research
**Call:** Installed `@ai-sdk/anthropic@1.2.12` exposes **no** `web_search`/`web_fetch` tools, so the real agent's `research()` returns empty sources → research-sufficiency would always fail on the real path. The demo's research is Mock (real-shaped sources). Follow-up bead: upgrade the SDK or inject a web tool for true real research.
**Why:** Avoids a silent landmine where the "real input" demo has no real research.
**⚠️ NEEDS YOUR INPUT (non-blocking):** Is real web research in-scope for the demo, or is Mock research acceptable for the graded run? Proceeding with **Mock research for reliability; real agent for the swap**.

### 🔴 D14 — Multi-persona is PROMOTED into the demo spine (not cut-first)
**Call:** Two real, voice-distinct personas are seeded in Wave 1. "Same concept → two visibly different pages, side by side" is a hero demo beat.
**Why:** It's the strongest, most controllable proof that Guardrails (Pillar 2) do real work — stronger and more reliable than the worker swap, and it directly demonstrates R3. The old plan cut it first; that was a priority error.

### 🟡 D15 — Track H is the proof surface; hero components are graded directly
**Call:** Track H builds, as first-class: four-pillar lanes + sealed-agent box (R1/O3), draft timeline + before/after diff (R2), two-persona compare (O1), compiled-guardrail panel (R3), structured alarm cards (R5), runs list + replay button (R9), and full empty/loading/error/terminal-failed states + WS reconnect.
**Why:** A hackathon is won on what renders in 5 minutes. The harness's best behaviors are otherwise invisible.

### 🟡 D16 — HARNESS.md + real persona/concept move to Wave 1
**Call:** Author HARNESS.md (from the defense kit) and the real demo persona + concept on day one, in parallel with Track 0.
**Why:** Both are graded (R7, R6), have zero code dependencies, and double as threshold-calibration inputs. Burying them in the final track risks a 3am rush.

### 🔴 D17 — Observability/Alarms STAYS a separate module (overriding the "fold E into G" suggestion)
**Call:** Keep Track E as its own `backend/src/observability/` module. The Orchestrator instantiates the per-run Meter and forwards alarms, but the metering/alarm logic is its own pillar.
**Why:** Observability & Alarms is **graded Pillar 4** and must be *demonstrably separate* (R1). Folding it into the spine would undercut the exact thing being scored. (Architecture reason overrides the strategy reviewer's simplification here.)

### 🔴 D18 — `createApp` becomes a router registry in Track 0
**Call:** Refactor `createApp` to accept/compose a router registry so Tracks A (personas) and G (runs) **append** routers instead of editing shared lines in `app.ts`.
**Why:** `app.ts` is the one guaranteed merge conflict in a multi-track fan-out; the mitigation is only real if Track 0 actually ships the pattern.

### 🟡 D19 — Escalation is right-sized to the one demo path
**Call:** Build fully: critical alarm → UI prompt → `enrich_persona` (edit + recompile guardrails) | `approve_anyway` → resume. Stub `retry`/`abort` behind the interface. On `enrich`, resume reloads + recompiles the persona before re-entering the loop.
**Why:** Escalation is a SHOULD on the most-loaded track (G); build the path you'll demo, keep the rest interface-only.

### 🟡 D20 — Coverage convention for untestable real paths
**Call:** Env-gated real paths (`AnthropicAgent`) and real fs/host I/O (`Sink` real publish) are excluded from coverage via explicit ignore + a contract-shape test; the Mock/deterministic path is fully covered.
**Why:** Otherwise Tracks C/F either miss the 60% function gate or write hollow tests. Documented in the CI bead.

---

## Open questions I did NOT block on (answer when convenient)
1. ~~**D11** — backend host for the deployed URL?~~ ✅ **RESOLVED: local backend + ngrok tunnel → Vercel frontend** (General, 2026-06-13).
2. **D13** — is real web research in-scope for the graded demo run, or is Mock research acceptable?
3. **Persona depth (D3)** — happy with `voiceSample` + fixed design-token vocabulary, or do you want a richer capture model?
4. **Demo concept (R6)** — do you have a specific real concept/idea you want published in the demo, or should I author one?
