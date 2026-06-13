import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Persona, Webpage } from "@publisher/shared";

/**
 * The judge seam for the two judge checkpoints (voice-fidelity, quality).
 *
 * A `Judge` is an injectable scoring function `(input) → score in [0,1]`. The
 * DEFAULT judges here are DETERMINISTIC and token-free so the harness — gates,
 * orchestrator, UI, the R2 money-shot fixture — develops and tests offline with
 * no API key (ASSUMPTIONS D12). The real LLM judge is wired later (Track C/G)
 * by passing a different `Judge` through the checkpoint dependencies; nothing in
 * this module reaches the network.
 *
 * FAIL-CLOSED (ASSUMPTIONS D7, dp0.5.2): `runJudge` never lets a judge fault
 * pass as a high score. On throw/reject it returns `{ ok:false, score:0 }` so
 * the calling checkpoint emits a `CHECKPOINT_ERROR` alarm and FAILS the gate.
 */

/** What a judge sees: the persona to measure against and the page under review. */
export interface JudgeInput {
  persona: Persona;
  webpage?: Webpage | undefined;
}

/** An injectable judge: scores an attempt in [0,1]. May be sync or async. */
export type Judge = (input: JudgeInput) => number | Promise<number>;

/** The outcome of running a judge under the fail-closed wrapper. */
export interface JudgeOutcome {
  /** False when the judge threw/rejected — the gate must treat this as FAIL. */
  ok: boolean;
  /** Clamped to [0,1]; 0 on any error. */
  score: number;
  /** The captured error message when `ok` is false. */
  error?: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** The visible text of a page — strips tags so vocabulary comparison is fair. */
function plainText(webpage: Webpage): string {
  return `${webpage.title} ${webpage.html} ${webpage.summary}`
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();
}

/** Tokenize into a set of word stems (length ≥ 3) for overlap scoring. */
function wordSet(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return new Set(words);
}

/**
 * Deterministic voice judge. Heuristic: how much of the persona's voiceSample +
 * stylePoints vocabulary the page echoes (Jaccard-style overlap), with a penalty
 * for "hype" markers the personas explicitly avoid. Real-shaped — the real LLM
 * judge replaces this with a model call returning the same [0,1] score.
 */
export function deterministicVoiceJudge(input: JudgeInput): number {
  const { persona, webpage } = input;
  if (!webpage) return 0;

  const sampleRef = wordSet(persona.voiceSample);
  if (sampleRef.size === 0) return 0;
  const styleRef = wordSet(`${persona.stylePoints.join(" ")} ${persona.voice}`);

  const text = plainText(webpage);
  const pageWords = wordSet(text);

  // Primary signal: how much of the voiceSample's vocabulary the page echoes.
  let sampleHits = 0;
  for (const w of sampleRef) if (pageWords.has(w)) sampleHits++;
  const sampleCoverage = sampleHits / sampleRef.size;

  // Secondary bonus: style/voice descriptor words present in the page.
  let styleHits = 0;
  for (const w of styleRef) if (pageWords.has(w)) styleHits++;
  const styleBonus = styleRef.size === 0 ? 0 : styleHits / styleRef.size;

  const coverage = clamp01(sampleCoverage * 0.85 + styleBonus * 0.15);

  // Hype markers the personas avoid ("no hype"): each drags the score down.
  const hypeMarkers = [
    "synergy",
    "leverage",
    "disruptive",
    "paradigm",
    "stakeholder",
    "roi",
    "verticals",
    "maximize",
  ];
  const hypeHits = hypeMarkers.filter((m) => text.includes(m)).length;
  const penalty = Math.min(0.6, hypeHits * 0.15);

  return clamp01(coverage - penalty);
}

/**
 * Deterministic quality judge. Heuristic: rewards substantive content length and
 * a non-trivial summary, the two cheap proxies for "did the worker actually
 * produce something". Real LLM judge swaps in later behind the same signature.
 */
export function deterministicQualityJudge(input: JudgeInput): number {
  const { webpage } = input;
  if (!webpage) return 0;

  const body = webpage.html.replace(/<[^>]*>/g, " ").trim();
  const wordCount = (body.match(/\S+/g) ?? []).length;
  // Saturating content score: ~60 words of real body ⇒ full marks.
  const contentScore = clamp01(wordCount / 60);

  const summaryWords = (webpage.summary.match(/\S+/g) ?? []).length;
  const summaryScore = clamp01(summaryWords / 8);

  // Weighted: content dominates, a real summary lifts it over threshold.
  return clamp01(contentScore * 0.7 + summaryScore * 0.3);
}

/**
 * The model's structured verdict (rrt.4.1). `score` ∈ [0,1]; `rationale` is a
 * short justification kept for debugging/telemetry. `generateObject` constrains
 * the model to exactly this shape so we never parse free-text.
 */
const VoiceVerdictSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Voice-fidelity score in [0,1]: 1 = perfectly on-voice."),
  rationale: z
    .string()
    .describe("One sentence justifying the score against the voice sample."),
});

