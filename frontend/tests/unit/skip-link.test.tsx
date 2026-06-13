import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkipLink } from "@/components/nav/SkipLink";

describe("SkipLink", () => {
  it("should render an anchor pointing at the #main landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to (main )?content/i });
    expect(link).toHaveAttribute("href", "#main");
  });

  it("should carry the visually-hidden skip-link class (visible only on focus)", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to (main )?content/i });
    // The token-driven class is what hides it at rest and reveals it on focus.
    expect(link.className).toContain("nav-skip-link");
  });

  it("should be reachable as the first focusable element (no tabindex removal)", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to (main )?content/i });
    expect(link).not.toHaveAttribute("tabindex", "-1");
  });
});
