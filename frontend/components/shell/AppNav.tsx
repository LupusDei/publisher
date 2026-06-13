"use client";

/**
 * AppNav — the persistent editorial top bar that gives wayfinding across the
 * product (Home · Onboarding · Personas · Demo). It is the only chrome in an
 * otherwise typeset, journal-like product, so it stays quiet: a serif wordmark
 * that returns home, a row of primary sections, and a right-side account
 * affordance.
 *
 * The account area is driven entirely by the shared auth context (`useAuth`):
 *   - authenticated → the signed-in email + a "Sign out" that calls
 *     `logout()` and routes to /login (no duplicate logout endpoint),
 *   - unauthenticated → a quiet "Sign in" link,
 *   - loading → nothing, so the bar never flickers a wrong state on rehydrate.
 *
 * Active section is derived from `usePathname` and exposed as `aria-current`
 * (Home matches exactly; every other section also matches its nested routes).
 * The whole bar is skipped on the /login route, where the auth surface owns the
 * full screen. Entrance uses the shared `.anim-fade` utility, which collapses
 * under the global prefers-reduced-motion guard.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/app/auth/AuthContext";
import "./shell.css";

interface Section {
  href: string;
  label: string;
}

const SECTIONS: readonly Section[] = [
  { href: "/", label: "Home" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/personas", label: "Personas" },
  { href: "/runs/demo", label: "Demo" },
];

/** Routes that own the full screen and should render no app chrome. */
const BARE_ROUTES: readonly string[] = ["/login"];

/** True when `pathname` falls within the section rooted at `href`. */
function isActiveSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav(): React.ReactElement | null {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { status, user, logout } = useAuth();

  // Auth surfaces (and anywhere we explicitly opt out) render no chrome.
  if (BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return null;
  }

  function onSignOut(): void {
    logout();
    router.push("/login");
  }

  return (
    <nav className="shell-nav anim-fade" aria-label="Primary">
      <div className="shell-nav-inner">
        <Link href="/" className="shell-wordmark">
          Publisher
        </Link>

        <ul className="shell-sections">
          {SECTIONS.map((section) => {
            const active = isActiveSection(pathname, section.href);
            return (
              <li key={section.href} className="shell-section">
                <Link
                  href={section.href}
                  className="shell-section-link"
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : undefined}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="shell-account">
          {status === "authenticated" && user ? (
            <span className="shell-account-signed-in">
              <span className="shell-account-email" title={user.email}>
                {user.email}
              </span>
              <Button variant="quiet" size="md" onClick={onSignOut}>
                Sign out
              </Button>
            </span>
          ) : status === "unauthenticated" ? (
            <Link href="/login" className="shell-account-signin">
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
