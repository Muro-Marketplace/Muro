import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock factories so refs in the factories
// below are initialised when the factory is evaluated.
const { stripeCreate, fromMock, canArtistAcceptOrdersMock } = vi.hoisted(() => ({
  stripeCreate: vi.fn(async () => ({ id: "sess_test", url: "https://stripe.example/session" })),
  fromMock: vi.fn(),
  canArtistAcceptOrdersMock: vi.fn(async () => true),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer artist-alice") {
      return { user: { id: "u-alice", email: "alice@x.com" }, error: null };
    }
    return { user: null, error: null };
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: stripeCreate } } },
}));

vi.mock("@/lib/stripe-connect-status", () => ({
  canArtistAcceptOrders: canArtistAcceptOrdersMock,
}));

vi.mock("@/lib/shipping-checkout", () => ({
  calculateOrderShipping: () => ({ totalShipping: 0, artistGroups: [] }),
}));

vi.mock("@/lib/validations", () => ({
  checkoutSchema: {
    safeParse: (b: unknown) => ({ success: true, data: b }),
  },
}));

vi.mock("@/lib/cart-sessions", () => ({
  saveCartSession: vi.fn(async () => undefined),
}));

import { POST } from "./route";

beforeEach(() => {
  stripeCreate.mockClear();
  fromMock.mockReset();
  canArtistAcceptOrdersMock.mockReset();
  canArtistAcceptOrdersMock.mockResolvedValue(true);
});

function req(body: unknown, auth: string | null = null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  return new Request("http://localhost/api/checkout", { method: "POST", headers, body: JSON.stringify(body) });
}

const baseShipping = {
  fullName: "Buyer",
  email: "buyer@x.com",
  phone: "",
  addressLine1: "1 St",
  addressLine2: "",
  city: "London",
  postcode: "E1",
  notes: "",
};

const baseItem = {
  title: "Untitled",
  artistSlug: "alice",
  artistName: "Alice",
  price: 100,
  quantity: 1,
  size: "S",
  image: "",
  shippingPrice: 5,
  internationalShippingPrice: 12,
  dimensions: null,
  framed: false,
};

// Default Supabase mock — used by tests that don't set up their own
// `fromMock` impl. Returns no artist profile for the auth lookup and
// returns the cart line as a "fresh" `artist_works` row at the price
// the cart claimed (so the existing self-purchase / country / Connect
// tests below don't trip the new G2-15 re-validation gate).
function setupDefaultDbMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: null }) }),
        }),
      };
    }
    if (table === "artist_works") {
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            // Echo back a row per id so re-validation passes when the
            // test doesn't explicitly mock the cart's DB state.
            data: ids.map((id) => ({
              id,
              available: true,
              quantity_available: 10,
              pricing: [{ label: "S", price: 100 }],
              title: "Untitled",
            })),
            error: null,
          }),
        }),
      };
    }
    if (table === "artist_collections") {
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            data: ids.map((id) => ({
              id,
              available: true,
              bundle_price: 100,
              name: "Bundle",
            })),
            error: null,
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
  });
}

beforeEach(() => {
  setupDefaultDbMock();
});

// Plan A Task 11 — self-purchase guard (Bearer auth + cart slug match → 403).
describe("POST /api/checkout self-purchase guard", () => {
  it("rejects when authenticated artist's slug matches a cart item", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { slug: "alice", user_id: "u-alice" } }) }),
          }),
        };
      }
      if (table === "artist_works") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({
                id, available: true, quantity_available: 10,
                pricing: [{ label: "S", price: 100 }], title: "Untitled",
              })),
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    });
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }, "Bearer artist-alice"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/own work/i);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("permits a guest checkout (no auth)", async () => {
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalled();
  });

  it("permits an artist buying a different artist's work", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { slug: "alice", user_id: "u-alice" } }) }),
          }),
        };
      }
      if (table === "artist_works") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({
                id, available: true, quantity_available: 10,
                pricing: [{ label: "S", price: 100 }], title: "Untitled",
              })),
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    });
    const res = await POST(req({
      items: [{ ...baseItem, artistSlug: "bob", type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }, "Bearer artist-alice"));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalled();
  });
});

// Plan B Task 3 — ISO country guard.
describe("POST /api/checkout country guard", () => {
  it("rejects an unsupported country with 400", async () => {
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "ZZ" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ZZ/);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("accepts GB and creates a Stripe session with slim metadata", async () => {
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ metadata?: { kind?: string; shipping_country?: string } }]
    >;
    const args = calls[0]?.[0];
    // Plan B Task 6: full shipping/cart no longer in Stripe metadata.
    expect(args?.metadata?.kind).toBe("cart_checkout");
    expect(args?.metadata?.shipping_country).toBeUndefined();
  });

  it("accepts US (international) and creates a Stripe session", async () => {
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "US" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects 'United Kingdom' (the legacy free-text value) with 400", async () => {
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "United Kingdom" },
    }));
    expect(res.status).toBe(400);
  });
});

