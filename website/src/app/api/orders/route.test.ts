import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "u-artist", email: "a@x.com" },
    error: null,
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/email", () => ({ notifyBuyerStatusUpdate: vi.fn(async () => {}) }));
vi.mock("@/lib/stripe-connect", () => ({ executeTransfer: vi.fn(async () => {}) }));

import { PATCH } from "./route";

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
