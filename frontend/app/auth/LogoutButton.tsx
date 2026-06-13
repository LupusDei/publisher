"use client";

/**
 * LogoutButton — a self-contained sign-out control (85q.5). Renders the signed
 * -in email plus a "Sign out" button; clicking clears the token (via the auth
 * context) and routes back to the login view. Renders nothing while signed out
 * or still resolving, so it is safe to drop into any header/toolbar.
 */

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function LogoutButton(): React.ReactElement | null {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  if (status !== "authenticated" || !user) return null;

  function onClick(): void {
    logout();
    router.push("/login");
  }

  return (
    <span className="auth-logout">
      <span className="auth-logout-email" title={user.email}>
        {user.email}
      </span>
      <Button variant="quiet" size="md" onClick={onClick}>
        Sign out
      </Button>
    </span>
  );
}
