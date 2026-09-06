// The badge poll: every signed-in user hits this every 60 seconds from
// Header.tsx, so it is the most-called authenticated route on the site.
//
// It timed out twice on 2026-08-31 at the Vercel default of 300 seconds
// (vercel-runtime-errors-7d.txt cluster 4). Two things follow from that, and
// both are pinned here.
//
//   - A route that should answer in under a second must not be allowed to burn
//     300 seconds of function time when something upstream hangs. maxDuration
//     caps it so a hang becomes a fast failure the client already tolerates.
//   - The two profile lookups were sequential, so a user with no artist profile
//     paid two round trips before the count even started. They are independent
//     and now run together, the same shape resolveSubscription uses.
//
// The swallowed catch stays (a badge that cannot be read should not break the
// header) but it no longer swallows silently: an unread count that is always 0
// because of an error looked exactly like an empty inbox.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getAuthMock: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));

import { GET, maxDuration } from "./route";

interface Db {
  artistSlug?: string | null;
  venueSlug?: string | null;
  count?: number | null;
  throwOn?: string;
}

let countFilters: Record<string, unknown> = {};
let tablesQueried: string[] = [];

function installDb({ artistSlug = "fin-coles", venueSlug = null, count = 3, throwOn }: Db = {}) {
  countFilters = {};
  tablesQueried = [];
  fromMock.mockImplementation((table: string) => {
    tablesQueried.push(table);
    if (throwOn === table) throw new Error("upstream hang");
    if (table === "messages") {
      const chain = {
        eq: (col: string, val: unknown) => {
          countFilters[col] = val;
          return chain;
        },
        then: undefined,
      } as unknown as Record<string, unknown> & PromiseLike<{ count: number | null }>;
      // The count query is awaited directly after the .eq() chain.
      (chain as unknown as { then: unknown }).then = (resolve: (v: { count: number | null }) => unknown) =>
        resolve({ count });
      return { select: () => chain };
    }
    const slug = table === "artist_profiles" ? artistSlug : venueSlug;
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: slug ? { slug } : null, error: null }) }) }),
    };
  });
}

function get() {
  return GET(new Request("https://x/api/messages/unread"));
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthMock.mockResolvedValue({ user: { id: "u-1" }, error: null });
  installDb();
});

describe("GET /api/messages/unread", () => {
  it("caps its own runtime, so a hang cannot burn 300 seconds of a polled route", () => {
    expect(maxDuration).toBeLessThanOrEqual(15);
    expect(maxDuration).toBeGreaterThan(0);
  });

  it("counts unread for an artist", async () => {
    const res = await get();
    expect(await res.json()).toEqual({ count: 3 });
    expect(countFilters).toEqual({ recipient_slug: "fin-coles", is_read: false });
  });

  it("counts unread for a venue when the user has no artist profile", async () => {
    installDb({ artistSlug: null, venueSlug: "the-curzon", count: 2 });
    const res = await get();
    expect(await res.json()).toEqual({ count: 2 });
    expect(countFilters).toEqual({ recipient_slug: "the-curzon", is_read: false });
  });

  it("looks both profiles up together, not one after the other", async () => {
    installDb({ artistSlug: null, venueSlug: "the-curzon" });
    await get();
    // Both profile tables are asked before the count, which only happens if the
    // venue lookup was not gated behind the artist lookup's result.
    expect(tablesQueried.slice(0, 2).sort()).toEqual(["artist_profiles", "venue_profiles"]);
  });

  it("prefers the artist slug when the account owns both profiles", async () => {
    installDb({ artistSlug: "fin-coles", venueSlug: "the-curzon" });
    await get();
    expect(countFilters.recipient_slug).toBe("fin-coles");
  });

  it("returns 0 for an account with neither profile, without querying messages", async () => {
    installDb({ artistSlug: null, venueSlug: null });
    const res = await get();
    expect(await res.json()).toEqual({ count: 0 });
    expect(tablesQueried).not.toContain("messages");
  });

  it("returns 0 but LOGS when the read fails, so a broken badge is not mistaken for an empty inbox", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    installDb({ throwOn: "artist_profiles" });
    const res = await get();
    expect(await res.json()).toEqual({ count: 0 });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("passes the auth failure straight through", async () => {
    const unauth = new Response(null, { status: 401 });
    getAuthMock.mockResolvedValue({ user: null, error: unauth });
    expect((await get()).status).toBe(401);
  });
});
