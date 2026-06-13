"use client";

/**
 * Login / Register — the front door (85q.5 / T010). One card hosts both modes;
 * a toggle swaps copy + the submit verb without losing the typed email. On
 * success it adopts the session (token persisted by the auth context) and
 * routes onward — to `?next=` when present, else to /personas.
 *
 * Accessibility: every input is labelled and described; the password field has
 * a keyboard-reachable show/hide; errors are announced via aria-live and are
 * never color-only (an icon + text accompany them); the in-flight state both
 * disables the control and announces "Signing in…".
 */

import { useState, useId, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "../auth/AuthContext";
import "../auth/auth.css";

type Mode = "login" | "register";

const COPY: Record<
  Mode,
  { eyebrow: string; title: string; lede: string; submit: string; busy: string }
> = {
  login: {
    eyebrow: "Welcome back",
    title: "Sign in",
    lede: "Sign in to author personas and publish runs against your guardrails.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  register: {
    eyebrow: "Get started",
    title: "Create your account",
    lede: "Set an email and password — your personas and runs are scoped to you.",
    submit: "Create account",
    busy: "Creating account…",
  },
};

export default function LoginPage(): React.ReactElement {
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailId = useId();
  const passwordId = useId();

  const copy = COPY[mode];
  const emailEmpty = email.trim().length === 0;
  const passwordEmpty = password.length === 0;
  const fieldsMissing = emailEmpty || passwordEmpty;

  function switchMode(): void {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setTouched(false);
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (fieldsMissing) return;

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
      const next = params?.get("next");
      router.push(next && next.startsWith("/") ? next : "/personas");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "login"
            ? "Could not sign in. Please try again."
            : "Could not create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-main">
      <section className="auth-card anim-rise">
        <p className="auth-eyebrow">{copy.eyebrow}</p>
        <h1 className="auth-title">{copy.title}</h1>
        <div className="auth-rule draw-rule" aria-hidden="true" />
        <p className="auth-lede">{copy.lede}</p>

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          {/* ── Email ──────────────────────────────────────────────────── */}
          <div
            className="auth-field"
            data-invalid={touched && emailEmpty ? "true" : undefined}
          >
            <label htmlFor={emailId} className="auth-label">
              Email
            </label>
            <input
              id={emailId}
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={touched && emailEmpty}
              aria-describedby={
                touched && emailEmpty ? `${emailId}-error` : undefined
              }
              placeholder="you@example.com"
              disabled={submitting}
            />
            {touched && emailEmpty ? (
              <p id={`${emailId}-error`} className="auth-field-error" role="alert">
                Enter your email address.
              </p>
            ) : null}
          </div>

          {/* ── Password ───────────────────────────────────────────────── */}
          <div
            className="auth-field"
            data-invalid={touched && passwordEmpty ? "true" : undefined}
          >
            <label htmlFor={passwordId} className="auth-label">
              Password
            </label>
            <div className="auth-password">
              <input
                id={passwordId}
                className="auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={touched && passwordEmpty}
                aria-describedby={
                  touched && passwordEmpty ? `${passwordId}-error` : undefined
                }
                placeholder={mode === "login" ? "Your password" : "Choose a password"}
                disabled={submitting}
              />
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={submitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {touched && passwordEmpty ? (
              <p
                id={`${passwordId}-error`}
                className="auth-field-error"
                role="alert"
              >
                Enter your password.
              </p>
            ) : null}
          </div>

          <div className="auth-actions">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
            >
              {submitting ? copy.busy : copy.submit}
            </Button>

            {/* Loading announcement (polite) */}
            <div aria-live="polite">
              {submitting ? (
                <p role="status" className="auth-status">
                  <span className="auth-spinner" aria-hidden="true" />
                  {copy.busy}
                </p>
              ) : null}
            </div>

            {/* Error announcement (assertive) */}
            <div aria-live="assertive">
              {error ? (
                <p role="alert" className="auth-error">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </form>

        <p className="auth-switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={switchMode}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={switchMode}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="auth-switch" style={{ border: "none", paddingTop: 0 }}>
          Setting up a new persona?{" "}
          <Link href="/onboarding" className="auth-switch-btn">
            Start onboarding
          </Link>
        </p>
      </section>
    </main>
  );
}
