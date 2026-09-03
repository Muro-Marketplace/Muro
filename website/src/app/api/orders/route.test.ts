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
// The artist's auth user, for the lifecycle emails that go to the artist. The
// default resolves nobody, which is what every pre-existing case expects.
const { getUserByIdMock } = vi.hoisted(() => ({
  getUserByIdMock: vi.fn(
    async (): Promise<{ data: { user: { email: string } | null } | null }> => ({ data: null }),
  ),
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));
// The buyer's order-page links carry a signed token. The secret is not set in
// tests, so the signer is stubbed to a fixed value the assertions look for.
vi.mock("@/lib/order-tracking-token", () => ({ signOrderToken: vi.fn(async () => "tok") }));

// K1: the legacy @/lib/email is deleted. The statuses the lifecycle dispatcher
// does not cover (cancelled / disputed / refunded) go through sendEmail now.
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/stripe-connect", () => ({ executeTransfer: vi.fn(async () => {}) }));
vi.mock("@/lib/refunds/cancellation", () => ({ processCancellationRefund: vi.fn(async () => {}) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
const { createNotificationMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));

import { PATCH } from "./route";
import { executeTransfer } from "@/lib/stripe-connect";
import { sendEmail } from "@/lib/email/send";
import { afterEach } from "vitest";
import { render } from "@react-email/components";

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
  createNotificationMock.mockReset();
  createNotificationMock.mockResolvedValue(undefined);
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
  function makeDeliveredFromMock(transferIds: string[], rowOverride: Record<string, unknown> = {}) {
    let orderSelectCalled = false;
    return vi.fn((table: string) => {
      if (table === "stripe_transfers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: transferIds.map((id) => ({ id })) }),
            }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }) }),
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
            ...rowOverride,
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
    vi.mocked(sendEmail).mockReset();
    fromMock.mockReset();
  });

  it("WS2.7: delivered releases only THIS artist's legs and the venue's, never a co-artist's", async () => {
    const executed: string[] = [];
    vi.mocked(executeTransfer).mockImplementation(async (id: string) => {
      executed.push(id);
      return null;
    });
    const base = makeDeliveredFromMock([]);
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_transfers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({
                data: [
                  { id: "t-mine", recipient_type: "artist", recipient_user_id: "u-artist" },
                  { id: "t-other", recipient_type: "artist", recipient_user_id: "u-second-artist" },
                  { id: "t-venue", recipient_type: "venue", recipient_user_id: "u-venue" },
                ],
              }),
            }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return base(table);
    });
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
    expect(executed.sort()).toEqual(["t-mine", "t-venue"]);
  });

  it("WS3.4: buyer confirms pickup - a collection order goes confirmed straight to delivered", async () => {
    fromMock.mockImplementation(
      makeDeliveredFromMock(["t1"], { status: "confirmed", fulfilment_method: "collect_venue" }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(200);
  });

  it("WS3.4: a shipped-fulfilment order still cannot skip confirmed to delivered", async () => {
    fromMock.mockImplementation(
      makeDeliveredFromMock(["t1"], { status: "confirmed", fulfilment_method: "ship" }),
    );
    const res = await PATCH(req({ orderId: "o1", status: "delivered" }));
    expect(res.status).toBe(422);
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

  it("cancelled PATCH where the status email rejects still returns 200", async () => {
    // The status change already committed; a mail failure must not turn a
    // successful cancellation into an error the caller retries.
    //
    // K1: this used to drive the legacy notifyBuyerStatusUpdate. sendEmail is
    // contractually non-throwing, so a rejection here is stricter than
    // production can actually produce — which is the point: the route must
    // survive it either way.
    vi.mocked(sendEmail).mockRejectedValue(new Error("SMTP error"));

    // fromMock for cancelled: single order select (status=confirmed so
    // confirmed→cancelled is a valid transition), then update, then
    // stripe_transfers update (cancel pending).
    let orderSelectCalled = false;
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_transfers") {
        return {
          select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }) }),
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
    // Email was attempted, on the status-update template (K1).
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      template: "customer_order_status_update",
      to: "b@x.com",
    });
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


// Migration 110. The 14-day statutory refund window could never open.
//
// `isRefundEligible` measures the Consumer Contracts Regulations 2013 window
// from `orders.delivered_at`, `/returns` promises it in those words, and the
// column existed in no migration and not in the live table. Nothing on this path
// ever wrote it, and the one place that tried — the collection branch of the
// webhook insert — had it in `strippableCols`, so the D6 ladder dropped it every
// time. So `status === "delivered" && delivered_at` was false for every delivered
// order and the customer portal never showed the refund affordance.
describe("PATCH /api/orders stamps delivered_at", () => {
  let updated: Record<string, unknown> | null = null;

  function setupOrder(row: Record<string, unknown>) {
    updated = null;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: row }),
              maybeSingle: async () => ({ data: row }),
              or: () => ({ maybeSingle: async () => ({ data: row }) }),
              eq: () => ({ maybeSingle: async () => ({ data: row }) }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updated = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    });
  }

  const ORDER = {
    id: "ord_1",
    status: "shipped",
    artist_user_id: "u-artist",
    artist_slug: "maya-chen",
    buyer_user_id: "u-buyer",
    buyer_email: "b@x.com",
    venue_slug: null,
    status_history: [],
    delivered_at: null,
  };

  function patch(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => actAs("buyer"));

  it("stamps it on the transition into delivered", async () => {
    setupOrder(ORDER);

    await PATCH(patch({ orderId: "ord_1", status: "delivered" }));

    expect(updated).toBeTruthy();
    expect(typeof updated!.delivered_at).toBe("string");
    expect(new Date(updated!.delivered_at as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("does NOT restamp an order that already has one", async () => {
    // A re-PATCH would otherwise silently restart someone's 14 days.
    setupOrder({ ...ORDER, status: "delivered", delivered_at: "2026-01-01T00:00:00Z" });

    await PATCH(patch({ orderId: "ord_1", status: "delivered" }));

    expect(updated ?? {}).not.toHaveProperty("delivered_at");
  });

  it("stamps nothing on any other transition", async () => {
    setupOrder({ ...ORDER, status: "processing" });

    await PATCH(patch({ orderId: "ord_1", status: "shipped", trackingNumber: "TRK1" }));

    expect(updated ?? {}).not.toHaveProperty("delivered_at");
  });
});

// ─── WS3.1 (missing-events gap 1): cancelling a PAID order refunds the buyer ───
import { processCancellationRefund } from "@/lib/refunds/cancellation";

describe("cancellation refunds the buyer (WS3.1)", () => {
  function req(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function installCancelDb(inserted: Array<Record<string, unknown>>) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: { id: "u-artist", email: "artist@x.com" },
      error: null,
    } as never);
    let orderSelectCalled = false;
    const paidRow = {
      id: "o1", artist_user_id: "u-artist", artist_slug: "alice",
      buyer_user_id: null, buyer_email: "b@x.com", status: "confirmed",
      status_history: [], placement_id: null, venue_revenue: null,
      shipping: {}, items: [{ workId: "w-1", quantity: 1 }],
      stripe_payment_intent_id: "pi_1", total: 100,
    };
    fromMock.mockImplementation((table: string) => {
      if (table === "refund_requests") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "rr-new" }, error: null }) }) };
          },
        };
      }
      if (table === "stripe_transfers") {
        return {
          select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }) }),
        };
      }
      if (table === "orders") {
        if (!orderSelectCalled) {
          orderSelectCalled = true;
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: paidRow }),
                or: () => ({ maybeSingle: async () => ({ data: paidRow }) }),
                single: async () => ({ data: paidRow }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: paidRow }),
              or: () => ({ maybeSingle: async () => ({ data: paidRow }) }),
              single: async () => ({ data: paidRow }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    });
  }

  it("files an approved refund request and runs the cancellation refund", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    installCancelDb(inserted);
    const res = await PATCH(req({ orderId: "o1", status: "cancelled" }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ order_id: "o1", type: "full", status: "pending", reason: "Order cancelled" });
    expect(vi.mocked(processCancellationRefund)).toHaveBeenCalledWith(expect.anything(), {
      refundRequestId: "rr-new",
      orderId: "o1",
    });
  });

  it("a refund failure keeps the cancellation and does not 500", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    installCancelDb(inserted);
    vi.mocked(processCancellationRefund).mockRejectedValueOnce(new Error("stripe down"));
    const res = await PATCH(req({ orderId: "o1", status: "cancelled" }));
    expect(res.status).toBe(200);
  });
});

