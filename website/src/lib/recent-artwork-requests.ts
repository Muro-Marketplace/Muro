/**
 * Local cache of artwork requests a venue has just submitted.
 *
 * QA flagged that POSTing a new artwork request lands the venue on a
 * detail page that's stuck on "Loading…" and a list page that says
 * "No requests yet" — even though the submission IS visible on the
 * public venue page. The root cause sits server-side (the venue's
 * own `/api/artwork-requests?mine=1` GET doesn't surface the row),
 * but until that's reconciled this cache makes the venue's recent
 * submissions visible in their own portal.
 *
 * Behaviour:
 *   - `recordSubmission` writes a row to localStorage on successful
 *     POST. TTL is 7 days so a long-lived cache doesn't quietly
 *     diverge from the database forever.
 *   - `getRecentRequests` returns the cached rows, expired ones
 *     pruned. Callers merge with the API response, de-duping by id.
 *   - `getRecentRequestById` returns one row by id, used by the
 *     detail page when the API returns nothing.
 *   - `clearRecentRequest` removes a row by id (e.g. when the API
 *     finally surfaces it so we don't render duplicates).
 *
 * Storage key is namespaced to avoid collisions; data is read on
 * demand, no in-memory subscription pattern needed (the surfaces
 * that care re-read it on mount + after navigation).
 */

const STORAGE_KEY = "wallplace-recent-artwork-requests";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RecentArtworkRequest {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[];
  mediums: string[];
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  location: string | null;
  timescale: string | null;
  visibility: string;
  status: "open" | "closed" | "fulfilled";
  /** ISO timestamp at submission, also seeds created_at-style fields. */
  created_at: string;
  /** Stored expiry, ms epoch. */
  _expiresAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): RecentArtworkRequest[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (r): r is RecentArtworkRequest =>
        !!r &&
        typeof r === "object" &&
        typeof (r as RecentArtworkRequest).id === "string" &&
        typeof (r as RecentArtworkRequest)._expiresAt === "number" &&
        (r as RecentArtworkRequest)._expiresAt > now,
    );
  } catch {
    return [];
  }
}

function writeAll(rows: RecentArtworkRequest[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota exceeded / private browsing, fall through silently — the
    // cache is a nice-to-have, not a correctness requirement.
  }
}

/**
 * Save a freshly-submitted artwork request to the local cache so it
 * appears in the venue's list + detail pages even before the API
 * surfaces it.
 */
export function recordSubmission(
  payload: Omit<RecentArtworkRequest, "_expiresAt"> & Partial<Pick<RecentArtworkRequest, "_expiresAt">>,
): void {
  if (!payload.id) return;
  const rows = readAll().filter((r) => r.id !== payload.id);
  rows.unshift({
    ...payload,
    _expiresAt: payload._expiresAt ?? Date.now() + TTL_MS,
  });
  writeAll(rows.slice(0, 25)); // hard cap on cache size
}

export function getRecentRequests(): RecentArtworkRequest[] {
  return readAll();
}

export function getRecentRequestById(id: string): RecentArtworkRequest | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function clearRecentRequest(id: string): void {
  const rows = readAll().filter((r) => r.id !== id);
  writeAll(rows);
}
