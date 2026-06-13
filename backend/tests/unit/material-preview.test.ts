import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileSink, isSelfContained } from "../../src/material/sink.js";
import { servePublishedPage } from "../../src/material/preview.js";
import type { Webpage } from "@publisher/shared";

const page: Webpage = {
  title: "Preview Page",
  html: "<main><h1>Hello</h1></main>",
  css: "h1{color:rebeccapurple}",
  summary: "preview",
  sourcesUsed: [],
};

describe("servePublishedPage", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "publisher-preview-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("should serve the self-contained published page for a known id", async () => {
    const sink = createFileSink({ dir, baseUrl: "" });
    await sink.publish(page, { runId: "run_1", workerId: "mock" });

    const response = servePublishedPage(sink, "run_1");

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<h1>Hello</h1>");
    expect(response.body).toContain("color:rebeccapurple");
    expect(isSelfContained(response.body)).toBe(true);
  });

  it("should return a 404 response for an unknown id", () => {
    const sink = createFileSink({ dir, baseUrl: "" });

    const response = servePublishedPage(sink, "missing");

    expect(response.status).toBe(404);
    expect(response.body).toMatch(/not found/i);
  });
});
