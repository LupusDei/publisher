import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, buttonClass } from "@/components/ui/Button";

describe("buttonClass", () => {
  it("should compose base + variant + size classes (happy path)", () => {
    expect(buttonClass("primary", "lg")).toBe("ui-btn ui-btn-primary ui-btn-lg");
  });

  it("should default to primary/md and append extra classes (defaults + extra)", () => {
    expect(buttonClass()).toBe("ui-btn ui-btn-primary ui-btn-md");
    expect(buttonClass("ghost", "md", "my-cta")).toBe(
      "ui-btn ui-btn-ghost ui-btn-md my-cta",
    );
  });

  it("should omit a falsy extra class (edge case)", () => {
    expect(buttonClass("danger", "md", undefined)).toBe(
      "ui-btn ui-btn-danger ui-btn-md",
    );
  });
});

describe("Button", () => {
  it("should render its label with type=button by default (initial state)", () => {
    render(<Button>Publish</Button>);
    const btn = screen.getByRole("button", { name: "Publish" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("ui-btn-primary");
  });

  it("should fire onClick when pressed (state change)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("should not fire onClick when disabled (error/edge case)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
