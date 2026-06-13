import { describe, it, expect } from "vitest";
import {
  UsageSchema,
  FinishReasonSchema,
  PhaseSchema,
  MetricsSchema,
  MetricBreachSchema,
  BudgetSchema,
  agentResultSchema,
  WebpageSchema,
} from "../../src/index.js";

describe("UsageSchema", () => {
  const valid = { inputTokens: 100, outputTokens: 250, totalTokens: 350 };

  it("should parse a valid usage when all token counts are present", () => {
    expect(UsageSchema.parse(valid)).toEqual(valid);
  });

  it("should accept an optional cachedInputTokens field (edge case)", () => {
    const parsed = UsageSchema.parse({ ...valid, cachedInputTokens: 40 });
    expect(parsed.cachedInputTokens).toBe(40);
  });

  it("should reject a non-numeric token count (invalid)", () => {
    const result = UsageSchema.safeParse({ ...valid, inputTokens: "lots" });
    expect(result.success).toBe(false);
  });

  it("should reject a negative token count (edge case)", () => {
    const result = UsageSchema.safeParse({ ...valid, outputTokens: -1 });
    expect(result.success).toBe(false);
  });
});

describe("FinishReasonSchema", () => {
  it("should accept every defined finish reason (valid)", () => {
    for (const r of [
      "stop",
      "length",
      "tool-calls",
      "content-filter",
      "error",
      "refusal",
      "other",
    ]) {
      expect(FinishReasonSchema.parse(r)).toBe(r);
    }
  });

  it("should reject an unknown finish reason (invalid)", () => {
    expect(FinishReasonSchema.safeParse("done").success).toBe(false);
  });
});

describe("PhaseSchema", () => {
  it("should accept research, build, refine (valid)", () => {
    expect(PhaseSchema.parse("research")).toBe("research");
    expect(PhaseSchema.parse("build")).toBe("build");
    expect(PhaseSchema.parse("refine")).toBe("refine");
  });

  it("should reject an unknown phase (invalid)", () => {
    expect(PhaseSchema.safeParse("publish").success).toBe(false);
  });
});

describe("MetricsSchema", () => {
  const valid = {
    perPhase: {
      research: { tokens: 100, latencyMs: 500, calls: 1 },
      build: { tokens: 800, latencyMs: 2000, calls: 1 },
      refine: { tokens: 0, latencyMs: 0, calls: 0 },
    },
    errorRate: 0,
  };

  it("should parse valid metrics with all three phases", () => {
    expect(MetricsSchema.parse(valid)).toEqual(valid);
  });

  it("should reject metrics missing a phase (invalid)", () => {
    const { refine: _refine, ...perPhase } = valid.perPhase;
    const result = MetricsSchema.safeParse({ ...valid, perPhase });
    expect(result.success).toBe(false);
  });

  it("should reject an errorRate above 1 (edge case)", () => {
    const result = MetricsSchema.safeParse({ ...valid, errorRate: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("BudgetSchema", () => {
  it("should parse an empty budget (edge case — all optional)", () => {
    expect(BudgetSchema.parse({})).toEqual({});
  });

  it("should parse a budget with both limits (valid)", () => {
    const parsed = BudgetSchema.parse({ maxTokens: 5000, maxLatencyMs: 30000 });
    expect(parsed.maxTokens).toBe(5000);
  });

  it("should reject a non-numeric limit (invalid)", () => {
    expect(BudgetSchema.safeParse({ maxTokens: "5k" }).success).toBe(false);
  });
});

describe("MetricBreachSchema", () => {
  const valid = { kind: "token", phase: "build", observed: 6000, limit: 5000 };

  it("should parse a valid token breach", () => {
    expect(MetricBreachSchema.parse(valid)).toEqual(valid);
  });

  it("should parse a latency breach without a phase (edge case — phase optional)", () => {
    const parsed = MetricBreachSchema.parse({
      kind: "latency",
      observed: 40000,
      limit: 30000,
    });
    expect(parsed.kind).toBe("latency");
  });

  it("should reject an unknown breach kind (invalid)", () => {
    expect(
      MetricBreachSchema.safeParse({ ...valid, kind: "memory" }).success,
    ).toBe(false);
  });
});

describe("agentResultSchema", () => {
  const ResultSchema = agentResultSchema(WebpageSchema);
  const validWebpage = {
    title: "T",
    html: "<main>x</main>",
    css: "",
    summary: "s",
    sourcesUsed: [],
  };
  const valid = {
    value: validWebpage,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: "stop",
  };

  it("should parse a valid AgentResult wrapping its value schema", () => {
    expect(ResultSchema.parse(valid)).toEqual(valid);
  });

  it("should reject when the wrapped value violates its schema (invalid)", () => {
    const result = ResultSchema.safeParse({
      ...valid,
      value: { ...validWebpage, title: "" },
    });
    expect(result.success).toBe(false);
  });

  it("should reject when usage is missing (edge case)", () => {
    const { usage: _usage, ...withoutUsage } = valid;
    expect(ResultSchema.safeParse(withoutUsage).success).toBe(false);
  });
});
