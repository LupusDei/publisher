import { z } from "zod";

/**
 * Auth contracts (Epic `publisher-85q`). These are the stable shapes the auth
 * service, routes, middleware, and frontend all build against.
 *
 * SECURITY INVARIANT: `User` is the *public* user shape and MUST NEVER carry the
 * password hash. The schemas use Zod's default strip behaviour, so parsing a row
 * that happens to include `passwordHash` silently drops it — the hash cannot
 * escape the store/service boundary through a typed `User`.
 */

/** The two roles in the MVP (spec: no finer-grained RBAC). `user` is the
 * default; `admin` is seeded and gates the admin observability views. */
export const RoleSchema = z.enum(["user", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

/** The public user record. Note the deliberate absence of any password field. */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  /** ISO-8601 timestamp. */
  createdAt: z.string().min(1),
});
export type User = z.infer<typeof UserSchema>;

/** Login / register input. Email is validated; password presence is enforced
 * here, strength policy is the service's concern. */
export const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "password is required"),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

/** What register/login return: a signed bearer token plus the public user. */
export const AuthResultSchema = z.object({
  token: z.string().min(1),
  user: UserSchema,
});
export type AuthResult = z.infer<typeof AuthResultSchema>;