// Row 727 / PASS2-placement-lifecycle-log. After a GBP 120 off-the-wall sale
// the placement went to `sold` and could never reach Collected: the bar sat at
// 5 of 6 and neither party had a control. The buyer confirming that they have
// picked the piece up IS the "Collected" event, so it closes the loan.
//
// A manual route stays open too (PATCH /api/placements accepts stage:
// "collected" from `sold`), because a buyer who never confirms must not be able
// to strand the venue's record.
describe("confirming a venue collection closes the placement (row 727)", () => {
  let orderUpdate: Record<string, unknown> | null = null;
  let placementUpdate: Record<string, unknown> | null = null;
  let placementSelected: Record<string, unknown> | null = null;

  function setup(order: Record<string, unknown>, placement: Record<string, unknown> | null) {
    orderUpdate = null;
    placementUpdate = null;
    placementSelected = placement;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: order }),
              maybeSingle: async () => ({ data: order }),
              or: () => ({ maybeSingle: async () => ({ data: order }) }),
              eq: () => ({ maybeSingle: async () => ({ data: order }) }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            orderUpdate = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "placements") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: placementSelected }),
              maybeSingle: async () => ({ data: placementSelected }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            placementUpdate = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      // Everything else answers empty. Self-referential so the multi-.eq()
      // chains (stripe_transfers filters on order_id AND status) resolve.
      const chain: Record<string, unknown> = {
        single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      chain.eq = () => chain;
      chain.in = () => chain;
      return {
        select: () => chain,
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    });
  }

  const COLLECT_ORDER = {
    id: "ord_collect",
    status: "confirmed",
    fulfilment_method: "collect_venue",
    placement_id: "p-wall",
    artist_user_id: "u-artist",
    artist_slug: "maya-chen",
    buyer_user_id: "u-buyer",
    buyer_email: "b@x.com",
    venue_slug: "copper-kettle",
    venue_revenue: 0,
    status_history: [{ status: "confirmed", timestamp: "2026-08-31T10:00:00.000Z" }],
    delivered_at: null,
  };

  function patch(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => actAs("buyer"));

  it("stamps collected_at on the placement the sale came off", async () => {
    setup(COLLECT_ORDER, { id: "p-wall", status: "sold", collected_at: null });

    const res = await PATCH(patch({ orderId: "ord_collect", status: "delivered" }));

    expect(res.status).toBe(200);
    expect(placementUpdate).toBeTruthy();
    expect(placementUpdate!.collected_at).toEqual(expect.any(String));
    expect(placementUpdate!.status).toBe("completed");
  });

  it("does not restamp a placement that was already closed by hand", async () => {
    setup(COLLECT_ORDER, {
      id: "p-wall",
      status: "completed",
      collected_at: "2026-08-30T10:00:00.000Z",
    });

    await PATCH(patch({ orderId: "ord_collect", status: "delivered" }));

    expect(placementUpdate).toBeNull();
  });

  it("touches no placement on a posted order", async () => {
    setup(
      { ...COLLECT_ORDER, fulfilment_method: "ship", status: "shipped" },
      { id: "p-wall", status: "sold", collected_at: null },
    );

    await PATCH(patch({ orderId: "ord_collect", status: "delivered" }));

    expect(placementUpdate).toBeNull();
    expect(orderUpdate).toBeTruthy();
  });
});

