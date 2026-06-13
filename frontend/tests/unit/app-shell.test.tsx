import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/nav/AppShell";
import type { AuthContextValue } from "@/app/auth/AuthContext";

let pathname = "/";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: push }),
}));

let auth: AuthContextValue;
vi.mock("@/app/auth/AuthContext", () => ({
  useAuth: () => auth,
}));

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

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    auth = makeAuth();
  });

  it("should render the skip link, the primary nav, and the children", () => {
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: /skip to (main )?content/i }),
    ).toHaveAttribute("href", "#main");
    expect(
      screen.getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("should wrap children in a focusable #main landmark for the skip link target", () => {
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );
    const main = document.getElementById("main");
    expect(main).not.toBeNull();
    // tabIndex=-1 lets the skip link move focus into the region programmatically.
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(main).toContainElement(screen.getByText("page body"));
  });
});
