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

  it("should reframe as 'Approve & Publish / Request changes / Discard' for the AWAITING_APPROVAL gate (final HITL gate)", () => {
    const approval: Escalation = {
      id: "esc_approve",
      runId: "r",
      reason: "Draft cleared every gate and is ready to publish.",
      alarm: {
        type: "AWAITING_APPROVAL",
        severity: "info",
        context: { draftTitle: "On Emergence" },
        recommendedAction: "Approve & Publish, Request changes, or Discard.",
      },
      options: ["approve_anyway", "enrich_persona", "abort"],
    };
    render(
      <EscalationPanel escalation={approval} persona={persona} onDecide={vi.fn(async () => {})} />,
    );
    // Publishing language, not alarm language.
    expect(screen.getByRole("button", { name: "Approve & Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByText(/Draft ready/)).toBeInTheDocument();
    // It is a calm sign-off, not an alert.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve anyway/ })).not.toBeInTheDocument();
  });

  it("should still POST approve_anyway when the AWAITING_APPROVAL gate is approved (wiring unchanged)", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => {});
    const approval: Escalation = {
      id: "esc_approve",
      runId: "r",
      reason: "Ready to publish.",
      alarm: {
        type: "AWAITING_APPROVAL",
        severity: "info",
        context: {},
        recommendedAction: "Approve to publish.",
      },
      options: ["approve_anyway", "enrich_persona", "abort"],
    };
    render(
      <EscalationPanel escalation={approval} persona={persona} onDecide={onDecide} />,
    );
    await user.click(screen.getByRole("button", { name: "Approve & Publish" }));
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith({ choice: "approve_anyway" }),
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
