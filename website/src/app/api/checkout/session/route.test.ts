// E39: GET /api/checkout/session takes a Stripe session id from the query string
// with no authentication and returned customerEmail, metadata, the cart and the
// full delivery address. Anyone holding a session id (a shared confirmation URL,
// browser history, a referrer leak, a log line) could read another customer's
// name, address and email.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { retrieveMock, loadCartMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  loadCartMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { retrieve: retrieveMock } } },
}));
vi.mock("@/lib/cart-sessions", () => ({ loadCartSession: loadCartMock }));

import { GET } from "./route";

const SESSION = {
  id: "cs_test_123",
  payment_status: "paid",
  amount_total: 12500,
  customer_email: "buyer@example.com",
  metadata: { artistSlug: "maya-chen", venueSlug: "the-kettle", internalNote: "x" },
  line_items: {
    data: [{ description: "Study in Oil", quantity: 1, amount_total: 12500 }],
  },
};

const SAVED_CART = {
  cart: [{ workId: "w1", title: "Study in Oil", price: 125 }],
  shipping: {
    fullName: "Ada Lovelace",
    addressLine1: "12 Analytical Way",
    addressLine2: "Flat 3",
    city: "London",
    postcode: "SW1A 1AA",
    country: "GB",
  },
};

function get(id?: string): Request {
  const url = id
    ? `http://localhost/api/checkout/session?id=${id}`
    : "http://localhost/api/checkout/session";
  return new Request(url);
}

beforeEach(() => {
  retrieveMock.mockReset();
  loadCartMock.mockReset();
  retrieveMock.mockResolvedValue(SESSION);
  loadCartMock.mockResolvedValue(SAVED_CART);
});

describe("GET /api/checkout/session PII disclosure (E39)", () => {
  it("does not return the customer's email", async () => {
    const body = await (await GET(get("cs_test_123"))).json();
    expect(body).not.toHaveProperty("customerEmail");
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
  });

  it("does not return the delivery address", async () => {
    const body = await (await GET(get("cs_test_123"))).json();
    expect(body).not.toHaveProperty("shipping");
    const serialised = JSON.stringify(body);
    for (const pii of ["Ada Lovelace", "12 Analytical Way", "Flat 3", "SW1A 1AA"]) {
      expect(serialised, `${pii} leaked`).not.toContain(pii);
    }
  });

  it("does not return the raw cart or Stripe metadata", async () => {
    const body = await (await GET(get("cs_test_123"))).json();
    expect(body).not.toHaveProperty("cart");
    expect(body).not.toHaveProperty("metadata");
    expect(JSON.stringify(body)).not.toContain("internalNote");
  });

  it("still returns what the confirmation page legitimately needs", async () => {
    const body = await (await GET(get("cs_test_123"))).json();
    expect(body).toMatchObject({
      id: "cs_test_123",
      status: "paid",
      amountTotal: 125,
    });
    expect(body.lineItems).toEqual([
      { name: "Study in Oil", quantity: 1, amount: 125 },
    ]);
  });

  it("still requires a session id", async () => {
    const res = await GET(get());
    expect(res.status).toBe(400);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("still fails closed when Stripe errors", async () => {
    retrieveMock.mockRejectedValue(new Error("no such session"));
    const res = await GET(get("cs_bogus"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to retrieve session" });
  });

  it("does not need the cart session row at all any more", async () => {
    // cart and shipping were the only things loadCartSession fed into the
    // response, so the extra round trip is now pure cost.
    await GET(get("cs_test_123"));
    expect(loadCartMock).not.toHaveBeenCalled();
  });
});

// ── Item 16 (E39 part 2) was assessed and found void. This locks the decision. ──
//
// Item 16 asks to add a sessionId claim to the order token, mint it into the
// Stripe success_url, and restore the full payload behind a token-or-email check.
// Two reasons not to:
//
// 1. NO CONSUMER. The confirmation page is the only caller and reads exactly
//    id/status/amountTotal/lineItems. It carries a comment saying the address is
//    deliberately not shown because the buyer has it in their email. Restoring
//    PII to the endpoint would add attack surface with nothing rendering it.
//
// 2. The prescribed mechanism has an ordering bug. The token must be bound to the
//    Stripe session id, but success_url is fixed at session-creation time, before
//    that id exists. Stripe only templates {CHECKOUT_SESSION_ID}, so a token
//    derived from the id cannot be placed there without a second binding (a
//    pre-generated nonce carried in session metadata). That is real machinery for
//    a feature with no consumer.
//
// 01 §E39 itself offers the fallback that "the minimum viable change is to drop
// the PII from the anonymous response", which is exactly what part 1 shipped.
//
// These assertions make the decision enforceable: the shape is pinned EXACTLY, so
// any new field fails here, including ones nobody thought to forbid by name.
describe("GET /api/checkout/session response shape is locked (E39 part 2 void)", () => {
  const SAFE_KEYS = ["id", "status", "amountTotal", "lineItems"];

  it("returns exactly the four safe fields and nothing else", async () => {
    const body = await (await GET(get("cs_test_123"))).json();
    expect(Object.keys(body).sort()).toEqual([...SAFE_KEYS].sort());
  });

  it("returns exactly three fields per line item, so product metadata cannot ride along", async () => {
    // A Stripe line item expands to price.product, which carries arbitrary
    // metadata. Only the three display fields may be projected.
    const body = await (await GET(get("cs_test_123"))).json();
    for (const item of body.lineItems as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(["amount", "name", "quantity"]);
    }
  });

  it("ignores a token query parameter, so a half-built token path cannot become the gate", async () => {
    // If the token work is ever revived it must land with its verification, not
    // as an accepted-but-unchecked parameter.
    const withToken = new Request(
      "http://localhost/api/checkout/session?id=cs_test_123&token=anything",
    );
    const body = await (await GET(withToken)).json();
    expect(Object.keys(body).sort()).toEqual([...SAFE_KEYS].sort());
  });
});
