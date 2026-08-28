// Tests for the POST /api/offers route, focused on the 4.3 customer gate.

import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted ensures these refs are ready when vi.mock factories run.
const { fromMock, authedUser } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authedUser: { id: "u-test", email: "test@example.com" },
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: authedUser, error: null })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// Silence notifications and email side-effects — not under test here.
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/emails/templates/messages/OfferReceivedNotification", () => ({
  OfferReceivedNotification: vi.fn(() => null),
}));

import { GET, POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/offers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Minimal valid body that satisfies createSchema. */
const validBody = {
  artistSlug: "alice",
  workIds: ["work-1"],
  amountPence: 10000,
};

/**
 * Build a simple db mock that dispatches by table name.
 * Callers can selectively override individual table handlers.
 */
function makeMaybeSingleChain(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data }),
      }),
    }),
  };
}

function setupDb(overrides: {
  venue_profiles?: unknown;
  artist_profiles?: unknown;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "venue_profiles") {
      return makeMaybeSingleChain(overrides.venue_profiles ?? null);
    }
    if (table === "artist_profiles") {
      // The route queries artist_profiles twice: once by user_id (caller check)
      // and once by slug (target artist lookup). We return a valid artist row
      // for the slug lookup so the gate tests reach the gate before anything
      // else blows up.
      return {
        select: () => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({
              data:
                _col === "user_id"
                  ? (overrides.artist_profiles ?? null)
                  : { user_id: "u-alice", name: "Alice" },
            }),
          }),
        }),
      };
    }
    if (table === "artist_works") {
      // Return a row with pricing so computeAskingPricePence doesn't crash for
      // venue-caller tests that reach the price-floor check.
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            data: ids.map((id) => ({
              id,
              pricing: [{ label: "M", price: 100 }],
            })),
            error: null,
          }),
        }),
      };
    }
    if (table === "purchase_offers") {
      // Stub the insert and any follow-up selects so the venue-caller test
      // can reach a response without crashing on missing chain methods.
      return {
        insert: async () => ({ error: null }),
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { buyer_user_id: "u-test", artist_user_id: "u-alice" } }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      };
    }
    // Fallback — return null for any other table so tests that only care about
    // the gate don't crash trying to reach deeper logic.
    return {
      ...makeMaybeSingleChain(null),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
          single: async () => ({ data: null }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  fromMock.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/offers — 4.3 customer gate", () => {
  it("rejects a customer with parentOfferId with customer_cannot_make_offers 403", async () => {
    // Neither venue nor artist profile for the caller.
    setupDb({ venue_profiles: null, artist_profiles: null });

    const res = await POST(
      makeRequest({ ...validBody, parentOfferId: "offer-parent-123" }),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("customer_cannot_make_offers");
  });

  it("rejects a plain customer (no parentOfferId) with customer_cannot_make_offers 403", async () => {
    setupDb({ venue_profiles: null, artist_profiles: null });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("customer_cannot_make_offers");
  });

  it("does NOT return customer_cannot_make_offers for a venue caller", async () => {
    // Venue profile present — caller is a venue.
    setupDb({
      venue_profiles: { user_id: "u-test", slug: "test-venue" },
      artist_profiles: null,
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    // The venue passes the customer gate. Deeper logic may return other errors
    // (e.g. price floor or ownership checks) but must NOT be the customer gate.
    expect(res.status).not.toBe(403);
    expect(body.error).not.toBe("customer_cannot_make_offers");
  });

  it("does NOT return customer_cannot_make_offers for an artist caller with parentOfferId", async () => {
    // Artist profile present for the caller, no venue profile.
    setupDb({
      venue_profiles: null,
      artist_profiles: { user_id: "u-test" },
    });

    const res = await POST(
      makeRequest({ ...validBody, parentOfferId: "offer-parent-456" }),
    );
    const body = await res.json();

    // The artist passes the customer gate. Deeper logic (ownership check on the
    // parent offer) will likely return a different error, but not the customer gate.
    expect(body.error).not.toBe("customer_cannot_make_offers");
  });
});

// ---------------------------------------------------------------------------
// row 19 #7 — artist_collections has `name`, not `title`. The GET enrichment
// selected `id, title, work_ids`; PostgREST rejects a select naming a column that
// does not exist, which nulled every collection on the offers list. The mock below
// models that rejection faithfully (a naive mock that ignores the select string
// would mask the bug), so the test fails before the fix and passes after.
// ---------------------------------------------------------------------------

// Real columns of artist_collections (tests/integration/schema-columns.json).
const COLLECTION_COLUMNS = new Set([
  "id", "artist_id", "artist_slug", "name", "description", "bundle_price",
  "work_ids", "available", "created_at", "thumbnail", "banner_image",
  "updated_at", "work_sizes",
]);

function getEnrichmentDb(collectionRow: Record<string, unknown>) {
  return (table: string) => {
    if (table === "purchase_offers") {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = () => chain;
      chain.or = () => chain;
      chain.limit = async () => ({
        data: [
          {
            id: "o1", buyer_user_id: "u-test", artist_user_id: "u-alice",
            artist_slug: null, work_ids: [], collection_id: "c1",
            amount_pence: 5000, status: "pending",
          },
        ],
        error: null,
      });
      return chain;
    }
    if (table === "artist_collections") {
      return {
        select: (cols: string) => ({
          in: async () => {
            // Simulate PostgREST: reject the whole query if the select names a
            // column the table does not have.
            const phantom = cols
              .split(",")
              .map((c) => c.trim())
              .find((c) => !COLLECTION_COLUMNS.has(c));
            if (phantom) {
              return { data: null, error: { message: `column artist_collections.${phantom} does not exist` } };
            }
            return { data: [collectionRow], error: null };
          },
        }),
      };
    }
    // venue_profiles / artist_works / artist_profiles enrichment — empty is fine.
    return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
  };
}

describe("GET /api/offers — collection enrichment (row 19 #7)", () => {
  it("surfaces the collection name (real column), not the phantom title", async () => {
    fromMock.mockImplementation(getEnrichmentDb({ id: "c1", name: "Spring Set", work_ids: [] }));
    const res = await GET(new Request("http://localhost/api/offers"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-before: the old select named artist_collections.title, so PostgREST
    // rejected the whole query and every offer's collection came back null.
    expect(body.offers[0].collection).toMatchObject({ id: "c1", name: "Spring Set" });
  });
});
