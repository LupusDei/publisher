# Atelier — Publisher Design System

> **Status:** v1 foundation (publisher-3jm.1). This document is the **contract**.
> Every surface obeys these tokens and motion rules. Coherence is the product.

## The idea

Publisher is a **modern fine-press studio with a brilliant assistant**. Paper and
ink, set in confident type, brought to life by an instrument that is visibly,
fluidly capable. We help creative people publish *beautiful ideas in their own
voice* — the app itself must feel like that promise.

## Principles

1. **Editorial, not dashboard.** Typeset journal, not SaaS admin. Serif display,
   generous measure, real typographic rhythm.
2. **Capability you can feel.** "Advanced and capable" is communicated through
   *motion and responsiveness* — ink settling, content arriving in considered
   sequence — never through clutter or chrome.
3. **One confident accent.** Warm vermillion does all the pointing. Restraint
   reads as taste.
4. **Motion with manners.** Every animation has a job: orient, confirm, or
   delight-once. All of it collapses gracefully under `prefers-reduced-motion`.

## Token schema (CSS custom properties — defined in `app/globals.css`)

**Always consume tokens. Never hard-code a hex, px size, duration, or easing in a
component.** If you need a value that isn't a token, add the token here first.

### Color
| Token | Value | Use |
|---|---|---|
| `--bg` | `#f6f4ef` | page paper |
| `--bg-sunk` | `#efe9df` | recessed wells, track backgrounds |
| `--panel` | `#fffdfa` | raised cards/surfaces |
| `--ink` | `#1f1d1a` | primary text |
| `--muted` | `#6b6358` | secondary text |
| `--line` | `#e4ded3` | hairlines, borders |
| `--accent` | `#b5512f` | the single accent (vermillion) |
| `--accent-strong` | `#8f3d22` | accent text on light / hover |
| `--good` | `#3f7d52` | success / published |
| `--warn` | `#b07a2b` | warnings |
| `--crit` | `#b23b3b` | critical / failure |
| `--focus` | `color-mix(--accent 50% transparent)` | focus rings |

### Type
- `--font-display`: `Georgia, "Times New Roman", serif` — headlines, the "press" voice.
- `--font-body`: system sans stack — body, UI.
- `--font-mono`: `ui-monospace, "SF Mono", Menlo, monospace` — metrics, code, receipts.
- Fluid scale (clamp): `--step--1` … `--step-6`. Use these, not raw px, for headings/lead.

### Space / radius / shadow
- Space: `--space-1` (4px) → `--space-10` (96px), 4px base.
- Radius: `--r-sm` 6, `--r-md` 12, `--r-lg` 18, `--r-pill` 999px.
- Shadow (warm-tinted, soft): `--shadow-1` (rest), `--shadow-2` (raised/hover), `--shadow-3` (overlay).

### Motion
- Durations: `--dur-1` 120ms (micro), `--dur-2` 220ms (standard), `--dur-3` 380ms (entrance).
- Easings: `--ease-out` `cubic-bezier(.22,1,.36,1)`, `--ease-spring` `cubic-bezier(.34,1.56,.64,1)`.

## Motion utilities (CSS-only, in `globals.css`)

- `.anim-rise` — fade + 8px rise (ink settling). Entrance default.
- `.anim-fade` — fade only.
- `.stagger > *` — children animate in sequence; set `style={{ ['--i' as any]: n }}`
  on each child to order it (delay = `--i × 60ms`).
- `.draw-rule` — an accent rule that draws in horizontally (hero signature).
- **Reduced motion:** a global `@media (prefers-reduced-motion: reduce)` guard
  neutralizes all animation/transition durations. Never re-enable motion past it.

## Shared primitives (`components/ui/`)

- `Button` — variants `primary | ghost | quiet | danger`, sizes `md | lg`.
  Vermillion fill for primary, hairline for ghost, text-only for quiet. Includes
  a press micro-interaction and token focus ring. **Use this — do not hand-roll
  buttons or use inline styles.**

## Hard rules for contributors

- No inline `style={}` color/spacing/type/motion values. Tokens or class names only.
- Keep `runs-ui.css` working — it already consumes `--bg/--panel/--ink/--muted/--line/--accent/--good/--crit`. Do not rename those.
- Everything keyboard-navigable; visible focus ring; respects reduced motion.
- New components with logic need tests (see constitution §1 / testing rules).
