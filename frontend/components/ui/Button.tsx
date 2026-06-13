/**
 * Button — the shared Atelier action primitive. Token-driven styling with a
 * press micro-interaction and the brand focus ring (see specs/design/atelier.md).
 *
 * Use `buttonClass()` to style a non-button element (e.g. a Next.js <Link> CTA)
 * with the exact same look, so navigation links and buttons stay identical.
 */
import type { ButtonHTMLAttributes } from "react";
import "./ui.css";

export type ButtonVariant = "primary" | "ghost" | "quiet" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "ui-btn-primary",
  ghost: "ui-btn-ghost",
  quiet: "ui-btn-quiet",
  danger: "ui-btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "ui-btn-md",
  lg: "ui-btn-lg",
};

/** Compose the Atelier button class string for any element. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return ["ui-btn", VARIANT_CLASS[variant], SIZE_CLASS[size], extra]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
