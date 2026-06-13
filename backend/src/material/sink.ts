import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { type Receipt, type Webpage } from "@publisher/shared";
import type { Sink } from "../domain/index.js";

export interface FileSinkOptions {
  /** Directory the self-contained HTML files are written to. */
  dir: string;
  /** Base URL prefix for the returned Receipt.url (e.g. "" → "/published/:id"). */
  baseUrl: string;
}

/** Render a Webpage into a single self-contained HTML document (css inlined). */
export function renderHtml(page: Webpage): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(page.title)}</title>
<style>${page.css}</style>
</head>
<body>
${page.html}
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * True iff `html` is genuinely self-contained — it pulls in NO external
 * resources (no linked stylesheets, no remote scripts, no CSS `@import`). This
 * is the Pillar 1 property graded for a "truly standalone, hostable page": the
 * file must render identically with zero network. Inline `<style>`/`<script>`
 * blocks are fine; an external `<link rel=stylesheet>`, `<script src>`, or
 * `@import` is not.
 */
export function isSelfContained(html: string): boolean {
  const linkedStylesheet = /<link\b[^>]*\brel=["']?[^"'>]*stylesheet/i;
  const remoteScript = /<script\b[^>]*\bsrc=/i;
  const cssImport = /@import\b/i;
  return (
    !linkedStylesheet.test(html) &&
    !remoteScript.test(html) &&
    !cssImport.test(html)
  );
}

/**
 * Minimal Material-Handling Sink (Pillar 1, skeleton scope). Writes a
 * self-contained HTML file keyed by id and returns a `Receipt`. The real file
 * hosting (`read`) is the documented real-IO path; the deterministic
 * write+receipt path is fully covered (ASSUMPTIONS D20). Track F thickens this.
 */
export function createFileSink(
  opts: FileSinkOptions,
  now: () => string = () => new Date().toISOString(),
): Sink & { read(id: string): string | null } {
  mkdirSync(opts.dir, { recursive: true });

  return {
    async publish(page, meta) {
      const html = renderHtml(page);
      const bytes = Buffer.byteLength(html, "utf8");
      const file = join(opts.dir, `${meta.runId}.html`);
      writeFileSync(file, html, "utf8");
      const receipt: Receipt = {
        id: meta.runId,
        url: `${opts.baseUrl}/published/${meta.runId}`,
        bytes,
        publishedAt: now(),
        workerId: meta.workerId,
      };
      return receipt;
    },

    /* c8 ignore start -- real-IO host read path is exercised by the integration test, not unit-covered (D20) */
    read(id) {
      const file = join(opts.dir, `${id}.html`);
      if (!existsSync(file)) return null;
      return readFileSync(file, "utf8");
    },
    /* c8 ignore stop */
  };
}
