import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PillarLanes } from "@/components/PillarLanes";
import { emptyRunView, applyEvents } from "@/app/runs/run-state";
import { mockRunEvents } from "@/app/runs/mock-stream";

describe("PillarLanes", () => {
  it("should render all four labelled pillar lanes (R1)", () => {
    render(<PillarLanes view={emptyRunView("r")} />);
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Guardrails")).toBeInTheDocument();
    expect(screen.getByText("Checkpoints")).toBeInTheDocument();
    expect(screen.getByText("Observability")).toBeInTheDocument();
  });

  it("should render the sealed-agent box showing system+messages+feedback only (R1)", () => {
    render(<PillarLanes view={emptyRunView("r")} />);
    expect(screen.getByLabelText(/Agent .sealed worker/)).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.getByText("feedback")).toBeInTheDocument();
  });

  it("should bucket folded events into their lanes (happy path)", () => {
    const view = applyEvents(emptyRunView("r"), mockRunEvents("r"));
    render(<PillarLanes view={view} />);
    // Checkpoints lane has the voice-fidelity entries.
    const lane = screen.getByRole("region", {
      name: /Run event stream by pillar/,
    });
    expect(within(lane).getAllByText(/voice-fidelity/).length).toBeGreaterThan(
      0,
    );
  });

  it("should be an aria-live region so new events are announced (accessibility)", () => {
    render(<PillarLanes view={emptyRunView("r")} />);
    const region = screen.getByRole("region", {
      name: /Run event stream by pillar/,
    });
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
