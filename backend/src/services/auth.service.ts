import {
  CredentialsSchema,
  type AuthResult,
  type Credentials,
  type User,
} from "@publisher/shared";
import { hash, verify } from "../auth/password.js";
import type { Jwt } from "../auth/jwt.js";
import {
  type UserStore,
  DuplicateEmailError as StoreDuplicateEmailError,
} from "../stores/user.store.js";

/** Email already registered (→ structured 409 at the route). */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = "DuplicateEmailError";
  }
}

/** Login failed. Deliberately generic — the message does NOT distinguish an
 * unknown email from a wrong password (→ 401 at the route). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

/** `me` was asked for a user that does not exist — e.g. a valid token whose
 * subject has since been deleted (→ 404 at the route). */
export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`No user with id "${id}"`);
    this.name = "UserNotFoundError";
  }
}

export interface AuthServiceDeps {
  userStore: UserStore;
  jwt: Jwt;
}

export interface AuthService {
  /** Hash + persist a new user, return a signed token and the public user.
   * Throws {@link DuplicateEmailError} on a duplicate email, or a ZodError on
   * malformed input. */
  register(input: Credentials): Promise<AuthResult>;
  /** Verify credentials, return a signed token + public user. Throws
   * {@link InvalidCredentialsError} on any mismatch. */
  login(input: Credentials): Promise<AuthResult>;
  /** Resolve the public user for an authenticated id. Throws
   * {@link UserNotFoundError} if absent. */
  me(userId: string): User;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { userStore, jwt } = deps;

  function tokenFor(user: User): AuthResult {
    const token = jwt.sign({ userId: user.id, role: user.role });
    return { token, user };
  }

  return {
    async register(input) {
      // Validate at the boundary (Rule 2) — rejects bad email / empty password.
      const creds = CredentialsSchema.parse(input);
      const passwordHash = await hash(creds.password);
      let user: User;
      try {
        user = userStore.create({ email: creds.email, passwordHash });
      } catch (err) {
        if (err instanceof StoreDuplicateEmailError) {
          throw new DuplicateEmailError(creds.email);
        }
        throw err;
      }
      return tokenFor(user);
    },

    async login(input) {
      const creds = CredentialsSchema.parse(input);
      const record = userStore.getByEmail(creds.email);
      // Always run a verify even on unknown email to keep timing uniform and
      // the failure mode identical (no email-enumeration via response/timing).
      const ok = record
        ? await verify(creds.password, record.passwordHash)
        : await verify(creds.password, DUMMY_HASH);
      if (!record || !ok) {
        throw new InvalidCredentialsError();
      }
      return tokenFor(record.user);
    },

    me(userId) {
      const user = userStore.getById(userId);
      if (!user) {
        throw new UserNotFoundError(userId);
      }
      return user;
    },
  };
}

/** A real bcrypt digest of a throwaway value. Verifying against it when the
 * email is unknown costs the same as a genuine compare, so login latency does
 * not leak whether an account exists. */
const DUMMY_HASH =
  "$2b$10$qpIBcXS8vnn1PQQuj.Bs3uE1GAyWSo4ySYAGJYEXcdOL7dYBQ6kpO";
