# HARNESS.md — Publisher

> The harness is the graded artifact. This document covers its architecture and design: the four constraint pillars, how they wrap a swappable agent worker, and how the agent's behavior changes from feedback.
> **Status:** living document — authored Wave 1 from the architecture-defense kit; updated as the build lands. Companion: `docs/architecture-defense.md`, `docs/agent-integration.md`, `specs/002-publisher-mvp/OVERVIEW.md`.

---

## 1. One-sentence pitch

**Publisher turns a research concept into a unique, elegantly-designed single-page webpage written in the authentic voice of *your* persona.** A harness wraps a research-and-build agent; four separate pillars guarantee the output captures the persona's voice and design, is backed by sufficient research, and meets a quality bar — or it refuses to publish and tells you exactly why.

This maps 1:1 to the challenge thesis: *"Agents focus on tasks. Harnesses focus on constraints. A well-designed harness makes constraint-handling invisible to the agent."* The agent researches and writes; the harness guarantees it sounds like **you**.

---

## 2. The four pillars (the graded artifact)

The agent is deliberately dumb about all four. It sees only `system + messages + feedback`. The pillars do the constraining, around it.

| Pillar | In Publisher | Interface (the seam) |
|---|---|---|
| **Material Handling** | `Source` brings in a concept + selected persona; `Sink` emits a self-contained static webpage `{title, html, css, summary, sourcesUsed}` hostable anywhere. | `Source.load(concept, personaId) → {material?, alarms[]}` · `Sink.publish(webpage) → Receipt` |
| **Guardrails (the Persona)** | The persona *is* the declared guardrail — voice, style points, key learnings, design tokens. Compiled **preventively** into the system prompt and **detectively** into validators. Declared once, enforced twice. | `GuardrailEngine.compile(persona) → { systemPrompt, validators[] }` |
| **Checkpoints** | Ordered pass/fail gates with explicit thresholds: research-sufficiency · voice-fidelity · design-conformance · quality. Persisted to a journal → replay from any checkpoint. | `Checkpoint.evaluate(ctx) → CheckpointResult{passed, score, threshold, feedback, alarms}` |
| **Observability & Alarms** | Meters token cost per phase, latency, error rate; emits structured `Alarm{type, severity, context, recommendedAction}` on budget breach or gate failure. Alarms are emitted, never thrown. | `Meter.record/snapshot` · `AlarmEmitter.evaluate(input) → Alarm[]` |

**Why "declared, not implicit":** the persona is data the user authored in onboarding — inspectable, reusable across runs, surfaced in the UI as both its declared form *and* its compiled form (the exact system-prompt fragment + validator list). A system prompt is implicit and unenforced; the persona is the declared guardrail, enforced twice and measured against.

---

## 3. Architecture

Eight components; the four graded pillars are wrapped around one swappable worker by a thin orchestrator.

```
                 ORCHESTRATOR (Run Engine) — thin sequencer, no domain logic
                 state machine · retry loop · journal · replay · escalation
   ┌──────────┬───────────┬────────────┬──────────────┬─────────────┐
   │ MATERIAL │ GUARDRAILS │ CHECKPOINTS │ OBSERVABILITY│   PERSONA   │
   │ (in/out) │ (persona)  │  (gates)    │  & ALARMS    │   STORE     │
   └──────────┴─────┬──────┴────────────┴──────┬───────┴─────────────┘
                    │ system + messages + feedback (only)
                    ▼
              AGENT (worker, swappable — Vercel AI SDK)
              research → build → refine        ── escalate on critical ──► HUMAN-IN-THE-LOOP
```

**Two planes.** Control plane: a Next.js/React frontend (onboarding, run stream, escalation, preview) on Vercel. Harness plane: a Node/TS backend (the orchestrator + pillars + SQLite) that drives the agent via an in-process **awaitable** call (Vercel AI SDK). No tmux, no out-of-process worker, no correlation IDs — the orchestrator keeps tight control of the loop, persists a checkpoint per round, and escalates inline.

