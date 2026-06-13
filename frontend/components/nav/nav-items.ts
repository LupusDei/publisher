/**
 * nav-items — the single source of truth for the product's information
 * architecture (publisher-nav.1.1). Every navigation surface (the desktop
 * masthead, the mobile disclosure menu) renders from this one list so the IA
 * never drifts between viewports.
 *
 * Flags:
 *   - `adminOnly`  — gated to `user.role === "admin"` (see SiteNav).
 *   - `secondary`  — de-emphasised in the primary row (e.g. the Demo link).
 */

export interface NavItem {
  /** Human label shown in the link. */
  label: string;
  /** Destination route (Next.js href). */
  href: string;
  /** Render only when the current user is an admin when true. */
  adminOnly?: boolean;
  /** De-emphasised in the primary masthead row when true. */
  secondary?: boolean;
}

/** The product's primary information architecture, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Personas", href: "/personas" },
  { label: "Runs", href: "/runs" },
  { label: "Gallery", href: "/runs/gallery" },
  { label: "Demo", href: "/runs/demo", secondary: true },
  { label: "Admin · Telemetry", href: "/admin/telemetry", adminOnly: true },
];
