/**
 * Health service — business logic for the liveness check. Kept free of any
 * Express/HTTP types so it is unit-testable in isolation (Constitution Rule 4).
 */
export interface HealthStatus {
  status: "ok";
  version: string;
  uptimeSeconds: number;
}

export interface HealthDeps {
  /** Seconds the process has been running. */
  uptime: () => number;
  /** Application version string. */
  version: string;
}

export interface HealthService {
  check(): HealthStatus;
}

export function createHealthService(deps: HealthDeps): HealthService {
  return {
    check(): HealthStatus {
      return {
        status: "ok",
        version: deps.version,
        uptimeSeconds: Math.floor(deps.uptime()),
      };
    },
  };
}
