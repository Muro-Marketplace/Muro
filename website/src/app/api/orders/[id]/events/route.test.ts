// row 19 #5. loadOrder selected phantom venue_user_id/currency/placed_at, so the
// whole select was rejected and the route 404'd for every order. These tests pin
// the mapping AND that the venue authz path still works via venue_slug (the
// phantom venue_user_id was gating a real authz check).

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock, verifyTokenMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/order-tracking-token", () => ({ verifyOrderToken: verifyTokenMock }));

import { GET } from "./route";

const ORDER = {
  id: "O1",
  status: "confirmed",
  buyer_email: "buyer@x.com",
  artist_user_id: "A1",
  venue_slug: "kings-arms",
  items: [],
  shipping: {},
  total: 120,
  created_at: "2026-05-01T00:00:00Z",
};

let venueRow: { user_id: string | null } | null = null;

function setupDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "orders") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ORDER }) }) }) };
    }
    if (table === "order_events") {
      return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) };
    }
    if (table === "venue_profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: venueRow }) }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function ctx(id = "O1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  verifyTokenMock.mockReset();
  venueRow = null;
  setupDb();
});

describe("GET /api/orders/[id]/events (row 19 #5)", () => {
  it("token path: maps the real columns (currency gbp, placedAt=created_at)", async () => {
    verifyTokenMock.mockResolvedValue({ orderId: "O1", email: "buyer@x.com" });
    const res = await GET(new Request("http://localhost/api/orders/O1/events?t=tok"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-before: old code read order.currency (undefined) and order.placed_at.
    expect(body.order).toMatchObject({ id: "O1", total: 120, currency: "gbp", placedAt: "2026-05-01T00:00:00Z" });
  });

  it("auth path: a venue resolved from venue_slug is authorised (the check the phantom column used to gate)", async () => {
    authMock.mockResolvedValue({ user: { id: "venue-user-1", email: "venue@x.com" }, error: null });
    venueRow = { user_id: "venue-user-1" }; // venue_profiles(slug=kings-arms).user_id
    const res = await GET(new Request("http://localhost/api/orders/O1/events"), ctx());
    expect(res.status).toBe(200);
  });

  it("auth path: an unrelated user (not buyer/artist/venue) is 403", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger", email: "stranger@x.com" }, error: null });
    venueRow = { user_id: "venue-user-1" }; // slug resolves to someone else
    const res = await GET(new Request("http://localhost/api/orders/O1/events"), ctx());
    expect(res.status).toBe(403);
  });
});
