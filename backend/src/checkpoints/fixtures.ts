import type {
  CheckpointContext,
  Persona,
  ResearchResult,
  Webpage,
} from "@publisher/shared";

/**
 * The DETERMINISTIC voice-drift fixture (ASSUMPTIONS D12) — the R2 money shot
 * made reproducible. Under the DEFAULT deterministic voice judge:
 *   • attempt-1 (off-voice, hype-laden) FAILS voice-fidelity → VOICE_DRIFT
 *   • attempt-2 (on-voice, echoes the voiceSample) PASSES
 * Pairs with Track C's scripted MockAgent so the demo's "rejected draft →
 * feedback → materially better draft" beat never depends on a live LLM.
 */

export interface VoiceDriftFixture {
  persona: Persona;
  concept: string;
  research: ResearchResult;
  attempt1: Webpage;
  attempt2: Webpage;
}

const persona: Persona = {
  id: "fixture-ada",
  name: "Ada",
  voice: "precise, warm, technical, plainspoken",
  voiceSample:
    "We build the smallest thing that proves the idea, then we thicken it. " +
    "Clarity over cleverness. Show the work; trust the reader. Ship the skeleton first.",
  stylePoints: [
    "short sentences",
    "concrete examples",
    "no hype",
    "show the work",
  ],
  keyLearnings: ["ship the skeleton first", "integrate before you thicken"],
  designElements: { tone: "calm", palette: "muted", typography: "serif" },
};

const research: ResearchResult = {
  text:
    "Emergence is how simple local rules produce complex global behavior — " +
    "from ant colonies to neural nets. We build small, observe, and thicken.",
  sources: [
    "https://example.com/emergence-primer",
    "https://example.com/complexity",
    "https://example.com/local-rules",
  ],
};

/** OFF-VOICE: hype-laden marketing speak — the opposite of "no hype". */
const attempt1: Webpage = {
  title: "UNLOCK EMERGENCE",
  html:
    "<main>SYNERGY! Leverage disruptive, paradigm-shifting emergence to " +
    "maximize stakeholder ROI across all verticals. Our revolutionary, " +
    "best-in-class platform delivers game-changing, next-gen value at scale!!!</main>",
  css: "",
  summary:
    "A high-impact, results-driven overview of emergence for stakeholders.",
  sourcesUsed: research.sources,
};

/** ON-VOICE: echoes the voiceSample — plain, concrete, "show the work". */
const attempt2: Webpage = {
  title: "On Emergence",
  html:
    "<main>We build the smallest thing that proves the idea, then we thicken it. " +
    "Emergence is simple: local rules, repeated, produce complex behavior. " +
    "Clarity over cleverness — we show the work and trust the reader. " +
    "Ship the skeleton first, observe, then thicken.</main>",
  css: "",
  summary:
    "A plainspoken explanation of emergence: build small, show the work, thicken.",
  sourcesUsed: research.sources,
};

export const voiceDriftFixture: VoiceDriftFixture = {
  persona,
  concept: "On Emergence",
  research,
  attempt1,
  attempt2,
};

/** Build a CheckpointContext from the fixture for a given attempt's webpage. */
export function buildContext(
  fx: VoiceDriftFixture,
  webpage: Webpage,
  attempt: number,
): CheckpointContext {
  return {
    persona: fx.persona,
    material: { concept: fx.concept, persona: fx.persona },
    research: fx.research,
    webpage,
    attempt,
    priorResults: [],
  };
}
