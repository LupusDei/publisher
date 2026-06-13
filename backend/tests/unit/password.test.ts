import { describe, it, expect } from "vitest";
import { hash, verify } from "../../src/auth/password.js";

describe("password", () => {
  it("should round-trip: a hash of a plaintext verifies against it (happy path)", async () => {
    const digest = await hash("correct horse battery staple");
    expect(await verify("correct horse battery staple", digest)).toBe(true);
  });

  it("should reject the wrong password (error path)", async () => {
    const digest = await hash("correct horse battery staple");
    expect(await verify("Tr0ub4dor&3", digest)).toBe(false);
  });

  it("should produce a bcrypt digest distinct from the plaintext (security edge)", async () => {
    const plain = "p@ssw0rd";
    const digest = await hash(plain);
    expect(digest).not.toBe(plain);
    // bcrypt digests start with the $2 family prefix.
    expect(digest.startsWith("$2")).toBe(true);
  });

  it("should produce different salts for the same plaintext on each call (edge case)", async () => {
    const a = await hash("same-input");
    const b = await hash("same-input");
    expect(a).not.toBe(b);
    expect(await verify("same-input", a)).toBe(true);
    expect(await verify("same-input", b)).toBe(true);
  });
});
