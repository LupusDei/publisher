import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SiteNav } from "@/components/nav/SiteNav";
import type { AuthContextValue } from "@/app/auth/AuthContext";
import type { AuthUser } from "@/app/auth/auth-api";

// usePathname drives active-route treatment; useRouter is used by LogoutButton.
let pathname = "/";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: push }),
}));

// useAuth is mocked so we can drive auth state directly without a provider.
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

const ADMIN: AuthUser = { ...USER, id: "u_admin", role: "admin" };

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

describe("SiteNav", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    auth = makeAuth();
  });

  it("should render the wordmark linking home", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(
      within(nav).getByRole("link", { name: /^publisher$/i }),
    ).toHaveAttribute("href", "/");
  });

  it("should render the primary nav items with correct hrefs", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const links: Record<string, string> = {
      Personas: "/personas",
      Runs: "/runs",
      Gallery: "/runs/gallery",
      Demo: "/runs/demo",
    };
    for (const [label, href] of Object.entries(links)) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toHaveAttribute("href", href);
    }
  });

  // ── publisher-nav.6.3: secondary flag is rendered (Demo de-emphasised) ────
  it("should de-emphasise the secondary Demo link via data-secondary", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const demo = within(nav).getByRole("link", { name: /^demo$/i });
    expect(demo).toHaveAttribute("data-secondary", "true");
    // Non-secondary items do not carry the flag.
    const runs = within(nav).getByRole("link", { name: /^runs$/i });
    expect(runs).not.toHaveAttribute("data-secondary");
  });

  it("should mark the active section via aria-current from usePathname", () => {
    pathname = "/runs/123";
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: /^runs$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("should show signed-out affordances: Log in + Author your persona", () => {
    auth = makeAuth({ status: "unauthenticated" });
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: /author your persona/i }),
    ).toHaveAttribute("href", "/onboarding");

    // No sign-out / user label when signed out.
    expect(
      screen.queryByRole("button", { name: /sign out|log out/i }),
    ).not.toBeInTheDocument();
  });

  it("should show signed-in affordances: user label + a sign-out control", () => {
    auth = makeAuth({ status: "authenticated", user: USER, token: "tok" });
    render(<SiteNav />);

    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out|log out/i }),
    ).toBeInTheDocument();
    // No "Log in" link when already signed in.
    expect(
      screen.queryByRole("link", { name: /^log in$/i }),
    ).not.toBeInTheDocument();
  });

  it("should render nothing meaningful while auth is loading (no flicker)", () => {
    auth = makeAuth({ status: "loading" });
    render(<SiteNav />);
    expect(
      screen.queryByRole("link", { name: /^log in$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign out|log out/i }),
    ).not.toBeInTheDocument();
  });

  // ── Admin gating (publisher-nav.4.1) ────────────────────────────────────
  it("should HIDE the Admin · Telemetry link for an anonymous visitor", () => {
    auth = makeAuth({ status: "unauthenticated" });
    render(<SiteNav />);
    expect(
      screen.queryByRole("link", { name: /admin.*telemetry/i }),
    ).not.toBeInTheDocument();
  });

  it("should HIDE the Admin · Telemetry link for a non-admin user", () => {
    auth = makeAuth({ status: "authenticated", user: USER, token: "tok" });
    render(<SiteNav />);
    expect(
      screen.queryByRole("link", { name: /admin.*telemetry/i }),
    ).not.toBeInTheDocument();
  });

  it("should SHOW the Admin · Telemetry link only for an admin user", () => {
    auth = makeAuth({ status: "authenticated", user: ADMIN, token: "tok" });
    render(<SiteNav />);
    const link = screen.getByRole("link", { name: /admin.*telemetry/i });
    expect(link).toHaveAttribute("href", "/admin/telemetry");
  });
});
