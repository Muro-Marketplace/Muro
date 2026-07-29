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
