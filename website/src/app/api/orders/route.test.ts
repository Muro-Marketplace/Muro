import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "u-artist", email: "a@x.com" },
    error: null,
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: async () => ({ data: null }) } } }),
}));

vi.mock("@/lib/email", () => ({ notifyBuyerStatusUpdate: vi.fn(async () => {}) }));
vi.mock("@/lib/stripe-connect", () => ({ executeTransfer: vi.fn(async () => {}) }));

import { PATCH } from "./route";
import { executeTransfer } from "@/lib/stripe-connect";
import { notifyBuyerStatusUpdate } from "@/lib/email";

function chainSelectSingle(row: unknown) {
  return {
    select: () => ({
      eq: () => ({ single: async () => ({ data: row }) }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

beforeEach(() => fromMock.mockReset());

describe("PATCH /api/orders state machine", () => {
  function req(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects confirmed → delivered with 422", async () => {
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
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/cannot move to delivered/);
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
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    artist_user_id: "u-artist",
                    artist_slug: "alice",
                    buyer_email: "b@x.com",
                    status: "shipped",
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
        // Subsequent orders.from calls (placement attribution etc.) — no-op
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          rpc: () => Promise.resolve({ error: null }),
        };
      }
      // order_events, artist_profiles, etc. — return safe no-ops
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
        insert: () => Promise.resolve({ error: null }),
      };
    });
  }

  beforeEach(() => {
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
          return {
            select: () => ({
              eq: () => ({
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
          select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
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
