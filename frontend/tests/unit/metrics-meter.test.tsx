import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Metrics } from "@publisher/shared";
import { MetricsMeter } from "@/components/MetricsMeter";

const metrics: Metrics = {
  perPhase: {
    research: { tokens: 1200, latencyMs: 800, calls: 1 },
    build: { tokens: 2100, latencyMs: 1600, calls: 1 },
    refine: { tokens: 1800, latencyMs: 1400, calls: 1 },
  },
  errorRate: 0,
};

describe("MetricsMeter", () => {
  it("should show a waiting note before any metric arrives (empty state)", () => {
    render(<MetricsMeter />);
    expect(
      screen.getByText(/Waiting for the first metric/),
    ).toBeInTheDocument();
  });

  it("should render headline totals and per-phase rows (happy path)", () => {
    render(<MetricsMeter metrics={metrics} />);
    // total tokens 1200+2100+1800 = 5100
    expect(screen.getByText("5,100")).toBeInTheDocument();
    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("build")).toBeInTheDocument();
    expect(screen.getByText("refine")).toBeInTheDocument();
  });

  it("should render the error rate as a percentage (edge case)", () => {
    render(<MetricsMeter metrics={{ ...metrics, errorRate: 0.5 }} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
