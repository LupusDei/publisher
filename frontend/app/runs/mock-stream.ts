/**
 * A deterministic mock RunEvent stream — the demo narrative as data. Used by
 * tests (no live backend) and by dev mode so the hero components render the
 * full story before Track G's SSE lands. The headline beat is the R2 money
 * shot: draft-1 VOICE_DRIFT 0.42 → feedback → draft-2 0.81 passing.
 *
 * Every event is a real `RunEvent` from @publisher/shared, with a monotonic
 * `seq`, so the same reducer that folds live events folds these — the mock is
 * not a parallel code path, it is the same contract with scripted values.
 */
import type {
  RunEvent,
  Webpage,
  Metrics,
  Alarm,
  Escalation,
  Receipt,
} from "@publisher/shared";

const RUN_ID = "run_mock";

function page(title: string, body: string, summary: string): Webpage {
  return {
    title,
    html: `<article><h1>${title}</h1>${body}</article>`,
    css: "article{max-width:42rem;margin:0 auto;font-family:Georgia,serif;line-height:1.6}h1{font-size:2rem}",
    summary,
    sourcesUsed: ["https://example.org/emergence", "https://example.org/complexity"],
  };
}

const DRAFT_1 = page(
  "On Emergence",
  "<p>Emergence is, like, when small stuff adds up to big stuff. It's pretty cool how that works honestly. Systems do things.</p>",
  "A casual take on emergence.",
);

const DRAFT_2 = page(
  "On Emergence",
  "<p>The whole becomes greater than its parts not by addition but by relation. A single neuron knows nothing of thought; a single bird, nothing of the flock's turning. Emergence is the quiet arithmetic by which simple rules, iterated, compose a mind.</p>",
  "A voice-true meditation on emergence — measured, lyrical, exact.",
);

function metrics(researchTok: number, buildTok: number, refineTok: number): Metrics {
  return {
    perPhase: {
      research: { tokens: researchTok, latencyMs: 820, calls: 1 },
      build: { tokens: buildTok, latencyMs: 1640, calls: 1 },
      refine: { tokens: refineTok, latencyMs: refineTok > 0 ? 1490 : 0, calls: refineTok > 0 ? 1 : 0 },
    },
    errorRate: 0,
  };
}

const VOICE_DRIFT_ALARM: Alarm = {
  type: "VOICE_DRIFT",
  severity: "warning",
  context: { score: 0.42, threshold: 0.75, checkpoint: "voice-fidelity" },
  recommendedAction:
    "Re-draft with explicit voice anchoring: match cadence and diction to the persona's voiceSample.",
};

const RECEIPT: Receipt = {
  id: RUN_ID,
  url: `/published/${RUN_ID}`,
  bytes: 4096,
  publishedAt: "2026-06-13T12:00:00.000Z",
  workerId: "opus",
};

/**
 * The full happy-path-with-redraft narrative, in order. seq is monotonic; ts is
 * synthetic but ordered. This is the canonical fixture the tests assert against.
 */
export function mockRunEvents(runId: string = RUN_ID): RunEvent[] {
  const r = runId;
  let seq = 0;
  const t = (n: number): string =>
    new Date(Date.UTC(2026, 5, 13, 12, 0, n)).toISOString();
  const next = (): { runId: string; seq: number; ts: string } => {
    const s = seq;
    seq += 1;
    return { runId: r, seq: s, ts: t(s) };
  };

  return [
    // ── Research phase ──────────────────────────────────────────────────
    { ...next(), t: "phase", phase: "research" },
    {
      ...next(),
      pillar: "material",
      t: "checkpoint",
      result: {
        name: "research-sufficiency",
        passed: true,
        score: 0.88,
        threshold: 0.7,
        details: "Two credible sources synthesized; concept well-covered.",
        autoCorrectable: false,
        alarms: [],
      },
    },
    { ...next(), pillar: "observability", t: "metric", metrics: metrics(1200, 0, 0) },

    // ── Build phase — draft 1 (the drift) ───────────────────────────────
    { ...next(), t: "phase", phase: "build" },
    {
      ...next(),
      pillar: "material",
      t: "draft",
      attempt: 1,
      webpage: DRAFT_1,
      score: 0.42,
      passed: false,
    },
    { ...next(), pillar: "observability", t: "metric", metrics: metrics(1200, 2100, 0) },
    // Voice-fidelity FAILS — emits the structured alarm + the feedback string.
    {
      ...next(),
      pillar: "observability",
      t: "alarm",
      alarm: VOICE_DRIFT_ALARM,
    },
    {
      ...next(),
      pillar: "checkpoints",
      t: "checkpoint",
      result: {
        name: "voice-fidelity",
        passed: false,
        score: 0.42,
        threshold: 0.75,
        details: "Draft reads as casual/colloquial; persona voice is measured and lyrical.",
        autoCorrectable: true,
        feedback:
          "Match the persona's voiceSample: replace colloquialisms ('like', 'pretty cool', 'honestly') with measured, lyrical prose. Anchor cadence to the sample.",
        alarms: [VOICE_DRIFT_ALARM],
      },
    },

    // ── Refine phase — draft 2 (the fix) ────────────────────────────────
    { ...next(), t: "phase", phase: "refine" },
    {
      ...next(),
      pillar: "material",
      t: "draft",
      attempt: 2,
      webpage: DRAFT_2,
      score: 0.81,
      passed: true,
    },
    { ...next(), pillar: "observability", t: "metric", metrics: metrics(1200, 2100, 1800) },
    {
      ...next(),
      pillar: "checkpoints",
      t: "checkpoint",
      result: {
        name: "voice-fidelity",
        passed: true,
        score: 0.81,
        threshold: 0.75,
        details: "Cadence and diction now match the persona voiceSample.",
        autoCorrectable: false,
        alarms: [],
      },
    },
    {
      ...next(),
      pillar: "checkpoints",
      t: "checkpoint",
      result: {
        name: "design-conformance",
        passed: true,
        score: 0.9,
        threshold: 0.7,
        details: "Declared design tokens reflected in the page CSS.",
        autoCorrectable: false,
        alarms: [],
      },
    },
    {
      ...next(),
      pillar: "checkpoints",
      t: "checkpoint",
      result: {
        name: "quality",
        passed: true,
        score: 0.86,
        threshold: 0.7,
        details: "Coherent, publishable, on-concept.",
        autoCorrectable: false,
        alarms: [],
      },
    },

    // ── Publish ─────────────────────────────────────────────────────────
    { ...next(), pillar: "material", t: "published", receipt: RECEIPT },
  ];
}

