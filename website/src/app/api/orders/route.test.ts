import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "u-artist", email: "a@x.com" },
    error: null,
  })),
}));
import { getAuthenticatedUser } from "@/lib/api-auth";

/** Act as the seller (default) or the buyer, for the E21 role split. */
function actAs(who: "seller" | "buyer" | "stranger") {
  const users = {
    seller: { id: "u-artist", email: "a@x.com" },
    buyer: { id: "u-buyer", email: "b@x.com" },
    stranger: { id: "u-nobody", email: "n@x.com" },
  };
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: users[who], error: null } as never);
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: async () => ({ data: null }) } } }),
}));

vi.mock("@/lib/email", () => ({ notifyBuyerStatusUpdate: vi.fn(async () => {}) }));
vi.mock("@/lib/stripe-connect", () => ({ executeTransfer: vi.fn(async () => {}) }));

import { PATCH } from "./route";
import { executeTransfer } from "@/lib/stripe-connect";
import { notifyBuyerStatusUpdate } from "@/lib/email";

/**
 * assertOrderParty (E21) reads the order with .select("*").eq("id").or(...)
 * .maybeSingle(), so the chain carries both shapes. `visible` is what the
 * party-filtered read returns: null models "the caller is not a party".
 */
function chainSelectSingle(row: unknown, visible: unknown = row) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: row }),
        maybeSingle: async () => ({ data: row }),
        or: () => ({ maybeSingle: async () => ({ data: visible }) }),
        eq: () => ({ maybeSingle: async () => ({ data: visible }) }),
      }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  actAs("seller");
});

