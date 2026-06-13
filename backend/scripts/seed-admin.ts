/**
 * Seed an administrator account (Epic publisher-85q, 85q.6).
 *
 * The admin is the only user who can see every persona/run (`requireAdmin` and
 * the owner-scoped routes). Bootstrapping it from the environment keeps the
 * credentials out of git: set ADMIN_EMAIL + ADMIN_PASSWORD and run the script.
 *
 * Idempotent: keyed by the (unique) email — a second run leaves the existing
 * admin untouched (it does NOT reset the password). Re-run after changing
 * ADMIN_PASSWORD only if you first delete the row, or use a dedicated reset.
 *
 * Run:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run seed:admin --workspace backend
 *   (uses DATABASE_PATH or ./publisher.db)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CredentialsSchema, type Credentials, type User } from "@publisher/shared";
import { openDb } from "../src/stores/db.js";
import { loadMigrations, runMigrations } from "../src/stores/migrate.js";
import {
  createUserStore,
  DuplicateEmailError,
  type UserStore,
} from "../src/stores/user.store.js";
import { hash } from "../src/auth/password.js";

/** What `seedAdmin` did: whether it created the admin or found one already. */
export interface SeedAdminResult {
  created: boolean;
  user: User;
}

/**
 * Ensure an admin user exists for the given credentials. Validates the
 * credentials (Rule 2), hashes the password, and inserts a user with the
 * `admin` role. Idempotent: if the email already exists it returns that user
 * with `created: false` and does not touch the stored password.
 *
 * Pure and testable — takes a store, returns what it did.
 */
export async function seedAdmin(
  store: UserStore,
  input: Credentials,
): Promise<SeedAdminResult> {
  const creds = CredentialsSchema.parse(input);

  const existing = store.getByEmail(creds.email);
  if (existing) {
    return { created: false, user: existing.user };
  }

  const passwordHash = await hash(creds.password);
  try {
    const user = store.create({
      email: creds.email,
      passwordHash,
      role: "admin",
    });
    return { created: true, user };
  } catch (err) {
    // Lost a race against a concurrent seed — treat as already-present.
    if (err instanceof DuplicateEmailError) {
      const now = store.getByEmail(creds.email);
      if (now) return { created: false, user: now.user };
    }
    throw err;
  }
}

/* c8 ignore start -- thin boot wiring; the pure seedAdmin logic is unit-tested */
async function run(): Promise<void> {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];
  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must both be set to seed an admin",
    );
  }

  const databasePath = process.env["DATABASE_PATH"] ?? "./publisher.db";
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "migrations");

  const db = openDb(databasePath);
  runMigrations(db, loadMigrations(migrationsDir));

  const result = await seedAdmin(createUserStore(db), { email, password });
  console.log(
    result.created
      ? `[seed] admin created: ${result.user.email}`
      : `[seed] admin already present: ${result.user.email} (left untouched)`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  run().catch((err: unknown) => {
    console.error("[seed] admin failed:", err);
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
