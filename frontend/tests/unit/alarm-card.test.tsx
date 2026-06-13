import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Alarm } from "@publisher/shared";
import { AlarmCard } from "@/components/AlarmCard";

function alarm(over: Partial<Alarm> = {}): Alarm {
  return {
    type: "VOICE_DRIFT",
    severity: "warning",
    context: { score: 0.42, threshold: 0.75 },
    recommendedAction: "Re-draft with voice anchoring.",
    ...over,
  };
}

describe("AlarmCard", () => {
  it("should render the type, severity, context and recommended action (happy path)", () => {
    render(<AlarmCard alarm={alarm()} />);
    expect(screen.getByText("VOICE_DRIFT")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(screen.getByText(/Re-draft with voice anchoring/)).toBeInTheDocument();
  });

  it("should convey severity in an aria-label, not by color alone (accessibility)", () => {
    render(<AlarmCard alarm={alarm({ severity: "critical", type: "TOKEN_BUDGET_EXCEEDED" })} />);
    expect(
      screen.getByLabelText(/Critical alarm: TOKEN_BUDGET_EXCEEDED/),
    ).toBeInTheDocument();
  });

  it("should mark a critical alarm as blocking (edge case)", () => {
    render(<AlarmCard alarm={alarm({ severity: "critical" })} />);
    expect(screen.getByText(/blocking alarm/)).toBeInTheDocument();
  });

  it("should render an object context value as JSON (edge case)", () => {
    render(<AlarmCard alarm={alarm({ context: { detail: { a: 1 } } })} />);
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });
});
