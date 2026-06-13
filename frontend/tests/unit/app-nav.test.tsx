import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppNav } from "@/components/shell/AppNav";
import type { AuthContextValue } from "@/app/auth/AuthContext";
import type { AuthUser } from "@/app/auth/auth-api";

// ── Mocks ────────────────────────────────────────────────────────────────────
// usePathname drives active-route treatment; useRouter is used by sign-out.
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

describe("AppNav", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    auth = makeAuth();
  });

  it("should render the wordmark and each section link with correct hrefs", () => {
    render(<AppNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });

    // Wordmark links home.
    expect(
      within(nav).getByRole("link", { name: /publisher/i }),
    ).toHaveAttribute("href", "/");

    // Primary sections — exact hrefs are the wayfinding contract.
    const links: Record<string, string> = {
      Home: "/",
      Onboarding: "/onboarding",
      Personas: "/personas",
      Demo: "/runs/demo",
    };
    for (const [label, href] of Object.entries(links)) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toHaveAttribute("href", href);
    }
  });

  it("should reflect authenticated state: show the user email and a sign-out control", () => {
    auth = makeAuth({ status: "authenticated", user: USER, token: "tok" });
    render(<AppNav />);

    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out|log out/i }),
    ).toBeInTheDocument();
    // No "Sign in" affordance when already signed in.
    expect(
      screen.queryByRole("link", { name: /^sign in$/i }),
    ).not.toBeInTheDocument();
  });

  it("should reflect unauthenticated state: a quiet Sign in link, no sign-out", () => {
    auth = makeAuth({ status: "unauthenticated" });
    render(<AppNav />);

    expect(
      screen.getByRole("link", { name: /^sign in$/i }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("button", { name: /sign out|log out/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ada@example.com/)).not.toBeInTheDocument();
  });

  it("should not show an account affordance while auth is still loading", () => {
    auth = makeAuth({ status: "loading" });
    render(<AppNav />);

    expect(
      screen.queryByRole("link", { name: /^sign in$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign out|log out/i }),
    ).not.toBeInTheDocument();
  });

  it("should mark the active section via aria-current from usePathname", () => {
    pathname = "/personas";
    render(<AppNav />);

    const active = screen.getByRole("link", { name: /^personas$/i });
    expect(active).toHaveAttribute("aria-current", "page");

    // A non-active section carries no aria-current.
    expect(
      screen.getByRole("link", { name: /^onboarding$/i }),
    ).not.toHaveAttribute("aria-current");
  });

  it("should treat nested routes as within their section (e.g. /personas/123 -> Personas active)", () => {
    pathname = "/personas/123";
    render(<AppNav />);
    expect(
      screen.getByRole("link", { name: /^personas$/i }),
    ).toHaveAttribute("aria-current", "page");
    // Home only matches exactly, so it is not active on a nested route.
    expect(screen.getByRole("link", { name: /^home$/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("should render nothing on the login route (auth surface owns the full screen)", () => {
    pathname = "/login";
    const { container } = render(<AppNav />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
