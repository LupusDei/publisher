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
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavLinkProps {
  /** Destination route. */
  href: string;
  /** Link contents (label). */
  children: ReactNode;
  /** Extra class names composed onto the anchor. */
  className?: string;
}

/** True when `pathname` is within the section rooted at `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
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