**Persistence.** Harness state (personas ↔ runs ↔ checkpoints ↔ alarms ↔ metrics ↔ escalations) is relational and queried live by the API → SQLite (behind store interfaces; Turso/libSQL is a later swap). `run_events` is the **authoritative event log** — the WebSocket is a live tail of it, and reconnect/replay are the same mechanism (`loadSince(runId, seq)`). Published webpages are static files.

---

## 4. The control loop — where the agent's behavior changes

```
persona     = PersonaStore.load(personaId)            // declared voice + style + design
guardrails  = GuardrailEngine.compile(persona)        // → systemPrompt + validators
material    = Source.load(concept, personaId)         // idea + persona (or INPUT_EMPTY alarm)

── RESEARCH ──
research = await agent.research({ system: guardrails.systemPrompt, concept })
if research-sufficiency FAILS → Alarm INSUFFICIENT_RESEARCH → feedback "go deeper on X" → research again   ◀ behavior changes

── BUILD / REFINE ──
webpage = await agent.build({ system: guardrails.systemPrompt, research })
for cp in [voice-fidelity, design-conformance, quality]:
    result = cp.evaluate(ctx); journal.append(result)         // ← replay point
    if result.FAILED:
        if autoCorrectable and attempt < MAX:
            feedback = nextBuildFeedback(results)              // owned by Checkpoints, not the orchestrator
            webpage  = await agent.build({ ..., feedback })    // ◀ behavior changes (refine)
        else: Alarm.raise(cp.toAlarm()); if CRITICAL: escalate()   // stop and ask the user

receipt = Sink.publish(webpage)                                // only persona-faithful, researched, quality pages ship
```

**The meaningful change:** a failed `VOICE_DRIFT` checkpoint ("0.42 < 0.75") produces structured feedback fed into the *refine* prompt ("match this voice sample; you drifted formal"). The next draft scores 0.81 and passes. `INSUFFICIENT_RESEARCH` sends it back to research; `DESIGN_DRIFT` adjusts the design. Guardrails shape the **first** attempt; checkpoint feedback corrects the **later** ones. That closed loop is the harness. The UI renders every attempt as a draft, so the rejected-draft → feedback → better-draft change is *visible*, not just journaled.

---

## 5. The should-haves & the bonus

- **Swappable agent (R8):** the worker lives behind one `Agent` seam (Vercel AI SDK). Swapping it — a different Claude model, or a different provider — is a one-line `model` change; the harness is untouched.
- **Persisted / replayable checkpoints (R9):** every checkpoint result + draft + alarm + metric is appended to `run_events`. Replay re-enters the loop at the first non-passed checkpoint, reusing prior phase outputs (replay from *build* reuses the research without re-researching).
- **Human-in-the-loop (R10):** a critical alarm or exhausted retry pauses the run and emits an `Escalation` to the frontend. The user resolves it — enrich the persona (which recompiles the guardrail), approve anyway, or abort — and the run resumes from that checkpoint.
- **BONUS (R11):** a second worker swapped in mid-demo (model or provider) proves portability — same persona + concept, two workers, two pages side-by-side, each labeled with its worker.

---

## 6. Key decisions & why

| Decision | Why over the alternative |
|---|---|
| The persona is the **declared** guardrail, not a hidden prompt | Authored data — inspectable, reusable, enforced twice (prompt + validators) and measured against. The rubric demands declared guardrails. |
| Agent never talks to the pillars; the **orchestrator mediates** | This *is* the thesis — constraint-handling stays invisible to the worker. Letting the agent call pillars leaks the cage and breaks swappability. |
| Guardrails enforced **twice** (preventive prompt + detective validator) | Prompt-only drifts; validator-only wastes a generation. Defense-in-depth. |
| Checkpoints **separate** from guardrails | The persona is the *declared rule*; a checkpoint is the *measured gate*. Checkpoints also cover non-persona gates (research, quality). |
| Alarms are **structured, not thrown** | Type + severity + context + recommended action; warnings don't halt; criticals escalate. Exceptions would lose that metadata. |
| Deterministic gates **hard-block**; LLM-judged gates **advisory + escalate** | Research-count / token-budget are deterministic. Fuzzy gates (voice/design/quality) use a judge with a threshold and prefer escalation over silent block — the judge is fallible. |
| `Agent` seam: `system` string in, `{value, usage, finishReason}` out | The worker is provider-blind and telemetry rides every call (feeds Observability + the error alarms). |
| **In-process Vercel AI SDK** as the transport | An `Agent` call is a normal awaitable; the orchestrator holds the message array, which maps 1:1 onto the journal + replay. Simpler than an out-of-process agent. |
| Harness **owns the loop** (no autonomous agent framework) | The harness must own the loop — the agent stays dumb, the pillars constrain. A checkpoint runs after every round. |