// Row 874 / production pass 2. "The buyer's three templates fired
// (customer_order_processing, customer_order_out_for_delivery,
// customer_order_delivered) and the lifecycle events were recorded, but NO
// email and no bell reached the artist on any transition, including the one
// that released their £50.99 payout."
//
// The email half is in lib/orders/lifecycle (artist_order_delivered). This is
// the bell, and it fires only for a transition the artist did NOT make: they
// drive processing and shipped themselves, and telling someone what they have
// just clicked is noise.
describe("the artist is told when someone else moves their order (row 874)", () => {
  let updated: Record<string, unknown> | null = null;

  function setupOrder(row: Record<string, unknown>) {
    updated = null;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: row }),
              maybeSingle: async () => ({ data: row }),
              or: () => ({ maybeSingle: async () => ({ data: row }) }),
              eq: () => ({ maybeSingle: async () => ({ data: row }) }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updated = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      const chain: Record<string, unknown> = {
        single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      chain.eq = () => chain;
      chain.in = () => chain;
      return {
        select: () => chain,
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    });
  }

  const SHIPPED = {
    id: "ord_bell",
    status: "shipped",
    artist_user_id: "u-artist",
    artist_slug: "maya-chen",
    buyer_user_id: "u-buyer",
    buyer_email: "b@x.com",
    venue_slug: null,
    status_history: [],
    delivered_at: null,
  };

  function patch(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rings the artist when the buyer confirms delivery", async () => {
    actAs("buyer");
    setupOrder(SHIPPED);

    await PATCH(patch({ orderId: "ord_bell", status: "delivered" }));

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-artist", title: "Order delivered" }),
    );
  });

  it("says nothing to the artist about a move the artist made", async () => {
    actAs("seller");
    setupOrder({ ...SHIPPED, status: "processing" });

    await PATCH(patch({ orderId: "ord_bell", status: "shipped", trackingNumber: "TRK1" }));

    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("still writes the order when the bell fails", async () => {
    actAs("buyer");
    setupOrder(SHIPPED);
    createNotificationMock.mockRejectedValueOnce(new Error("bell down"));

    const res = await PATCH(patch({ orderId: "ord_bell", status: "delivered" }));

    expect(res.status).toBe(200);
    expect(updated).toMatchObject({ status: "delivered" });
  });
});

