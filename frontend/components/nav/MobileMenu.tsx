"use client";

/**
 * MobileMenu — the narrow-viewport disclosure menu (publisher-nav.3.1 / 6.4). A
 * single toggle button (`aria-expanded` / `aria-controls`) reveals a panel that
 * lists the same IA the desktop row renders AND mirrors the desktop auth cluster
 * (signed out → "Log in" + "Author your persona"; signed in → user + Log out),
 * so mobile users get the same wayfinding the desktop bar offers.
 *
 * Keyboard & focus contract:
 *   - Opening moves focus into the panel (first focusable), so keyboard users
 *     land on the menu, not stranded on the toggle.
 *   - Closing — via Escape, click-outside, or the toggle — returns focus to the
 *     toggle, so focus is never lost.
 *   - Escape and a click outside both close the panel, so users are never
 *     trapped.
 *
 * Visibility across breakpoints is owned by site-nav.css; this component owns
 * only the open state and focus management.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { useAuth } from "@/app/auth/AuthContext";
import { LogoutButton } from "@/app/auth/LogoutButton";
import { NavLink } from "./NavLink";
import type { NavItem } from "./nav-items";
import "./site-nav.css";

export interface MobileMenuProps {
  /** The IA to list inside the panel (already filtered for the viewer). */
  items: readonly NavItem[];
}

export function MobileMenu({ items }: MobileMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { status, user } = useAuth();

  // Escape closes; a pointer press outside the menu closes. Both only while open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  // Focus management: into the panel on open, back to the toggle on close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    } else if (!open && wasOpen.current) {
      toggleRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="mobile-menu" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="mobile-menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        Menu
      </button>

      {open ? (
        <div id={panelId} ref={panelRef} className="mobile-menu-panel">
          <ul className="mobile-menu-list">
            {items.map((item) => (
              <li key={item.href} className="mobile-menu-item">
                <NavLink
                  href={item.href}
                  className="mobile-menu-link"
                  secondary={item.secondary}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mobile-menu-auth">
            {status === "authenticated" && user ? (
              <LogoutButton />
            ) : status === "unauthenticated" ? (
              <>
                <Link href="/login" className="site-nav-login">
                  Log in
                </Link>
                <Link
                  href="/onboarding"
                  className={buttonClass("primary", "md")}
                >
                  Author your persona
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
