import { describe, it, expect } from "vitest";
import {
  UserSchema,
  RoleSchema,
  CredentialsSchema,
  AuthResultSchema,
} from "../../src/index.js";

const validUser = {
  id: "u_1",
  email: "writer@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

describe("RoleSchema", () => {
  it("should accept 'user' and 'admin' (valid)", () => {
    expect(RoleSchema.parse("user")).toBe("user");
    expect(RoleSchema.parse("admin")).toBe("admin");
  });

  it("should reject an unknown role (invalid)", () => {
    expect(RoleSchema.safeParse("superadmin").success).toBe(false);
  });

  it("should reject a non-string role (edge case)", () => {
    expect(RoleSchema.safeParse(42).success).toBe(false);
  });
});

describe("UserSchema", () => {
  it("should parse a well-formed user (valid)", () => {
    const user = UserSchema.parse(validUser);
    expect(user.email).toBe("writer@example.com");
    expect(user.role).toBe("user");
  });

  it("should reject a malformed email (invalid)", () => {
    expect(
      UserSchema.safeParse({ ...validUser, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("should NEVER carry a passwordHash field — stripped on parse (security edge)", () => {
    const parsed = UserSchema.parse({
      ...validUser,
      passwordHash: "$2a$10$leakedhashvalue",
    });
    expect("passwordHash" in parsed).toBe(false);
  });

  it("should reject an empty id (edge case)", () => {
    expect(UserSchema.safeParse({ ...validUser, id: "" }).success).toBe(false);
  });
});

describe("CredentialsSchema", () => {
  it("should parse valid credentials (valid)", () => {
    const creds = CredentialsSchema.parse({
      email: "writer@example.com",
      password: "correct horse battery",
    });
    expect(creds.email).toBe("writer@example.com");
  });

  it("should reject an invalid email (invalid)", () => {
    expect(
      CredentialsSchema.safeParse({ email: "nope", password: "secret123" })
        .success,
    ).toBe(false);
  });

  it("should reject an empty password (edge case)", () => {
    expect(
      CredentialsSchema.safeParse({
        email: "writer@example.com",
        password: "",
      }).success,
    ).toBe(false);
  });
});

describe("AuthResultSchema", () => {
  it("should parse a token + user pair (valid)", () => {
    const result = AuthResultSchema.parse({
      token: "header.payload.signature",
      user: validUser,
    });
    expect(result.token).toContain(".");
    expect(result.user.email).toBe("writer@example.com");
  });

  it("should reject a missing token (invalid)", () => {
    expect(AuthResultSchema.safeParse({ user: validUser }).success).toBe(false);
  });

  it("should reject a user that leaks a passwordHash by stripping it (security edge)", () => {
    const result = AuthResultSchema.parse({
      token: "header.payload.signature",
      user: { ...validUser, passwordHash: "$2a$10$leaked" },
    });
    expect("passwordHash" in result.user).toBe(false);
  });
});
