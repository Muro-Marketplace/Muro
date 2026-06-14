// Tests for remediation finding 1.5: isAdminRequest gate in GET /api/refunds.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { isAdminMock, authMock, fromMock } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  authMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: isAdminMock }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { GET } from "./route";

function req(): Request {
  return new Request("http://localhost/api/refunds", {
    headers: { authorization: "Bearer valid" },
  });
}

beforeEach(() => {
  isAdminMock.mockReset();
  authMock.mockReset();
  fromMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
});

// A sentinel that distinguishes the admin (all-rows) query from the
// artist-scoped query: admin query selects from refund_requests directly,
// artist path first fetches orders, then filters refund_requests by order IDs.
// We count how many times the orders table is touched to distinguish them.

describe("GET /api/refunds — admin vs artist scope (1.5)", () => {
  it("admin path: queries refund_requests without an order-filter step", async () => {
    isAdminMock.mockResolvedValue(true);

    const ordersCalls: string[] = [];
    const allRows = [{ id: "rr-admin-1" }, { id: "rr-admin-2" }];

    fromMock.mockImplementation((table: string) => {
      ordersCalls.push(table);
      if (table === "artist_profiles") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      }
      if (table === "refund_requests") {
        return {
          select: () => ({
            order: async () => ({ data: allRows, error: null }),
          }),
        };
      }
      // Orders should NOT be queried in the admin path.
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      };
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userType).toBe("admin");
    // Admin path must NOT hit the orders table to scope results.
    expect(ordersCalls).not.toContain("orders");
  });

  it("artist path: queries orders first to scope refund_requests, does NOT return all rows", async () => {
    isAdminMock.mockResolvedValue(false);

    const artistOrderIds = ["ord-10"];
    const artistRows = [{ id: "rr-artist-1", order_id: "ord-10" }];

    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { slug: "alice" }, error: null }),
            }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              // Returns only this artist's orders.
              data: artistOrderIds.map((id) => ({ id })),
              error: null,
              // Make it thenable for await
              then(resolve: (v: { data: { id: string }[]; error: null }) => void) {
                resolve({ data: artistOrderIds.map((id) => ({ id })), error: null });
              },
            }),
          }),
        };
      }
      if (table === "refund_requests") {
        return {
          select: () => ({
            in: () => ({
              order: async () => ({ data: artistRows, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userType).toBe("artist");
    // Artist path returns only scoped rows, not all rows.
    expect(body.refundRequests).toHaveLength(1);
    expect(body.refundRequests[0].id).toBe("rr-artist-1");
  });
});
