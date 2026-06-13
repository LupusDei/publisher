import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLink, isActivePath } from "@/components/nav/NavLink";

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

  // ── publisher-nav.6.1: most-specific match only (no double aria-current) ──
  it("should mark ONLY the most-specific nav item active when two hrefs match (Gallery, not Runs)", () => {
    pathname = "/runs/gallery";
    render(
      <>
        <NavLink href="/runs">Runs</NavLink>
        <NavLink href="/runs/gallery">Gallery</NavLink>
      </>,
    );
    // Gallery is the most-specific NAV_ITEMS href → it alone is current.
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Runs is a less-specific prefix and must NOT also be current.
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute(
      "aria-current",
    );
    // Invariant: exactly one aria-current="page" across the rendered links.
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("should fall back to the nearest section when no nav item matches the exact path (/runs/123 → Runs)", () => {
    pathname = "/runs/123";
    render(
      <>
        <NavLink href="/runs">Runs</NavLink>
        <NavLink href="/runs/gallery">Gallery</NavLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Gallery" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("isActivePath should be true only for the most-specific matching nav href", () => {
    // Direct unit check of the pure helper against the real IA.
    expect(isActivePath("/runs/gallery", "/runs/gallery")).toBe(true);
    expect(isActivePath("/runs/gallery", "/runs")).toBe(false);
    // No nav item for /runs/123 → the /runs section is the most specific match.
    expect(isActivePath("/runs/123", "/runs")).toBe(true);
    expect(isActivePath("/runs/123", "/runs/gallery")).toBe(false);
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
