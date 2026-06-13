import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Escalation, Persona } from "@publisher/shared";
import { EscalationPanel } from "@/components/EscalationPanel";

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "measured, lyrical",
  voiceSample: "The whole becomes greater than its parts.",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};

const escalation: Escalation = {
  id: "esc_1",
  runId: "r",
  reason: "Token budget exceeded.",
  alarm: {
    type: "TOKEN_BUDGET_EXCEEDED",
    severity: "critical",
    context: { observed: 18000, limit: 12000 },
    recommendedAction: "Approve or enrich.",
  },
  options: ["enrich_persona", "approve_anyway", "abort"],
};

describe("EscalationPanel", () => {
  it("should render the reason and the triggering alarm (R10 happy path)", () => {
    render(
      <EscalationPanel escalation={escalation} persona={persona} onDecide={vi.fn(async () => {})} />,
    );
    expect(screen.getByText("Token budget exceeded.")).toBeInTheDocument();
    expect(screen.getByText("TOKEN_BUDGET_EXCEEDED")).toBeInTheDocument();
  });

  it("should submit approve_anyway when approved (state change)", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => {});
    render(
      <EscalationPanel escalation={escalation} persona={persona} onDecide={onDecide} />,
    );
    await user.click(screen.getByRole("button", { name: /Approve anyway/ }));
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith({ choice: "approve_anyway" }),
    );
  });

  it("should submit an enriched persona with edited voiceSample (enrich path)", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => {});
    render(
      <EscalationPanel escalation={escalation} persona={persona} onDecide={onDecide} />,
    );
    await user.click(screen.getByRole("button", { name: "Enrich persona" }));
    const sample = screen.getByLabelText("Voice sample");
    await user.clear(sample);
    await user.type(sample, "A new richer sample.");
    await user.click(screen.getByRole("button", { name: /Save & resume run/ }));
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith({
        choice: "enrich_persona",
        payload: { persona: expect.objectContaining({ voiceSample: "A new richer sample." }) },
      }),
    );
  });

  it("should surface an error when the decision POST fails (error handling)", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => {
      throw new Error("network down");
    });
    render(
      <EscalationPanel escalation={escalation} persona={persona} onDecide={onDecide} />,
    );
    await user.click(screen.getByRole("button", { name: /Reject \(abort\)/ }));
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });
});
