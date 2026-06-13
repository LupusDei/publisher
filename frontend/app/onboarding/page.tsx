"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/Button";
import {
  createPersona,
  DESIGN_TOKEN_KEYS,
  DESIGN_TOKEN_META,
  type DesignTokenKey,
  type NewPersona,
  type Persona,
} from "../personas/persona-api";
import { useAuth } from "../auth/AuthContext";
import "./onboarding.css";

type SubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "created"; persona: Persona }
  | { kind: "error"; message: string };

/** The three required fields, in order of appearance. */
const REQUIRED_FIELDS = ["name", "voice", "voiceSample"] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** Splits a textarea of one-per-line items into a trimmed, non-empty array. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Onboarding — a guided, Atelier-themed flow that authors a persona (the
 * declared guardrail). Three titled movements — Voice, Style & convictions,
 * Design tokens — reveal in sequence. Required fields validate inline; a live
 * preview echoes the voice in display type; success lands as an accomplishment.
 *
 * All four FIXED design-token fields are offered (no free-text keys). Loading,
 * success, and error are announced via aria-live regions. Styling is entirely
 * token-driven (onboarding.css); motion comes from the globals utilities and
 * collapses under prefers-reduced-motion.
 */
export default function OnboardingPage(): React.ReactElement {
  const { status, register } = useAuth();
  // Show the account step only for a brand-new (signed-out) visitor; a visitor
  // who is already signed in (or whose session is still resolving) goes
  // straight to authoring a persona.
  const needsAccount = status === "unauthenticated";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState("");
  const [voice, setVoice] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [stylePoints, setStylePoints] = useState("");
  const [keyLearnings, setKeyLearnings] = useState("");
  const [tokens, setTokens] = useState<Record<DesignTokenKey, string>>({
    palette: "",
    typography: "",
    layout: "",
    tone: "",
  });
  const [touched, setTouched] = useState<Record<RequiredField, boolean>>({
    name: false,
    voice: false,
    voiceSample: false,
  });
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const values: Record<RequiredField, string> = {
    name,
    voice,
    voiceSample,
  };

  /** A required field is in error once it has been touched and left empty. */
  function fieldError(field: RequiredField): boolean {
    return touched[field] && values[field].trim().length === 0;
  }

  function markTouched(field: RequiredField): void {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  const requiredDone = REQUIRED_FIELDS.filter(
    (f) => values[f].trim().length > 0,
  ).length;

  // A signed-out visitor must also supply email + password before submit; a
  // signed-in (or still-resolving) visitor skips the account step entirely.
  const accountReady =
    !needsAccount || (email.trim().length > 0 && password.length > 0);

  const canSubmit =
    requiredDone === REQUIRED_FIELDS.length &&
    accountReady &&
    state.kind !== "saving";

  function buildPayload(): NewPersona {
    const designElements: Record<string, string> = {};
    for (const key of DESIGN_TOKEN_KEYS) {
      const v = tokens[key].trim();
      if (v.length > 0) {
        designElements[key] = v;
      }
    }
    return {
      name: name.trim(),
      voice: voice.trim(),
      voiceSample: voiceSample.trim(),
      stylePoints: lines(stylePoints),
      keyLearnings: lines(keyLearnings),
      designElements,
    };
  }

  async function onSubmit(): Promise<void> {
    // Surface any missing required fields before attempting the request.
    setTouched({ name: true, voice: true, voiceSample: true });
    if (requiredDone !== REQUIRED_FIELDS.length) return;
    setState({ kind: "saving" });
    try {
      // A signed-out visitor sets a password here: create the account first so
      // the persona is created with an authenticated, owner-scoped request.
      if (needsAccount) {
        await register(email.trim(), password);
      }
      const persona = await createPersona(buildPayload());
      setState({ kind: "created", persona });
    } catch (err: unknown) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Failed to complete onboarding",
      });
    }
  }

  // ── Celebratory success state ─────────────────────────────────────────
  if (state.kind === "created") {
    return (
      <main className="ob-main">
        <div aria-live="polite">
          <section className="ob-success anim-rise" role="status">
            <span className="ob-success-mark" aria-hidden="true">
              ✓
            </span>
            <p className="ob-success-eyebrow">Persona created</p>
            <h1 className="ob-success-name">{state.persona.name}</h1>
            <div className="ob-success-rule draw-rule" aria-hidden="true" />
            <p className="ob-success-sub">
              Your declared guardrail is set. Every checkpoint now judges drafts
              against this voice.
            </p>
            <div className="ob-success-actions">
              <Link
                href={`/personas/${state.persona.id}`}
                className={buttonClass("primary", "lg")}
              >
                View it →
              </Link>
              <Link href="/personas" className={buttonClass("ghost", "lg")}>
                All personas
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const sample = voiceSample.trim();

  return (
    <main className="ob-main">
      <header className="ob-header anim-rise">
        <p className="eyebrow">Onboarding</p>
        <h1>Author a persona</h1>
        <div className="ob-rule draw-rule" aria-hidden="true" />
        <p className="ob-lede">
          A persona is your <strong>declared guardrail</strong>: the voice,
          style, and design the harness enforces on every page. Capture it once
          — the checkpoints judge against it.
        </p>
      </header>

      <ol className="ob-rail anim-fade" aria-hidden="true">
        <li data-reached={requiredDone >= 1}>
          <span className="ob-rail-track">
            <span className="ob-rail-fill" />
          </span>
          <span className="ob-rail-label">Voice</span>
        </li>
        <li data-reached={requiredDone >= 2}>
          <span className="ob-rail-track">
            <span className="ob-rail-fill" />
          </span>
          <span className="ob-rail-label">Convictions</span>
        </li>
        <li data-reached={requiredDone >= 3}>
          <span className="ob-rail-track">
            <span className="ob-rail-fill" />
          </span>
          <span className="ob-rail-label">Design</span>
        </li>
      </ol>

      <form
        className="ob-form stagger"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        {/* ── Movement 0: Account (signed-out visitors only) ────────────── */}
        {needsAccount ? (
          <fieldset className="ob-section" style={{ ["--i" as string]: 0 }}>
            <legend className="ob-section-head ob-legend">
              <span className="ob-section-num">00</span>
              <span className="ob-section-title ob-legend-title">
                Create your account
              </span>
            </legend>
            <p className="ob-section-sub">
              Set an email and password — your personas and runs are scoped to
              you. Already have an account? <Link href="/login">Sign in</Link>.
            </p>
            <div className="ob-token-grid">
              <Field id="email" label="Email">
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="ob-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Field id="password" label="Password">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="ob-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password"
                />
                <button
                  type="button"
                  className={buttonClass("quiet", "md")}
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </Field>
            </div>
          </fieldset>
        ) : null}

        {/* ── Movement 1: Voice ─────────────────────────────────────────── */}
        <section className="ob-section" style={{ ["--i" as string]: 0 }}>
          <header className="ob-section-head">
            <span className="ob-section-num">01</span>
            <h2 className="ob-section-title">Voice</h2>
          </header>
          <p className="ob-section-sub">
            Name this voice and describe how it sounds. The voice sample is the
            anchor the fidelity checkpoint measures every draft against.
          </p>

          <Field
            id="name"
            label="Persona name"
            help="A short handle for this voice."
            required
            error={fieldError("name") ? "Give your persona a name." : null}
          >
            <input
              id="name"
              className="ob-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => markTouched("name")}
              placeholder="e.g. The Essayist"
              autoComplete="off"
            />
          </Field>

          <Field
            id="voice"
            label="Voice"
            help="Describe the voice in a sentence or two."
            required
            error={
              fieldError("voice") ? "Describe how this voice sounds." : null
            }
          >
            <textarea
              id="voice"
              className="ob-textarea"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              onBlur={() => markTouched("voice")}
              placeholder="Measured, first-person, fond of the em-dash."
            />
          </Field>

          <Field
            id="voiceSample"
            label="Voice sample"
            help="A short, authentic passage in this voice. The voice-fidelity checkpoint judges drafts against this."
            required
            error={
              fieldError("voiceSample")
                ? "Write a sample — it anchors every checkpoint."
                : null
            }
          >
            <textarea
              id="voiceSample"
              className="ob-textarea"
              value={voiceSample}
              onChange={(e) => setVoiceSample(e.target.value)}
              onBlur={() => markTouched("voiceSample")}
              placeholder="Write 2–3 real sentences as this persona would."
            />
          </Field>

          {/* Live preview — the voice, set in the press's display type. */}
          <figure className="ob-preview" aria-live="off">
            <figcaption className="ob-preview-label">Voice preview</figcaption>
            {sample.length > 0 ? (
              <>
                <p className="ob-preview-quote">{sample}</p>
                <p className="ob-preview-byline">
                  — {name.trim().length > 0 ? name.trim() : "this persona"}
                </p>
              </>
            ) : (
              <p className="ob-preview-empty">
                Your sample will appear here, in the persona&apos;s own type.
              </p>
            )}
          </figure>
        </section>

        {/* ── Movement 2: Style & convictions ──────────────────────────── */}
        <section className="ob-section" style={{ ["--i" as string]: 1 }}>
          <header className="ob-section-head">
            <span className="ob-section-num">02</span>
            <h2 className="ob-section-title">Style &amp; convictions</h2>
          </header>
          <p className="ob-section-sub">
            Optional, but they sharpen the guardrail. One rule or belief per
            line.
          </p>

          <Field
            id="stylePoints"
            label="Style points"
            help="One per line — concrete rules (e.g. short paragraphs)."
          >
            <textarea
              id="stylePoints"
              className="ob-textarea"
              value={stylePoints}
              onChange={(e) => setStylePoints(e.target.value)}
              placeholder={"short paragraphs\none image per section"}
            />
          </Field>

          <Field
            id="keyLearnings"
            label="Key learnings"
            help="One per line — convictions this persona writes from."
          >
            <textarea
              id="keyLearnings"
              className="ob-textarea"
              value={keyLearnings}
              onChange={(e) => setKeyLearnings(e.target.value)}
              placeholder={
                "emergence is not magic\nattention is the scarce resource"
              }
            />
          </Field>
        </section>

        {/* ── Movement 3: Design tokens ────────────────────────────────── */}
        <fieldset className="ob-section" style={{ ["--i" as string]: 2 }}>
          <legend className="ob-section-head ob-legend">
            <span className="ob-section-num">03</span>
            <span className="ob-section-title ob-legend-title">
              Design tokens
            </span>
          </legend>
          <p className="ob-section-sub">
            A fixed vocabulary so the harness can validate the page&apos;s
            design. Leave any blank.
          </p>
          <div className="ob-token-grid">
            {DESIGN_TOKEN_KEYS.map((key) => (
              <Field
                key={key}
                id={`token-${key}`}
                label={DESIGN_TOKEN_META[key].label}
              >
                <input
                  id={`token-${key}`}
                  className="ob-input"
                  value={tokens[key]}
                  onChange={(e) =>
                    setTokens((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={DESIGN_TOKEN_META[key].placeholder}
                />
              </Field>
            ))}
          </div>
        </fieldset>

        <div className="ob-actions" style={{ ["--i" as string]: 3 }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canSubmit}
          >
            {state.kind === "saving" ? "Saving…" : "Create persona"}
          </Button>
          <Link href="/personas" className={buttonClass("quiet", "lg")}>
            View personas
          </Link>
          {!canSubmit && state.kind !== "saving" ? (
            <p className="ob-actions-hint">
              {requiredDone} of {REQUIRED_FIELDS.length} required fields
              complete
            </p>
          ) : null}
        </div>
      </form>

      {/* Live status region — announces loading to assistive tech. */}
      <div aria-live="polite">
        {state.kind === "saving" && (
          <p role="status" className="ob-status">
            <span className="ob-spinner" aria-hidden="true" />
            Saving — creating your persona…
          </p>
        )}
      </div>

      <div aria-live="assertive">
        {state.kind === "error" && (
          <p role="alert" className="ob-error">
            Couldn&apos;t create persona: {state.message}
          </p>
        )}
      </div>
    </main>
  );
}

/** A labelled field with optional help text, required flag, and inline error. */
function Field(props: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  const errorId = `${props.id}-error`;
  return (
    <div className="ob-field" data-invalid={Boolean(props.error)}>
      <div className="ob-label-row">
        <label htmlFor={props.id} className="ob-label">
          {props.label}
        </label>
        {props.required ? (
          <span className="ob-req" aria-hidden="true">
            Required
          </span>
        ) : null}
      </div>
      {props.help ? <p className="ob-help">{props.help}</p> : null}
      {props.children}
      {props.error ? (
        <p id={errorId} className="ob-field-error" role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