export interface RealVoiceJudgeOptions {
  apiKey: string;
  /** Judge model; defaults to the most capable Opus (matches the worker default). */
  model?: string;
}

/**
 * The REAL, Claude-backed voice judge (rrt.4.1). Returns an injectable `Judge`
 * that scores a built page against the persona's voice profile + `voiceSample`
 * via a single `generateObject` call (ai@6) constrained to `VoiceVerdictSchema`,
 * yielding a [0,1] score. It NEVER throws on a missing page (returns 0 so the
 * fail-closed wrapper fails the gate); a provider/parse fault propagates so
 * `runJudge` catches it → `{ ok:false }` → critical CHECKPOINT_ERROR + fail.
 *
 * Env-gated at the composition root: only selected when USE_REAL_AGENT + a key
 * are present (see `selectVoiceJudge`); the deterministic judge stays the
 * default for mock/tests so the harness needs no network or key.
 */
/* c8 ignore start -- network-gated real judge; the SDK-mocked unit test covers the logic, the live call is not run in CI (D20). */
export function createRealVoiceJudge(opts: RealVoiceJudgeOptions): Judge {
  const provider = createAnthropic({ apiKey: opts.apiKey });
  const languageModel = provider(opts.model ?? "claude-opus-4-8");

  return async ({ persona, webpage }: JudgeInput): Promise<number> => {
    // No page → nothing to score. Return 0 so the gate fails closed (a draft
    // that produced no webpage must never pass the voice check).
    if (!webpage) return 0;

    const system =
      "You are a strict voice-fidelity judge. Score how faithfully the page " +
      "below matches the target persona's authentic writing voice. Reward " +
      "diction, tone, and rhythm that match the voice sample; penalize off-voice " +
      "register (e.g. corporate hype, academic stiffness) the persona avoids. " +
      "Return ONLY the structured verdict.";

    const prompt =
      `PERSONA: ${persona.name}\n` +
      `VOICE: ${persona.voice}\n` +
      `STYLE POINTS: ${persona.stylePoints.join("; ")}\n` +
      `VOICE SAMPLE (the gold standard):\n"""${persona.voiceSample}"""\n\n` +
      `PAGE UNDER REVIEW:\n` +
      `Title: ${webpage.title}\n` +
      `Summary: ${webpage.summary}\n` +
      `Body (text): ${plainText(webpage)}\n\n` +
      `Score 0..1 how on-voice this page is for ${persona.name}.`;

    const { object } = await generateObject({
      model: languageModel,
      schema: VoiceVerdictSchema,
      system,
      prompt,
    });
    // clamp01 in runJudge also guards, but normalize here too.
    return clamp01(object.score);
  };
}
/* c8 ignore stop */

/**
 * Run a judge FAIL-CLOSED. Any throw/rejection becomes `{ ok:false, score:0 }`
 * so a faulting judge can NEVER pass a gate (never fail-open). Scores are
 * clamped into [0,1].
 */
export async function runJudge(
  judge: Judge,
  input: JudgeInput,
): Promise<JudgeOutcome> {
  try {
    const raw = await judge(input);
    return { ok: true, score: clamp01(raw) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, score: 0, error };
  }
}
