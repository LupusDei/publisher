import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartRunForm } from "@/components/StartRunForm";

const personas = [
  { id: "p_1", name: "The Essayist" },
  { id: "p_2", name: "The Reporter" },
];

describe("StartRunForm", () => {
  it("should disable submit until a persona and concept are present (initial state)", () => {
    render(
      <StartRunForm
        personas={personas}
        onStart={vi.fn(async () => ({ runId: "r" }))}
      />,
    );
    expect(screen.getByRole("button", { name: "Start run" })).toBeDisabled();
  });

  it("should POST persona, concept and worker on submit (state change)", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn(async () => ({ runId: "run_1" }));
    render(<StartRunForm personas={personas} onStart={onStart} />);
    await user.selectOptions(screen.getByLabelText("Persona"), "p_2");
    await user.type(screen.getByLabelText("Concept"), "On Emergence");
    await user.selectOptions(screen.getByLabelText(/Worker/), "sonnet");
    await user.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        personaId: "p_2",
        concept: "On Emergence",
        workerId: "sonnet",
      }),
    );
  });

  it("should surface a start error inline (error handling)", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn(async () => {
      throw new Error("backend unreachable");
    });
    render(<StartRunForm personas={personas} onStart={onStart} />);
    await user.selectOptions(screen.getByLabelText("Persona"), "p_1");
    await user.type(screen.getByLabelText("Concept"), "c");
    await user.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByText("backend unreachable")).toBeInTheDocument();
  });

  it("should show a personas load error and an empty option (edge case)", () => {
    render(
      <StartRunForm
        personas={[]}
        onStart={vi.fn(async () => ({ runId: "r" }))}
        personasError="could not load personas"
      />,
    );
    expect(screen.getByText("could not load personas")).toBeInTheDocument();
    expect(screen.getByText("No personas yet")).toBeInTheDocument();
  });

  it("should preselect the persona from initialPersonaId (pdp.2 deep-link)", () => {
    render(
      <StartRunForm
        personas={personas}
        initialPersonaId="p_2"
        onStart={vi.fn(async () => ({ runId: "r" }))}
      />,
    );
    const select = screen.getByLabelText("Persona") as HTMLSelectElement;
    expect(select.value).toBe("p_2");
  });

  it("should default to no persona selected when initialPersonaId is omitted (edge case)", () => {
    render(
      <StartRunForm
        personas={personas}
        onStart={vi.fn(async () => ({ runId: "r" }))}
      />,
    );
    const select = screen.getByLabelText("Persona") as HTMLSelectElement;
    expect(select.value).toBe("");
  });
});
