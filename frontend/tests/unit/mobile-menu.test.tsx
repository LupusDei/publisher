import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileMenu } from "@/components/nav/MobileMenu";
import type { NavItem } from "@/components/nav/nav-items";

// NavLink (rendered inside the panel) reads usePathname.
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const ITEMS: NavItem[] = [
  { label: "Personas", href: "/personas" },
  { label: "Runs", href: "/runs" },
];

describe("MobileMenu", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("should render a collapsed disclosure button (aria-expanded=false) and no panel", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Panel links are not rendered while collapsed.
    expect(
      screen.queryByRole("link", { name: /^personas$/i }),
    ).not.toBeInTheDocument();
  });

  it("should wire aria-controls to the panel id it toggles", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    fireEvent.click(toggle);
    const panel = document.getElementById(controls as string);
    expect(panel).not.toBeNull();
  });

  it("should open on click, listing the nav links, and set aria-expanded=true", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /^personas$/i })).toHaveAttribute(
      "href",
      "/personas",
    );
    expect(screen.getByRole("link", { name: /^runs$/i })).toHaveAttribute(
      "href",
      "/runs",
    );
  });

  it("should toggle closed on a second click", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: /^personas$/i }),
    ).not.toBeInTheDocument();
  });

  it("should close when Escape is pressed while open", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: /^personas$/i }),
    ).not.toBeInTheDocument();
  });

  it("should ignore non-Escape keys while open", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