// Email audit 2026-09-03 (fix 2). The lifecycle templates declare more props
// than the PATCH used to pass (firstName, orderNumber, orderUrl, statusText),
// so the buyer's emails rendered with holes and the artist's greeted the
// buyer. These run the REAL dispatcher and registry and render the element the
// pipeline was handed, because a prop name that drifts from the template is
// invisible to a mock.
describe("lifecycle emails carry real order data (email audit fix 2)", () => {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
  const ORDER = {
    id: "o1",
    artist_user_id: "u-artist",
    artist_slug: "maya-chen",
    buyer_user_id: null,
    buyer_email: "b@x.com",
    status: "confirmed",
    status_history: [],
    placement_id: null,
    venue_revenue: null,
    shipping: { fullName: "Bob Buyer" },
    items: [
      {
        title: "Last Light on Mare Street",
        image: "https://wallplace.co.uk/sample-work.jpg",
        quantity: 1,
        lineTotal: { amount: 24000, currency: "GBP" },
      },
    ],
    tracking_number: null,
    delivered_at: null,
  };

  /**
   * `artistProfile` is the row artist_profiles returns FOR THE SELLER only.
   * The lookup has to be column-aware: assertOrderParty resolves the caller's
   * own slugs through this same table, so a mock that answers every query
   * makes the buyer look like the owner of the artist slug, and the role gate
   * then refuses their delivery confirmation with a 403. Pass null to model an
   * artist with no profile row at all.
   */
  function setupOrder(
    row: Record<string, unknown>,
    artistProfile: { name: string | null; slug: string } | null = { name: "Maya Chen", slug: "maya-chen" },
  ) {
    let orderRead = false;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders" && !orderRead) {
        orderRead = true;
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: row }),
              maybeSingle: async () => ({ data: row }),
              or: () => ({ maybeSingle: async () => ({ data: row }) }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "artist_profiles") {
        const rowFor = (column: string, value: string) => {
          if (!artistProfile) return null;
          const owns =
            (column === "user_id" && value === row.artist_user_id) ||
            (column === "slug" && value === artistProfile.slug);
          return owns ? artistProfile : null;
        };
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              single: async () => ({ data: rowFor(column, value) }),
              maybeSingle: async () => ({ data: rowFor(column, value) }),
            }),
          }),
        };
      }
      if (table === "stripe_transfers") {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
        insert: () => Promise.resolve({ error: null }),
      };
    });
  }

  function patch(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * The HTML the pipeline would have sent for a registry template id, with
   * React's empty text separators removed. React emits `<!-- -->` between two
   * adjacent interpolations, so a sentence built from a prop and a literal
   * reads as `Maya Chen<!-- --> is preparing` in the raw markup while an inbox
   * shows it as one sentence. Stripping them lets the assertions read the
   * sentence the recipient actually sees.
   */
  async function renderedEmail(templateId: string): Promise<string> {
    const call = vi
      .mocked(sendEmail)
      .mock.calls.map((c) => c[0])
      .find((c) => c.template === templateId);
    expect(call, `no ${templateId} send reached the pipeline`).toBeTruthy();
    return (await render(call!.react)).replaceAll("<!-- -->", "");
  }

  beforeEach(() => {
    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, skipped: false, messageId: "m" });
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "maya@x.com" } } });
  });

  afterEach(() => {
    getUserByIdMock.mockResolvedValue({ data: null });
    vi.useRealTimers();
  });

  it("processing: names the artist and shows the piece", async () => {
    actAs("seller");
    setupOrder({ ...ORDER, status: "confirmed" });

    const res = await PATCH(patch({ orderId: "o1", status: "processing" }));

    expect(res.status).toBe(200);
    const html = await renderedEmail("customer_order_processing");
    expect(html).toContain("Maya Chen is preparing your piece");
    expect(html).toContain("Last Light on Mare Street");
    expect(html).not.toContain("undefined");
  });

  it("out for delivery: carries the tracking reference the same request stored", async () => {
    actAs("seller");
    setupOrder({ ...ORDER, status: "processing" });

    await PATCH(patch({ orderId: "o1", status: "shipped", trackingNumber: "TRK-777" }));

    const html = await renderedEmail("customer_order_out_for_delivery");
    expect(html).toContain("TRK-777");
    expect(html).toContain("Maya Chen");
  });

  it("out for delivery: falls back to the tracking number already on the order", async () => {
    actAs("seller");
    setupOrder({ ...ORDER, status: "processing", tracking_number: "TRK-STORED" });

    await PATCH(patch({ orderId: "o1", status: "shipped" }));

    const html = await renderedEmail("customer_order_out_for_delivery");
    expect(html).toContain("TRK-STORED");
  });

  it("delivered: dates the delivery, and both buttons link to the buyer's order page", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T10:00:00Z"));
    actAs("buyer");
    setupOrder({ ...ORDER, status: "shipped" });

    const res = await PATCH(patch({ orderId: "o1", status: "delivered" }));

    expect(res.status).toBe(200);
    const html = await renderedEmail("customer_order_delivered");
    // en-GB with a weekday renders "Friday, 4 September 2026".
    expect(html).toContain("delivered on Friday, 4 September 2026");
    // Confirm delivery and Report a problem both resolve to the order page,
    // which hosts the confirm CTA and the dispute form (B29), signed for a
    // guest buyer.
    const orderPage = `${SITE_URL}/orders/o1?t=tok`;
    expect(html.split(`href="${orderPage}"`).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('href=""');
    expect(html).not.toContain("undefined");
  });

  it("delivered: greets the artist by the artist's name and links to their orders", async () => {
    actAs("buyer");
    setupOrder({ ...ORDER, status: "shipped" });

    await PATCH(patch({ orderId: "o1", status: "delivered" }));

    const html = await renderedEmail("artist_order_delivered");
    expect(html).toContain("Hi Maya");
    expect(html).not.toContain("Hi Bob");
    expect(html).toContain(`${SITE_URL}/artist-portal/orders`);
    // The buyer's copy is untouched by the artist overrides.
    const buyerHtml = await renderedEmail("customer_order_delivered");
    expect(buyerHtml).toContain("Hi Bob");
  });

  it("never lets a raw slug reach the buyer when the artist has no profile name", async () => {
    // Owner-reported 2026-08-30: a slug in customer-facing copy ("a work by
    // fin-coles"). With no profile row to read a name from, the de-slugged
    // slug is the display name of last resort, never the slug itself.
    actAs("seller");
    setupOrder({ ...ORDER, status: "confirmed", artist_slug: "fin-coles" }, null);

    await PATCH(patch({ orderId: "o1", status: "processing" }));

    const html = await renderedEmail("customer_order_processing");
    expect(html).toContain("Fin Coles is preparing your piece");
    expect(html).not.toContain("fin-coles");
  });
});
