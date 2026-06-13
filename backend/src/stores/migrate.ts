import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./db.js";

export interface Migration {
  name: string;
  sql: string;
}

/** Load numbered *.sql migration files from a directory, sorted by filename. */
export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/**
 * Apply pending migrations in order, recording each in `_migrations`.
 * Idempotent: already-applied migrations are skipped. Each migration runs in a
 * transaction, so a failing migration rolls back and surfaces as a thrown error
 * (the bad migration is NOT recorded as applied).
 *
 * @returns the names of migrations applied during this call.
 */
export function runMigrations(
  db: DB,
  migrations: Migration[],
  now: () => string = () => new Date().toISOString(),
): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const appliedRows = db
    .prepare(`SELECT name FROM _migrations`)
    .all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  const insert = db.prepare(
    `INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`,
  );

  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.name, now());
    });
    tx();
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}
