import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer buyer") {
      return { user: { id: "u-buyer", email: "buyer@x.com" }, error: null };
    }
    return {
      user: null,
      error: new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }),
}));

// K1: notifyRefundRequested mailed the admin AND the artist from one function.
// Split by audience now: an operational alert and the artist's own notice.
vi.mock("@/lib/email/admin-alert", () => ({
  sendAdminAlert: vi.fn(async () => ({ ok: true, skipped: false, messageId: "m" })),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, skipped: false, messageId: "m" })),
}));

import { POST } from "./route";
import { signOrderToken } from "@/lib/order-tracking-token";

beforeEach(() => {
  fromMock.mockReset();
  process.env.ORDER_TOKEN_SECRET = "test-secret";
});

function req(body: unknown, auth: string | null = null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  return new Request("http://localhost/api/refunds/request", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function setupRoute({ orderRow, existingRefund }: {
  orderRow: Record<string, unknown> | null;
  existingRefund: Array<{ id: string; status: string }>;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: orderRow, error: orderRow ? null : { code: "PGRST116" } }) }),
        }),
      };
    }
    if (table === "refund_requests") {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({ limit: async () => ({ data: existingRefund, error: null }) }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: "rr-new", status: "pending" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "venue_profiles") {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { name: "Alice" } }) }) }),
      };
    }
    return {};
  });
}

describe("POST /api/refunds/request token branch", () => {
  it("accepts a signed token (no Bearer) and creates the request", async () => {
    setupRoute({
      orderRow: {
        id: "ord-1",
        buyer_email: "buyer@x.com",
        artist_user_id: null,
        total: 50,
        venue_slug: null,
      },
      existingRefund: [],
    });
    const token = await signOrderToken({ orderId: "ord-1", email: "buyer@x.com" });
    const res = await POST(req({ orderId: "ord-1", reason: "damaged", type: "full", token }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects a token with mismatched orderId in body (403)", async () => {
    setupRoute({
      orderRow: {
        id: "ord-1",
        buyer_email: "buyer@x.com",
        artist_user_id: null,
        total: 50,
        venue_slug: null,
      },
      existingRefund: [],
    });
    const token = await signOrderToken({ orderId: "ord-1", email: "buyer@x.com" });
    const res = await POST(req({ orderId: "ord-OTHER", reason: "damaged", type: "full", token }));
    expect(res.status).toBe(403);
  });

  it("rejects a tampered token with 401", async () => {
    const token = await signOrderToken({ orderId: "ord-1", email: "buyer@x.com" });
    const res = await POST(req({ orderId: "ord-1", reason: "x", type: "full", token: token.slice(0, -2) + "xx" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/refunds/request duplicate prevention", () => {
  it("blocks when an approved request already exists (409)", async () => {
    setupRoute({
      orderRow: {
        id: "ord-1",
        buyer_email: "buyer@x.com",
        artist_user_id: null,
        total: 50,
        venue_slug: null,
      },
      existingRefund: [{ id: "rr-existing", status: "approved" }],
    });
    const res = await POST(
      req({ orderId: "ord-1", reason: "x", type: "full" }, "Bearer buyer"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/approved/i);
  });

  it("permits re-submit when only a rejected request exists", async () => {
    setupRoute({
      orderRow: {
        id: "ord-1",
        buyer_email: "buyer@x.com",
        artist_user_id: null,
        total: 50,
        venue_slug: null,
      },
      existingRefund: [], // .neq("status", "rejected") filters those out
    });
    const res = await POST(
      req({ orderId: "ord-1", reason: "x", type: "full" }, "Bearer buyer"),
    );
    expect(res.status).toBe(200);
  });
});