---

## 7. Known tradeoffs & uncertainties (stated up front)

1. **Voice-fidelity / quality gates are LLM-judged** → non-deterministic. Mitigation: deterministic gates hard-block; fuzzy gates have thresholds and escalate; thresholds are per-persona-tunable and calibrated on the real persona.
2. **Defining a persona's voice well enough to measure is hard.** A thin persona yields a weak guardrail → repeated `VOICE_DRIFT` → escalate to enrich.
3. **Research-sufficiency is a judgment call** — a declared, tunable threshold + escalation, not a hard-coded constant.
4. **The refine loop can oscillate** — bounded by `MAX_ATTEMPTS`; on exhaustion → `WEBPAGE_GENERATION_FAILED` + escalate.
5. **Portability is partial** — the core build/refine loop is provider-portable (one-line model swap); server-side web search/fetch and prompt caching are Anthropic-specific, so research depth is provider-scoped. (Honest, and stronger than claiming "fully portable.")
6. **Cost/latency are on the critical path** — prompt-cache the persona prefix, meter per-call `usage`, fire `TOKEN_BUDGET_EXCEEDED` / `HIGH_LATENCY` before spend runs away. This *is* the Observability pillar working.
7. **Third-party model dependency** — refusals / rate-limits / outages surface as structured `REFUSAL` / `RATE_LIMITED` / `PROVIDER_ERROR` alarms with retry/escalate; runs resume from the last checkpoint.

---

## 8. Failure modes

| Failure | Detection | Harness response |
|---|---|---|
| Concept empty/thin | Source | `INPUT_EMPTY` (warning) — never run the agent on nothing |
| Not enough research | research-sufficiency | `INSUFFICIENT_RESEARCH` → research-more loop → escalate |
| Off-voice output | voice-fidelity (judge) | `VOICE_DRIFT` → refine loop → persistent → escalate |
| Ignores design | design-conformance | `DESIGN_DRIFT` → refine loop |
| Incoherent / low quality | quality | `INSUFFICIENT_QUALITY` → refine → `WEBPAGE_GENERATION_FAILED` + escalate |
| Excess tokens / slow | observability meters | `TOKEN_BUDGET_EXCEEDED` / `HIGH_LATENCY` (warning→critical) |
| Rate-limit / refusal / outage / truncation | `finishReason` + SDK errors | `RATE_LIMITED` / `REFUSAL` / `PROVIDER_ERROR` / `OUTPUT_TRUNCATED` → backoff/retry/escalate |
| Judge LLM errors | checkpoint engine | `CHECKPOINT_ERROR` → **fail-closed** (treat as fail + escalate) |

---

## 9. Repository map

```
shared/      cross-tier Zod contracts (the frozen seams)
backend/     orchestrator + the four pillars + agent seam + SQLite stores
  src/{domain, agent, guardrails, checkpoints, observability, material, orchestrator, stores, routes}
frontend/    Next.js control plane (onboarding, run stream, escalation, preview)
docs/        architecture-defense, agent-integration, design brief
specs/002-publisher-mvp/   the MVP plan (OVERVIEW.md), decisions (ASSUMPTIONS.md), per-track specs
```

Run: `npm install && npm run dev`. The agent defaults to a deterministic, token-free `MockAgent`; the real Anthropic worker is env-gated (`USE_REAL_AGENT=true` + `ANTHROPIC_API_KEY`).
