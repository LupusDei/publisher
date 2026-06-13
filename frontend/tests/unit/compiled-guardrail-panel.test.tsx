import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompiledGuardrailPanel } from "@/components/CompiledGuardrailPanel";
import type { CompiledGuardrailsView } from "@/app/runs/run-api";

const view: CompiledGuardrailsView = {
  systemPrompt: "You are The Essayist. Write measured, lyrical prose.",
  validators: [
    {
      rule: "design-token",
      kind: "deterministic",
      description: "Checks tokens.",
    },
    {
      rule: "banned-phrase",
      kind: "deterministic",
      description: "No meta phrasing.",
    },
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

  it("should fetch once and NOT refire when re-rendered with a fresh loader (infinite-loop regression)", async () => {
    // Production passes no `load`, so the default loader is a NEW inline
    // function every render. When that identity was an effect dependency, each
    // render refired the effect → setState → re-render → an infinite /compiled
    // fetch loop. Simulate the unstable loader and assert the fetch fires ONCE
    // per personaId across re-renders.
    const spy = vi.fn(async () => view);
    const { rerender } = render(
      <CompiledGuardrailPanel personaId="p_1" load={(id) => spy(id)} />,
    );
    await screen.findByText(/You are The Essayist/);
    for (let i = 0; i < 5; i += 1) {
      rerender(
        <CompiledGuardrailPanel personaId="p_1" load={(id) => spy(id)} />,
      );
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("should refetch when personaId actually changes (state change)", async () => {
    const spy = vi.fn(async (id: string) => ({ ...view, systemPrompt: id }));
    const { rerender } = render(
      <CompiledGuardrailPanel personaId="p_1" load={spy} />,
    );
    await screen.findByText("p_1");
    rerender(<CompiledGuardrailPanel personaId="p_2" load={spy} />);
    await screen.findByText("p_2");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, "p_1");
    expect(spy).toHaveBeenNthCalledWith(2, "p_2");
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
