import { describe, it, expect } from "vitest";
import { createHealthService } from "../../src/services/health.service.js";

describe("HealthService", () => {
  it("should report status 'ok' with the provided version", () => {
    const service = createHealthService({
      uptime: () => 12.7,
      version: "1.2.3",
    });
    const result = service.check();
    expect(result.status).toBe("ok");
    expect(result.version).toBe("1.2.3");
  });

  it("should floor fractional uptime to whole seconds", () => {
    const service = createHealthService({
      uptime: () => 12.9,
      version: "0.0.0",
    });
    expect(service.check().uptimeSeconds).toBe(12);
  });

  it("should handle zero uptime at process start (edge case)", () => {
    const service = createHealthService({ uptime: () => 0, version: "0.0.0" });
    expect(service.check().uptimeSeconds).toBe(0);
  });
});
