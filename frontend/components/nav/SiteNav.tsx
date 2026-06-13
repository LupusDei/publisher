"use client";

/**
 * SiteNav — the editorial masthead and the product's primary wayfinding surface
 * (publisher-nav.2.1, nav.3.1, nav.4.1). A serif wordmark that returns home, the
 * primary section row rendered from the single IA source (NAV_ITEMS), an auth
 * cluster driven entirely by `useAuth`, and a responsive mobile disclosure menu.
 *
 * Auth cluster:
 *   - signed out  → "Log in" (/login) + "Author your persona" (/onboarding, the
 *     single primary CTA),
 *   - signed in   → the user label + the shared LogoutButton,
 *   - loading     → nothing, so the bar never flickers a wrong state on rehydrate.
 *
 * Admin gating (nav.4.1): the `adminOnly` "Admin · Telemetry" item renders only
 * when the signed-in user's role is "admin"; it is absent for plain users and
 * anonymous visitors.
 *
 * Styling is token-only (see site-nav.css). The desktop section row and the
 * mobile menu are swapped at the CSS breakpoint, so both render the same IA.
 */

import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { useAuth } from "@/app/auth/AuthContext";
import { LogoutButton } from "@/app/auth/LogoutButton";
import { NavLink } from "./NavLink";
import { MobileMenu } from "./MobileMenu";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import "./site-nav.css";

/** Filter the IA down to what the current viewer is allowed to see. */
export function visibleNavItems(isAdmin: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}

export function SiteNav(): React.ReactElement {
  const { status, user } = useAuth();
  const isAdmin = status === "authenticated" && user?.role === "admin";
  const items = visibleNavItems(Boolean(isAdmin));

  return (
    <nav className="site-nav anim-fade" aria-label="Primary">
      <div className="site-nav-inner">
        <Link href="/" className="site-nav-wordmark">
          Publisher
        </Link>

        <ul className="site-nav-links">
          {items.map((item) => (
            <li key={item.href} className="site-nav-item">
              <NavLink href={item.href} className="site-nav-link">
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="site-nav-auth">
          {status === "authenticated" && user ? (
            <LogoutButton />
          ) : status === "unauthenticated" ? (
            <>
              <Link href="/login" className="site-nav-login">
                Log in
              </Link>
              <Link href="/onboarding" className={buttonClass("primary", "md")}>
                Author your persona
              </Link>
            </>
          ) : null}
        </div>

        <MobileMenu items={items} />
      </div>
    </nav>
  );
}
