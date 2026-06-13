import bcrypt from "bcryptjs";

/** Cost factor for bcrypt. 10 is the library default — a sensible balance of
 * resistance and latency for the MVP; raise if hardware budget grows. */
const SALT_ROUNDS = 10;

/** Hash a plaintext password with a fresh per-call salt. */
export async function hash(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Constant-time compare of a plaintext against a stored bcrypt digest. */
export async function verify(plain: string, digest: string): Promise<boolean> {
  return bcrypt.compare(plain, digest);
}
