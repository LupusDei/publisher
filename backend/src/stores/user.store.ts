import { randomUUID } from "node:crypto";
import { UserSchema, type User, type Role } from "@publisher/shared";
import type { DB } from "./db.js";

/** Input to create a user. The caller hashes the password and passes the digest
 * — the store never sees plaintext. `role` defaults to 'user'. */
export interface NewUser {
  email: string;
  passwordHash: string;
  role?: Role;
}

/** A stored user *with* its hash, for verification during login. This shape is
 * internal to the auth boundary — routes/frontend only ever see the public
 * `User` (no hash). */
export interface UserRecord {
  user: User;
  passwordHash: string;
}

/** Thrown when creating a user whose email already exists (→ structured 409). */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = "DuplicateEmailError";
  }
}

/** Data-access contract for users. Callers depend on this interface, not on the
 * SQLite implementation (Constitution Rule 4). */
export interface UserStore {
  /** Create a user; throws {@link DuplicateEmailError} on a duplicate email. */
  create(input: NewUser): User;
  /** Public user + hash by email, or null. Used by login to verify. */
  getByEmail(email: string): UserRecord | null;
  /** Public user by id, or null. */
  getById(id: string): User | null;
  /** Replace the stored hash; returns false if no user has that id. */
  setPassword(id: string, passwordHash: string): boolean;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  // Validate on read — the DB is a boundary (Constitution Rule 2). The hash is
  // deliberately NOT passed in, so the public User can never carry it.
  return UserSchema.parse({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  });
}

/** better-sqlite3 surfaces a UNIQUE violation as a SqliteError whose `code` is
 * SQLITE_CONSTRAINT_UNIQUE; match defensively on code or message. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof message === "string" && /UNIQUE constraint failed/.test(message))
  );
}

export function createUserStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): UserStore {
  const insertStmt = db.prepare(
    `INSERT INTO users (id, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const getByEmailStmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
  const getByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
  const setPasswordStmt = db.prepare(
    `UPDATE users SET password_hash = ? WHERE id = ?`,
  );

  const store: UserStore = {
    create(input) {
      const id = newId();
      const role: Role = input.role ?? "user";
      try {
        insertStmt.run(id, input.email, input.passwordHash, role, now());
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateEmailError(input.email);
        }
        throw err;
      }
      const created = store.getById(id);
      if (!created) {
        throw new Error(`User ${id} was inserted but could not be read back`);
      }
      return created;
    },

    getByEmail(email) {
      const row = getByEmailStmt.get(email) as UserRow | undefined;
      if (!row) return null;
      return { user: rowToUser(row), passwordHash: row.password_hash };
    },

    getById(id) {
      const row = getByIdStmt.get(id) as UserRow | undefined;
      return row ? rowToUser(row) : null;
    },

    setPassword(id, passwordHash) {
      const result = setPasswordStmt.run(passwordHash, id);
      return result.changes > 0;
    },
  };

  return store;
}
