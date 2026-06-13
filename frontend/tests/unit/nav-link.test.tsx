import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLink } from "@/components/nav/NavLink";

// usePathname drives active-route treatment.
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("NavLink", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("should render an anchor with the given href and label", () => {
    pathname = "/";
    render(<NavLink href="/personas">Personas</NavLink>);
    const link = screen.getByRole("link", { name: "Personas" });
    expect(link).toHaveAttribute("href", "/personas");
  });

  it("should mark aria-current=page on an exact path match", () => {
    pathname = "/personas";
    render(<NavLink href="/personas">Personas</NavLink>);
    expect(screen.getByRole("link", { name: "Personas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("should mark aria-current=page on a nested route within the section", () => {
    pathname = "/runs/123";
    render(<NavLink href="/runs">Runs</NavLink>);
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("should NOT mark aria-current when the path is unrelated", () => {
    pathname = "/personas";
    render(<NavLink href="/runs">Runs</NavLink>);
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("should treat the home href '/' as active only on an exact match", () => {
    pathname = "/personas";
    render(<NavLink href="/">Home</NavLink>);
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("should NOT treat a sibling prefix as nested (e.g. /runs-archive is not within /runs)", () => {
    pathname = "/runs-archive";
    render(<NavLink href="/runs">Runs</NavLink>);
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("should forward an extra className while preserving active state", () => {
    pathname = "/runs";
    render(
      <NavLink href="/runs" className="extra-class">
        Runs
      </NavLink>,
    );
    const link = screen.getByRole("link", { name: "Runs" });
    expect(link.className).toContain("extra-class");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
