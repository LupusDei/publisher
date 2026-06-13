import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileSink,
  renderHtml,
  isSelfContained,
} from "../../src/material/sink.js";
import type { Webpage } from "@publisher/shared";

const page: Webpage = {
  title: "Emergence & Attention",
  html: "<main><h1>Emergence</h1><p>Not magic — attention paid closely.</p></main>",
  css: "body{font-family:serif;color:#222} h1{font-size:2rem}",
  summary: "A short essay on emergence.",
  sourcesUsed: ["https://example.com/emergence"],
};

describe("renderHtml", () => {
  it("should produce a self-contained document with the css inlined", () => {
    const html = renderHtml(page);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<style>");
    // The css text must appear inline in the document.
    expect(html).toContain("font-family:serif");
    // The page body must be present.
    expect(html).toContain("<h1>Emergence</h1>");
  });

  it("should be self-contained — no external css/js/font references", () => {
    const html = renderHtml(page);

    expect(isSelfContained(html)).toBe(true);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it("should escape title characters that would break the document head", () => {
    const html = renderHtml({ ...page, title: "A <b> & </b> tag" });

    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    // The raw, unescaped sequence must not leak into <title>.
    expect(html).not.toContain("<title>A <b>");
  });
});

describe("isSelfContained", () => {
  it("should reject a document that links an external stylesheet", () => {
    const bad =
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>';
    expect(isSelfContained(bad)).toBe(false);
  });

  it("should reject a document with a remote script src", () => {
    const bad =
      '<!doctype html><html><head><script src="https://cdn.example.com/a.js"></script></head><body></body></html>';
    expect(isSelfContained(bad)).toBe(false);
  });
});

describe("Sink", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "publisher-sink-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("should publish a page, write it to disk, and return a Receipt", async () => {
    const sink = createFileSink(
      { dir, baseUrl: "" },
      () => "2026-06-13T00:00:00.000Z",
    );

    const receipt = await sink.publish(page, {
      runId: "run_1",
      workerId: "mock",
    });

    expect(receipt.id).toBe("run_1");
    expect(receipt.url).toBe("/published/run_1");
    expect(receipt.workerId).toBe("mock");
    expect(receipt.publishedAt).toBe("2026-06-13T00:00:00.000Z");
    expect(receipt.bytes).toBeGreaterThan(0);

    const file = join(dir, "run_1.html");
    expect(existsSync(file)).toBe(true);
    const written = readFileSync(file, "utf8");
    expect(Buffer.byteLength(written, "utf8")).toBe(receipt.bytes);
  });

  it("should write a SELF-CONTAINED page — the css is inlined, not linked", async () => {
    const sink = createFileSink({ dir, baseUrl: "" });

    await sink.publish(page, { runId: "run_2", workerId: "mock" });

    const written = readFileSync(join(dir, "run_2.html"), "utf8");
    expect(isSelfContained(written)).toBe(true);
    expect(written).toContain("font-family:serif");
    expect(written).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
  });

  it("should prefix the Receipt url with the configured baseUrl", async () => {
    const sink = createFileSink({ dir, baseUrl: "https://host.example" });

    const receipt = await sink.publish(page, {
      runId: "run_3",
      workerId: "opus",
    });

    expect(receipt.url).toBe("https://host.example/published/run_3");
  });

  it("should round-trip the published bytes via read()", async () => {
    const sink = createFileSink({ dir, baseUrl: "" });

    await sink.publish(page, { runId: "run_4", workerId: "mock" });

    const html = sink.read("run_4");
    expect(html).not.toBeNull();
    expect(html).toContain("<h1>Emergence</h1>");
  });

  it("should return null from read() for an unknown id", async () => {
    const sink = createFileSink({ dir, baseUrl: "" });
    expect(sink.read("nope")).toBeNull();
  });
});
