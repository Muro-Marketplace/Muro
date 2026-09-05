"use client";

import { authFetch } from "@/lib/api-client";

/**
 * Shared reads for portal pages, so a click lands on a request that is already
 * in flight.
 *
 * Moving the chrome into the route layout stopped the portal being rebuilt on
 * every click, and pinning the functions beside the database roughly halved
 * what each request costs. What was left is the one thing neither of those
 * touches: the page's OWN data. Clicking Orders keeps the sidebar now, but the
 * content area still waits the full round trip before it can render anything,
 * because the request does not start until the page mounts.
 *
 * The sidebar starts it earlier. Hovering or focusing a link fires the request
 * for that page, and by the time the click lands (a couple of hundred
 * milliseconds later, for a pointer) the answer is on its way or already here.
 *
 * Two rules keep this honest, and they are why there is no persistent cache:
 *
 *   1. A resolved value is reused for FRESH_MS only. That window is about the
 *      gap between hovering a link and clicking it, not a caching policy, so a
 *      page can never render data from earlier in the session.
 *   2. Any confirmed write clears everything (mutate() in lib/api-client.ts),
 *      so a save is never followed by a stale list.
 *
 * A rejected request is not cached at all: a failure must not be replayed to
 * the next caller, who may well be a retry.
 */

/** How long a resolved response may be handed to a new caller. */
export const FRESH_MS = 5_000;

interface Entry {
  promise: Promise<unknown>;
  /** When it settled. Absent while still in flight. */
  settledAt?: number;
  failed?: boolean;
}

const entries = new Map<string, Entry>();

function usable(entry: Entry | undefined): boolean {
  if (!entry || entry.failed) return false;
  if (entry.settledAt === undefined) return true; // still in flight: join it
  return Date.now() - entry.settledAt < FRESH_MS;
}

/**
 * GET a portal endpoint, sharing the request with anything that asked for the
 * same URL moments ago. Rejects on a non-2xx, so a caller cannot render a
 * 403 body as data.
 */
export function portalGet<T = unknown>(url: string): Promise<T> {
  const existing = entries.get(url);
  if (usable(existing)) return existing!.promise as Promise<T>;

  const entry: Entry = {
    promise: authFetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} failed (${res.status})`);
        return (await res.json()) as T;
      })
      .then(
        (value) => {
          entry.settledAt = Date.now();
          return value;
        },
        (err) => {
          // Never replay a failure: the next caller is often a retry.
          entry.failed = true;
          entries.delete(url);
          throw err;
        },
      ),
  };
  entries.set(url, entry);
  return entry.promise as Promise<T>;
}

/**
 * Start the request without caring about the answer. Used by the sidebar on
 * hover and focus; the click that follows joins whatever this started.
 */
export function prefetchPortalGet(url: string): void {
  portalGet(url).catch(() => {
    /* Prefetch is best effort. The page's own call will surface any error. */
  });
}

/** Drop everything. Called by mutate() on every confirmed write. */
export function clearPortalGetCache(): void {
  entries.clear();
}

/** Test seam. */
export function portalGetCacheSize(): number {
  return entries.size;
}
