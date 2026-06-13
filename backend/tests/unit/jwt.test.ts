import { describe, it, expect } from "vitest";
import { createJwt } from "../../src/auth/jwt.js";

const SECRET = "test-secret-please-rotate";

describe("jwt", () => {
  it("should round-trip a {userId, role} claim set (happy path)", () => {
    const jwt = createJwt(SECRET);
    const token = jwt.sign({ userId: "u_1", role: "admin" });
    const claims = jwt.verify(token);
    expect(claims.userId).toBe("u_1");
    expect(claims.role).toBe("admin");
  });

  it("should reject a tampered token (error path)", () => {
    const jwt = createJwt(SECRET);
    const token = jwt.sign({ userId: "u_1", role: "user" });
    // Flip the last character of the signature segment.
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(() => jwt.verify(tampered)).toThrow();
  });

  it("should reject a garbage token (edge case)", () => {
    const jwt = createJwt(SECRET);
    expect(() => jwt.verify("not.a.jwt")).toThrow();
  });

  it("should reject a token signed with a different secret (security edge)", () => {
    const issuer = createJwt("secret-A");
    const verifier = createJwt("secret-B");
    const token = issuer.sign({ userId: "u_1", role: "user" });
    expect(() => verifier.verify(token)).toThrow();
  });

  it("should use HS256 as the signing algorithm", () => {
    const jwt = createJwt(SECRET);
    const token = jwt.sign({ userId: "u_1", role: "user" });
    const header = JSON.parse(
      Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"),
    ) as { alg: string };
    expect(header.alg).toBe("HS256");
  });

  it("should reject a token whose payload omits a required claim (edge case)", () => {
    const jwt = createJwt(SECRET);
    // A token validly signed but missing `role` should fail claim validation.
    const bare = jwt.signRaw({ userId: "u_1" });
    expect(() => jwt.verify(bare)).toThrow();
  });
});
