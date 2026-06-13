/**
 * Typed client for the persona endpoints, owned by Track A (kept in the
 * personas route tree so it does not touch the shared lib/api.ts). Mirrors the
 * backend Persona contract. The base URL comes from NEXT_PUBLIC_API_BASE so the
 * same build points at a local or deployed backend.
 */

// authFetch attaches the persisted JWT as `Authorization: Bearer <token>` so
// every authenticated persona call carries the session (85q.5).
import { authFetch } from "../auth/auth-api";

export const PERSONA_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

/** The Persona shape as returned by the backend (mirror of @publisher/shared). */
export interface Persona {
  id: string;
  name: string;
  voice: string;
  voiceSample: string;
  stylePoints: string[];
  keyLearnings: string[];
  designElements: Record<string, string>;
}

/** Creation payload — everything but the server-assigned id. */
export type NewPersona = Omit<Persona, "id">;

/**
 * The FIXED design-token vocabulary (ASSUMPTIONS D3). Onboarding offers exactly
 * these keys so Track B's detective validators have known keys to check.
 */
export const DESIGN_TOKEN_KEYS = [
  "palette",
  "typography",
  "layout",
  "tone",
] as const;
export type DesignTokenKey = (typeof DESIGN_TOKEN_KEYS)[number];

/** Human-friendly labels + helper text for each fixed design token. */
export const DESIGN_TOKEN_META: Record<
  DesignTokenKey,
  { label: string; placeholder: string }
> = {
  palette: {
    label: "Palette",
    placeholder: "e.g. warm neutrals, ink on cream",
  },
  typography: {
    label: "Typography",
    placeholder: "e.g. serif headings, humanist sans body",
  },
  layout: {
    label: "Layout",
    placeholder: "e.g. single column, generous margins",
  },
  tone: { label: "Tone", placeholder: "e.g. calm, confident, unhurried" },
};

interface ApiError {
  error?: { message?: string; issues?: { path: string; message: string }[] };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiError;
    if (body.error?.issues && body.error.issues.length > 0) {
      return body.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    }
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createPersona(
  input: NewPersona,
  base: string = PERSONA_API_BASE,
): Promise<Persona> {
  const res = await authFetch(`${base}/personas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Failed to create persona (HTTP ${res.status})`),
    );
  }
  return (await res.json()) as Persona;
}

export async function fetchPersonas(
  base: string = PERSONA_API_BASE,
): Promise<Persona[]> {
  const res = await authFetch(`${base}/personas`);
  if (!res.ok) {
    throw new Error(`Failed to load personas (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { personas: Persona[] };
  return body.personas;
}

export async function fetchPersona(
  id: string,
  base: string = PERSONA_API_BASE,
): Promise<Persona> {
  const res = await authFetch(`${base}/personas/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load persona (HTTP ${res.status})`);
  }
  return (await res.json()) as Persona;
}

export async function updatePersona(
  id: string,
  patch: Partial<NewPersona>,
  base: string = PERSONA_API_BASE,
): Promise<Persona> {
  const res = await authFetch(`${base}/personas/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Failed to update persona (HTTP ${res.status})`),
    );
  }
  return (await res.json()) as Persona;
}
