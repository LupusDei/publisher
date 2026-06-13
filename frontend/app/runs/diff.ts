/**
 * A tiny word-level diff for the before/after draft compare (R2). Not a full
 * Myers diff — a longest-common-subsequence over whitespace-split tokens, which
 * is plenty to make "what changed between attempt N and N+1" legible on screen.
 */

export type DiffOp = "equal" | "added" | "removed";

export interface DiffToken {
  op: DiffOp;
  text: string;
}

/** Split into tokens while keeping the whitespace so re-joining looks natural. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * LCS-based word diff. Returns an ordered list of tokens tagged equal/added/
 * removed (removed = present in `before`, added = present in `after`).
 */
export function wordDiff(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "removed", text: a[i]! });
      i += 1;
    } else {
      out.push({ op: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ op: "removed", text: a[i]! });
    i += 1;
  }
  while (j < m) {
    out.push({ op: "added", text: b[j]! });
    j += 1;
  }
  return out;
}

/** Strip HTML tags to plain text so the diff compares prose, not markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
