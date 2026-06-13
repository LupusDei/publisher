import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { RequestHandler } from "express";
import { createApp } from "../../src/app.js";
import { adminTelemetryRouter } from "../../src/routes/admin-telemetry.js";
import { createTelemetry } from "../../src/telemetry/metrics.js";

function buildApp(requireAdmin?: RequestHandler) {
  const telemetry = createTelemetry();
  // Seed a few measurements so the snapshot has observable content.
  telemetry.recordOutcome("published");
  telemetry.recordOutcome("published");
  telemetry.recordOutcome("failed");
  telemetry.recordTokens("research", "worker-1", 1000, 200);
  telemetry.recordTokens("build", "worker-2", 500);
  telemetry.recordError("timeout", "worker-1");
  telemetry.runStarted();

  const app = createApp({
    corsOrigin: "*",
    version: "test",
    routers: [
      {
        path: "/admin/telemetry",
        router: adminTelemetryRouter({ telemetry, requireAdmin }),
      },
    ],
  });
  return { app, telemetry };
}

describe("GET /admin/telemetry", () => {
  it("should return 200 with the curated telemetry snapshot shape", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/admin/telemetry");

    expect(res.status).toBe(200);
    expect(res.body.outcomesByStatus).toEqual({ published: 2, failed: 1 });
    expect(res.body.tokens.total).toBe(1500);
    expect(res.body.tokens.cachedInput).toBe(200);
    expect(res.body.errorsByType).toEqual({ timeout: 1 });
    expect(res.body.runsActive).toBe(1);
  });

  it("should reflect the live snapshot from the injected telemetry", async () => {
    const { app, telemetry } = buildApp();
    const res = await request(app).get("/admin/telemetry");
    expect(res.body).toEqual(telemetry.snapshot());
  });

  it("should invoke the injected requireAdmin guard and honor a 403 rejection", async () => {
    const requireAdmin: RequestHandler = vi.fn((_req, res) => {
      res.status(403).json({ error: "forbidden" });
    });

    const { app } = buildApp(requireAdmin);
    const res = await request(app).get("/admin/telemetry");

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("should fall back to the passthrough stub guard when none is injected", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/admin/telemetry");
    expect(res.status).toBe(200);
  });
});
