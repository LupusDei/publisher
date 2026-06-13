/**
 * Typed client for the Publisher backend. The base URL comes from
 * NEXT_PUBLIC_API_BASE so the same build points at local or deployed backends.
 */
export interface Health {
  status: string;
  version: string;
  uptimeSeconds: number;
}

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export async function fetchHealth(base: string = API_BASE): Promise<Health> {
  const res = await fetch(`${base}/health`);
  if (!res.ok) {
    throw new Error(`Backend health check failed (HTTP ${res.status})`);
  }
  return (await res.json()) as Health;
}