// Plan B Task 8 — Stripe Connect pre-flight.
describe("POST /api/checkout Stripe Connect pre-flight", () => {
  it("rejects with 422 when an artist isn't charges_enabled", async () => {
    canArtistAcceptOrdersMock.mockResolvedValue(false);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/alice/i);
    expect(body.blocked).toEqual(["alice"]);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("permits checkout when all artists are ready", async () => {
    canArtistAcceptOrdersMock.mockResolvedValue(true);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalled();
  });
});

// Plan G2 Task 2 (G2-15) — cart re-validation against DB. Without this
// gate, a stale localStorage cart can carry an old price for a sold /
// deleted / re-priced work, and Stripe gets billed for whatever the
// client claimed. These tests pin the route to re-fetch from the DB
// before minting a Stripe session.
describe("POST /api/checkout cart re-validation (G2-15)", () => {
  // Helper: build a `from` mock that returns the works the test wants.
  function mockWorks(rows: Array<{ id: string; available?: boolean; quantity_available?: number | null; pricing?: Array<{ label: string; price: number }>; title?: string }>) {
    const map = new Map(rows.map((r) => [r.id, r]));
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: null }) }),
          }),
        };
      }
      if (table === "artist_works") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => map.get(id)).filter(Boolean),
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    });
  }

  it("rejects with 409 when a cart line refers to a sold-out work", async () => {
    // available=false simulates the artist marking the work sold.
    mockWorks([{
      id: "w-sold",
      available: false,
      quantity_available: 0,
      pricing: [{ label: "S", price: 250 }],
      title: "Sunset",
    }]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-sold", price: 250, title: "Sunset" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/sold|unavailable|no longer/i);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a cart line refers to a deleted work (row missing)", async () => {
    mockWorks([]); // empty → ids.map(...).filter(Boolean) returns []
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-deleted", price: 400, title: "Gone" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer|unavailable|sold/i);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects with 409 when quantity_available has dropped to 0", async () => {
    // Edge: the row still exists and `available` may even still be
    // true, but inventory has hit zero. We don't want the buyer to
    // pay for stock that isn't there.
    mockWorks([{
      id: "w-empty",
      available: true,
      quantity_available: 0,
      pricing: [{ label: "S", price: 100 }],
      title: "Out of stock",
    }]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-empty", price: 100 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("recomputes unit_amount from DB price (ignores stale client price)", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "S", price: 100 }], // DB says £100
      title: "Untitled",
    }]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1", price: 50 /* stale */, size: "S" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >;
    const lineItems = calls[0]?.[0]?.line_items ?? [];
    // First line item is the work — unit_amount should be the DB
    // price in pence (100 × 100 = 10000), NOT the client's 5000.
    expect(lineItems[0]?.price_data?.unit_amount).toBe(10000);
  });

  it("ship-fulfilment carts also re-validate", async () => {
    // Fourth scenario per the plan: ensures the gate isn't only
    // exercised on collection-mode payloads.
    mockWorks([]); // deleted
    const res = await POST(req({
      fulfilmentMethod: "ship",
      items: [{ ...baseItem, type: "work", workId: "w-gone", price: 100 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("returns the offending workId so the client can drop it from the cart", async () => {
    mockWorks([
      { id: "w-good", available: true, quantity_available: 10, pricing: [{ label: "S", price: 100 }], title: "Good" },
    ]);
    const res = await POST(req({
      items: [
        { ...baseItem, type: "work", workId: "w-good", price: 100 },
        { ...baseItem, type: "work", workId: "w-bad", price: 200, title: "Bad" },
      ],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.workId).toBe("w-bad");
  });

  // Plan G2 PR-1 Task 2 follow-up: defensive floor for framed lines.
  // Framed cart lines carry size "<base> + <frame label>", which won't
  // match the DB's bare-size pricing tiers, so the existing recompute
  // step falls back to the client price. The floor check parses the
  // base size out of the cart line, looks up the DB base tier, and
  // refuses to checkout if the cart's total is below today's base.
  it("rejects framed line where client price is below DB base price", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Untitled",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 80,
        size: "A3 + Black Wood Frame",
        framed: true,
      }],
      shipping: { ...baseShipping, country: "GB" },
      fulfilmentMethod: "collection",
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("price_below_base");
    expect(body.workId).toBe("w-1");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("accepts framed line where client price is at or above DB base (with warn log)", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Untitled",
    }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "A3 + Black Wood Frame",
        framed: true,
      }],
      shipping: { ...baseShipping, country: "GB" },
      fulfilmentMethod: "collection",
    }));
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/framed line uses client price/),
      "w-1",
      120,
      100,
    );
    warn.mockRestore();
  });
});

// Plan G2 Task 2 — drops the dead `digital` fulfilment branch. The
// schema (real, not the pass-through mock used here) already rejects
// `digital`, so the only remaining behaviour we can pin in this test
// file is that the route narrows to ship/collection: even with a
// pass-through schema mock, a `digital` payload must NOT result in a
// Stripe session whose metadata records the rogue value.
describe("POST /api/checkout no-digital", () => {
  it("never records fulfilment_method=digital on the Stripe session", async () => {
    const res = await POST(req({
      fulfilmentMethod: "digital",
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    // Schema-rejection via the real validations module would 400; with
    // the pass-through mock we hit the route's own narrowing and 200
    // is fine — what we're really pinning is that the route silently
    // collapses an unknown value to "ship" rather than letting
    // "digital" leak into Stripe metadata or shipping logic.
    if (res.status === 200) {
      const calls = stripeCreate.mock.calls as unknown as Array<
        [{ metadata?: { fulfilment_method?: string } }]
      >;
      expect(calls[0]?.[0]?.metadata?.fulfilment_method).toBe("ship");
    } else {
      expect([400, 409]).toContain(res.status);
    }
  });
});
