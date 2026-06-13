import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileMenu } from "@/components/nav/MobileMenu";
import type { NavItem } from "@/components/nav/nav-items";
import type { AuthContextValue } from "@/app/auth/AuthContext";
import type { AuthUser } from "@/app/auth/auth-api";

// NavLink (rendered inside the panel) reads usePathname; LogoutButton reads useRouter.
let pathname = "/";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: push }),
}));

// The mobile panel mirrors the desktop auth cluster, so it consumes useAuth.
let auth: AuthContextValue;
vi.mock("@/app/auth/AuthContext", () => ({
  useAuth: () => auth,
}));

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

function makeAuth(over: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "unauthenticated",
    user: null,
    token: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...over,
  };
}

const ITEMS: NavItem[] = [
  { label: "Personas", href: "/personas" },
  { label: "Runs", href: "/runs" },
];

describe("MobileMenu", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    auth = makeAuth();
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

  // ── publisher-nav.6.4: auth cluster mirrored inside the panel ─────────────
  it("should include the signed-out auth cluster (Log in + Author your persona) in the open panel", () => {
    auth = makeAuth({ status: "unauthenticated" });
    render(<MobileMenu items={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: /author your persona/i }),
    ).toHaveAttribute("href", "/onboarding");
  });

  it("should include the signed-in auth cluster (user + log out) in the open panel", () => {
    auth = makeAuth({ status: "authenticated", user: USER, token: "tok" });
    render(<MobileMenu items={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out|log out/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^log in$/i }),
    ).not.toBeInTheDocument();
  });

  // ── publisher-nav.6.4: click-outside closes the panel ─────────────────────
  it("should close when clicking outside the menu", () => {
    render(
      <div>
        <MobileMenu items={ITEMS} />
        <button type="button">outside</button>
      </div>,
    );
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseDown(screen.getByRole("button", { name: /outside/i }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: /^personas$/i }),
    ).not.toBeInTheDocument();
  });

  it("should NOT close when clicking inside the open panel", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    fireEvent.mouseDown(screen.getByRole("link", { name: /^personas$/i }));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  // ── publisher-nav.6.4: focus management ───────────────────────────────────
  it("should move focus into the panel when opened", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    const panel = document.getElementById(
      toggle.getAttribute("aria-controls") as string,
    );
    // Focus lands inside the panel, not left on the toggle.
    expect(panel?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(toggle);
  });

  it("should return focus to the toggle when closed via Escape", () => {
    render(<MobileMenu items={ITEMS} />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle);
  });
});
