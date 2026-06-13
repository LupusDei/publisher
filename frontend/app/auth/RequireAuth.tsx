"use client";

/**
 * RequireAuth — gate a page behind a valid session (85q.5). While the session
 * resolves it shows an accessible loading state; once resolved it either
 * renders its children (authenticated) or redirects to /login, threading the
 * current path through `?next=` so the user lands back where they intended.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, pathname, router]);

  if (status === "authenticated") {
    return <>{children}</>;
  }

  // loading, or unauthenticated mid-redirect: an accessible holding state.
  return (
    <main className="auth-gate" aria-busy="true">
      <p role="status" className="auth-gate-status">
        <span className="auth-spinner" aria-hidden="true" />
        {status === "loading"
          ? "Checking your session…"
          : "Redirecting to sign in…"}
      </p>
    </main>
  );
}
