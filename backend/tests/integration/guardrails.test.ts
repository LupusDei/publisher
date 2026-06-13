import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { guardrailsRouter } from "../../src/routes/guardrails.js";
import { essayist, operator } from "../fixtures/personas.js";
import type { Persona } from "@publisher/shared";

/** Minimal in-memory persona-store stub matching the dep the route needs. */
function stubStore(personas: Persona[]) {
  return {
    getById(id: string): Persona | null {
      return personas.find((p) => p.id === id) ?? null;
    },
  };
}

function appWith(personas: Persona[]) {
  return createApp({
    corsOrigin: "*",
    version: "test",
    routers: [
      {
        path: "/personas",
        router: guardrailsRouter({ personaStore: stubStore(personas) }),
      },
    ],
  });
}

describe("GET /personas/:id/compiled (dp0.3.3)", () => {
  it("should return the compiled systemPrompt + described validators for a stored persona", async () => {
    const app = appWith([essayist]);
    const res = await request(app).get(`/personas/${essayist.id}/compiled`);
    expect(res.status).toBe(200);
    expect(typeof res.body.systemPrompt).toBe("string");
    expect(res.body.systemPrompt).toContain("The Essayist");
    expect(Array.isArray(res.body.validators)).toBe(true);
    expect(res.body.validators.length).toBeGreaterThan(0);
    for (const v of res.body.validators) {
      expect(typeof v.rule).toBe("string");
      expect(typeof v.description).toBe("string");
    }
  });

  it("should return 404 with a structured error for an unknown persona (error path)", async () => {
    const app = appWith([essayist]);
    const res = await request(app).get("/personas/nope/compiled");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(typeof res.body.error.message).toBe("string");
  });

  it("should serve DIFFERENT compiled output for two different personas (two-persona proof)", async () => {
    const app = appWith([essayist, operator]);
    const a = await request(app).get(`/personas/${essayist.id}/compiled`);
    const b = await request(app).get(`/personas/${operator.id}/compiled`);
    expect(a.body.systemPrompt).not.toBe(b.body.systemPrompt);
    expect(a.body.systemPrompt).toContain("serif");
    expect(b.body.systemPrompt).toContain("sans-serif");
  });

  it("should not serialize validator functions in the response (JSON-safe)", async () => {
    const app = appWith([essayist]);
    const res = await request(app).get(`/personas/${essayist.id}/compiled`);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("function");
    expect(raw).not.toContain("=>");
  });
});
