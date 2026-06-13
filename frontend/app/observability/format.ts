/**
 * Display formatters for the observability surfaces. Pure functions, unit
 * tested directly — they carry the only display logic that isn't trivial
 * markup, so they live apart from the page components.
 */

/** Group a token count with thousands separators (e.g. 1234567 → "1,234,567"). */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return "—";
  return Math.round(tokens).toLocaleString("en-US");
}

/** A latency in ms rendered with a unit; sub-1000 stays ms, else seconds. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

/** A 0..1 ratio rendered as a whole-ish percentage (e.g. 0.1234 → "12.3%"). */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const clamped = Math.max(0, Math.min(1, ratio));
  return `${(clamped * 100).toFixed(1)}%`;
}

/**
 * Map an error count to a severity bucket so error panels are color-coded by
 * volume — but the bucket is ALSO surfaced as text/aria so it never relies on
 * color alone (WCAG 1.4.1). Thresholds are deliberately coarse for an MVP.
 */
export type ErrorSeverity = "info" | "warning" | "critical";

export function errorSeverity(count: number): ErrorSeverity {
  if (count >= 10) return "critical";
  if (count >= 3) return "warning";
  return "info";
}

export const SEVERITY_LABEL: Record<ErrorSeverity, string> = {
  info: "Low",
  warning: "Elevated",
  critical: "High",
};
