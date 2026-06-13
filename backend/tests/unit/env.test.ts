import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

describe("loadEnv", () => {
  it("should parse a valid environment and apply defaults", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      PORT: "8080",
      // Production requires a real JWT secret (Epic 85q fail-fast).
      AUTH_JWT_SECRET: "a-real-rotated-secret",
    } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_PATH).toBe("./publisher.db");
    expect(env.USE_REAL_AGENT).toBe(false);
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });

  it("should apply all defaults when given an empty environment", () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
    expect(env.USE_REAL_AGENT).toBe(false);
  });

  it("should throw a readable error when PORT is not a positive number", () => {
    expect(() => loadEnv({ PORT: "-1" } as NodeJS.ProcessEnv)).toThrowError(
      /Invalid environment configuration/,
    );
  });

  it("should coerce USE_REAL_AGENT='true' to boolean true", () => {
    const env = loadEnv({
      USE_REAL_AGENT: "true",
      ANTHROPIC_API_KEY: "sk-test",
    } as NodeJS.ProcessEnv);
    expect(env.USE_REAL_AGENT).toBe(true);
  });

  it("should reject when USE_REAL_AGENT=true but ANTHROPIC_API_KEY is absent (edge case)", () => {
    expect(() =>
      loadEnv({ USE_REAL_AGENT: "true" } as NodeJS.ProcessEnv),
    ).toThrowError(/ANTHROPIC_API_KEY is required/);
  });

  it("should reject an invalid USE_REAL_AGENT value", () => {
    expect(() =>
      loadEnv({ USE_REAL_AGENT: "yes" } as NodeJS.ProcessEnv),
    ).toThrowError(/Invalid environment configuration/);
  });

  it("should apply a dev default for AUTH_JWT_SECRET outside production", () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.AUTH_JWT_SECRET).toBe(
      "dev-insecure-jwt-secret-change-in-production",
    );
  });

  it("should accept an explicit AUTH_JWT_SECRET in production", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      AUTH_JWT_SECRET: "a-real-rotated-secret",
    } as NodeJS.ProcessEnv);
    expect(env.AUTH_JWT_SECRET).toBe("a-real-rotated-secret");
  });

  it("should reject the dev-default AUTH_JWT_SECRET in production (fail-fast)", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrowError(/AUTH_JWT_SECRET must be set/);
  });
});
