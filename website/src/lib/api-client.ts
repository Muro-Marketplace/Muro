import { supabase } from "@/lib/supabase";

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

  return payload as T;
}

/** True when the failure is worth retrying rather than reporting as invalid input. */
export function isTransient(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof ApiError && err.status >= 500);
}
