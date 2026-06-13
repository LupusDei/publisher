/**
 * Seed two voice-distinct, real personas (ASSUMPTIONS D14, R6, ★).
 *
 * These are the demo's "same concept → two visibly different pages" proof and
 * the genuine "real input from your own work" requirement. Both carry a real
 * `voiceSample` the voice-fidelity checkpoint judges against, and declare design
 * tokens from the FIXED vocabulary (palette/typography/layout/tone, D3).
 *
 * Idempotent: personas are keyed by their (unique) name; a second run inserts
 * nothing.
 *
 * Run:
 *   npx tsx backend/scripts/seed-personas.ts     (uses DATABASE_PATH or ./publisher.db)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { NewPersona } from "@publisher/shared";
import { openDb } from "../src/stores/db.js";
import { loadMigrations, runMigrations } from "../src/stores/migrate.js";
import type { PersonaStore } from "../src/stores/persona.store.js";
import { createPersonaStore } from "../src/stores/persona.store.js";

/** The two real, voice-distinct demo personas (id assigned by the store). */
export const SEED_PERSONAS: NewPersona[] = [
  {
    name: "The Essayist",
    voice:
      "Measured and first-person, fond of the em-dash and the well-placed pause. Reasons in public, prefers a precise image to an abstraction, and never raises its voice.",
    voiceSample:
      "Emergence is not magic — it is only attention paid closely enough that the pattern finally has nowhere left to hide. We mistake the surprise for the cause. The ant colony does not plan the bridge; it simply keeps walking, and the bridge is what walking together looks like from above.",
    stylePoints: [
      "Short paragraphs, often a single thought each.",
      "One concrete image per section to anchor the idea.",
      "Em-dashes for the turn; semicolons for the gather.",
      "End on a quiet, earned line — never a fanfare.",
    ],
    keyLearnings: [
      "Emergence is not magic; it is attention paid closely enough.",
      "The reader trusts a precise image more than a confident claim.",
      "Clarity is a courtesy, not a constraint.",
    ],
    designElements: {
      palette: "warm neutrals — ink on cream, a single muted ochre accent",
      typography:
        "humanist serif for body, generous leading; small-caps headings",
      layout: "single narrow column, wide margins, no sidebars",
      tone: "calm, confiding, unhurried",
    },
  },
  {
    name: "The Builder",
    voice:
      "Direct, second-person, imperative. Talks like a senior engineer at a whiteboard: short sentences, concrete verbs, no throat-clearing. Shows the tradeoff, then makes the call.",
    voiceSample:
      "Ship the boring version first. You do not earn the right to a clever abstraction until you have felt the pain it removes three separate times. Measure, then cut. The fastest code is the code you deleted, and the second fastest is the code you never wrote because you read the requirement twice.",
    stylePoints: [
      "Lead with the action; bury the caveats below the fold.",
      "Bullet lists over prose when steps matter.",
      "Name the tradeoff explicitly, then decide.",
      "Every claim earns its place with a reason or a number.",
    ],
    keyLearnings: [
      "Simplest thing that works first; abstractions after the third duplication.",
      "A tradeoff named is a tradeoff managed.",
      "The fastest code is the code you never wrote.",
    ],
    designElements: {
      palette: "high-contrast — near-black on white, one electric-blue accent",
      typography:
        "geometric sans throughout, tight tracking, bold weights for headings",
      layout: "wide content column, code-friendly gutters, sticky section nav",
      tone: "confident, terse, pragmatic",
    },
  },
];

export interface SeedResult {
  /** Names of personas created during this run. */
  inserted: string[];
  /** Names that already existed and were left untouched. */
  skipped: string[];
}

/**
 * Insert any seed personas not already present (matched by their unique name).
 * Pure and testable: takes a store, returns what it did. Idempotent across runs.
 */
export function seedPersonas(store: PersonaStore): SeedResult {
  const existing = new Set(store.list().map((p) => p.name));
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of SEED_PERSONAS) {
    if (existing.has(seed.name)) {
      skipped.push(seed.name);
      continue;
    }
    store.create(seed);
    inserted.push(seed.name);
  }

  return { inserted, skipped };
}

/* c8 ignore start -- thin boot wiring; the pure seedPersonas logic is unit-tested */
function run(): void {
  const databasePath = process.env["DATABASE_PATH"] ?? "./publisher.db";
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "migrations");

  const db = openDb(databasePath);
  runMigrations(db, loadMigrations(migrationsDir));

  const result = seedPersonas(createPersonaStore(db));
  console.log(
    `[seed] personas — inserted: ${
      result.inserted.join(", ") || "(none)"
    }; skipped (already present): ${result.skipped.join(", ") || "(none)"}`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  try {
    run();
  } catch (err: unknown) {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  }
}
/* c8 ignore stop */
