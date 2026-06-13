/**
 * The FIXED design-token vocabulary (ASSUMPTIONS D3). Onboarding (Track A)
 * captures design elements under exactly these keys, so the detective validators
 * (Track B) can check for their presence and the preventive compile can emit them
 * in a canonical order. Declared here once and shared by compile + validators so
 * the two halves of the guardrail agree on the key set.
 */
export const DESIGN_TOKEN_VOCABULARY = [
  "palette",
  "typography",
  "layout",
  "tone",
] as const;

export type DesignTokenKey = (typeof DESIGN_TOKEN_VOCABULARY)[number];

/**
 * Heuristic marker fragments per token VALUE. The detective validator checks the
 * built page's CSS/markup for at least one marker associated with the declared
 * value. Markers are intentionally broad, lowercase substrings — deterministic
 * and cheap (no LLM). `tone` is a soft signal (no reliable CSS marker), so it is
 * matched against page text content rather than gating hard.
 *
 * Keys are matched case-insensitively against the declared persona value; the
 * FIRST entry whose key is a substring of the declared value wins.
 */
export interface TokenMarkerRule {
  /** Substring that must appear in the persona's declared token value. */
  match: string;
  /** Lowercased fragments — ANY of which, found in css+html, satisfies the rule. */
  markers: string[];
}

export const TYPOGRAPHY_MARKERS: TokenMarkerRule[] = [
  { match: "serif", markers: ["serif", "georgia", "times", "garamond"] },
  {
    match: "sans",
    markers: ["sans-serif", "helvetica", "arial", "inter", "system-ui"],
  },
  { match: "mono", markers: ["monospace", "mono", "courier", "menlo"] },
];

export const LAYOUT_MARKERS: TokenMarkerRule[] = [
  {
    match: "grid",
    markers: ["display:grid", "display: grid", "grid-template", "grid-template-columns"],
  },
  {
    match: "single-column",
    markers: ["max-width", "margin:0 auto", "margin: 0 auto", "flex-direction:column", "flex-direction: column"],
  },
  {
    match: "flex",
    markers: ["display:flex", "display: flex", "flex-direction"],
  },
];

export const PALETTE_MARKERS: TokenMarkerRule[] = [
  {
    match: "mono",
    markers: ["#000", "#fff", "black", "white", "#111", "#eee", "#f5f5f5"],
  },
  {
    match: "warm",
    markers: ["#f", "#e", "rgb(", "hsl(", "beige", "cream", "tan", "brown", "amber"],
  },
];

/**
 * Default banned / leak phrasings the page must NOT contain — the kind of
 * meta-leakage an LLM emits when it breaks character (e.g. talking about itself
 * or the prompt). Personas may add their own via a `bannedPhrases` design token
 * convention, but these are the floor. Lowercased for case-insensitive scanning.
 */
export const DEFAULT_BANNED_PHRASES = [
  "as an ai",
  "as a language model",
  "i cannot",
  "i'm sorry, but",
  "system prompt",
  "as requested by the persona",
  "lorem ipsum",
] as const;
