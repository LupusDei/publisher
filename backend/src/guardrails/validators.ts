import type { Persona, Validator, ValidatorFinding, Webpage } from "@publisher/shared";
import {
  DEFAULT_BANNED_PHRASES,
  LAYOUT_MARKERS,
  PALETTE_MARKERS,
  TYPOGRAPHY_MARKERS,
  type TokenMarkerRule,
} from "./vocabulary.js";

/**
 * Detective validators — the DETECTIVE half of the Guardrails pillar (Pillar 2).
 * Each is a pure, deterministic `Validator` (page, persona) → findings: NO LLM,
 * NO network. They catch declared-guardrail violations cheaply before a full
 * generation/judge pass (Track D runs and scores them).
 *
 * Three families:
 *   1. designTokenValidator  — declared design tokens present in page CSS/markup
 *      (against the FIXED vocabulary, D3)
 *   2. bannedPhraseValidator — banned / character-leak phrasings absent
 *   3. structureValidator    — basic structure (title, h1) + length heuristics
 *
 * `buildValidators(persona)` bundles the set the GuardrailEngine attaches to the
 * compiled guardrail.
 */

/** Lowercased haystack of the page's css + html, scanned by the marker checks. */
function pageHaystack(page: Webpage): string {
  return `${page.css}\n${page.html}`.toLowerCase();
}

/** Strip tags to approximate visible text content for length/leak heuristics. */
function textContent(page: Webpage): string {
  return page.html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the first marker rule whose `match` substring appears in the declared
 * token value (case-insensitive). Returns null when the declared value is not
 * one we have markers for — in which case the token check is skipped rather than
 * failed, keeping validators total over arbitrary persona values.
 */
function ruleForValue(
  value: string,
  rules: TokenMarkerRule[],
): TokenMarkerRule | null {
  const v = value.toLowerCase();
  return rules.find((r) => v.includes(r.match)) ?? null;
}

function tokenFinding(
  tokenKey: string,
  declaredValue: string,
  rules: TokenMarkerRule[],
  haystack: string,
): ValidatorFinding | null {
  const rule = ruleForValue(declaredValue, rules);
  if (!rule) return null; // no marker vocabulary for this value → not gated
  // Strip antiMarker contexts first so e.g. "serif" does not match inside
  // "sans-serif" (a sans-serif declaration must not satisfy a serif rule).
  const scanned = (rule.antiMarkers ?? []).reduce(
    (h, anti) => h.split(anti).join(" "),
    haystack,
  );
  const matched = rule.markers.find((m) => scanned.includes(m));
  const passed = matched !== undefined;
  return {
    rule: `design-token:${tokenKey}`,
    passed,
    detail: passed
      ? `Declared ${tokenKey} "${declaredValue}" is reflected in the page (matched "${matched}").`
      : `Declared ${tokenKey} "${declaredValue}" not detected in page CSS/markup (expected one of: ${rule.markers.join(", ")}).`,
  };
}

/**
 * (1) Required design tokens present. Checks the persona's declared
 * typography / layout / palette values against marker fragments in the page's
 * CSS + markup. Tone has no reliable CSS marker (D3) so it is intentionally not
 * hard-gated here — voice/tone fidelity is the checkpoints' (Track D) job.
 */
export const designTokenValidator: Validator = (page, persona) => {
  const haystack = pageHaystack(page);
  const findings: ValidatorFinding[] = [];
  const de = persona.designElements;

  const checks: Array<[string, string | undefined, TokenMarkerRule[]]> = [
    ["typography", de.typography, TYPOGRAPHY_MARKERS],
    ["layout", de.layout, LAYOUT_MARKERS],
    ["palette", de.palette, PALETTE_MARKERS],
  ];

  for (const [key, value, rules] of checks) {
    if (!value || !value.trim()) continue;
    const finding = tokenFinding(key, value.trim(), rules, haystack);
    if (finding) findings.push(finding);
  }

  return findings;
};

/**
 * (2) Banned / character-leak phrasings absent. Scans the page's visible text
 * (plus raw html as a fallback) for meta-leakage that signals the agent broke
 * character. Personas may extend the floor via a `bannedPhrases` design key
 * (semicolon-separated). Emits ONE finding per banned phrase that appears, plus
 * a single passing finding when the page is clean.
 */
export const bannedPhraseValidator: Validator = (page, persona) => {
  const haystack = `${textContent(page)}\n${page.html}`.toLowerCase();
  const banned = personaBannedPhrases(persona);

  const findings: ValidatorFinding[] = banned
    .filter((phrase) => haystack.includes(phrase))
    .map((phrase) => ({
      rule: "banned-phrase",
      passed: false,
      detail: `Page contains banned/leak phrasing: "${phrase}".`,
    }));

  if (findings.length === 0) {
    return [
      {
        rule: "banned-phrase",
        passed: true,
        detail: `No banned/leak phrasing found (checked ${banned.length} phrases).`,
      },
    ];
  }
  return findings;
};

function personaBannedPhrases(persona: Persona): string[] {
  const extra = persona.designElements.bannedPhrases;
  const custom = extra
    ? extra
        .split(";")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
    : [];
  // De-duplicate while preserving the default floor first.
  return Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...custom]));
}

const MIN_BODY_CHARS = 200;

/**
 * (3) Basic structure + length heuristics. A publishable page should have a
 * non-empty title, at least one <h1>, and enough body text to be a real article
 * rather than a stub. Each is an independent finding.
 */
export const structureValidator: Validator = (page) => {
  const findings: ValidatorFinding[] = [];

  const hasTitle = page.title.trim().length > 0;
  findings.push({
    rule: "structure:title",
    passed: hasTitle,
    detail: hasTitle
      ? `Page has a title ("${page.title.trim()}").`
      : "Page is missing a title.",
  });

  const hasH1 = /<h1[\s>]/i.test(page.html);
  findings.push({
    rule: "structure:heading",
    passed: hasH1,
    detail: hasH1
      ? "Page has an <h1> heading."
      : "Page is missing an <h1> heading.",
  });

  const bodyLen = textContent(page).length;
  const longEnough = bodyLen >= MIN_BODY_CHARS;
  findings.push({
    rule: "structure:length",
    passed: longEnough,
    detail: longEnough
      ? `Body text length ${bodyLen} meets the ${MIN_BODY_CHARS}-char floor.`
      : `Body text length ${bodyLen} is below the ${MIN_BODY_CHARS}-char floor.`,
  });

  return findings;
};

/**
 * Bundle the detective validator set for a persona. Returned by the
 * GuardrailEngine as the compiled guardrail's `validators`. Deterministic: the
 * same persona always yields the same set in the same order.
 */
export function buildValidators(_persona: Persona): Validator[] {
  return [designTokenValidator, bannedPhraseValidator, structureValidator];
}
