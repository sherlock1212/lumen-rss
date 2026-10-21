/**
 * Who may use the server endpoints (/api/feed, /api/discover-feed).
 * Server only: never import this from client code.
 *
 * The browser sends its Firebase login token. We do not verify the token ourselves: we hand it
 * to Firestore and ask for the caller's own entry in the "allowlist" collection. Firestore
 * checks the token, applies firestore.rules and answers:
 *   200  the person is on the list              -> allowed
 *   404  valid token, not on the list           -> refused (403)
 *   401  the token is not valid (or expired)    -> 401, the app gets a fresh one and retries
 * so the list and the rules stay the only source of truth, and no secret has to be stored here.
 * Answers are remembered for a short while, so a burst of feed requests costs one lookup.
 */
import { jsonResponse } from "./feedProxy";

const GOOD_FOR_MS = 60_000;
const BAD_FOR_MS = 10_000;
const MAX_REMEMBERED = 300;
const LOOKUP_TIMEOUT_MS = 5_000;

export interface AccessDeps {
  fetch?: typeof fetch;
  projectId?: string;
  now?: () => number;
}

const remembered = new Map<string, { until: number; status: 200 | 403 }>();

/** Test helper. */
export function forgetAccessAnswers(): void {
  remembered.clear();
}

function claimsOf(token: string): { email: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) =>
      c.charCodeAt(0),
    );
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof claims.email !== "string" || typeof claims.exp !== "number") return null;
    return { email: claims.email.trim().toLowerCase(), exp: claims.exp };
  } catch {
    return null;
  }
}

function refuse(request: Request, status: number, error: string): Response {
  const extra: Record<string, string> = { "Cache-Control": "no-store" };
  if (status === 401) extra["WWW-Authenticate"] = "Bearer";
  return jsonResponse(request, { error }, status, extra);
}

/** null when the caller may continue, otherwise the response to send back. */
export async function requireAccess(
  request: Request,
  deps: AccessDeps = {},
): Promise<Response | null> {
  const now = deps.now ?? Date.now;
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return refuse(request, 401, "Sign in required");

  const claims = claimsOf(token);
  if (!claims || !claims.email) return refuse(request, 401, "Sign in required");
  // (Only a pre-check, to spare a lookup: Firestore does the real verification.)
  if (claims.exp * 1000 <= now()) return refuse(request, 401, "Session expired");

  const known = remembered.get(token);
  if (known && known.until > now()) {
    return known.status === 200 ? null : refuse(request, 403, "Access not allowed");
  }

  const projectId =
    deps.projectId ?? (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined);
  if (!projectId) return refuse(request, 503, "Access check is not configured");

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/allowlist/${encodeURIComponent(claims.email)}?mask.fieldPaths=role`;

  let status: number;
  try {
    const res = await (deps.fetch ?? fetch)(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => {});
    status = res.status;
  } catch {
    return refuse(request, 503, "Could not check your access, try again");
  }

  if (status === 401) return refuse(request, 401, "Session expired");
  if (status !== 200 && status !== 403 && status !== 404) {
    return refuse(request, 503, "Could not check your access, try again");
  }

  const verdict = status === 200 ? 200 : 403;
  if (remembered.size >= MAX_REMEMBERED) {
    for (const [k, v] of remembered) if (v.until <= now()) remembered.delete(k);
    if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  }
  remembered.set(token, {
    until: now() + (verdict === 200 ? GOOD_FOR_MS : BAD_FOR_MS),
    status: verdict,
  });
  return verdict === 200 ? null : refuse(request, 403, "Access not allowed");
}
