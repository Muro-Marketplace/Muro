// Tests for remediation findings 1.5 (admin gate) and 4.1 (artist self-approval block).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { isAdminMock, authMock, fromMock } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  authMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: isAdminMock }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
  }),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: { create: vi.fn(async () => ({ id: "re_test" })) },
    transfers: { createReversal: vi.fn(async () => {}) },
  },
}));
vi.mock("@/lib/email", () => ({
  notifyRefundDecision: vi.fn(async () => {}),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => {}),
}));
vi.mock("@/emails/templates/orders/CustomerRefundConfirmation", () => ({
  CustomerRefundConfirmation: () => null,
}));
vi.mock("@/emails/templates/orders/ArtistRefundNotification", () => ({
  ArtistRefundNotification: () => null,
}));

import { POST } from "./route";

// Helper: build a minimal POST request.
function req(body: unknown): Request {
  return new Request("http://localhost/api/refunds/process", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Set up DB mock with configurable order and refund request rows.
function setupDb({
  refundReq,
  order,
}: {
  refundReq: Record<string, unknown>;
  order: Record<string, unknown>;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "refund_requests") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: refundReq, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: order, error: null }),
          }),
        }),
      };
    }
    if (table === "stripe_transfers") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { name: "Alice" }, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  isAdminMock.mockReset();
  authMock.mockReset();
  fromMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
});

const baseRefundReq = {
  id: "rr-1",
  status: "pending",
  order_id: "ord-1",
  amount: 50,
  type: "full",
  requester_type: "buyer",
  requester_email: "buyer@x.com",
  requester_user_id: null,
};

const baseOrder = {
  id: "ord-1",
  artist_user_id: "u-artist",
  buyer_email: "buyer@x.com",
  total: 50,
  status: "confirmed",
  status_history: [],
  items: [],
  stripe_payment_intent_id: null, // Avoid Stripe calls in authz tests
  shipping: {},
};

describe("POST /api/refunds/process — authorisation (1.5, 4.1)", () => {
  it("403 when caller is not artist and not admin", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-stranger", email: "x@x.com" }, error: null });
    setupDb({
      refundReq: { ...baseRefundReq, requester_type: "buyer" },
      order: { ...baseOrder, artist_user_id: "u-artist" }, // caller != artist
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not authorised/i);
  });

  it("403 when caller is artist of order but requester_type is 'artist' (self-approval block, 4.1)", async () => {
    isAdminMock.mockResolvedValue(false);
    // Caller IS the artist of the order.
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
    setupDb({
      refundReq: { ...baseRefundReq, requester_type: "artist" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/artist-initiated refunds require admin approval/i);
  });

  it("admin CAN action artist-initiated refund (confirm admin bypass of 4.1 block)", async () => {
    isAdminMock.mockResolvedValue(true);
    authMock.mockResolvedValue({ user: { id: "u-admin", email: "admin@x.com" }, error: null });
    setupDb({
      refundReq: { ...baseRefundReq, requester_type: "artist" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    // 422 would occur because stripe_payment_intent_id is null for approve,
    // but reject path should succeed at 200. Either way it must not be 403.
    expect(res.status).not.toBe(403);
  });

  it("artist CAN action buyer-initiated refund (requester_type='buyer')", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
    setupDb({
      refundReq: { ...baseRefundReq, requester_type: "buyer" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).not.toBe(403);
  });
});
