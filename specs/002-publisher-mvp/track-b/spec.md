# Spec — Track B: Guardrail Compiler (Pillar 2)

> **Root bead:** `publisher-dp0.3` (children `dp0.3.1–dp0.3.3`) · **Master plan:** `../OVERVIEW.md` · **Decisions:** `../ASSUMPTIONS.md`
> **Depends on Track 0** (the `GuardrailEngine`/`Validator` interfaces + `Persona.voiceSample` + the relocated `compile.ts` stub).

## Problem
The persona is the **declared guardrail**, and the rubric demands it be enforced — not buried in an implicit prompt. Pillar 2 compiles a persona **two ways**: **preventively** into the agent's system prompt, and **detectively** into TS validators that feed the checkpoints. "Declared once, enforced twice." This is the knockout answer to "isn't the persona just a system prompt?" — and it powers the R3 "compiled guardrail" UI panel.

## Non-Goals
- The voice/design *checkpoints* (the measured gates) — that's Track D. Track B produces the prompt fragment + the validator functions; Track D runs them and scores.
- Judge LLM calls — validators here are **deterministic** TS checks.

## Locked Decisions
- **D2:** `compilePersonaSystem` was moved from `agent/` to `backend/src/guardrails/compile.ts` by Track 0 as a minimal stub. Track B owns and enriches it.
- **D3:** detective validators check against the **fixed design-token vocabulary** (`palette`, `typography`, `layout`, `tone`) so keys are known.
- **D19:** `compile()` is re-runnable so escalation "enrich persona" can recompile before resuming.

## User Stories

### US1 — Preventive compile: persona → system-prompt fragment (Priority: P1) — bead `dp0.3.1`
**As** the orchestrator, **I want** `compile(persona).systemPrompt`, **so that** the agent's first attempt is shaped by the declared voice/style/design.
**Acceptance:** `systemPrompt` incorporates voice, style points, key learnings, `voiceSample` (as an exemplar), and design tokens; deterministic; covered by tests over fixture personas (incl. sparse-persona edge case).

### US2 — Detective compile: persona → validators[] (Priority: P1) — bead `dp0.3.2`
**As** the checkpoints (Track D), **I want** deterministic `Validator` functions, **so that** voice/design violations are caught cheaply without a full generation.
**Acceptance:** validators return `ValidatorFinding[]` (rule, passed, detail); cover at least: required design tokens present in the page CSS/markup, banned/leak phrasings absent, basic structure/length heuristics; each validator independently tested (passing + failing input).

### US3 — `compile()` integration + the inspection contract (Priority: P1) — bead `dp0.3.3`
**As** Track H (R3 panel) and the orchestrator, **I want** `GuardrailEngine.compile(persona) → { systemPrompt, validators }` and an endpoint that returns the compiled output for a stored persona, **so that** the compiled guardrail is inspectable.
**Acceptance:** `compile()` integration tested over the two seeded personas (proving two personas → two different prompts); `GET /personas/:id/compiled` returns `{ systemPrompt, validators: [{rule, ...}] }` (validators described, not serialized as functions); registers via the router registry.

## Success Criteria
- `compile()` is deterministic and total over all personas; two distinct personas yield two distinct system prompts + validator sets; validators catch seeded violations; build+test green; the compiled view is fetchable (powers R3).

## Tasks (TDD-shaped — map to beads)
- **T001a/b** [US1] (`dp0.3.1`) Failing tests over fixtures → impl preventive prompt builder in `backend/src/guardrails/compile.ts`. RED→GREEN.
- **T002a/b** [US2] (`dp0.3.2`) Failing tests (passing+failing inputs) → impl detective validators in `backend/src/guardrails/validators.ts` against the fixed vocabulary. RED→GREEN.
- **T003a/b** [US3] (`dp0.3.3`) Failing integration tests (two-persona divergence) → impl `GuardrailEngine` in `backend/src/guardrails/index.ts` + `GET /personas/:id/compiled` route. RED→GREEN.

> **Concurrency (Rule 7):** Track B owns `backend/src/guardrails/` (+ one read-only persona route). Disjoint from other tracks. Develops fully against fixture personas + the two seeds — no agent, no network.