describe("PATCH /api/orders state machine", () => {
  function req(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects confirmed → delivered, now at the role gate before the state machine", async () => {
    // Was asserted as 422. After E21 a SELLER is refused 403 for `delivered` at
    // all, which is the stronger answer and reached first. The 422 path still
    // exists for a caller whose role permits the status: see the buyer case in
    // the E21 suite below.
    fromMock.mockImplementation(() =>
      chainSelectSingle({
        artist_user_id: "u-artist",
        artist_slug: "alice",
        status: "confirmed",
        status_history: [],
        buyer_email: "b@x.com",
      }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/seller cannot move an order to delivered/i);
  });

  it("allows confirmed → artist_notified", async () => {
    fromMock.mockImplementation(() =>
      chainSelectSingle({
        artist_user_id: "u-artist",
        status: "confirmed",
        status_history: [],
      }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "artist_notified" }));
    expect(res.status).toBe(200);
  });

  it("allows confirmed → processing (skip-ahead, used by artist portal)", async () => {
    fromMock.mockImplementation(() =>
      chainSelectSingle({
        artist_user_id: "u-artist",
        status: "confirmed",
        status_history: [],
      }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "processing" }));
    expect(res.status).toBe(200);
  });

  it("rejects shipped → processing (backward)", async () => {
    fromMock.mockImplementation(() =>
      chainSelectSingle({
        artist_user_id: "u-artist",
        status: "shipped",
        status_history: [],
      }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "processing" }));
    expect(res.status).toBe(422);
  });

  it("rejects anything out of cancelled (terminal)", async () => {
    fromMock.mockImplementation(() =>
      chainSelectSingle({
        artist_user_id: "u-artist",
        status: "cancelled",
        status_history: [],
      }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "shipped" }));
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/orders payout + email side-effects", () => {
  function req(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Build a fromMock that handles the sequence of .from() calls for a
  // delivered transition: orders.select (get order), orders.update (status),
  // order_events.upsert (lifecycle, best-effort), stripe_transfers.select
  // (pending list), then optionally orders.select again for placement.
  // We keep it simple by table name.
  function makeDeliveredFromMock(transferIds: string[]) {
    let orderSelectCalled = false;
    return vi.fn((table: string) => {
      if (table === "stripe_transfers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: transferIds.map((id) => ({ id })) }),
            }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      // orders table
      if (table === "orders") {
        if (!orderSelectCalled) {
          orderSelectCalled = true;
          const row = {
            id: "o1",
            artist_user_id: "u-artist",
            artist_slug: "alice",
            buyer_user_id: null,
            buyer_email: "b@x.com",
            status: "shipped",
            status_history: [],
            placement_id: null,
            venue_revenue: null,
            shipping: {},
            items: [],
          };
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: row }),
                maybeSingle: async () => ({ data: row }),
                // assertOrderParty's party-filtered read (E21).
                or: () => ({ maybeSingle: async () => ({ data: row }) }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        // Subsequent orders.from calls (placement attribution etc.) — no-op
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null }),
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          rpc: () => Promise.resolve({ error: null }),
        };
      }
      // order_events, artist_profiles, etc. — return safe no-ops.
      // maybeSingle matters: assertOrderParty looks up the caller's
      // artist_profiles.slug that way (E21).
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
        insert: () => Promise.resolve({ error: null }),
      };
    });
  }

  beforeEach(() => {
    // delivered is buyer-only after E21, and delivered is what releases the
    // transfers these tests are about.
    actAs("buyer");
    vi.mocked(executeTransfer).mockReset();
    vi.mocked(notifyBuyerStatusUpdate).mockReset();
    fromMock.mockReset();
  });

  it("delivered PATCH with one failing executeTransfer returns 200 with payoutFailures >= 1", async () => {
    // RED: currently the transfer is fire-and-forget so the response
    // does not include payoutFailures at all.
    vi.mocked(executeTransfer).mockRejectedValue(new Error("Stripe down"));

    fromMock.mockImplementation(makeDeliveredFromMock(["t1", "t2"]));

    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payoutFailures).toBeGreaterThanOrEqual(1);
    // Both transfers were attempted even though the first failed
    expect(vi.mocked(executeTransfer)).toHaveBeenCalledTimes(2);
  });

  it("delivered PATCH where first transfer fails and second succeeds returns 200 with payoutFailures === 1", async () => {
    // First call rejects, second resolves — loop must continue past a failure.
    vi.mocked(executeTransfer)
      .mockRejectedValueOnce(new Error("Stripe down"))
      .mockResolvedValueOnce({ id: "tr_ok" } as never);

    fromMock.mockImplementation(makeDeliveredFromMock(["t1", "t2"]));

    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payoutFailures).toBe(1);
    expect(vi.mocked(executeTransfer)).toHaveBeenCalledTimes(2);
  });

  it("delivered PATCH where all executeTransfers succeed returns 200 with no payoutFailures", async () => {
    vi.mocked(executeTransfer).mockResolvedValue({ id: "tr_123" } as never);

    fromMock.mockImplementation(makeDeliveredFromMock(["t1"]));

    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // payoutFailures must be absent or 0
    expect(body.payoutFailures ?? 0).toBe(0);
    expect(vi.mocked(executeTransfer)).toHaveBeenCalledTimes(1);
  });

  it("cancelled PATCH where notifyBuyerStatusUpdate rejects still returns 200", async () => {
    // RED: currently notifyBuyerStatusUpdate is fire-and-forget so the
    // test will currently pass — but once we await it the test must still
    // confirm the request does NOT fail when the email throws.
    vi.mocked(notifyBuyerStatusUpdate).mockRejectedValue(new Error("SMTP error"));

    // fromMock for cancelled: single order select (status=confirmed so
    // confirmed→cancelled is a valid transition), then update, then
    // stripe_transfers update (cancel pending).
    let orderSelectCalled = false;
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_transfers") {
        return {
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      if (table === "orders") {
        if (!orderSelectCalled) {
          orderSelectCalled = true;
          const cancelRow = {
            id: "o1",
            artist_user_id: "u-artist",
            artist_slug: "alice",
            buyer_user_id: null,
            buyer_email: "b@x.com",
            status: "confirmed",
            status_history: [],
            placement_id: null,
            venue_revenue: null,
            shipping: {},
            items: [],
          };
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: cancelRow }),
                // assertOrderParty's party-filtered read (E21).
                or: () => ({ maybeSingle: async () => ({ data: cancelRow }) }),
                single: async () => ({
                  data: {
                    artist_user_id: "u-artist",
                    buyer_email: "b@x.com",
                    status: "confirmed",
                    status_history: [],
                    placement_id: null,
                    venue_revenue: null,
                    shipping: {},
                    items: [],
                  },
                }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null }),
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      // artist_profiles included: assertOrderParty resolves the caller's slug
      // with .maybeSingle() (E21).
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
        insert: () => Promise.resolve({ error: null }),
      };
    });

    const res = await PATCH(req({ orderId: "o1", status: "cancelled" }));
    expect(res.status).toBe(200);
    // Email was attempted
    expect(vi.mocked(notifyBuyerStatusUpdate)).toHaveBeenCalledTimes(1);
  });
});

