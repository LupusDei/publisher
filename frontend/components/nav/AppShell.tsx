/**
 * AppShell — the global application chrome (publisher-nav.2.3). It composes the
 * accessibility skip link, the editorial masthead, and a focusable `#main`
 * landmark that wraps the routed page. Mounted once in the root layout so every
 * route inherits consistent wayfinding and the skip-to-content affordance.
 *
 * `#main` carries `tabIndex={-1}` so the SkipLink can move focus into the page
 * region programmatically without making the wrapper a tab stop in normal flow.
 */

import type { ReactNode } from "react";
import { SkipLink } from "./SkipLink";
import { SiteNav } from "./SiteNav";

export function AppShell({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <SkipLink />
      <SiteNav />
      <div id="main" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
