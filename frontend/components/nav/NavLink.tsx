"use client";

/**
 * NavLink — a wayfinding link that knows whether it is "here"
 * (publisher-nav.1.2). It wraps `next/link` and derives the active state from
 * `usePathname`, exposing it to assistive tech via `aria-current="page"` and to
 * CSS via `data-active`.
 *
 * Active rules (the wayfinding contract):
 *   - The home href "/" is active only on an exact match.
 *   - Any other href is active on an exact match OR on a nested route, so
 *     "/runs" stays active on "/runs/123". A sibling that merely shares a
 *     prefix ("/runs-archive") is NOT treated as nested.
 *   - Only the MOST-SPECIFIC matching NAV_ITEMS href is active
 *     (publisher-nav.6.1). On "/runs/gallery" both "/runs" and "/runs/gallery"
 *     match by prefix, but only "/runs/gallery" (the longer, more-specific item)
 *     is current — never two aria-current="page" at once.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "./nav-items";

export interface NavLinkProps {
  /** Destination route. */
  href: string;
  /** Link contents (label). */
  children: ReactNode;
  /** Extra class names composed onto the anchor. */
  className?: string;
}

/** True when `pathname` matches the section rooted at `href` (exact or nested). */
function matchesPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single most-specific NAV_ITEMS href that matches `pathname`, or null when
 * nothing matches. "Most specific" = the longest matching href, so a deeper item
 * ("/runs/gallery") wins over its parent section ("/runs"). This keeps exactly
 * one nav item active at a time (publisher-nav.6.1).
 */
function mostSpecificActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (!matchesPath(pathname, item.href)) continue;
    if (best === null || item.href.length > best.length) best = item.href;
  }
  return best;
}

/**
 * True when `href` is the most-specific NAV_ITEMS match for `pathname`. A less
 * specific prefix that also matches (e.g. "/runs" on "/runs/gallery") is NOT
 * active, so only one link ever carries aria-current="page".
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (!matchesPath(pathname, href)) return false;
  return mostSpecificActiveHref(pathname) === href;
}

export function NavLink({
  href,
  children,
  className,
}: NavLinkProps): React.ReactElement {
  const pathname = usePathname() ?? "/";
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      className={className}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}
