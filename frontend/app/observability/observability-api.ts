/**
 * Typed client for the observability endpoints (Epic `publisher-2p3`, frontend
 * tasks 2p3.2 + 2p3.4). Kept in the observability route tree so it stays
 * self-contained (mirrors the runs/run-api.ts pattern) and never touches the
 * shared lib or other tracks.
 *
 * Wire contract (the ObsBackend implements it in parallel):
 *   GET /me/observability    (Bearer)        -> UserObservability
 *   GET /admin/observability (Bearer, admin) -> AdminObservability
 *
 * Authenticated calls route through `authFetch` so the persisted JWT travels
 * with every request. The base URL comes from NEXT_PUBLIC_API_BASE so one build
 * points at a local or deployed backend.
 */
import { authFetch } from "../auth/auth-api";

export const OBS_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

/** The published status of a single article/run, as the backend reports it. */
export type ArticleStatus = "published" | "failed" | string;

/** One article's token cost + outcome (a row in the per-article cost table). */
export interface ArticleCost {
  runId: string;
  title: string;
  tokens: number;
  status: ArticleStatus;
}

/** GET /me/observability — the signed-in user's own costs + outcomes. */
export interface UserObservability {
  totalTokensPublished: number;
  perArticle: ArticleCost[];
  researchLoopCount: number;
  publishedCount: number;
  failedCount: number;
}

/** Average + p95 latency, in milliseconds (from the OTel snapshot). */
export interface LatencySnapshot {
  avgMs: number;
  p95Ms: number;
}

/** Average duration (ms) of each pipeline phase (from the OTel snapshot). */
export interface PhaseDurations {
  research: number;
  build: number;
  refine: number;
}

/** GET /admin/observability — system-wide aggregates + OTel error tracking. */
export interface AdminObservability {
  tokenTotals: number;
  publishedCount: number;
  rejectedCount: number;
  /** Rejected / (published + rejected), 0..1. Backend computes it. */
  rejectedRatio: number;
  latency: LatencySnapshot;
  phaseDurations: PhaseDurations;
  /** Error counts keyed by error type (from OTel). */
  errorsByType: Record<string, number>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
    };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** GET /me/observability → the signed-in user's snapshot (requireAuth). */
export async function fetchUserObservability(
  base: string = OBS_API_BASE,
): Promise<UserObservability> {
  const res = await authFetch(`${base}/me/observability`);
  if (!res.ok) {
    throw new Error(
      await readError(
        res,
        `Failed to load your observability (HTTP ${res.status})`,
      ),
    );
  }
  return (await res.json()) as UserObservability;
}

/** GET /admin/observability → system aggregates + OTel snapshot (requireAdmin). */
export async function fetchAdminObservability(
  base: string = OBS_API_BASE,
): Promise<AdminObservability> {
  const res = await authFetch(`${base}/admin/observability`);
  if (!res.ok) {
    throw new Error(
      await readError(
        res,
        `Failed to load admin observability (HTTP ${res.status})`,
      ),
    );
  }
  return (await res.json()) as AdminObservability;
}
