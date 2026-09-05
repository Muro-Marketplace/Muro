import { supabase } from "@/lib/supabase";
import { clearCurrentArtistCache } from "@/lib/current-artist-cache";
import { clearPortalGetCache } from "@/lib/portal-get";

/**
 * Thrown when a request reaches the server and comes back non-2xx. Carries the
 * status and the parsed body so callers can branch on `code` (the `error` key
 * our API routes use) without re-reading the response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: unknown;

  constructor(status: number, message: string, code: string | null, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** Thrown when the request never got a reply, or auth could not be resolved. */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

async function authHeaders(options: RequestInit): Promise<Headers> {
  const headers = new Headers(options.headers);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    // Previously this rejection escaped before fetch() ran, so a save looked
    // like it fired zero requests and produced no error anywhere.
    throw new NetworkError("Could not read your session. Please sign in again.", err);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/**
 * Fetch wrapper that includes the current user's auth token. READ-ONLY use.
 * Returns the raw Response and never throws on a non-2xx, so callers must
 * check `res.ok` themselves. For anything that writes, use `mutate()`.
 */
export async function authFetch(url: string, options: RequestInit = {}) {
  const headers = await authHeaders(options);
  return fetch(url, { ...options, headers });
}

/**
 * Authenticated write. Throws ApiError on a non-2xx and NetworkError when the
 * request never lands, so a save can only be reported as successful if the
 * server actually confirmed it.
 *
 *   const { blog } = await mutate<{ blog: Blog }>("/api/blogs", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   });
 */
export async function mutate<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await authHeaders(options);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new NetworkError("Network error. Please check your connection.", err);
  }

  const raw = await res.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: raw.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const body = (payload ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof body.error === "string" ? body.error : null;
    const message =
      (typeof body.message === "string" && body.message) ||
      code ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, code, payload);
  }

  // A confirmed write may have changed what /api/artist-profile returns, and
  // useCurrentArtist seeds the next portal page from a per-tab snapshot of it.
  // Drop the snapshot so that page fetches, or an artist who saves a work and
  // comes back within five minutes edits the pre-save copy (owner report,
  // 5 September 2026). Broad on purpose: a placement or visualizer write can
  // touch artist_works too, and the cost is one GET on the next mount.
  clearCurrentArtistCache();
  // Same reasoning for the portal list reads: a confirmed write must never be
  // followed by a stale list, even inside portal-get's short reuse window.
  clearPortalGetCache();
  return payload as T;
}

/** True when the failure is worth retrying rather than reporting as invalid input. */
export function isTransient(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof ApiError && err.status >= 500);
}

/**
 * The message to show a user for a failed request.
 *
 * Production pass 2 named a pattern: five separate refusals returned a correct,
 * well-worded error that the UI never showed, so the user saw a button that did
 * nothing and concluded the site was broken. A past install date
 * (`400 "Install date can't be in the past."`), a blog body under 200
 * characters (`422` with an `issues` array), a revenue share above 50%, an
 * offer below the 60% floor, and the saved-walls cap (`402`). Message
 * moderation was the one counter-example: it says "Message contains blocked
 * content" and means it.
 *
 * Two shapes are unpacked, because the API uses both:
 *
 *   { error: "Install date can't be in the past." }
 *   { error: "Not ready for review", issues: ["Body needs at least 200 characters…"] }
 *
 * The `issues` array is the specific one. A user told "Not ready for review"
 * learns nothing; told "Body needs at least 200 characters before submitting"
 * they know exactly what to do, and the server already said so.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof NetworkError) return "Network error. Please try again.";
  if (!(err instanceof ApiError)) return fallback;

  const payload = (err.payload ?? {}) as { issues?: unknown };
  const issues = Array.isArray(payload.issues)
    ? payload.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    : [];
  if (issues.length > 0) return issues.join(" ");

  return err.message || err.code || fallback;
}
