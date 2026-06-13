import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("GET /health", () => {
  const app = createApp({ corsOrigin: "*", version: "9.9.9" });

  it("should return 200 with an ok status body", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("should report the application version", async () => {
    const res = await request(app).get("/health");
    expect(res.body.version).toBe("9.9.9");
  });

  it("should send permissive CORS headers for the configured origin", async () => {
    const res = await request(app).get("/health").set("Origin", "*");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
