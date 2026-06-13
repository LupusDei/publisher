import { describe, it, expect } from "vitest";
import {
  designTokenValidator,
  bannedPhraseValidator,
  structureValidator,
  buildValidators,
} from "../../src/guardrails/validators.js";
import { essayist, operator, sparse } from "../fixtures/personas.js";
import type { Webpage } from "@publisher/shared";

/** A well-formed page that honors the essayist persona (serif, single-column). */
const goodEssayistPage: Webpage = {
  title: "On Emergence",
  html: [
    "<!doctype html><html><head><title>On Emergence</title></head>",
    "<body><h1>On Emergence</h1>",
    "<p>Attention, paid slowly, until the pattern admits itself. ".repeat(8) + "</p>",
    "<h2>The slow look</h2>",
    "<p>A concrete image anchors each turn of the argument here.</p>",
    "</body></html>",
  ].join("\n"),
  css: "body{font-family:Georgia,serif;max-width:680px;margin:0 auto;background:#fbf7f0;color:#2b2b2b;}",
  summary: "A reflective essay on emergence.",
  sourcesUsed: ["https://example.com/emergence"],
};

/** A page honoring the operator persona (sans-serif, dense grid). */
const goodOperatorPage: Webpage = {
  title: "Ship The Number",
  html: "<!doctype html><html><head><title>Ship The Number</title></head><body><h1>Ship The Number</h1><p>Cut what does not move the metric. Measure everything you ship today.</p><h2>Cut</h2><p>Numbers over adjectives, every single time.</p></body></html>",
  css: "body{font-family:Inter,Helvetica,sans-serif;}main{display:grid;grid-template-columns:repeat(3,1fr);background:#000;color:#fff;}",
  summary: "An operator's playbook.",
  sourcesUsed: ["https://example.com/ship"],
};

describe("designTokenValidator (dp0.3.2)", () => {
  it("should PASS when the page CSS carries the persona's declared typography + layout markers", () => {
    const findings = designTokenValidator(goodEssayistPage, essayist);
    const typo = findings.find((f) => f.rule.includes("typography"));
    const layout = findings.find((f) => f.rule.includes("layout"));
    expect(typo?.passed).toBe(true);
    expect(layout?.passed).toBe(true);
  });

  it("should FAIL the typography finding when the declared token is absent from the page", () => {
    const wrongFont: Webpage = {
      ...goodEssayistPage,
      css: "body{font-family:Inter,sans-serif;}", // sans, but persona declares serif
    };
    const findings = designTokenValidator(wrongFont, essayist);
    const typo = findings.find((f) => f.rule.includes("typography"));
    expect(typo?.passed).toBe(false);
    expect(typo?.detail).toMatch(/serif/i);
  });

  it("should distinguish personas — the operator's grid layout passes for the operator page", () => {
    const findings = designTokenValidator(goodOperatorPage, operator);
    const layout = findings.find((f) => f.rule.includes("layout"));
    expect(layout?.passed).toBe(true);
  });

  it("should return no design findings for a sparse persona with no declared tokens (edge case)", () => {
    const findings = designTokenValidator(goodEssayistPage, sparse);
    expect(findings).toEqual([]);
  });
});

describe("bannedPhraseValidator (dp0.3.2)", () => {
  it("should PASS when no leak/banned phrasing is present", () => {
    const findings = bannedPhraseValidator(goodEssayistPage, essayist);
    expect(findings.every((f) => f.passed)).toBe(true);
  });

  it("should FAIL when the page leaks meta phrasing like 'As an AI'", () => {
    const leaky: Webpage = {
      ...goodEssayistPage,
      html: goodEssayistPage.html.replace(
        "<h1>On Emergence</h1>",
        "<h1>On Emergence</h1><p>As an AI language model, I cannot reflect.</p>",
      ),
    };
    const findings = bannedPhraseValidator(leaky, essayist);
    const failed = findings.filter((f) => !f.passed);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.some((f) => /as an ai/i.test(f.detail))).toBe(true);
  });
});

describe("bannedPhraseValidator — persona-declared extras", () => {
  it("should FAIL when the page contains a persona-declared banned phrase", () => {
    const strict = {
      ...essayist,
      designElements: { ...essayist.designElements, bannedPhrases: "synergy; leverage" },
    };
    const salesy: Webpage = {
      ...goodEssayistPage,
      html: goodEssayistPage.html.replace("</body>", "<p>Unlock synergy now.</p></body>"),
    };
    const findings = bannedPhraseValidator(salesy, strict);
    expect(findings.some((f) => !f.passed && /synergy/.test(f.detail))).toBe(true);
  });
});

describe("designTokenValidator — out-of-vocabulary value (total)", () => {
  it("should skip (not fail) a declared value with no known markers", () => {
    const oddTypography = {
      ...essayist,
      designElements: { typography: "blackletter-fraktur" },
    };
    const findings = designTokenValidator(goodEssayistPage, oddTypography);
    // no marker rule matches "blackletter-fraktur" → no typography finding emitted
    expect(findings.find((f) => f.rule.includes("typography"))).toBeUndefined();
  });
});

describe("structureValidator (dp0.3.2)", () => {
  it("should PASS a page with a title, an h1, and adequate body length", () => {
    const findings = structureValidator(goodEssayistPage, essayist);
    expect(findings.every((f) => f.passed)).toBe(true);
  });

  it("should FAIL when the page has no h1 heading", () => {
    const noHeading: Webpage = {
      ...goodEssayistPage,
      html: "<!doctype html><html><body><p>Body without any heading at all, just text that goes on for a while to clear the length floor comfortably.</p></body></html>",
    };
    const findings = structureValidator(noHeading, essayist);
    expect(findings.some((f) => f.rule.includes("heading") && !f.passed)).toBe(
      true,
    );
  });

  it("should FAIL when the body content is too thin (length heuristic)", () => {
    const thin: Webpage = {
      ...goodEssayistPage,
      html: "<!doctype html><html><body><h1>Hi</h1><p>Too short.</p></body></html>",
    };
    const findings = structureValidator(thin, essayist);
    expect(findings.some((f) => f.rule.includes("length") && !f.passed)).toBe(
      true,
    );
  });
});

describe("buildValidators (dp0.3.2)", () => {
  it("should return a deterministic, non-empty set of validators for a rich persona", () => {
    const a = buildValidators(essayist);
    const b = buildValidators(essayist);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  it("should produce a flat findings array when every validator runs over a page", () => {
    const validators = buildValidators(operator);
    const findings = validators.flatMap((v) => v(goodOperatorPage, operator));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(typeof f.rule).toBe("string");
      expect(typeof f.passed).toBe("boolean");
      expect(typeof f.detail).toBe("string");
    }
  });
});
