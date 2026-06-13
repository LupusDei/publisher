# Publisher — Architecture Defense Kit

> For the Gauntlet AI Architecture Review (5 min present + 5 min Q&A).
> Goal of the session: *does this architecture hold up under pressure, and how can it be improved?*
> Winning strategy: **state your tradeoffs before they're asked.** Identifying your own gaps is a strength here.

---

## 0. The one-sentence pitch (memorize this)

> **Publisher lets anyone turn a research concept, idea, or thought experiment into a unique, elegantly-designed single-page webpage — written in the authentic voice of *their* persona.** A harness wraps a research-and-build agent; four separate pillars guarantee the output captures the persona's voice and design, is backed by sufficient research, and meets a quality bar — or it refuses to publish and tells you exactly why.

This maps 1:1 to the challenge's thesis: *"Agents focus on tasks. Harnesses focus on constraints. A well-designed harness makes constraint-handling invisible to the agent."* The agent researches and writes; the harness guarantees it sounds like **you**.

---

## 1. The core problem (≈45 sec)

People have valuable ideas — a research insight, a thought experiment, a concept worth sharing — but turning one into a **published artifact** is two hard jobs at once:

- **It has to sound like them.** Generic AI prose is voiceless. A real persona has a voice, recurring style moves, and hard-won points of view. Off-the-shelf output erases all of that.
- **It has to look like them, and be good.** A publishable page needs elegant, coherent design *and* enough real research underneath to be worth reading. Most tools give you one or the other.

**The persona is the heart of Publisher.** A user defines one (or several) personas up front — its **voice**, **key style points**, **key learnings**, and **design elements** — and from then on, feeding Publisher a raw concept produces a finished, hostable webpage in that persona's voice and design. The agent does the research and the building; **the harness guarantees fidelity, sufficiency, and quality — or refuses and says why.**

---

## 2. The major components & how they connect (≈2 min — spend your depth here)

Eight components. The four graded pillars are **bold**. The agent is deliberately dumb about all of them — it just researches and writes; the persona and the pillars do the constraining.

```
                       ┌──────────────────────────────────────────────┐
                       │              ORCHESTRATOR (Run Engine)         │
                       │   state machine · retry loop · replay · journal│
                       └──────────────────────────────────────────────┘
              ┌───────────┬──────────────┬──────────────┬──────────────┐
   load/emit  │  compile  │     gate     │   measure    │   context    │
              ▼           ▼              ▼              ▼              ▼
   ┌────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐
   │ ▌MATERIAL      │ │ ▌GUARDRAILS  │ │ ▌CHECKPOINTS │ │ ▌OBSERVABILITY│ │  PERSONA   │
   │  HANDLING▐     │ │  (PERSONA)▐  │ │  ▐           │ │  & ALARMS▐    │ │  STORE     │
   │ in: concept /  │ │ voice rules, │ │ research-    │ │ token cost / │ │ voice,     │
   │ idea / thought │ │ style points,│ │ sufficiency, │ │ phase,       │ │ style,     │
   │ + persona      │ │ design tokens│ │ voice-       │ │ latency,     │ │ learnings, │
   │ out: 1-page    │ │ → prompt +   │ │ fidelity,    │ │ error rate → │ │ design     │
   │ webpage (HTML) │ │ validators   │ │ design-conf, │ │ structured   │ │ (per user) │
   │ host/preview   │ │ (declared!)  │ │ quality      │ │ alarms       │ │            │
   └────────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘
                          │                                     │
                          │      ┌──────────────────┐           │ critical / gate-fail
                          └─────▶│  AGENT (worker)  │           ▼
            persona context +    │ research → build │     ┌──────────────┐
            checkpoint feedback  │ → refine         │     │ ESCALATION / │
                                 │ claude CLI (SWAP)│     │ HUMAN-IN-LOOP│
                                 └──────────────────┘     └──────────────┘
```

