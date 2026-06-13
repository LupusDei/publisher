import Database from "better-sqlite3";

/** The concrete database handle. Kept behind this module so the rest of the
 * codebase depends on the `DB` type, not on better-sqlite3 directly — leaving
 * the documented Turso/libSQL cloud path a localized swap. */
export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
