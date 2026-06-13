import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createJwt } from "../../src/auth/jwt.js";
import { requireAuth, requireAdmin } from "../../src/auth/middleware.js";

const SECRET = "mw-test-secret";
const jwt = createJwt(SECRET);

/** Minimal Response double that records status + json and signals `sent`. */
function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function reqWith(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe("requireAuth", () => {
  it("should populate req.user and call next() for a valid Bearer token", () => {
    const token = jwt.sign({ userId: "u_1", role: "user" });
    const req = reqWith({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(SECRET)(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ userId: "u_1", role: "user" });
    expect(res.statusCode).toBe(0);
  });

  it("should return a structured 401 when the Authorization header is missing", () => {
    const req = reqWith({});
    const res = mockRes();
    const next = vi.fn();

    requireAuth(SECRET)(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error?: unknown }).error).toBeDefined();
  });

  it("should return a 401 for a malformed / wrongly-signed token (edge case)", () => {
    const req = reqWith({ authorization: "Bearer not.a.jwt" });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(SECRET)(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("should return a 401 when the scheme is not Bearer", () => {
    const token = jwt.sign({ userId: "u_1", role: "user" });
    const req = reqWith({ authorization: `Basic ${token}` });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(SECRET)(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("should call next() when req.user has the admin role", () => {
    const req = reqWith();
    req.user = { userId: "u_admin", role: "admin" };
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("should return a 403 when req.user is a non-admin", () => {
    const req = reqWith();
    req.user = { userId: "u_1", role: "user" };
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as { error?: unknown }).error).toBeDefined();
  });

  it("should return a 401 when req.user is absent (no prior requireAuth)", () => {
    const req = reqWith();
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
