/**
 * timeAgo — a compact, human relative timestamp ("just now", "5m ago", "3h
 * ago", "2d ago", "Jun 13") for run cards. `now` is injectable so the format is
 * deterministic under test. Invalid input returns "" so the caller can omit it.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((now.getTime() - then) / 1000);
  // Future / clock-skew timestamps read as the present, never negative.
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  // Older than ~a month → an absolute short date is clearer than "8w ago".
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** A full, unambiguous timestamp for the card's hover title (disambiguates two
 * runs with the same concept). Returns "" for invalid input. */
export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
