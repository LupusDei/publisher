import { describe, it, expect } from "vitest";
import { Router } from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("createApp router registry", () => {
  it("should mount each router in the registry at its path", async () => {
    const ping = Router();
    ping.get("/", (_req, res) => res.json({ ok: true }));
    const echo = Router();
    echo.get("/:msg", (req, res) => res.json({ msg: req.params.msg }));

    const app = createApp({
      corsOrigin: "*",
      version: "1.2.3",
      routers: [
        { path: "/ping", router: ping },
        { path: "/echo", router: echo },
      ],
    });

    const r1 = await request(app).get("/ping");
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);

    const r2 = await request(app).get("/echo/hello");
    expect(r2.status).toBe(200);
    expect(r2.body.msg).toBe("hello");
  });

  it("should still serve /health through the registry by default", async () => {
    const app = createApp({ corsOrigin: "*", version: "9.9.9" });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("9.9.9");
  });

  it("should work with an empty extra-routers list (edge case — health only)", async () => {
    const app = createApp({ corsOrigin: "*", version: "0.0.1", routers: [] });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
