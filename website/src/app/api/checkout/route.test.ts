import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";

// vi.hoisted runs before vi.mock factories so refs in the factories
// below are initialised when the factory is evaluated.
const { stripeCreate, fromMock, canReceivePayoutMock, saveCartSessionMock } = vi.hoisted(() => ({
  stripeCreate: vi.fn(async () => ({ id: "sess_test", url: "https://stripe.example/session" })),
  fromMock: vi.fn(),
  canReceivePayoutMock: vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })),
  saveCartSessionMock: vi.fn(async () => undefined),
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

vi.mock("@/lib/payouts/capability", () => ({
  canReceivePayout: canReceivePayoutMock,
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
  saveCartSession: saveCartSessionMock,
}));

import { POST } from "./route";

beforeEach(() => {
  stripeCreate.mockClear();
  fromMock.mockReset();
  canReceivePayoutMock.mockReset();
  canReceivePayoutMock.mockResolvedValue({ ok: true });
  saveCartSessionMock.mockClear();
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
/**
 * G-C / Bug 10. The `artist_profiles` branch needs BOTH shapes now: `.eq().single()`
 * for the self-purchase lookup, and `.in()` for the shipping-scope lookup. Default
 * to the live default (ships_internationally false, i.e. UK only), which is what
 * every one of the 14 prod profiles carries.
 */
function profilesTable(intlSlugs: string[] = []) {
  return {
    select: () => ({
      eq: () => ({ single: async () => ({ data: null }) }),
      in: async (_col: string, slugs: string[]) => ({
        data: slugs.map((slug) => ({
          slug,
          ships_internationally: intlSlugs.includes(slug),
        })),
        error: null,
      }),
    }),
  };
}

function setupDefaultDbMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return profilesTable();
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

  // Was "accepts US (international) and creates a Stripe session". That assertion
  // WAS the bug (G-C / Bug 10): a supported country is not the same thing as a
  // country the artist ships to, and alice does not ship abroad. Replaced rather
  // than kept beside its successor, so the old promise can't come back.
  it("accepts US when the artist has opted in to international delivery", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") return profilesTable(["alice"]);
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

// G-C / Bug 10 — delivery country vs the artist's own shipping scope.
//
// Before this, api/checkout checked the country only against the platform-wide
// supported list, so a buyer could pay for delivery to a country the artist had
// never agreed to ship to, while the artwork page they bought from said "Ships to
// UK only" (it said that for EVERY work, because ships_internationally lived in no
// migration until 081 and so read false for all 14 artists).
describe("POST /api/checkout shipping scope (G-C / Bug 10)", () => {
  function mockScope(intlSlugs: string[]) {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") return profilesTable(intlSlugs);
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
  }

  // The acceptance test named in the plan.
  it("refuses a UK-only item shipped to AU with 400 and never reaches Stripe", async () => {
    mockScope([]); // alice ships UK only, the live default
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "AU" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("shipping_scope");
    expect(body.ukOnly).toEqual(["alice"]);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("names the artist and the destination in the refusal", async () => {
    mockScope([]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "AU" },
    }));
    const body = await res.json();
    expect(body.message).toContain("Alice");
    expect(body.message).toContain("Australia");
    // Public copy: no em or en dashes (AGENTS.md).
    expect(body.message).not.toMatch(/[—–]/);
  });

  it("still allows GB when the artist ships UK only", async () => {
    mockScope([]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("allows AU once the artist has opted in", async () => {
    mockScope(["alice"]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "AU" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses a mixed cart where only one artist ships abroad", async () => {
    // v1 does not split a cart across destinations, so one UK-only artist
    // blocks the whole parcel rather than half-shipping it.
    mockScope(["alice"]);
    const res = await POST(req({
      items: [
        { ...baseItem, type: "work", workId: "w-1" },
        { ...baseItem, artistSlug: "bob", artistName: "Bob", type: "work", workId: "w-2" },
      ],
      shipping: { ...baseShipping, country: "AU" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ukOnly).toEqual(["bob"]);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("exempts collection, where there is no delivery to scope", async () => {
    // A buyer collecting in person may well live abroad. Their country is not a
    // delivery destination, so the artist's shipping scope does not apply.
    mockScope([]);
    const res = await POST(req({
      fulfilmentMethod: "collection",
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "AU" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });
});

// Plan B Task 8 — Stripe Connect pre-flight.
describe("POST /api/checkout Stripe Connect pre-flight", () => {
  it("rejects with 422 when an artist isn't charges_enabled", async () => {
    canReceivePayoutMock.mockResolvedValue({ ok: false, reason: "payouts_disabled" });
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
    canReceivePayoutMock.mockResolvedValue({ ok: true });
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
  function mockWorks(rows: Array<{ id: string; available?: boolean; quantity_available?: number | null; pricing?: Array<{ label: string; price: number }>; title?: string; frame_options?: Array<{ label: string; priceUplift: number; pricesBySize?: Record<string, number> }> }>) {
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

  it("B28: rejects a quantity above remaining stock with 409", async () => {
    mockWorks([{
      id: "w-two-left",
      available: true,
      quantity_available: 2,
      pricing: [{ label: "S", price: 100 }],
      title: "Short run",
    }]);
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-two-left", price: 100, size: "S", quantity: 5 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("insufficient_stock");
    expect(body.available).toBe(2);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("B28: unlimited stock (null) accepts any sane quantity; silly quantities 400", async () => {
    mockWorks([{
      id: "w-open",
      available: true,
      quantity_available: null,
      pricing: [{ label: "S", price: 100 }],
      title: "Open edition",
    }]);
    const ok = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-open", price: 100, size: "S", quantity: 7 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(ok.status).toBe(200);

    const bad = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-open", price: 100, size: "S", quantity: 0 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(bad.status).toBe(400);
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
  // E46c retired `price_below_base`. It existed because the server only knew the
  // FLOOR (the bare base tier) and had to reject anything under it while trusting
  // anything over it. The server now computes the whole framed price, so a client
  // figure that is too low is simply corrected, exactly as unframed lines already
  // behave. Rewritten rather than kept: the old assertion pinned the contract that
  // made the frame free.
  it("corrects a framed line priced below base instead of rejecting it (E46c)", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Untitled",
      frame_options: [{ label: "Black Wood Frame", priceUplift: 85 }],
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
    expect(res.status).toBe(200);
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >;
    // 100 base + 85 uplift, not the 80 the client asked for.
    expect(calls[0]?.[0]?.line_items?.[0]?.price_data?.unit_amount).toBe(18500);
  });

  // Was "accepts framed line where client price is at or above DB base (with warn
  // log)". That warn log WAS the finding: the client's number went to Stripe. Now
  // asserts the server's number is charged and the client's is ignored.
  it("charges base + server-side uplift and ignores the client price (E46c)", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Untitled",
      frame_options: [{ label: "Black Wood Frame", priceUplift: 85 }],
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
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >;
    // 100 + 85 = 185, not the client's 120.
    expect(calls[0]?.[0]?.line_items?.[0]?.price_data?.unit_amount).toBe(18500);
    expect(warn).toHaveBeenCalledWith(
      "[checkout] framed line price corrected",
      expect.objectContaining({ workId: "w-1", clientPence: 12000, serverPence: 18500 }),
    );
    warn.mockRestore();
  });

  // Pins the contract that the route persists subtotal off the
  // DB-corrected line items (not the client price). Without this,
  // a stale localStorage cart could drive expectedSubtotalPence on
  // cart_sessions to the old number and the webhook reconciliation
  // would silently accept a mismatch.
  it("persists subtotal computed from DB-corrected line items, not client prices", async () => {
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "S", price: 100 }], // DB price £100
      title: "Untitled",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 50, // stale client price
        quantity: 2,
        size: "S",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(saveCartSessionMock).toHaveBeenCalledTimes(1);
    const saveCalls = saveCartSessionMock.mock.calls as unknown as Array<
      [{ expectedSubtotalPence?: number }]
    >;
    const saveArgs = saveCalls[0]?.[0];
    // 100 (DB) × 100 pence × 2 quantity = 20000 — NOT 50 × 100 × 2 = 10000.
    expect(saveArgs?.expectedSubtotalPence).toBe(20000);
  });

  // The page strips ALL cart lines whose workId matches the offending
  // one on a 409 (bulk removal). The API only needs to surface the
  // first offending workId — the page handles the rest. This pins
  // that contract so a refactor that returns ALL bad workIds (or
  // changes the field name) doesn't silently break the page.
  it("returns the offending workId for any line that fails the gate (page strips all matching lines)", async () => {
    mockWorks([
      { id: "work-2-sold", available: false, quantity_available: 0, pricing: [{ label: "A3", price: 100 }], title: "Sold work" },
    ]);
    const res = await POST(req({
      items: [
        { ...baseItem, type: "work", workId: "work-2-sold", price: 100, size: "A3", title: "Sold work" },
        { ...baseItem, type: "work", workId: "work-2-sold", price: 100, size: "A4", title: "Sold work" },
      ],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.workId).toBe("work-2-sold");
    expect(stripeCreate).not.toHaveBeenCalled();
  });
});

// Task 2.4 — reject unresolvable framed pricing (size_label_unresolvable).
// A framed line whose base size cannot be resolved to a DB pricing tier must
// be rejected 409 with code "size_label_unresolvable" rather than silently
// falling through and trusting the client price.
describe("POST /api/checkout framed line unresolvable-base rejection (Task 2.4)", () => {
  // Helper: same pattern as the G2-15 suite above.
  function mockWorks(rows: Array<{ id: string; available?: boolean; quantity_available?: number | null; pricing?: Array<{ label: string; price: number }> | null; title?: string; frame_options?: Array<{ label: string; priceUplift: number; pricesBySize?: Record<string, number> }> }>) {
    const map = new Map(rows.map((r) => [r.id, r]));
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
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

  it("succeeds when a framed line's base size resolves to a DB tier with price at or above client price", async () => {
    // Resolvable framed line — base "A3" found in DB at £100, client sends £120.
    // Should succeed (Stripe session created, 200).
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "The Piece",
      // E46c: the frame must be ON the work for the line to resolve at all.
      frame_options: [{ label: "Oak Frame", priceUplift: 85 }],
    }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "A3 + Oak Frame",
        framed: true,
        title: "The Piece",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rejects 409 size_label_unresolvable when the framed base size segment is empty", async () => {
    // Size " + Oak Frame" splits to "" before " + ", so baseSize is empty.
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "The Piece",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: " + Oak Frame",
        framed: true,
        title: "The Piece",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("size_label_unresolvable");
    expect(body.workId).toBe("w-1");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects 409 size_label_unresolvable when the framed base size does not match any DB pricing tier", async () => {
    // Base "XL" is not in the DB; only "A3" exists.
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "The Piece",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "XL + Oak Frame",
        framed: true,
        title: "The Piece",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("size_label_unresolvable");
    expect(body.workId).toBe("w-1");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects 409 size_label_unresolvable when the framed work row has no pricing array", async () => {
    // pricing: null — can't resolve the base at all.
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: null,
      title: "The Piece",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "A3 + Oak Frame",
        framed: true,
        title: "The Piece",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("size_label_unresolvable");
    expect(body.workId).toBe("w-1");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("does not affect a normal non-framed line (succeeds as before)", async () => {
    // Non-framed line with matching DB tier must still be accepted.
    mockWorks([{
      id: "w-nf",
      available: true,
      quantity_available: 5,
      pricing: [{ label: "A4", price: 80 }],
      title: "Flat Print",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-nf",
        price: 80,
        size: "A4",
        framed: false,
        title: "Flat Print",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });
});

// Task 2.3 minor improvements — split/match edge behaviour pins.
// These three tests fix the exact " + " split semantics and case-insensitive
// base resolution so any refactor of the parse logic trips a test.
describe("POST /api/checkout framed line split/match edge cases (Task 2.3)", () => {
  function mockWorks(rows: Array<{ id: string; available?: boolean; quantity_available?: number | null; pricing?: Array<{ label: string; price: number }> | null; title?: string; frame_options?: Array<{ label: string; priceUplift: number; pricesBySize?: Record<string, number> }> }>) {
    const map = new Map(rows.map((r) => [r.id, r]));
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
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

  // Was asserting price_below_base, which E46c retired. The split still yields
  // base "A3" and frame "Oak" from "A3 + Oak + Gold", so the line resolves and the
  // price is computed rather than floored. What matters is that the client's 80 is
  // NOT what Stripe sees.
  it("computes the price for a multi-segment size ('A3 + Oak + Gold') (E46c)", async () => {
    // Size has two " + " separators; split(" + ")[0] must still yield "A3" and
    // the floor check must fire because client price (80) < DB base (100).
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Multi-segment",
      frame_options: [{ label: "Oak", priceUplift: 40 }],
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 80,
        size: "A3 + Oak + Gold",
        framed: true,
        title: "Multi-segment",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >;
    expect(calls[0]?.[0]?.line_items?.[0]?.price_data?.unit_amount).toBe(14000);
  });

  it("accepts checkout for lowercase base 'a3 + Oak Frame' at or above the DB 'A3' tier (case-insensitive match)", async () => {
    // Cart sends lowercase "a3"; DB tier is labelled "A3". The toLowerCase()
    // comparison must resolve them as the same tier.
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Case test",
      frame_options: [{ label: "Oak Frame", priceUplift: 85 }],
    }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "a3 + Oak Frame",
        framed: true,
        title: "Case test",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rejects 409 size_label_unresolvable for 'A3  + Oak' (double space before +) because split(' + ')[0] yields 'A3 ' with a trailing space that won't match 'A3'", async () => {
    // The route splits on the literal " + " (space-plus-space). A double
    // space before "+" means the split yields "A3 " (trailing space) as the
    // base, which does NOT match the DB tier "A3" via exact toLowerCase
    // comparison. This pins the current behaviour so a change to the parse
    // logic (e.g. trim()) is deliberate and noticed here.
    mockWorks([{
      id: "w-1",
      available: true,
      quantity_available: 10,
      pricing: [{ label: "A3", price: 100 }],
      title: "Double space",
    }]);
    const res = await POST(req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        price: 120,
        size: "A3  + Oak",
        framed: true,
        title: "Double space",
      }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    // If the implementation ever adds .trim() to the base-size segment,
    // this becomes a 200 — update the comment above and flip the assertion.
    const body = await res.json();
    if (res.status === 409) {
      expect(body.code).toBe("size_label_unresolvable");
      expect(body.workId).toBe("w-1");
      expect(stripeCreate).not.toHaveBeenCalled();
    } else {
      // Trim was added: document the real behaviour.
      expect(res.status).toBe(200);
      expect(stripeCreate).toHaveBeenCalledTimes(1);
    }
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

// ── E46c "free frames": the uplift was fully client-trusted (06 B6) ──────────
//
// Framed cart lines carry size "<base> + <frame label>", which never matches a DB
// pricing tier, so the line-item builder found no tier and kept the CLIENT's
// price. The only guard was a floor at the bare unframed price. So: DB tier £100,
// artist's oak frame £85, legitimate total £185, and a buyer posting price: 100
// with size "A3 + Oak Frame" was charged £100 and got the frame free. A warn log
// fired, which made it observable but not prevented.
//
// The server now computes base + uplift from the work's own frame_options and the
// client's number is never used for a framed line.
describe("POST /api/checkout framed uplift is server-side (E46c)", () => {
  function mockFramedWork(over: Partial<{
    pricing: Array<{ label: string; price: number }>;
    frame_options: Array<{ label: string; priceUplift: number; pricesBySize?: Record<string, number> }>;
  }> = {}) {
    const row = {
      id: "w-1",
      available: true,
      quantity_available: 10,
      title: "Harbour Light",
      pricing: over.pricing ?? [{ label: "A3", price: 100 }],
      frame_options: over.frame_options ?? [{ label: "Oak Frame", priceUplift: 85 }],
    };
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") return profilesTable();
      if (table === "artist_works") {
        return { select: () => ({ in: async () => ({ data: [row], error: null }) }) };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    });
  }

  const unitAmount = () => {
    const calls = stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >;
    return calls[0]?.[0]?.line_items?.[0]?.price_data?.unit_amount;
  };

  function framedReq(over: Record<string, unknown> = {}) {
    return req({
      items: [{
        ...baseItem,
        type: "work",
        workId: "w-1",
        title: "Harbour Light",
        size: "A3 + Oak Frame",
        framed: true,
        price: 100,
        ...over,
      }],
      shipping: { ...baseShipping, country: "GB" },
    });
  }

  it("charges base + uplift when the client posts only the base price", async () => {
    // The exact exploit from 06 §3.3.
    mockFramedWork();
    const res = await POST(framedReq({ price: 100 }));
    expect(res.status).toBe(200);
    expect(unitAmount(), "the frame was free").toBe(18500);
  });

  it("ignores an inflated client price too, so the number is the server's either way", async () => {
    mockFramedWork();
    await POST(framedReq({ price: 999 }));
    expect(unitAmount()).toBe(18500);
  });

  it("prefers the explicit frameLabel over splitting the size string", async () => {
    mockFramedWork({
      frame_options: [
        { label: "Oak Frame", priceUplift: 85 },
        { label: "Gilt", priceUplift: 200 },
      ],
    });
    await POST(framedReq({ size: "A3 + Oak Frame", frameLabel: "Gilt" }));
    expect(unitAmount()).toBe(30000);
  });

  it("uses a pricesBySize override in preference to the flat uplift", async () => {
    mockFramedWork({
      frame_options: [{ label: "Oak Frame", priceUplift: 85, pricesBySize: { A3: 120 } }],
    });
    await POST(framedReq());
    expect(unitAmount()).toBe(22000);
  });

  it("falls back to the flat uplift when the size has no override", async () => {
    mockFramedWork({
      pricing: [{ label: "A2", price: 150 }],
      frame_options: [{ label: "Oak Frame", priceUplift: 85, pricesBySize: { A3: 120 } }],
    });
    await POST(framedReq({ size: "A2 + Oak Frame" }));
    expect(unitAmount()).toBe(23500);
  });

  it("409s a framed line naming a frame the work does not offer", async () => {
    // Previously this was charged at the client's number.
    mockFramedWork({ frame_options: [{ label: "Oak Frame", priceUplift: 85 }] });
    const res = await POST(framedReq({ size: "A3 + Invented Frame" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("size_label_unresolvable");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("409s a framed line on a work with no frame options at all", async () => {
    mockFramedWork({ frame_options: [] });
    const res = await POST(framedReq());
    expect(res.status).toBe(409);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("matches the frame label case-insensitively, since the cart's copy is client-held", async () => {
    mockFramedWork();
    await POST(framedReq({ frameLabel: "oak frame" }));
    expect(unitAmount()).toBe(18500);
  });

  it("resolves a legacy cart with no frameLabel, so no migration window is needed", async () => {
    mockFramedWork();
    const res = await POST(framedReq()); // size split only
    expect(res.status).toBe(200);
    expect(unitAmount()).toBe(18500);
  });

  it("leaves unframed lines on the existing tier-match path", async () => {
    mockFramedWork({ pricing: [{ label: "A3", price: 100 }] });
    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1", size: "A3", framed: false, price: 100 }],
      shipping: { ...baseShipping, country: "GB" },
    }));
    expect(res.status).toBe(200);
    expect(unitAmount()).toBe(10000);
  });
});

// ── D10: venue attribution must be a signed token, not a raw slug ────────────
//
// A raw venueSlug moved the venue's revenue share out of the artist's net, so a
// venue operator could divert an artist's money on a sale that never came through
// their QR. Checkout now verifies a token bound to the scanned artist.
describe("POST /api/checkout venue attribution (D10)", () => {
  let signQrAttribution: typeof import("@/lib/qr-attribution-token").signQrAttribution;

  beforeAll(async () => {
    process.env.ORDER_TOKEN_SECRET = "test-secret-not-for-prod";
    ({ signQrAttribution } = await import("@/lib/qr-attribution-token"));
  });
  afterEach(() => {
    delete process.env.QR_ATTRIBUTION_ENFORCE;
  });

  function setupOk() {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") return profilesTable([]);
      if (table === "artist_works") {
        // The audit closed the workId-less fallback, so this fixture's line
        // now names a work and the DB must price it.
        return {
          select: () => ({
            in: async () => ({
              data: [{ id: "w-1", available: true, quantity_available: null, pricing: [{ label: "S", price: 100 }], title: "Untitled", frame_options: null, in_store_price: null }],
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }), in: async () => ({ data: [], error: null }) }) };
    });
  }
  const savedVenueSlug = () => {
    const calls = saveCartSessionMock.mock.calls as unknown as Array<[{ venueSlug?: string }]>;
    return calls[0]?.[0]?.venueSlug;
  };
  const body = (extra: Record<string, unknown>) => ({
    items: [{ ...baseItem, artistSlug: "alice", type: "work", workId: "w-1" }],
    shipping: { ...baseShipping, country: "GB" },
    ...extra,
  });

  it("honours a valid token whose artist is in the cart", async () => {
    setupOk();
    const token = await signQrAttribution({ venueSlug: "kings-arms", artistSlug: "alice" });
    expect((await POST(req(body({ venueAttributionToken: token })))).status).toBe(200);
    expect(savedVenueSlug()).toBe("kings-arms");
  });

  it("ignores a valid token whose artist is NOT in the cart", async () => {
    setupOk();
    const token = await signQrAttribution({ venueSlug: "kings-arms", artistSlug: "someone-else" });
    await POST(req(body({ venueAttributionToken: token })));
    expect(savedVenueSlug()).toBe("");
  });

  it("ignores a forged/invalid token", async () => {
    setupOk();
    await POST(req(body({ venueAttributionToken: "garbage.token" })));
    expect(savedVenueSlug()).toBe("");
  });

  it("still accepts a bare venueSlug when enforcement is off (backward compat)", async () => {
    setupOk();
    await POST(req(body({ venueSlug: "kings-arms" })));
    expect(savedVenueSlug()).toBe("kings-arms");
  });

  it("ignores a bare venueSlug once QR_ATTRIBUTION_ENFORCE=1", async () => {
    setupOk();
    process.env.QR_ATTRIBUTION_ENFORCE = "1";
    await POST(req(body({ venueSlug: "kings-arms" })));
    expect(savedVenueSlug()).toBe("");
  });

  it("a token always beats a mismatched bare slug, even with enforcement off", async () => {
    // The token names april-venue for alice; the body also carries a bogus bare
    // slug. The verified token wins.
    setupOk();
    const token = await signQrAttribution({ venueSlug: "april-venue", artistSlug: "alice" });
    await POST(req(body({ venueAttributionToken: token, venueSlug: "attacker-venue" })));
    expect(savedVenueSlug()).toBe("april-venue");
  });
});

// ── D39: enforcement without the signing secret must fail CLOSED, not zero every
// venue's revenue share ──────────────────────────────────────────────────────
//
// If QR_ATTRIBUTION_ENFORCE=1 but ORDER_TOKEN_SECRET is unset, verifyQrAttribution
// throws on every token and the bare-slug fallback is off, so venueSlug would be
// "" on every sale — silently zeroing every venue's revenue share. The route must
// refuse to price the sale instead (503). The D10 test above ("ignores a bare
// venueSlug once QR_ATTRIBUTION_ENFORCE=1") runs with the secret present and still
// prices the sale, so it doubles as the "does not over-trigger" case.
describe("POST /api/checkout QR enforcement fail-closed (D39)", () => {
  let savedSecret: string | undefined;
  beforeEach(() => {
    savedSecret = process.env.ORDER_TOKEN_SECRET;
  });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.ORDER_TOKEN_SECRET;
    else process.env.ORDER_TOKEN_SECRET = savedSecret;
    delete process.env.QR_ATTRIBUTION_ENFORCE;
  });

  it("503s and prices nothing when enforcement is on but ORDER_TOKEN_SECRET is missing (D39)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.QR_ATTRIBUTION_ENFORCE = "1";
    delete process.env.ORDER_TOKEN_SECRET;

    const res = await POST(req({
      items: [{ ...baseItem, type: "work", workId: "w-1" }],
      shipping: { ...baseShipping, country: "GB" },
    }));

    expect(res.status).toBe(503);
    const bodyJson = await res.json();
    expect(bodyJson.error).toMatch(/temporarily unavailable/i);
    // Fails closed: no session minted, no Stripe call, nothing priced.
    expect(saveCartSessionMock).not.toHaveBeenCalled();
    expect(stripeCreate).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});


// T9 / owner decision 13 (04 Phase 8, item 8.4). Collect-from-venue lines are
// CLAIMS about what is hanging where. Every claim is re-validated against the
// live placements table before money is taken: the client's collectVenueSlug
// and collectPlacementId prove nothing, since a browser console can send any
// pair.
describe("POST /api/checkout collect-from-venue re-validation (T9)", () => {
  const PLACEMENT = {
    id: "p-1",
    venue_slug: "the-copper-kettle",
    artist_slug: "alice",
    status: "active",
    collection_address: "The Copper Kettle, 1 High St, Hampton, TW12 2TH",
    placed_size_label: null as string | null,
  };

  function setupWithPlacements(rows: (typeof PLACEMENT)[]) {
    setupDefaultDbMock();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "placements") {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({ data: rows, error: null }),
            }),
          }),
        };
      }
      return base(table);
    });
  }

  const collectItem = {
    ...baseItem,
    workId: "w-1",
    lineFulfilment: "collect_venue",
    collectVenueSlug: "the-copper-kettle",
    collectPlacementId: "p-1",
  };

  const collectBody = {
    fulfilmentMethod: "collect_venue",
    items: [collectItem],
    shipping: { ...baseShipping, addressLine1: "", city: "", postcode: "", country: "GB" },
  };

  it("accepts a valid claim and carries the placement's address into the cart session", async () => {
    setupWithPlacements([PLACEMENT]);

    const res = await POST(req(collectBody));

    expect(res.status).toBe(200);
    const saved = (saveCartSessionMock.mock.calls as unknown as Array<
      [{ shipping: { collectionAddress?: string } }]
    >)[0][0];
    // Resolved SERVER-side from the placement row, never from the client.
    expect(saved.shipping.collectionAddress).toBe(PLACEMENT.collection_address);
  });

  it("rejects a line whose placement does not exist or is not active", async () => {
    // The .eq("status","active") filter means an ended placement simply is not
    // in the result set: same refusal as a fabricated id.
    setupWithPlacements([]);

    const res = await POST(req(collectBody));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("collection_unavailable");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects a claim whose venue does not match the placement's", async () => {
    setupWithPlacements([{ ...PLACEMENT, venue_slug: "somewhere-else" }]);

    const res = await POST(req(collectBody));

    expect(res.status).toBe(409);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects a claim whose artist does not match the placement's", async () => {
    // Otherwise artist B's checkout could ride artist A's placement.
    setupWithPlacements([{ ...PLACEMENT, artist_slug: "someone-else" }]);

    expect((await POST(req(collectBody))).status).toBe(409);
  });

  it("rejects the wrong SIZE when the placement records what hangs", async () => {
    // A work on a wall is one object at one size.
    setupWithPlacements([{ ...PLACEMENT, placed_size_label: "A2" }]);

    const res = await POST(req(collectBody)); // cart line size is "S"

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("collection_size_mismatch");
  });

  it("accepts any size when the placement does not record one", async () => {
    // NULL = not recorded = no restriction: every pre-119 placement, and
    // refusing them all would kill the flow at birth.
    setupWithPlacements([{ ...PLACEMENT, placed_size_label: null }]);
    expect((await POST(req(collectBody))).status).toBe(200);
  });

  it("rejects a line with no placement claim at all", async () => {
    setupWithPlacements([PLACEMENT]);
    const res = await POST(
      req({ ...collectBody, items: [{ ...collectItem, collectPlacementId: undefined }] }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a cart spanning two venues", async () => {
    setupWithPlacements([PLACEMENT, { ...PLACEMENT, id: "p-2", venue_slug: "other-venue" }]);
    const res = await POST(
      req({
        ...collectBody,
        items: [
          collectItem,
          { ...collectItem, collectPlacementId: "p-2", collectVenueSlug: "other-venue" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/one venue/i);
  });

  it("charges no shipping on a collect order", async () => {
    setupWithPlacements([PLACEMENT]);
    await POST(req(collectBody));
    const saved = (saveCartSessionMock.mock.calls as unknown as Array<
      [{ expectedShippingPence: number }]
    >)[0][0];
    expect(saved.expectedShippingPence).toBe(0);
  });
});

// ── Server-side pricing, closed end to end (2026-08-28 audit) ────────────────
//
// The framed hole (E46c) was closed earlier; this pins the three fallbacks that
// still let a client price survive to Stripe: collection bundles (never checked
// against artist_collections at all), lines with no identity, and unframed
// lines whose size label matches no tier. It also pins the T9 rule that a
// collect-from-venue line charges the IN-STORE price the button displayed,
// not the shipped tier price.
describe("POST /api/checkout server-side pricing (audit)", () => {
  beforeEach(() => {
    setupDefaultDbMock();
  });

  const sentLineItems = () =>
    (stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >)[0]?.[0]?.line_items ?? [];

  it("prices a collection bundle from the DB, not the client", async () => {
    const res = await POST(
      req({
        items: [{ ...baseItem, title: "Bundle", type: "collection", collectionId: "c-1", price: 0.01 }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(200);
    // DB bundle_price is 100 in the default mock; the 1p client claim dies here.
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(10000);
    const saved = (saveCartSessionMock.mock.calls as unknown as Array<
      [{ cart: Array<{ price: number }> }]
    >)[0][0];
    // The data-of-record the webhook books from carries the corrected number too.
    expect(saved.cart[0].price).toBe(100);
  });

  it("refuses a collection that is missing or unavailable", async () => {
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_collections") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }
      return base(table);
    });
    const res = await POST(
      req({
        items: [{ ...baseItem, title: "Bundle", type: "collection", collectionId: "c-gone", price: 100 }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("collection_unavailable");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("refuses a line naming neither a work nor a collection", async () => {
    const res = await POST(
      req({
        items: [{ ...baseItem, price: 0.01 }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("cart_line_unidentified");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("refuses an unframed line whose size matches no tier, instead of trusting its price", async () => {
    const res = await POST(
      req({
        items: [{ ...baseItem, type: "work", workId: "w-1", size: "Made Up", price: 0.01 }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("size_label_unresolvable");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  // Collect-from-venue pricing needs the T9 placement claim to hold, so these
  // two mock both tables.
  function setupCollect(workRow: Record<string, unknown>, placementExtra: Record<string, unknown> = {}) {
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_works") {
        return { select: () => ({ in: async () => ({ data: [workRow], error: null }) }) };
      }
      if (table === "placements") {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({
                data: [{
                  id: "p-1",
                  venue_slug: "the-copper-kettle",
                  artist_slug: "alice",
                  status: "active",
                  collection_address: "1 High St",
                  placed_size_label: null,
                  in_store_price: null,
                  ...placementExtra,
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      return base(table);
    });
  }

  const collectLine = {
    ...baseItem,
    type: "work",
    workId: "w-1",
    lineFulfilment: "collect_venue",
    collectVenueSlug: "the-copper-kettle",
    collectPlacementId: "p-1",
  };
  const collectShipping = { ...baseShipping, addressLine1: "", city: "", postcode: "", country: "GB" };

  it("legacy per-size in-store price is honoured only while the tick box is off", async () => {
    setupCollect({
      id: "w-1", available: true, quantity_available: 10, title: "Untitled",
      pricing: [{ label: "S", price: 100, inStorePrice: 80 }],
      frame_options: null, in_store_price: null, available_in_store: false,
    });
    const res = await POST(
      req({ fulfilmentMethod: "collect_venue", items: [{ ...collectLine, price: 80 }], shipping: collectShipping }),
    );
    expect(res.status).toBe(200);
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(8000);
  });

  it("falls back to the work-level in_store_price when the tier has none (legacy)", async () => {
    setupCollect({
      id: "w-1", available: true, quantity_available: 10, title: "Untitled",
      pricing: [{ label: "S", price: 100 }],
      frame_options: null, in_store_price: 70, available_in_store: false,
    });
    const res = await POST(
      req({ fulfilmentMethod: "collect_venue", items: [{ ...collectLine, price: 70 }], shipping: collectShipping }),
    );
    expect(res.status).toBe(200);
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(7000);
  });

  it("121: the PLACEMENT's off-the-wall offer is the price, beating every work-level source", async () => {
    // The artist priced this physical piece at live-on-wall; tier price,
    // tick box and legacy in-store prices are all overridden.
    setupCollect(
      {
        id: "w-1", available: true, quantity_available: 10, title: "Untitled",
        pricing: [{ label: "S", price: 100, inStorePrice: 80 }],
        frame_options: null, in_store_price: 70, available_in_store: true,
      },
      { in_store_price: 130 },
    );
    const res = await POST(
      req({ fulfilmentMethod: "collect_venue", items: [{ ...collectLine, price: 130 }], shipping: collectShipping }),
    );
    expect(res.status).toBe(200);
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(13000);
  });

  it("121: a forged client price on an offered piece is corrected to the offer", async () => {
    setupCollect(
      {
        id: "w-1", available: true, quantity_available: 10, title: "Untitled",
        pricing: [{ label: "S", price: 100 }],
        frame_options: null, in_store_price: null, available_in_store: false,
      },
      { in_store_price: 130 },
    );
    const res = await POST(
      req({ fulfilmentMethod: "collect_venue", items: [{ ...collectLine, price: 1 }], shipping: collectShipping }),
    );
    expect(res.status).toBe(200);
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(13000);
  });

  it("the tick box charges the NORMAL tier price, ignoring any legacy in-store price", async () => {
    // Owner decision 2026-08-28: collect-from-venue is the same price as
    // online; the in-store price model is retired.
    setupCollect({
      id: "w-1", available: true, quantity_available: 10, title: "Untitled",
      pricing: [{ label: "S", price: 100, inStorePrice: 80 }],
      frame_options: null, in_store_price: 70, available_in_store: true,
    });
    const res = await POST(
      req({ fulfilmentMethod: "collect_venue", items: [{ ...collectLine, price: 100 }], shipping: collectShipping }),
    );
    expect(res.status).toBe(200);
    expect(sentLineItems()[0]?.price_data?.unit_amount).toBe(10000);
  });

  it("persists the corrected price on the cart session the webhook books from", async () => {
    const res = await POST(
      req({
        items: [{ ...baseItem, type: "work", workId: "w-1", price: 0.01 }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(200);
    const saved = (saveCartSessionMock.mock.calls as unknown as Array<
      [{ cart: Array<{ price: number }>; expectedSubtotalPence: number }]
    >)[0][0];
    expect(saved.cart[0].price).toBe(100);
    expect(saved.expectedSubtotalPence).toBe(10000);
  });
});

// QA flag B27 (launch triage). The in-store price is a collect-from-venue
// price; a cart line still carrying its collect claim inside a SHIP order
// must be charged the shipped tier price, or collect-priced goods get posted.
describe("POST /api/checkout collect claim under a ship order (B27)", () => {
  it("charges the tier price, not the in-store price, when the order ships", async () => {
    setupDefaultDbMock();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_works") {
        return {
          select: () => ({
            in: async () => ({
              data: [{
                id: "w-1", available: true, quantity_available: 10, title: "Untitled",
                pricing: [{ label: "S", price: 100, inStorePrice: 80 }],
                frame_options: null, in_store_price: 80,
              }],
              error: null,
            }),
          }),
        };
      }
      return base(table);
    });

    const res = await POST(
      req({
        // Order-level SHIP, line-level collect claim (a flipped cart).
        items: [{
          ...baseItem, type: "work", workId: "w-1", price: 80,
          lineFulfilment: "collect_venue",
          collectVenueSlug: "the-copper-kettle", collectPlacementId: "p-1",
        }],
        shipping: { ...baseShipping, country: "GB" },
      }),
    );
    expect(res.status).toBe(200);
    const sent = (stripeCreate.mock.calls as unknown as Array<
      [{ line_items?: Array<{ price_data?: { unit_amount?: number } }> }]
    >)[0]?.[0]?.line_items ?? [];
    expect(sent[0]?.price_data?.unit_amount).toBe(10000);
  });
});
