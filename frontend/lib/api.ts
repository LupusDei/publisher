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

/** Minimal mirror of the backend Receipt (shared contract). */
export interface Receipt {
  id: string;
  url: string;
  bytes: number;
  publishedAt: string;
  workerId: string;
}

/** A run event as returned by GET /runs/:id/events (envelope + discriminant). */
export interface SkeletonEvent {
  runId: string;
  seq: number;
  ts: string;
  t: string;
  pillar?: string;
}

export interface StartedRun {
  runId: string;
  receipt: Receipt;
}

/** Start a skeleton run for a persona + concept. */
export async function startRun(
  input: { personaId: string; concept: string },
  base: string = API_BASE,
): Promise<StartedRun> {
  const res = await fetch(`${base}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Failed to start run (HTTP ${res.status})`);
  }
  return (await res.json()) as StartedRun;
}

/** Fetch the ordered journal for a run. */
export async function fetchRunEvents(
  runId: string,
  base: string = API_BASE,
): Promise<SkeletonEvent[]> {
  const res = await fetch(`${base}/runs/${runId}/events`);
  if (!res.ok) {
    throw new Error(`Failed to load run events (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { events: SkeletonEvent[] };
  return body.events;
}

/** The absolute URL of a published page (for the preview iframe). */
export function publishedUrl(runId: string, base: string = API_BASE): string {
  return `${base}/published/${runId}`;
}
