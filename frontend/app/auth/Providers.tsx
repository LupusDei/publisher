"use client";

/**
 * Providers — the client boundary that hosts app-wide context (currently the
 * AuthProvider). Kept as a thin "use client" wrapper so the root server layout
 * can mount it with a single import:
 *
 *   import { Providers } from "./auth/Providers";
 *   <body><Providers>{children}</Providers></body>
 *
 * Wiring this into `app/layout.tsx` is the orchestrator's one-line integration
 * step (the layout is outside this task's lane).
 */

import type { ReactNode } from "react";
import { AuthProvider } from "./AuthContext";

export function Providers({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return <AuthProvider>{children}</AuthProvider>;
}
