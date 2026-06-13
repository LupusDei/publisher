# Addendum — Additional Telemetry Metrics

> **Author:** Valerian (review of epic `publisher-gu0`) · **Status:** approved by the General, in execution
> Extends `BRIEF.md`. The original 6 instruments stand unchanged; this adds **4 instruments + 1 token enrichment**, each justified against the harness thesis and the admin page's needs. Same constraints (env-gated, no-op in CI, never blocks a run, TDD).

## Why add anything?
The original six cover latency, errors, gate failures, outcomes, and token totals — the operational surface. What they *don't* capture is the harness's own quality story: **does the bounded feedback loop actually converge, and are our fuzzy thresholds calibrated?** Those are the two things the architecture defense explicitly flags as uncertain (tradeoffs #1 and #4). Measuring them turns "we think the loop is bounded" into evidence.

## The additions

### 7. `publisher.run.attempts` (histogram, unit `1`; attr `phase=research|refine`)
Number of iterations a run took in each looping phase before it converged (or hit the cap). The whole pitch is "checkpoint feedback changes the agent's later attempts" — this measures it. A distribution skewed toward `MAX_ATTEMPTS` is the **oscillation** failure mode (tradeoff #4) showing up in data.
- **Recorded:** at exit of the research loop and the refine loop in the run engine (`ctx.attempt` count).
- **Admin:** "avg refine passes per run", "research retry rate".

### 8. `publisher.checkpoint.score` (histogram, 0–1; attr `gate`)
The LLM-judge score per gate (`CheckpointResult.score`, already produced by voice-fidelity / design-conformance / quality). The defense doc calls voice-fidelity calibration "genuinely uncertain"; a live score distribution against the threshold is exactly the data to tune it.
- **Recorded:** in `recordCheckpoint`, only when `result.score !== undefined`.
- **Admin:** score distribution per gate vs. its threshold (calibration view); complements `checkpoint.failures`.

### 9. `publisher.run.duration` (histogram, ms)
End-to-end run wall-clock (start → terminal transition). `http.server.duration` is request latency and `run.phase.duration` is per-phase; neither is the headline "how long did producing a page take" number a user feels.
- **Recorded:** once at every terminal transition (publish/fail/escalate/awaitApproval), `now - ctx.startedAt`.
- **Admin:** avg + p95 end-to-end run time.

### 10. `publisher.runs.active` (UpDownCounter, unit `1`)
In-flight runs. +1 at `start()`, −1 at every terminal transition (including pause-for-approval? **no** — a run awaiting approval is still "active/held", so −1 only on publish/fail/abort-escalate; awaiting_approval keeps it counted). Gives the admin page a system-load gauge and makes stuck runs visible.
- **Admin:** "runs in flight" live gauge.

### Enrichment — `publisher.tokens.cached_input` (counter; attr `phase`, `workerId`)
`Usage.cachedInputTokens` is already on the wire. Prompt caching is the defense doc's headline cost lever; without surfacing cache hits we can't show it working. Sibling counter (not an attribute) so it aggregates cleanly alongside `tokens.total`.
- **Recorded:** in `recordTokens`, when `usage.cachedInputTokens` is present.
- **Admin:** cache-hit ratio = `cached_input / tokens.total` → cost-savings story.

## Net instrument set: **11** (6 original + 4 new + 1 enrichment counter)
All new instruments go through the same injectable, no-op-by-default telemetry API (`metrics.ts`); CI exercises the no-op path, so this adds **zero** required behavior and keeps every existing test green. The new engine recordings (`recordRunAttempts`, `recordCheckpointScore`, `recordRunDuration`, `runStarted`/`runEnded`, `recordTokens` cached arg) are added behind the same injected `telemetry` dep.
