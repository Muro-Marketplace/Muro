import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

import { POST } from "./route";
import { signOrderToken } from "@/lib/order-tracking-token";

beforeEach(() => {
  fromMock.mockReset();
  process.env.ORDER_TOKEN_SECRET = "test-secret";
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/orders/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Mirrors the REAL orders columns (schema-columns.json), not the phantom ones the
// route used to name. The old mock returned total_amount/shipping_amount/cart_items,
// which do not exist, so the suite stayed green while the live route 500'd.
function mockOrderRow(buyerEmail: string) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: "ord-1",
            order_number: "WP-1",
            status: "confirmed",
            buyer_email: buyerEmail,
            artist_slug: "alice",
            total: 100,
            shipping_cost: 5,
            items: [{ title: "Sunset", price: 100, qty: 1 }],
            status_history: [],
            tracking_number: null,
            created_at: "2026-05-01T00:00:00Z",
          },
          error: null,
        }),
      }),
    }),
  });
}

describe("POST /api/orders/track", () => {
  it("accepts a signed token and maps the real columns into the response", async () => {
    mockOrderRow("buyer@x.com");
    const token = await signOrderToken({ orderId: "ord-1", email: "buyer@x.com" });
    const res = await POST(req({ token }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-before: the old route read total_amount/shipping_amount/cart_items, so
    // against a real-columns row these came back undefined/empty.
    expect(body.order).toMatchObject({
      id: "ord-1",
      total: 100,
      shipping: 5,
      currency: "gbp",
      items: [{ title: "Sunset", price: 100, qty: 1 }],
    });
  });

  it("rejects a tampered token with 401", async () => {
    const token = await signOrderToken({ orderId: "ord-1", email: "buyer@x.com" });
    const res = await POST(req({ token: token.slice(0, -2) + "xx" }));
    expect(res.status).toBe(401);
  });

  it("still accepts the legacy orderId + email path", async () => {
    mockOrderRow("buyer@x.com");
    const res = await POST(req({ orderId: "ord-1", email: "buyer@x.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects email/orderId mismatch with 404", async () => {
    mockOrderRow("buyer@x.com");
    const res = await POST(req({ orderId: "ord-1", email: "wrong@x.com" }));
    expect(res.status).toBe(404);
  });

  it("rejects when neither token nor orderId+email supplied", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