// E19 / E46f. POST /api/orders had no authentication of any kind and inserted
// with status: "confirmed" and a client-supplied total, so anyone could forge a
// paid order. It was also dead: every "/api/orders" call site in src/app is a
// GET except artist-portal/orders/page.tsx:84, which is the PATCH. Deleting beat
// fixing, so the handler is gone and this asserts it stays gone.
describe("POST /api/orders (E19, deleted)", () => {
  it("exports no POST handler", async () => {
    const route = await import("./route");
    expect("POST" in route, "POST was re-added to /api/orders").toBe(false);
  });

  it("still exports the handlers that are actually used", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.PATCH).toBe("function");
  });
});


// ── E21: the seller could self-attest delivery and release escrow on day zero ──
//
// The authorisation predicate accepted exactly one role, the artist, and the
// buyer, the only party who knows whether the parcel arrived, could set no status
// at all. canTransition blocks confirmed → delivered, but shipped → delivered is
// a legal edge and shipping is self-attested too, so the seller could walk
// confirmed → processing → shipped → delivered in three requests and every
// pending stripe_transfers row executed immediately. That defeats the 14-day
// hold, which is the only chargeback buffer in the payout design.
describe("PATCH /api/orders role split (E21)", () => {
  function req(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const SHIPPED = {
    id: "o1",
    artist_user_id: "u-artist",
    artist_slug: "alice",
    buyer_user_id: null,      // every live order is a guest checkout
    buyer_email: "b@x.com",
    status: "shipped",
    status_history: [],
  };

  beforeEach(() => {
    vi.mocked(executeTransfer).mockReset();
    vi.mocked(executeTransfer).mockResolvedValue({ id: "tr_1" } as never);
  });

  it("refuses the seller marking their own order delivered, and pays nobody", async () => {
    // The exploit's third request.
    actAs("seller");
    fromMock.mockImplementation(() => chainSelectSingle(SHIPPED));
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/seller cannot move an order to delivered/i);
    expect(vi.mocked(executeTransfer), "escrow was released by the seller").not.toHaveBeenCalled();
  });

  it("lets the seller still mark shipped, so dispatch is unaffected", async () => {
    actAs("seller");
    fromMock.mockImplementation(() =>
      chainSelectSingle({ ...SHIPPED, status: "processing" }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "shipped" }));
    expect(res.status).toBe(200);
  });

  it("lets the buyer confirm delivery, matched on buyer_email since buyer_user_id is null", async () => {
    // The email arm of assertOrderParty is load-bearing: 0 of the 12 live orders
    // have buyer_user_id, so a user-id-only match would strand every order.
    actAs("buyer");
    fromMock.mockImplementation(() => chainSelectSingle(SHIPPED));
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
  });

  it("refuses the buyer marking an order shipped", async () => {
    actAs("buyer");
    fromMock.mockImplementation(() =>
      chainSelectSingle({ ...SHIPPED, status: "processing" }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "shipped" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/buyer cannot move an order to shipped/i);
  });

  it("gives a third party 404 order_not_found rather than 403", async () => {
    // Not "forbidden": a stranger should not learn the order exists.
    actAs("stranger");
    fromMock.mockImplementation(() => chainSelectSingle(SHIPPED, null));
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("order_not_found");
    expect(vi.mocked(executeTransfer)).not.toHaveBeenCalled();
  });

  it("keeps both gates independent: a legal role still obeys the state machine", async () => {
    // The buyer may set delivered, but not from `confirmed`.
    actAs("buyer");
    fromMock.mockImplementation(() =>
      chainSelectSingle({ ...SHIPPED, status: "confirmed" }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(422);
  });
});
