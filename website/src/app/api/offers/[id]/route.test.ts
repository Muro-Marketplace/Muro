// F41. PATCH /api/offers/[id] read `status` and nothing else about time, so an
// offer whose `expires_at` had passed months ago still accepted — and an accept
// is what makes the row payable. `expires_at` has been a stored, typed column
// since the create route accepted it; the only writer of the "expired" status
// was the checkout's stock re-validation, which is a different reason.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));

import { PATCH } from "./route";

const BUYER = "u-buyer";
const ARTIST = "u-artist";
const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

type OfferRow = Record<string, unknown>;

const BASE_OFFER: OfferRow = {
  id: "off_1",
  buyer_user_id: BUYER,
  artist_user_id: ARTIST,
  created_by_user_id: BUYER,
  amount_pence: 4200,
  status: "pending",
  accepted_at: null,
  expires_at: null,
};

/** Every purchase_offers UPDATE with the filters it was scoped by. */
let offerUpdates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
let messageInserts: Array<Record<string, unknown>> = [];

function setupDb(offer: OfferRow | null) {
  offerUpdates = [];
  messageInserts = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "purchase_offers") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: offer }) }) }),
        update: (payload: Record<string, unknown>) => {
          const filters: Array<[string, unknown]> = [];
          offerUpdates.push({ payload, filters });
          const chain = {
            eq: (col: string, val: unknown) => {
              filters.push([col, val]);
              return chain;
            },
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          };
          return chain;
        },
      };
    }
    if (table === "artist_profiles" || table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { slug: table === "artist_profiles" ? "alice" : "kettle" } }),
          }),
        }),
      };
    }
    if (table === "messages") {
      return {
        insert: async (row: Record<string, unknown>) => {
          messageInserts.push(row);
          return { error: null };
        },
      };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  });
}

function patch(action: string, actor = ARTIST) {
  authMock.mockResolvedValue({ user: { id: actor, email: "x@example.com" }, error: null });
  return PATCH(
    new Request("http://localhost/api/offers/off_1", {
      method: "PATCH",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id: "off_1" }) },
  );
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
});

describe("PATCH /api/offers/[id] enforces the expiry deadline (F41)", () => {
  it("refuses to accept an offer whose deadline has passed", async () => {
    setupDb({ ...BASE_OFFER, expires_at: PAST });

    const res = await patch("accept");

    // Fail-before: the handler only checked `status`, so this returned 200 and
    // stamped accepted_at, which is exactly what makes the row payable.
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "offer_expired" });
    expect(
      offerUpdates.some((u) => u.payload.status === "accepted"),
      "an expired offer was accepted",
    ).toBe(false);
  });

  it("closes the lapsed row so it stops looking live", async () => {
    setupDb({ ...BASE_OFFER, expires_at: PAST });

    await patch("accept");

    const closed = offerUpdates.find((u) => u.payload.status === "expired");
    expect(closed).toBeTruthy();
    // Compare-and-set on the status we read, so a concurrent accept or payment
    // is never overwritten by this bookkeeping write.
    expect(closed!.filters).toContainEqual(["status", "pending"]);
  });

  it("refuses to decline a lapsed offer too", async () => {
    setupDb({ ...BASE_OFFER, expires_at: PAST });

    const res = await patch("decline");

    expect(res.status).toBe(409);
    expect(offerUpdates.some((u) => u.payload.status === "declined")).toBe(false);
  });

  it("still lets the sender withdraw a lapsed offer", async () => {
    setupDb({ ...BASE_OFFER, expires_at: PAST });

    const res = await patch("withdraw", BUYER);

    expect(res.status).toBe(200);
    expect(offerUpdates.some((u) => u.payload.status === "withdrawn")).toBe(true);
  });

  it("accepts normally while the deadline is still ahead", async () => {
    setupDb({ ...BASE_OFFER, expires_at: FUTURE });

    const res = await patch("accept");

    expect(res.status).toBe(200);
    expect(offerUpdates.some((u) => u.payload.status === "accepted")).toBe(true);
  });

  it("accepts normally when the offer is open-ended", async () => {
    setupDb({ ...BASE_OFFER, expires_at: null });

    const res = await patch("accept");

    expect(res.status).toBe(200);
    expect(offerUpdates.some((u) => u.payload.status === "accepted")).toBe(true);
  });

  it("never reads an unparseable stamp as expired", async () => {
    setupDb({ ...BASE_OFFER, expires_at: "whenever" });

    const res = await patch("accept");

    expect(res.status).toBe(200);
  });
});