1. **Orchestrator (Run Engine)** — the thin control loop and the *only* thing the agent talks to. Owns the run lifecycle, retry loop, checkpoint persistence, and replay. Sequences the pillars; contains no domain logic itself.
2. **▌Material Handling▐** — `Source` brings in a **concept/idea/thought-experiment + a selected persona**; `Sink` emits a **self-contained single-page webpage (HTML/CSS)** that's trivially hostable (static file → preview → host). Narrow interface: `Source.load() → Material`, `Sink.publish(Webpage) → Receipt`.
3. **▌Guardrails (the Persona)▐** — a persona *is* the **declared** guardrail set: voice rules, key style points, and design tokens (palette, type, layout). Compiled two ways — a **preventive** prompt/context fragment injected into the agent, and **detective** validators feeding checkpoints. Declared once, enforced twice. This is what makes the output sound and look like *that* persona.
4. **▌Checkpoints▐** — ordered pass/fail gates with explicit thresholds: **research-sufficiency** (enough credible depth before building), **voice-fidelity** (output matches the persona voice), **design-conformance** (page honors the persona's design elements), **quality** (structure/coherence/completeness). Every result is **persisted** → replay from any checkpoint forward. A gate failure is a real outcome: *"could not produce a webpage — insufficient research."*
5. **▌Observability & Alarms▐** — a telemetry layer meters **token cost per phase (research / build / refine), latency, and error rate**; when a metric breaches a declared budget or a gate fails, it emits a **structured `Alarm { type, severity, context, recommendedAction }`**. Named types: `TOKEN_BUDGET_EXCEEDED`, `HIGH_LATENCY`, `INSUFFICIENT_RESEARCH`, `INSUFFICIENT_QUALITY`, `VOICE_DRIFT`, `DESIGN_DRIFT`, `WEBPAGE_GENERATION_FAILED`.
6. **Persona Store** — per-user personas (voice, style points, key learnings, design elements) persisted in SQLite, created in onboarding. Feeds both Guardrails (as declared constraints) and the agent (as context).
7. **Escalation / Human-in-the-loop** — on a critical alarm or a non-auto-correctable gate failure, the orchestrator **pauses and asks the user** in the frontend instead of guessing.
8. **Agent (worker, swappable)** — an **in-process module behind one `Agent` seam**, implemented with the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`), that **researches → builds the webpage → refines** it. Research uses Anthropic's server-side `web_search` / `web_fetch` tools. The harness owns the loop; the agent only sees a system prompt (the persona) + messages + feedback. Swapping it (bonus requirement) is a one-line `model` change — a different Claude model, or a different *provider* entirely. See `docs/agent-integration.md`.

---

## 2.5 Deployment topology & the agent transport

The agent is driven by an **in-process code API — the Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) — not a separate process. An `Agent` call is a normal awaitable: the orchestrator sends the persona + messages, `await`s the response, runs checkpoints on it, and loops by appending feedback. Two planes:

```
  CONTROL PLANE  (Vercel-deployable)
  ┌──────────────────────────────────────────────────┐
  │  Web Frontend (Next.js / React)                    │
  │   • onboarding: create a persona (voice/style/design)│
  │   • watch a run stream through the pillars          │
  │   • approve / reject at escalation points (HITL)    │
  └───────────────────────┬────────────────────────────┘
                          │ HTTPS / WebSocket
                          ▼
  HARNESS PLANE  (Node/TS backend — local now, cloud-deployable later)
  ┌──────────────────────────────────────────────────┐
  │  Backend API  ───────────────────►  SQLite DB      │
  │      │       (personas, runs, checkpoints, alarms, │
  │      │        metrics, escalations, webpages)       │
  │  ┌───┴──────────────  ORCHESTRATOR  ─────────────┐  │
  │  │  ▌GUARDRAILS(persona)▐  ▌CHECKPOINTS▐         │  │
  │  │  ▌MATERIAL▐    ▌OBSERVABILITY & ALARMS▐       │  │
  │  └──────────────────┬───────────────────────────┘  │
  │   await Agent.run() │  (in-process)                  │
  │  ┌──────────────────▼───────────────────────────┐  │
  │  │  Agent  (Vercel AI SDK, SWAPPABLE provider)   │  │
  │  │  research (web_search/web_fetch) → build →    │  │
  │  │  refine                                       │  │
  │  └──────────────────┬───────────────────────────┘  │
  └─────────────────────┼───────────────────────────────┘
                        │ HTTPS
                        ▼
         Anthropic API  (or any AI-SDK provider)
```

**The agent transport is a synchronous (awaitable) request/response** — no tmux, no async callback, no correlation IDs, no liveness polling. This is a deliberate simplification over an out-of-process agent: the orchestrator keeps tight control of the loop, persists a checkpoint per round, and escalates inline. Streaming (`.stream()`) pushes the build phase to the UI over WebSocket; human-in-the-loop is the orchestrator pausing the loop on a critical alarm and awaiting an operator decision from the frontend.

**Deploy:** because the agent is just an outbound API call (`ANTHROPIC_API_KEY` + network), the backend runs locally now and can deploy to a Node host / serverless later — there is no local-execution constraint pinning it down. The *output* (a static single-page webpage) hosts anywhere. See `docs/agent-integration.md` for the SDK details and the `Agent` seam.

---

## 3. The control flow — *where the agent's behavior actually changes* (≈1 min)

The question they'll hammer: *"How does the agent's behavior change from feedback?"* Have this cold.

```
1. persona  = PersonaStore.load(personaId)              // declared voice + style + design
2. material = MaterialHandler.load(concept, persona)    // the idea + persona context
3. guardrails = GuardrailEngine.compile(persona)        // persona → prompt fragment + validators

   ── RESEARCH phase ──
4. research = await agent.run({system: persona, messages, tools: [web_search, web_fetch]})
5. if research-sufficiency checkpoint FAILS:
        Alarm INSUFFICIENT_RESEARCH → append feedback "go deeper on X" → agent.run() again  ◀── BEHAVIOR CHANGES

   ── BUILD phase ──
6. webpage = await agent.run({system: persona, messages: [...concept, ...research], structuredOutput})
7. for cp in [voice-fidelity, design-conformance, quality]:
      result = cp.evaluate(webpage, persona, material)
      journal.persist(result)                            // <-- replay point
      if result.FAILED:
          if autoCorrectable AND attempts < MAX:
              messages.push(feedback(result))            // ◀── BEHAVIOR CHANGES (refine phase)
              webpage = await agent.run({...}); re-evaluate
          else:
              Alarm.raise(cp.toAlarm())                  // structured
              if severity == CRITICAL: escalate()        // stop and ask the user

8. receipt = Sink.publish(webpage)                       // only persona-faithful, researched, quality pages ship
```

**The meaningful behavior change:** a failed `VOICE_DRIFT` checkpoint ("too formal, score 0.42 < 0.75") produces structured feedback fed back into the agent's *refine* prompt ("match this voice sample; you drifted formal"). The next draft is materially different. `INSUFFICIENT_RESEARCH` sends it back to research; `DESIGN_DRIFT` sends it back to adjust the design. Guardrails (the persona) shape the **first** attempt; checkpoint feedback corrects the **later** ones. That closed loop is the harness.

---

## 4. Key decisions & *why* (this is what the format asks for)

| Decision | Why this over the alternative |
|---|---|
| **The persona is the declared guardrail, not a hidden prompt** | Voice/style/design live as declared data (per-persona config) the user authored in onboarding — inspectable, swappable, reusable across runs. Burying them in a prompt would make them implicit and un-enforceable; the rubric demands *declared* guardrails. |
| **Agent never talks to the pillars; the orchestrator mediates** | This *is* the rubric's thesis — constraint-handling stays invisible to the worker. The agent only ever sees a prompt + persona context + feedback. Letting it call the pillars itself would leak the cage and break swappability. |
| **Guardrails enforced twice: preventive (prompt) + detective (validator)** | Prompt-only is unreliable (agents drift); validator-only wastes a full generation before catching drift. Defense-in-depth: cheap prevention, guaranteed detection of voice/design violations. |
| **Checkpoints separate from guardrails** | The persona is the *declared rule* ("this is the voice"); a checkpoint is the *measured gate* ("voice-fidelity ≥ 0.75"). Checkpoints also cover gates that aren't persona rules at all — research-sufficiency, quality. Orthogonal concerns. |
| **"Observability" feeds the Alarms pillar; alarms are structured, not thrown** | Token-cost/latency/error-rate are *metrics*; alarms are what fire when a metric breaches a declared budget or a gate fails — each with **severity + recommended action + context**, and warnings don't halt the run. Exceptions would lose that metadata and the per-phase cost story the user cares about. |
| **Deterministic gates are hard blocks; LLM-judged gates are advisory + escalate** | Research-source-count, token-budget, latency are deterministic. Fuzzy gates (voice-fidelity, design-conformance, quality) use an LLM judge with a threshold and prefer **escalation over silent block**, because the judge is fallible. |
| **In-process Vercel AI SDK as the agent transport** | A code API makes an `Agent` call a normal awaitable — request → response — so the orchestrator keeps tight control of the loop, runs checkpoints inline, and loops by appending feedback to `messages[]`. We hold the conversation array, which maps 1:1 onto our checkpoint journal and replay. Simpler and more controllable than an out-of-process (tmux/CLI) agent. |
| **Vercel AI SDK over the raw Anthropic SDK** | Provider abstraction → swapping the worker (a different Claude model, or OpenAI/Google) is a one-line `model` change, which *is* the portability bonus. Tradeoff stated up front: the server-side `web_search`/`web_fetch` tools and prompt caching are Anthropic-specific (reached via `providerOptions`/provider tools), so research depth isn't portable — but the core build/refine loop is. |
| **Harness owns the loop (no autonomous agent framework)** | We drive the loop ourselves, not an Agent-SDK/Managed-Agents self-driving loop, because the harness *must* own the loop — that's the thesis (agent stays dumb, pillars constrain). A checkpoint runs after every round. |
| **Structured output (`output_config.format`) for material-out** | The build phase returns a typed `{title, html, css, summary, sourcesUsed}` object — a clean material-handling contract, not stdout/markdown scraping. |
| **SQLite for critical records** | Personas, runs, checkpoints, alarms, metrics, escalations are relational, transactional, and queried live by the API for the UI. (Published *webpages* are static files.) Right tool per data shape. |
| **Control plane on Vercel; backend local now, cloud-deployable later** | Because the agent is just an outbound API call, the backend isn't pinned to the machine — local for the demo, deployable to a Node host / serverless afterward (pair SQLite with Turso/libSQL in the cloud). |

---

## 5. Known tradeoffs & areas of uncertainty (say these *out loud* — honesty wins points)

1. **Voice-fidelity and quality gates rely on LLM-as-judge** → non-deterministic, can mis-score how "on-voice" a page is. *Mitigation:* deterministic gates (research-source-count, token-budget) are hard blocks; fuzzy gates have thresholds and escalate rather than silently auto-correct. Calibration of "voice-fidelity ≥ 0.75" is genuinely uncertain and persona-dependent.
2. **Defining a persona's voice well enough to measure against is hard.** Onboarding captures voice/style/learnings, but a thin persona yields a weak guardrail. *Mitigation:* the gate's feedback is specific, and a too-thin persona surfaces as repeated `VOICE_DRIFT` → escalate to enrich the persona.
3. **Research-sufficiency is a judgment call.** "Enough research" has no universal threshold; too strict blocks good pages, too loose ships shallow ones. *Mitigation:* a declared, per-persona-tunable threshold + escalation, not a hard-coded constant.
4. **The retry loop can oscillate** (refine → drift → refine). Bounded by `MAX_ATTEMPTS`; on exhaustion → `WEBPAGE_GENERATION_FAILED` + escalate, never loop forever.
5. **We depend on a third-party model API.** A refusal (`stop_reason: "refusal"`), rate-limit, or outage stalls a run. *Mitigation:* structured `PROVIDER_ERROR` / `RATE_LIMITED` / `REFUSAL` alarms + retry/escalate; the swappable `Agent` seam makes a second provider an adapter, not a rewrite.
6. **Cost and latency live on the critical path.** Research + build + refine can be many model calls. *Mitigation:* prompt-cache the persona + research prefix, meter per-call `usage`, and fire `TOKEN_BUDGET_EXCEEDED` / `HIGH_LATENCY` before spend runs away — this *is* the Observability pillar working.
7. **Orchestrator centrality risks a god-object.** Mitigated by keeping it a thin sequencer; all logic lives in the pillar modules behind narrow interfaces.
8. **Scope risk for a 24h build.** Persona onboarding + API + SQLite + Vercel frontend + research/build/refine pipeline is a lot. The demo-critical spine: *one persona → one concept → research+build+refine via the SDK → the four pillars → one published webpage.* Everything else is additive.

---

## 6. Failure modes (have an answer for each)

| Failure | Detection | Harness response |
|---|---|---|
| Concept too thin / empty | Source adapter | `INPUT_EMPTY` alarm (warning), halt — never run the agent on nothing |
| Not enough research to build on | research-sufficiency checkpoint | `INSUFFICIENT_RESEARCH` alarm → feedback loop (research more), then escalate |
| Output drifts off the persona's voice | voice-fidelity checkpoint (LLM judge) | `VOICE_DRIFT` alarm (warning) → refine loop, auto-retry; persistent drift → escalate |
| Page ignores the persona's design | design-conformance checkpoint | `DESIGN_DRIFT` alarm (warning) → refine loop |
| Page is incoherent / low quality | quality checkpoint | `INSUFFICIENT_QUALITY` alarm → refine, then `WEBPAGE_GENERATION_FAILED` + escalate |
| Research/build burns excess tokens | observability meter vs. declared budget | `TOKEN_BUDGET_EXCEEDED` alarm (warning→critical by overage) → recommended action: narrow scope / escalate |
| Run too slow | observability latency meter | `HIGH_LATENCY` alarm → recommended action surfaced in UI |
| Model API rate-limited / overloaded | SDK throws (429/529) | `RATE_LIMITED` alarm → backoff + retry (SDK auto-retries); persistent → escalate |
| Model refuses (`stop_reason: "refusal"`) | orchestrator checks `stop_reason` | `REFUSAL` alarm (critical) → escalate; never treat empty content as a draft |
| Output truncated (`stop_reason: "max_tokens"`) | orchestrator checks `stop_reason` | `OUTPUT_TRUNCATED` alarm → retry with higher `max_tokens` / streaming |
| Provider outage / network error | SDK throws after retries | `PROVIDER_ERROR` alarm (critical) → escalate; run resumes from last checkpoint |
| Judge LLM itself errors/times out | checkpoint engine | `CHECKPOINT_ERROR` alarm → **fail-closed** (treat as fail + escalate), never fail-open |
| All gates pass but page still weak | — | high-stakes runs keep a human final-approval escalation; the harness is honest that gates aren't infallible |

---

## 7. Anticipated Q&A — your sparring partner's likely shots (rehearse these)

**Q: Isn't "the persona" just a fancy system prompt?**
A: No — it's *declared, inspectable, reusable* data the user authored in onboarding, compiled into both a preventive prompt fragment *and* detective validators, and measured against by the voice/design checkpoints. A system prompt is implicit and unenforced; the persona is the declared guardrail the rubric demands, and it's reused across every run and surfaced in the UI.

**Q: How do you actually measure "voice fidelity"? That's subjective.**
A: An LLM judge scores the page against the persona's voice profile + style points + sample, producing a 0–1 score against a declared threshold. It's genuinely uncertain (stated tradeoff #1) — so it's advisory-with-escalation, not a hard silent block, while deterministic gates (research count, token budget) are the hard blocks.

**Q: How does the agent's behavior *actually* change — show me.**
A: A failed checkpoint produces structured feedback injected into the next prompt. `VOICE_DRIFT 0.42 → "match this sample, you drifted formal"` → the refined page scores 0.81 and passes. `INSUFFICIENT_RESEARCH` sends it back to the research phase. Live in the demo.

**Q: Why multiple personas — what does that buy you architecturally?**
A: The persona is a clean abstraction that decouples *who's writing* from *what's being written*. The same concept run through two personas yields two genuinely different pages — different voice, different design. It proves the guardrail pillar is doing real work, and it's a great demo.

**Q: Your 4th pillar is "observability," but the rubric says "alarms" — how do they relate?**
A: Observability is the *metric layer* (token cost per phase, latency, error rate); alarms are the *structured pillar output* — named types with severity, context, and recommended action — that fire when a metric breaches a declared budget or a gate fails. Metrics are the signal; alarms are the harness's structured response.

**Q: How does the backend actually drive the agent?**
A: The Vercel AI SDK in-process — `generateText` / `generateObject` over `@ai-sdk/anthropic`, behind one `Agent` seam. The persona is the `system` prompt, the concept + research + feedback are the messages, research uses Anthropic's server-side `web_search`/`web_fetch` tools, and the build phase uses `generateObject` (Zod schema) for a typed webpage contract. Normal request/response, so the orchestrator keeps the loop.

**Q: Why the Vercel AI SDK instead of the raw Anthropic SDK?**
A: Provider abstraction — swapping the worker is a one-line `model` change, which is the portability bonus. The honest cost: the server-side web tools and prompt caching are Anthropic-specific (via `providerOptions`/provider tools), so research depth isn't portable — but the part we want portable, the build/refine loop, is.

**Q: Why your own loop instead of an autonomous agent framework (Agent SDK / Managed Agents)?**
A: The harness *must* own the loop — that's the thesis (agent stays dumb, pillars constrain). An autonomous framework self-drives its own loop and context, which is exactly what we don't want. Our own loop runs a checkpoint after every round and escalates inline.

**Q: What stops an infinite refine loop (refine → drift → refine)?**
A: `MAX_ATTEMPTS`. On exhaustion → `WEBPAGE_GENERATION_FAILED` + escalate to the user.

**Q: What happens when the model refuses, rate-limits, or the provider is down?**
A: We check `stop_reason` and catch SDK errors: `REFUSAL`/`PROVIDER_ERROR` (critical) escalate; `RATE_LIMITED` backs off and retries (the SDK auto-retries 429/5xx); `OUTPUT_TRUNCATED` retries with more tokens. Every run is resumable from its last checkpoint.

**Q: How is this "deployed"?**
A: The agent is just an outbound API call, so there's no local-execution constraint. Vercel hosts the frontend; the backend runs locally for the demo and can deploy to a Node host / serverless afterward (SQLite → Turso/libSQL in the cloud). The *output* — a static webpage — hosts anywhere.

**Q: Why SQLite instead of the markdown+index approach your other project uses?**
A: Harness *state* (personas↔runs↔checkpoints↔alarms↔metrics) is relational, transactional, and queried live by the API. Markdown+index was right for document artifacts; published webpages stay as static files. Right tool per data shape.

**Q: Isn't this just rebuilding a generic agent orchestrator?**
A: No — the product is the four constraint pillars for *persona-faithful publishing*. A generic orchestrator routes tasks; Publisher governs a research-and-build worker and refuses to ship anything off-voice, under-researched, or low-quality. The harness semantics are the contribution.

**Q: How do you swap in a second worker for the portability bonus?**
A: Swappability is at the `Agent` interface. The simplest swap is the `model` param (opus → sonnet) — same SDK, harness untouched. A different provider is a new `Agent` implementation behind the same interface; nothing else changes. That's the bonus.

**Q: Replay — what's persisted and what re-runs?**
A: The journal persists the persona, the concept, every draft, and every checkpoint result + alarms + metrics. Replay re-enters the loop at the first non-passed checkpoint — e.g., replay from *build* reusing the research, without re-researching.

**Q: How does this hold up if the constraint changes — a new design system or a 3-second latency SLA?**
A: Add design tokens to the persona (no engine change) or a latency budget to the observability config; a breach fires `HIGH_LATENCY`. Declared-config + adapters absorb the change.

**Q: Have you considered a single LLM call with a long prompt?**
A: Yes — it fails the rubric (pillars not separable, no persistence/replay, no structured alarms, no swappability) and fails in practice (no detection of voice drift, no research-sufficiency gate, no per-phase cost visibility, no escalation, no audit trail).

**Q: What's the blast radius if the orchestrator has a bug?**
A: It's a thin sequencer with no domain logic, unit-tested at the loop level. Worst case it halts a run; it can never publish an off-voice or under-researched page because publishing is gated behind all checkpoints passing.

**Q: Where's the human-in-the-loop, concretely?**
A: A critical alarm or exhausted retry pauses the run and emits an escalation to the frontend (and the agent itself can `escalate` via MCP). The user resolves it — enrich the persona, approve anyway, or abort — and the run resumes from that checkpoint.

---

## 8. The 5-minute timing plan

| Time | Section | Slide/visual |
|---|---|---|
| 0:00–0:45 | The problem (publishing in *your* voice, well-researched, is two hard jobs) | a bland generic-AI page vs. a persona page |
| 0:45–2:45 | The 8 components + four pillars + the persona at the center (§2 diagram) | the architecture diagram |
| 2:45–3:45 | The control loop — research → build → refine, where behavior changes (§3) | the loop, highlight the feedback arrows |
| 3:45–4:30 | 2–3 key decisions + *why* (§4) — lead with "persona = declared guardrail" | the decisions table, top 3 |
| 4:30–5:00 | Known tradeoffs (§5) — say them before they ask | the tradeoffs list |

Hold the failure-mode and Q&A material (§6–7) for the questioning — deploy it as answers, don't spend presentation time on it.

---

## 9. Three things to *not* get caught on

1. **Don't over-claim measurability.** Say "voice-fidelity is an LLM-judged gate with a threshold, and it's a stated uncertainty," never "we objectively measure voice." The honest framing is stronger and the format rewards it.
2. **Don't let them collapse the persona into "just a prompt."** Have the one-liner ready (§7, Q1): declared, inspectable, reusable data, enforced twice and measured against.
3. **Don't let the agent creep into the architecture.** Every "the agent should check X" → "that's a pillar's job; the agent just researches and writes." That redirect *is* the design.
