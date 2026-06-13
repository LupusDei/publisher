"use client";

/**
 * SkipLink — the first focusable element on the page (publisher-nav.1.3). It is
 * visually hidden at rest and snaps into view when focused, letting keyboard and
 * screen-reader users jump straight past the masthead to the `#main` landmark.
 * Styling is token-driven (see site-nav.css); the visible focus ring is part of
 * the Atelier accessibility contract.
 */

import "./site-nav.css";

export function SkipLink(): React.ReactElement {
  return (
    <a href="#main" className="nav-skip-link">
      Skip to main content
    </a>
  );
}
