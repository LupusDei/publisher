import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompiledGuardrailPanel } from "@/components/CompiledGuardrailPanel";
import type { CompiledGuardrailsView } from "@/app/runs/run-api";

const view: CompiledGuardrailsView = {
  systemPrompt: "You are The Essayist. Write measured, lyrical prose.",
  validators: [
    { rule: "design-token", kind: "deterministic", description: "Checks tokens." },
    { rule: "banned-phrase", kind: "deterministic", description: "No meta phrasing." },
  ],
};

describe("CompiledGuardrailPanel", () => {
  it("should render the system prompt fragment and validators on load (R3 happy path)", async () => {
    render(
      <CompiledGuardrailPanel personaId="p_1" load={vi.fn(async () => view)} />,
    );
    expect(await screen.findByText(/You are The Essayist/)).toBeInTheDocument();
    expect(screen.getByText("design-token")).toBeInTheDocument();
    expect(screen.getByText("banned-phrase")).toBeInTheDocument();
    expect(screen.getByText(/2 validators/)).toBeInTheDocument();
  });

  it("should show a loading note before resolution (loading state)", () => {
    render(
      <CompiledGuardrailPanel
        personaId="p_1"
        load={() => new Promise(() => {})}
      />,
    );
    expect(screen.getByText(/Compiling guardrails/)).toBeInTheDocument();
  });

  it("should surface a load error (error handling)", async () => {
    render(
      <CompiledGuardrailPanel
        personaId="missing"
        load={vi.fn(async () => {
          throw new Error("HTTP 404");
        })}
      />,
    );
    expect(await screen.findByText("HTTP 404")).toBeInTheDocument();
  });
});
