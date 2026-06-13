"use client";

/**
 * MobileMenu — the narrow-viewport disclosure menu (publisher-nav.3.1). A single
 * toggle button (`aria-expanded` / `aria-controls`) reveals a panel listing the
 * same IA the desktop row renders. The panel closes on a second click or when
 * Escape is pressed, so keyboard users are never trapped. Visibility across
 * breakpoints is owned by site-nav.css; this component owns only the open state.
 */

import { useEffect, useId, useState } from "react";
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

  // Escape closes an open menu (only while open, to avoid stray listeners).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="mobile-menu">
      <button
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
        <ul id={panelId} className="mobile-menu-panel">
          {items.map((item) => (
            <li key={item.href} className="mobile-menu-item">
              <NavLink href={item.href} className="mobile-menu-link">
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