const CRITICAL_ALARM: Alarm = {
  type: "TOKEN_BUDGET_EXCEEDED",
  severity: "critical",
  context: { observed: 18000, limit: 12000, phase: "refine" },
  recommendedAction:
    "Pause and escalate: the run exceeded its token budget. Approve to continue or enrich the persona to converge faster.",
};

const ESCALATION: Escalation = {
  id: "esc_1",
  runId: RUN_ID,
  reason: "Token budget exceeded after repeated voice drift — human decision required.",
  alarm: CRITICAL_ALARM,
  options: ["enrich_persona", "approve_anyway", "abort"],
};

/**
 * A second narrative that escalates (R10) instead of publishing. Drives the
 * escalation UI demo: it pauses on a critical alarm awaiting a decision.
 */
export function mockEscalationEvents(runId: string = RUN_ID): RunEvent[] {
  const r = runId;
  let seq = 0;
  const t = (n: number): string =>
    new Date(Date.UTC(2026, 5, 13, 13, 0, n)).toISOString();
  const next = (): { runId: string; seq: number; ts: string } => {
    const s = seq;
    seq += 1;
    return { runId: r, seq: s, ts: t(s) };
  };

  return [
    { ...next(), t: "phase", phase: "research" },
    { ...next(), pillar: "observability", t: "metric", metrics: metrics(1200, 0, 0) },
    { ...next(), t: "phase", phase: "build" },
    {
      ...next(),
      pillar: "material",
      t: "draft",
      attempt: 1,
      webpage: DRAFT_1,
      score: 0.42,
      passed: false,
    },
    { ...next(), pillar: "observability", t: "alarm", alarm: CRITICAL_ALARM },
    { ...next(), pillar: "observability", t: "escalation", escalation: ESCALATION },
  ];
}

/**
 * A terminal-failure narrative ("refused to publish — here's why"). The harness
 * refusing to ship a bad page is itself a feature to SHOW.
 */
export function mockFailureEvents(runId: string = RUN_ID): RunEvent[] {
  const r = runId;
  let seq = 0;
  const t = (n: number): string =>
    new Date(Date.UTC(2026, 5, 13, 14, 0, n)).toISOString();
  const next = (): { runId: string; seq: number; ts: string } => {
    const s = seq;
    seq += 1;
    return { runId: r, seq: s, ts: t(s) };
  };

  return [
    { ...next(), t: "phase", phase: "build" },
    {
      ...next(),
      pillar: "checkpoints",
      t: "checkpoint",
      result: {
        name: "quality",
        passed: false,
        score: 0.31,
        threshold: 0.7,
        details: "Quality gate failed on every attempt; max attempts reached.",
        autoCorrectable: false,
        alarms: [],
      },
    },
    {
      ...next(),
      t: "failed",
      reason:
        "Refused to publish: the quality checkpoint failed on all 3 attempts (best score 0.31, threshold 0.70). The harness will not ship a page that fails its own gates.",
    },
  ];
}

/**
 * Drive a callback with the events one at a time on a timer — a faithful stand-in
 * for the SSE stream in dev. Returns a cancel function (clears the timer). The
 * `intervalMs` is configurable so tests can run it at 0ms.
 */
export function playMockStream(
  events: RunEvent[],
  onEvent: (e: RunEvent) => void,
  opts: { intervalMs?: number; onDone?: () => void } = {},
): () => void {
  const { intervalMs = 600, onDone } = opts;
  let i = 0;
  let cancelled = false;
  const timer = setInterval(() => {
    if (cancelled) return;
    if (i >= events.length) {
      clearInterval(timer);
      onDone?.();
      return;
    }
    const e = events[i];
    i += 1;
    if (e) onEvent(e);
  }, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
